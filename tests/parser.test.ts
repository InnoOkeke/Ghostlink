import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseLegacyCode, detectLanguageFromFilename } from '../src/parser/legacy-parser.js';
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
        fc.constantFrom('php', 'asp', 'vb6', 'cobol', 'delphi'),
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
        fc.constantFrom('php', 'asp', 'vb6', 'cobol', 'delphi'),
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
        fc.constantFrom('PHP', 'php', 'ASP', 'VB6', 'COBOL', 'Delphi'),
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
        fc.constantFrom('php', 'vb6'),
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

  it('detects legacy languages from file extensions', () => {
    expect(detectLanguageFromFilename('cart.php')).toBe('php');
    expect(detectLanguageFromFilename('login.asp')).toBe('asp');
    expect(detectLanguageFromFilename('calc.bas')).toBe('vb6');
    expect(detectLanguageFromFilename('payroll.cbl')).toBe('cobol');
    expect(detectLanguageFromFilename('form.pas')).toBe('delphi');
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
