import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  parseLegacyCode,
  detectLanguageFromFilename,
  detectLanguageFromContent
} from '../src/parser/legacy-parser.js';
import { extractJson } from '../src/agents/archaeology-agent.js';

describe('parseLegacyCode property tests', () => {
  it('never throws on arbitrary strings for PHP', () => {
    fc.assert(
      fc.property(fc.string(), (code) => {
        expect(() => parseLegacyCode(code, 'php')).not.toThrow();
      })
    );
  });

  it('extracted function counts are non-negative', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.constantFrom('php', 'asp', 'vb6', 'cobol', 'delphi', 'c', 'cpp', 'csharp', 'fortran', 'perl'),
        (code, lang) => {
          const result = parseLegacyCode(code, lang);
          expect(result.functions.length).toBeGreaterThanOrEqual(0);
        }
      )
    );
  });

  it('handles Windows CRLF line endings', () => {
    fc.assert(
      fc.property(fc.string(), (code) => {
        const crlf = code.replace(/\n/g, '\r\n');
        const lf = parseLegacyCode(code, 'php');
        const crlfResult = parseLegacyCode(crlf, 'php');
        expect(crlfResult.lineCount).toEqual(lf.lineCount);
      })
    );
  });

  it('lineCount is always at least 1', () => {
    fc.assert(
      fc.property(fc.string(), (code) => {
        const result = parseLegacyCode(code, 'php');
        expect(result.lineCount).toBeGreaterThanOrEqual(1);
      })
    );
  });

  it('complexity is non-negative and equals function count', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.constantFrom('php', 'asp', 'vb6', 'cobol', 'delphi', 'c', 'cpp', 'csharp', 'fortran', 'perl'),
        (code, lang) => {
          const result = parseLegacyCode(code, lang);
          expect(result.complexity).toBeGreaterThanOrEqual(0);
          expect(result.complexity).toEqual(result.functions.length);
        }
      )
    );
  });

  it('language is preserved and lowercased', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.constantFrom('PHP', 'php', 'ASP', 'VB6', 'COBOL', 'Delphi', 'C', 'CPP', 'CSharp', 'Fortran', 'Perl'),
        (code, lang) => {
          const result = parseLegacyCode(code, lang);
          expect(result.language).toEqual(lang.toLowerCase());
        }
      )
    );
  });

  it('globals count is non-negative', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.constantFrom('php', 'vb6', 'cobol', 'c', 'cpp', 'csharp', 'fortran', 'perl'),
        (code, lang) => {
          const result = parseLegacyCode(code, lang);
          expect(result.globals.length).toBeGreaterThanOrEqual(0);
        }
      )
    );
  });
});

describe('parseLegacyCode unit tests', () => {
  it('extracts PHP functions', () => {
    const code = `<?php\nfunction add($a, $b) { return $a + $b; }\nfunction sub($a, $b) { return $a - $b; }`;
    const result = parseLegacyCode(code, 'php');
    expect(result.functions).toContain('add');
    expect(result.functions).toContain('sub');
    expect(result.functions.length).toBe(2);
  });

  it('extracts VB6 functions and subs', () => {
    const code = `Public Function Add(a As Double, b As Double) As Double\nEnd Function\nPrivate Sub Form_Load()\nEnd Sub`;
    const result = parseLegacyCode(code, 'vb6');
    expect(result.functions).toContain('Add');
    expect(result.functions).toContain('Form_Load');
  });

  it('extracts Classic ASP subs and functions', () => {
    const code = `Sub LoginUser()\nEnd Sub\nFunction IsAdmin(uid)\nEnd Function`;
    const result = parseLegacyCode(code, 'asp');
    expect(result.functions).toContain('LoginUser');
    expect(result.functions).toContain('IsAdmin');
  });

  it('deduplicates functions', () => {
    const code = `function foo() {}\nfunction foo() {}`;
    const result = parseLegacyCode(code, 'php');
    expect(result.functions.filter((f) => f === 'foo').length).toBe(1);
  });

  it('returns empty functions array for blank input', () => {
    const result = parseLegacyCode('', 'php');
    expect(result.functions).toEqual([]);
    expect(result.lineCount).toBeGreaterThanOrEqual(1);
  });

  it('extracts functionDetails with line numbers and signatures', () => {
    const code = [
      '<?php',
      'function calculate_total($price, $qty) {',
      '  return $price * $qty;',
      '}'
    ].join('\n');
    const result = parseLegacyCode(code, 'php');
    expect(result.functionDetails).toHaveLength(1);
    expect(result.functionDetails[0]).toEqual({
      name: 'calculate_total',
      signature: 'function calculate_total($price, $qty)',
      lineStart: 2,
      lineEnd: 4
    });
  });

  it('extracts dbCalls, sideEffects, and externalDeps from legacy code', () => {
    const code = [
      '<?php',
      'require_once("config.php");',
      'function get_user($id) {',
      '  $res = mysql_query("SELECT * FROM users WHERE id = " . $id);',
      '  echo $_POST["name"];',
      '}'
    ].join('\n');
    const result = parseLegacyCode(code, 'php');
    expect(result.externalDeps).toContain('config.php');
    expect(result.dbCalls.some((c) => c.includes('mysql_query') || c.includes('SQL SELECT'))).toBe(true);
    expect(result.sideEffects.some((s) => s.includes('echo') || s.includes('superglobal'))).toBe(true);
  });

  it('detects legacy languages from file extensions without a php fallback', () => {
    expect(detectLanguageFromFilename('cart.php')).toBe('php');
    expect(detectLanguageFromFilename('login.asp')).toBe('asp');
    expect(detectLanguageFromFilename('calc.bas')).toBe('vb6');
    expect(detectLanguageFromFilename('payroll.cbl')).toBe('cobol');
    expect(detectLanguageFromFilename('form.pas')).toBe('delphi');
    expect(detectLanguageFromFilename('engine.c')).toBe('c');
    expect(detectLanguageFromFilename('matrix.cpp')).toBe('cpp');
    expect(detectLanguageFromFilename('BillingService.cs')).toBe('csharp');
    expect(detectLanguageFromFilename('solver.f90')).toBe('fortran');
    expect(detectLanguageFromFilename('report.pl')).toBe('perl');
    expect(detectLanguageFromFilename('unknown.xyz')).toBe('');
  });

  it('detects legacy languages directly from pasted source content', () => {
    expect(
      detectLanguageFromContent('IDENTIFICATION DIVISION.\nPROGRAM-ID. ADD-NUMBERS.\n01 NUM1 PIC 9(5).')
    ).toBe('cobol');
    expect(detectLanguageFromContent('<?php echo $_POST["id"]; ?>')).toBe('php');
    expect(detectLanguageFromContent('<% Response.Write(Request.Form("x")) %>')).toBe('asp');
    expect(detectLanguageFromContent('#include <stdio.h>\nint main(void) { printf("hi"); return 0; }')).toBe('c');
    expect(detectLanguageFromContent('#include <iostream>\nint main() { std::cout << 1; }')).toBe('cpp');
    expect(detectLanguageFromContent('using System;\nclass Program { static void Main() { Console.WriteLine("hi"); } }')).toBe('csharp');
    expect(detectLanguageFromContent('Dim count As Integer\nPublic Sub Calc()\nEnd Sub')).toBe('vb6');
    expect(detectLanguageFromContent('PROGRAM SOLVER\nIMPLICIT NONE\nEND PROGRAM SOLVER')).toBe('fortran');
    expect(detectLanguageFromContent('unit MyForm;\nprocedure Foo;\nbegin\nend;')).toBe('delphi');
    expect(detectLanguageFromContent('use strict;\nour $x = 1;\nsub run {}')).toBe('perl');
    expect(detectLanguageFromContent('plain English text with no code markers')).toBeNull();
  });

  it('extracts entry point, PIC globals, and I/O side effects from flat COBOL programs', () => {
    const code = [
      'IDENTIFICATION DIVISION.',
      'PROGRAM-ID. ADD-NUMBERS.',
      'DATA DIVISION.',
      'WORKING-STORAGE SECTION.',
      '01 NUM1 PIC 9(5).',
      '01 NUM2 PIC 9(5).',
      '01 RESULT PIC 9(6).',
      'PROCEDURE DIVISION.',
      '    DISPLAY "Enter first number: ".',
      '    ACCEPT NUM1.',
      '    DISPLAY "Enter second number: ".',
      '    ACCEPT NUM2.',
      '    ADD NUM1 TO NUM2 GIVING RESULT.',
      '    DISPLAY "The sum is: " RESULT.',
      '    STOP RUN.'
    ].join('\n');
    const result = parseLegacyCode(code, 'cobol');
    expect(result.functions).toEqual(['ADD-NUMBERS']);
    expect(result.functionDetails[0]?.signature).toBe('PROGRAM-ID ADD-NUMBERS');
    expect(result.globals).toEqual(['NUM1 (PIC 9(5))', 'NUM2 (PIC 9(5))', 'RESULT (PIC 9(6))']);
    expect(result.sideEffects.some((s) => s.includes('DISPLAY/ACCEPT'))).toBe(true);
  });

  it('extracts functions, globals, and dependencies from C, C++, C#, Fortran, and Perl', () => {
    const cCode = [
      '#include <stdio.h>',
      '#define MAX_ITEMS 100',
      'int add_pair(int a, int b) {',
      '  printf("%d\\n", a + b);',
      '  return a + b;',
      '}'
    ].join('\n');
    const cRes = parseLegacyCode(cCode, 'c');
    expect(cRes.functions).toContain('add_pair');
    expect(cRes.globals).toContain('MAX_ITEMS');
    expect(cRes.externalDeps).toContain('stdio.h');
    expect(cRes.sideEffects.some((s) => s.includes('stdio'))).toBe(true);

    const cppCode = [
      '#include <iostream>',
      'class Ledger {',
      '};',
      'double Ledger::computeTax(double amount) const {',
      '  std::cout << amount;',
      '  return amount * 0.1;',
      '}'
    ].join('\n');
    const cppRes = parseLegacyCode(cppCode, 'cpp');
    expect(cppRes.functions).toContain('Ledger::computeTax');
    expect(cppRes.globals).toContain('Ledger');
    expect(cppRes.externalDeps).toContain('iostream');

    const csCode = [
      'using System;',
      'public class InvoiceProcessor {',
      '  public static const decimal TaxRate = 0.08m;',
      '  public decimal CalculateTotal(decimal subtotal) {',
      '    Console.WriteLine(subtotal);',
      '    return subtotal * (1 + TaxRate);',
      '  }',
      '}'
    ].join('\n');
    const csRes = parseLegacyCode(csCode, 'csharp');
    expect(csRes.functions).toContain('CalculateTotal');
    expect(csRes.globals).toContain('TaxRate');
    expect(csRes.externalDeps).toContain('System');
    expect(csRes.sideEffects.some((s) => s.includes('Console I/O'))).toBe(true);

    const fortranCode = [
      '      PROGRAM HEAT_SOLVER',
      '      PARAMETER (MAX_STEPS=500)',
      '      PRINT *, MAX_STEPS',
      '      END PROGRAM HEAT_SOLVER',
      '      SUBROUTINE STEP_GRID(N)',
      '      END SUBROUTINE STEP_GRID'
    ].join('\n');
    const fortranRes = parseLegacyCode(fortranCode, 'fortran');
    expect(fortranRes.functions).toEqual(['HEAT_SOLVER', 'STEP_GRID']);
    expect(fortranRes.globals).toContain('MAX_STEPS=500');
    expect(fortranRes.sideEffects.some((s) => s.includes('Fortran I/O'))).toBe(true);

    const perlCode = [
      'use DBI;',
      'our $MAX_RETRIES = 3;',
      'sub sync_records {',
      '  my $dbh = DBI->connect("dbi:SQLite:dbname=test.db");',
      '}'
    ].join('\n');
    const perlRes = parseLegacyCode(perlCode, 'perl');
    expect(perlRes.functions).toContain('sync_records');
    expect(perlRes.globals).toContain('$MAX_RETRIES');
    expect(perlRes.externalDeps).toContain('DBI');
    expect(perlRes.dbCalls.some((c) => c.includes('Perl DBI'))).toBe(true);
  });
});

describe('extractJson', () => {
  it('parses JSON wrapped in markdown code fences', () => {
    const raw = 'Here is the result:\n```json\n{\n  "functions": [],\n  "globals": ["$conn"]\n}\n```';
    expect(extractJson(raw)).toEqual({ functions: [], globals: ['$conn'] });
  });

  it('sanitizes trailing commas in objects and arrays', () => {
    const raw = '{"functions": [{"name": "foo",},], "globals": ["$x",],}';
    expect(extractJson(raw)).toEqual({ functions: [{ name: 'foo' }], globals: ['$x'] });
  });

  it('parses arbitrary JSON objects even with trailing commas inserted', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{0,12}$/), fc.integer()),
        (obj) => {
          const json = JSON.stringify(obj);
          const withTrailingComma =
            Object.keys(obj).length > 0 ? json.replace(/\}$/, ',}') : json;
          expect(extractJson(withTrailingComma)).toEqual(obj);
        }
      )
    );
  });
});
