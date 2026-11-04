import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseLegacyCode } from '../src/parser/legacy-parser.js';

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
});
