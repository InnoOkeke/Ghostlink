export interface ParseResult {
  functions: string[];
  globals: string[];
  language: string;
  lineCount: number;
  complexity: number;
}

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function extractPhpFunctions(content: string): string[] {
  const pattern = /function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  const functions: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    functions.push(match[1]);
  }
  return functions;
}

function extractPhpGlobals(content: string): string[] {
  const globals: string[] = [];
  // global keyword declarations inside functions
  const globalPattern = /global\s+(\$[a-zA-Z_][a-zA-Z0-9_]*(?:\s*,\s*\$[a-zA-Z_][a-zA-Z0-9_]*)*)/g;
  let match: RegExpExecArray | null;
  while ((match = globalPattern.exec(content)) !== null) {
    const vars = match[1].split(',').map((v) => v.trim());
    globals.push(...vars);
  }
  return [...new Set(globals)];
}

function extractAspFunctions(content: string): string[] {
  const pattern = /(?:Sub|Function)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\(|$)/gim;
  const functions: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    functions.push(match[1]);
  }
  return functions;
}

function extractVb6Functions(content: string): string[] {
  const pattern = /(?:Sub|Function|Property\s+(?:Get|Set|Let))\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\(|$)/gim;
  const functions: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    functions.push(match[1]);
  }
  return functions;
}

function extractVb6Globals(content: string): string[] {
  const pattern = /^(?:Dim|Public|Private|Global)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gim;
  const globals: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    globals.push(match[1]);
  }
  return globals;
}

function extractCobolParagraphs(content: string): string[] {
  // COBOL paragraph names appear at the start of a line (no indentation) followed by a period
  // We look for lines in the PROCEDURE DIVISION
  const procedureDivisionIdx = content.toUpperCase().indexOf('PROCEDURE DIVISION');
  const searchArea = procedureDivisionIdx >= 0
    ? content.slice(procedureDivisionIdx)
    : content;

  const pattern = /^([A-Z][A-Z0-9-]*)\.?\s*$/gm;
  const paragraphs: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(searchArea)) !== null) {
    const name = match[1];
    // Filter out common division/section keywords
    if (!['PROCEDURE', 'DATA', 'ENVIRONMENT', 'IDENTIFICATION', 'DIVISION', 'SECTION'].includes(name)) {
      paragraphs.push(name);
    }
  }
  return paragraphs;
}

function extractDelphiFunctions(content: string): string[] {
  const pattern = /(?:procedure|function)\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*(?:\(|;|:)/gi;
  const functions: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    functions.push(match[1]);
  }
  return functions;
}

function calculateComplexity(functions: string[]): number {
  // Simple complexity metric: number of functions
  return functions.length;
}

export function parseLegacyCode(content: string, language: string): ParseResult {
  const normalized = normalizeLineEndings(content);
  const lines = normalized.split('\n');
  const lineCount = lines.length;
  const lang = language.toLowerCase();

  let functions: string[] = [];
  let globals: string[] = [];

  try {
    switch (lang) {
      case 'php':
        functions = extractPhpFunctions(normalized);
        globals = extractPhpGlobals(normalized);
        break;
      case 'asp':
      case 'asp_vbs':
      case 'vbscript':
        functions = extractAspFunctions(normalized);
        break;
      case 'vb6':
      case 'vb':
        functions = extractVb6Functions(normalized);
        globals = extractVb6Globals(normalized);
        break;
      case 'cobol':
        functions = extractCobolParagraphs(normalized);
        break;
      case 'delphi':
      case 'pascal':
        functions = extractDelphiFunctions(normalized);
        break;
      default:
        // Generic fallback: look for common function patterns
        functions = extractPhpFunctions(normalized);
        break;
    }
  } catch {
    // Graceful degradation — return empty results rather than crashing
    functions = [];
    globals = [];
  }

  return {
    functions: [...new Set(functions)],
    globals: [...new Set(globals)],
    language: lang,
    lineCount,
    complexity: calculateComplexity(functions)
  };
}
