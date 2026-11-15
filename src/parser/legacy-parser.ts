import path from 'path';

export interface FunctionDetail {
  name: string;
  signature: string;
  lineStart: number;
  lineEnd: number;
}

export interface ParseResult {
  functions: string[];
  functionDetails: FunctionDetail[];
  globals: string[];
  dbCalls: string[];
  sideEffects: string[];
  externalDeps: string[];
  language: string;
  lineCount: number;
  complexity: number;
}

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  '.php': 'php',
  '.asp': 'asp',
  '.bas': 'vb6',
  '.vb': 'vb6',
  '.cls': 'vb6',
  '.frm': 'vb6',
  '.cbl': 'cobol',
  '.cob': 'cobol',
  '.cpy': 'cobol',
  '.pas': 'delphi',
  '.dpr': 'delphi',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.f': 'fortran',
  '.for': 'fortran',
  '.f77': 'fortran',
  '.f90': 'fortran',
  '.f95': 'fortran',
  '.pl': 'perl',
  '.pm': 'perl'
};

/**
 * Detects a legacy source language directly from source code syntax patterns.
 */
export function detectLanguageFromContent(content: string): string | null {
  if (!content.trim()) return null;

  if (
    /\b(?:IDENTIFICATION\s+DIVISION|PROCEDURE\s+DIVISION|WORKING-STORAGE\s+SECTION|DATA\s+DIVISION|PROGRAM-ID\.)/i.test(
      content
    ) ||
    /\bPIC(?:TURE)?\s+(?:IS\s+)?[9XASV()0-9]+/i.test(content)
  ) {
    return 'cobol';
  }
  if (/<\?(?:php|=)?/i.test(content) || /\$_(?:GET|POST|SESSION|COOKIE|REQUEST|SERVER)\b/.test(content)) {
    return 'php';
  }
  if (
    (content.includes('<%') && content.includes('%>')) ||
    /\b(?:Response\.(?:Write|Redirect)|Request\.(?:Form|QueryString)|Server\.CreateObject)\b/i.test(
      content
    )
  ) {
    return 'asp';
  }
  if (
    /^\s*(?:PROGRAM|SUBROUTINE|INTEGER\s+FUNCTION|REAL\s+FUNCTION|DOUBLE\s+PRECISION\s+FUNCTION)\s+[A-Z0-9_]+/im.test(
      content
    ) ||
    /\b(?:IMPLICIT\s+NONE|END\s+(?:PROGRAM|SUBROUTINE))\b/i.test(content)
  ) {
    return 'fortran';
  }
  if (
    /^\s*(?:unit|program)\s+[a-zA-Z_][a-zA-Z0-9_]*\s*;/im.test(content) ||
    (/\b(?:procedure|function)\s+[a-zA-Z_]\w*/i.test(content) &&
      /\bbegin\b/i.test(content) &&
      /\bend\s*;/i.test(content))
  ) {
    return 'delphi';
  }
  if (
    /^\s*using\s+System(?:\.[a-zA-Z0-9_.]+)?\s*;/im.test(content) ||
    /\bConsole\.(?:WriteLine|Write|ReadLine)\b/.test(content)
  ) {
    return 'csharp';
  }
  if (
    /^\s*#include\s*<(?:iostream|vector|string|map|memory|algorithm|fstream|sstream)>/im.test(
      content
    ) ||
    /\bstd::(?:cout|cin|string|vector|endl)\b/.test(content) ||
    /\b[A-Za-z_]\w*::[A-Za-z_~]\w*\s*\(/.test(content)
  ) {
    return 'cpp';
  }
  if (
    /^\s*#include\s*<(?:stdio|stdlib|string|math|stdint|unistd|ctype)\.h>/im.test(content) ||
    /\b(?:printf|scanf|malloc|free)\s*\(/.test(content)
  ) {
    return 'c';
  }
  if (
    /\b(?:Public|Private|Dim)\s+\w+\s+As\s+(?:Integer|Long|String|Boolean|Double|Currency|Variant|Object)\b/i.test(
      content
    ) ||
    (/^\s*(?:Public\s+|Private\s+)?(?:Sub|Function)\s+\w+/im.test(content) &&
      /^\s*End\s+(?:Sub|Function)\b/im.test(content))
  ) {
    return 'vb6';
  }
  if (
    /^#!.*perl/im.test(content) ||
    /\buse\s+(?:strict|warnings|DBI|vars)\b/.test(content) ||
    /\b(?:my|our)\s+[$@%][a-zA-Z_]\w*/.test(content)
  ) {
    return 'perl';
  }

  return null;
}

/**
 * Infers a legacy source language identifier from a filename extension,
 * or from source content when the extension is unknown or absent.
 */
export function detectLanguageFromFilename(filename: string, content?: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext && EXTENSION_LANGUAGE_MAP[ext]) {
    return EXTENSION_LANGUAGE_MAP[ext];
  }
  if (content) {
    return detectLanguageFromContent(content) ?? '';
  }
  return '';
}

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function findBraceBlockEnd(lines: string[], startIdx: number): number {
  let depth = 0;
  let sawOpenBrace = false;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '{') {
        depth++;
        sawOpenBrace = true;
      } else if (ch === '}') {
        depth--;
        if (sawOpenBrace && depth <= 0) {
          return i + 1;
        }
      }
    }
  }

  return startIdx + 1;
}

function findEndKeywordLine(lines: string[], startIdx: number, endPattern: RegExp): number {
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (endPattern.test(lines[i])) {
      return i + 1;
    }
  }
  return startIdx + 1;
}

function extractPhpFunctions(lines: string[]): FunctionDetail[] {
  const details: FunctionDetail[] = [];
  const pattern = /\bfunction\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/;

  for (let i = 0; i < lines.length; i++) {
    const match = pattern.exec(lines[i]);
    if (match) {
      const name = match[1];
      const params = match[2].trim();
      details.push({
        name,
        signature: `function ${name}(${params})`,
        lineStart: i + 1,
        lineEnd: findBraceBlockEnd(lines, i)
      });
    }
  }

  return details;
}

function extractPhpGlobals(content: string): string[] {
  const globals: string[] = [];
  const globalPattern = /global\s+(\$[a-zA-Z_][a-zA-Z0-9_]*(?:\s*,\s*\$[a-zA-Z_][a-zA-Z0-9_]*)*)/g;
  let match: RegExpExecArray | null;
  while ((match = globalPattern.exec(content)) !== null) {
    const vars = match[1].split(',').map((v) => v.trim());
    globals.push(...vars);
  }
  return [...new Set(globals)];
}

function extractAspFunctions(lines: string[]): FunctionDetail[] {
  const details: FunctionDetail[] = [];
  const pattern = /^\s*(?:Public\s+|Private\s+)?(Sub|Function)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\(([^)]*)\)|$)/i;

  for (let i = 0; i < lines.length; i++) {
    const match = pattern.exec(lines[i]);
    if (match) {
      const kind = match[1];
      const name = match[2];
      const params = (match[3] ?? '').trim();
      const endRe = new RegExp(`^\\s*End\\s+${kind}\\b`, 'i');
      details.push({
        name,
        signature: `${kind} ${name}(${params})`,
        lineStart: i + 1,
        lineEnd: findEndKeywordLine(lines, i, endRe)
      });
    }
  }

  return details;
}

function extractVb6Functions(lines: string[]): FunctionDetail[] {
  const details: FunctionDetail[] = [];
  const pattern =
    /^\s*(?:Public\s+|Private\s+|Friend\s+)?(?:Static\s+)?(Sub|Function|Property\s+(?:Get|Set|Let))\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\(([^)]*)\)|$)/i;

  for (let i = 0; i < lines.length; i++) {
    const match = pattern.exec(lines[i]);
    if (match) {
      const kind = match[1];
      const name = match[2];
      const params = (match[3] ?? '').trim();
      const endKeyword = kind.toLowerCase().startsWith('property') ? 'Property' : kind;
      const endRe = new RegExp(`^\\s*End\\s+${endKeyword}\\b`, 'i');
      details.push({
        name,
        signature: `${kind} ${name}(${params})`,
        lineStart: i + 1,
        lineEnd: findEndKeywordLine(lines, i, endRe)
      });
    }
  }

  return details;
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

function extractCobolParagraphs(lines: string[]): FunctionDetail[] {
  const details: FunctionDetail[] = [];
  const procIdx = lines.findIndex((l) => /PROCEDURE\s+DIVISION/i.test(l));
  const startIdx = procIdx >= 0 ? procIdx + 1 : 0;
  const pattern = /^(?:\d{6}\s+)?\s{0,11}([A-Z][A-Z0-9-]*)\.\s*$/i;
  const ignored = new Set([
    'PROCEDURE',
    'DATA',
    'ENVIRONMENT',
    'IDENTIFICATION',
    'DIVISION',
    'SECTION',
    'STOP',
    'EXIT',
    'CONTINUE',
    'GOBACK',
    'END-IF',
    'END-PERFORM',
    'END-READ',
    'END-EVALUATE'
  ]);

  for (let i = startIdx; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\s*(?:\*|\*>)/.test(raw)) continue;
    const match = pattern.exec(raw);
    if (match && !ignored.has(match[1].toUpperCase())) {
      const name = match[1].toUpperCase();
      details.push({
        name,
        signature: `${name}.`,
        lineStart: i + 1,
        lineEnd: i + 1
      });
    }
  }

  for (let idx = 0; idx < details.length; idx++) {
    const nextStart = idx + 1 < details.length ? details[idx + 1].lineStart - 1 : lines.length;
    details[idx].lineEnd = Math.max(details[idx].lineStart, nextStart);
  }

  // Flat COBOL programs have executable statements directly under PROCEDURE DIVISION without paragraph labels.
  if (details.length === 0 && procIdx >= 0) {
    let programId = 'MAIN-PROCEDURE';
    for (const line of lines.slice(0, procIdx)) {
      const idMatch = /PROGRAM-ID\.\s*([A-Z0-9-]+)/i.exec(line);
      if (idMatch && idMatch[1]) {
        programId = idMatch[1].toUpperCase();
        break;
      }
    }
    details.push({
      name: programId,
      signature: `PROGRAM-ID ${programId}`,
      lineStart: procIdx + 1,
      lineEnd: lines.length
    });
  }

  return details;
}

function extractCobolGlobals(lines: string[]): string[] {
  const procIdx = lines.findIndex((l) => /PROCEDURE\s+DIVISION/i.test(l));
  const dataLines = procIdx >= 0 ? lines.slice(0, procIdx) : lines;
  const globals: string[] = [];
  const itemPattern =
    /^(?:\d{6}\s+)?\s*(?:01|05|10|15|20|77)\s+([A-Z][A-Z0-9-]*)(?:\s+PIC(?:TURE)?\s+(?:IS\s+)?([^\s.]+))?/i;

  for (const raw of dataLines) {
    if (/^\s*(?:\*|\*>)/.test(raw)) continue;
    const match = itemPattern.exec(raw);
    if (!match) continue;
    const name = match[1].toUpperCase();
    if (name === 'FILLER') continue;
    const pic = match[2];
    globals.push(pic ? `${name} (PIC ${pic.toUpperCase()})` : name);
  }

  return [...new Set(globals)];
}

const BRACE_CONTROL_KEYWORDS = new Set([
  'if',
  'else',
  'for',
  'while',
  'switch',
  'catch',
  'return',
  'sizeof',
  'typeof',
  'decltype',
  'lock',
  'using',
  'fixed'
]);

function extractBraceFunctions(lines: string[], allowScopeAndCtors: boolean): FunctionDetail[] {
  const details: FunctionDetail[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (
      !trimmed ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('}')
    ) {
      continue;
    }

    const openParen = trimmed.indexOf('(');
    const closeParen = trimmed.lastIndexOf(')');
    if (openParen <= 0 || closeParen <= openParen) continue;

    const afterParen = trimmed.slice(closeParen + 1).trim();
    if (afterParen.endsWith(';')) continue;

    let braceLine = -1;
    if (afterParen.includes('{')) {
      braceLine = i;
    } else if (
      afterParen === '' ||
      /^(?:const|noexcept|override|final|where\b|:\s*[\w:~<>(),\s]+)$/.test(afterParen)
    ) {
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const nextTrimmed = lines[j].trim();
        if (!nextTrimmed || nextTrimmed.startsWith('//')) continue;
        if (nextTrimmed.startsWith('{')) {
          braceLine = j;
        }
        break;
      }
    }
    if (braceLine === -1) continue;

    const beforeParen = trimmed.slice(0, openParen).trim();
    if (
      beforeParen.includes('=') ||
      beforeParen.includes(';') ||
      beforeParen.includes('->') ||
      beforeParen.includes('.')
    ) {
      continue;
    }

    const nameMatch = allowScopeAndCtors
      ? /([a-zA-Z_~][a-zA-Z0-9_]*(?:::[~a-zA-Z_][a-zA-Z0-9_]*)?)$/.exec(beforeParen)
      : /\b([a-zA-Z_][a-zA-Z0-9_]*)$/.exec(beforeParen);
    if (!nameMatch) continue;

    const name = nameMatch[1];
    const bareName = name.includes('::') ? (name.split('::').pop() ?? name) : name;
    const firstToken = beforeParen.split(/\s+/)[0] ?? '';
    if (
      BRACE_CONTROL_KEYWORDS.has(bareName) ||
      BRACE_CONTROL_KEYWORDS.has(firstToken) ||
      firstToken === 'typedef'
    ) {
      continue;
    }

    const prefix = beforeParen.slice(0, nameMatch.index).trim();
    if (!prefix && !(allowScopeAndCtors && name.includes('::'))) {
      continue;
    }

    const params = trimmed.slice(openParen + 1, closeParen).trim();
    details.push({
      name,
      signature: `${beforeParen}(${params})`,
      lineStart: i + 1,
      lineEnd: findBraceBlockEnd(lines, braceLine)
    });
  }

  return details;
}

function extractCStyleGlobals(lines: string[], includeTypes: boolean): string[] {
  const globals: string[] = [];
  let depth = 0;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue;
    }

    const defineMatch = /^\s*#define\s+([A-Z_][A-Z0-9_]*)\b/.exec(trimmed);
    if (defineMatch) {
      globals.push(defineMatch[1]);
    }

    if (depth === 0) {
      if (includeTypes) {
        const typeMatch = /^\s*(?:class|struct)\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/.exec(trimmed);
        if (typeMatch) {
          globals.push(typeMatch[1]);
        }
      }

      if (
        !trimmed.startsWith('#') &&
        !trimmed.startsWith('using ') &&
        !trimmed.startsWith('namespace ') &&
        !trimmed.startsWith('typedef ') &&
        !trimmed.includes('(') &&
        trimmed.endsWith(';')
      ) {
        const varMatch =
          /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\[[^\]]*\]\s*)?(?:=[^;]*)?;/.exec(trimmed);
        if (varMatch) {
          globals.push(varMatch[1]);
        }
      }
    }

    for (let c = 0; c < raw.length; c++) {
      if (raw[c] === '{') depth++;
      else if (raw[c] === '}' && depth > 0) depth--;
    }
  }

  return [...new Set(globals)];
}

function extractCFunctions(lines: string[]): FunctionDetail[] {
  return extractBraceFunctions(lines, false);
}

function extractCGlobals(lines: string[]): string[] {
  return extractCStyleGlobals(lines, false);
}

function extractCppFunctions(lines: string[]): FunctionDetail[] {
  return extractBraceFunctions(lines, true);
}

function extractCppGlobals(lines: string[]): string[] {
  return extractCStyleGlobals(lines, true);
}

function extractCSharpFunctions(lines: string[]): FunctionDetail[] {
  return extractBraceFunctions(lines, false);
}

function extractCSharpGlobals(lines: string[]): string[] {
  const globals: string[] = [];
  const fieldPattern =
    /^\s*(?:(?:public|private|protected|internal)\s+)?(?:(?:static|const|readonly)\s+)+[a-zA-Z_][a-zA-Z0-9_<>,.\[\]?]*\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=|;)/;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.includes('(')) continue;
    const match = fieldPattern.exec(trimmed);
    if (match) {
      globals.push(match[1]);
    }
  }

  return [...new Set(globals)];
}

function extractFortranFunctions(lines: string[]): FunctionDetail[] {
  const details: FunctionDetail[] = [];
  const unitPattern =
    /^\s*(?:(?:RECURSIVE|PURE|ELEMENTAL|INTEGER|REAL|DOUBLE\s+PRECISION|LOGICAL)\s+)?(PROGRAM|SUBROUTINE|FUNCTION)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*\(([^)]*)\))?/i;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\s*(?:!|c\s|\*)/i.test(raw)) continue;
    const match = unitPattern.exec(raw);
    if (!match) continue;

    const kind = match[1].toUpperCase();
    const name = match[2];
    const params = (match[3] ?? '').trim();
    const endRe = new RegExp(`^\\s*END(?:\\s+${kind})?\\b`, 'i');
    details.push({
      name,
      signature: params ? `${kind} ${name}(${params})` : `${kind} ${name}`,
      lineStart: i + 1,
      lineEnd: findEndKeywordLine(lines, i, endRe)
    });
  }

  return details;
}

function extractFortranGlobals(lines: string[]): string[] {
  const globals: string[] = [];
  const paramStmt = /\bPARAMETER\s*\(([^)]+)\)/i;
  const f90Param = /,\s*PARAMETER\b[^:]*::\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\s*=\s*[^,!\n]+)?)/i;
  const commonStmt = /\bCOMMON\s*\/\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\//i;

  for (const raw of lines) {
    if (/^\s*(?:!|\*)/i.test(raw)) continue;
    const pMatch = paramStmt.exec(raw);
    if (pMatch) {
      for (const part of pMatch[1].split(',')) {
        const cleaned = part.trim();
        if (cleaned) globals.push(cleaned);
      }
    }
    const f90Match = f90Param.exec(raw);
    if (f90Match) {
      globals.push(f90Match[1].trim());
    }
    const cMatch = commonStmt.exec(raw);
    if (cMatch) {
      globals.push(`COMMON /${cMatch[1]}/`);
    }
  }

  return [...new Set(globals)];
}

function extractPerlFunctions(lines: string[]): FunctionDetail[] {
  const details: FunctionDetail[] = [];
  const subPattern = /^\s*sub\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/;

  for (let i = 0; i < lines.length; i++) {
    const match = subPattern.exec(lines[i]);
    if (!match) continue;
    const name = match[1];
    details.push({
      name,
      signature: `sub ${name}`,
      lineStart: i + 1,
      lineEnd: findBraceBlockEnd(lines, i)
    });
  }

  return details;
}

function extractPerlGlobals(content: string): string[] {
  const globals: string[] = [];
  const ourPattern = /\bour\s+(?:\(([^)]+)\)|([$@%][a-zA-Z_][a-zA-Z0-9_]*))/g;
  const useVarsPattern = /\buse\s+vars\s+qw\s*[(\[/]([^)\]/]+)[)\]/]/g;

  let match: RegExpExecArray | null;
  while ((match = ourPattern.exec(content)) !== null) {
    if (match[1]) {
      for (const v of match[1].split(',')) {
        const trimmed = v.trim();
        if (trimmed) globals.push(trimmed);
      }
    } else if (match[2]) {
      globals.push(match[2].trim());
    }
  }

  while ((match = useVarsPattern.exec(content)) !== null) {
    for (const v of match[1].trim().split(/\s+/)) {
      if (v) globals.push(v);
    }
  }

  return [...new Set(globals)];
}

function extractDelphiFunctions(lines: string[]): FunctionDetail[] {
  const details: FunctionDetail[] = [];
  const pattern = /^\s*(procedure|function)\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*(?:\(([^)]*)\))?/i;

  for (let i = 0; i < lines.length; i++) {
    const match = pattern.exec(lines[i]);
    if (match) {
      const kind = match[1];
      const name = match[2];
      const params = (match[3] ?? '').trim();
      details.push({
        name,
        signature: `${kind} ${name}(${params})`,
        lineStart: i + 1,
        lineEnd: findEndKeywordLine(lines, i, /^\s*end\s*;/i)
      });
    }
  }

  return details;
}

function extractDbCalls(lines: string[]): string[] {
  const calls: string[] = [];
  const patterns: Array<{ label: string; regex: RegExp }> = [
    { label: 'SQL SELECT', regex: /\bSELECT\s+[^\n]{1,120}\bFROM\b/i },
    { label: 'SQL INSERT', regex: /\bINSERT\s+INTO\s+[a-zA-Z_][a-zA-Z0-9_.]*/i },
    { label: 'SQL UPDATE', regex: /\bUPDATE\s+[a-zA-Z_][a-zA-Z0-9_.]*\s+SET\b/i },
    { label: 'SQL DELETE', regex: /\bDELETE\s+FROM\s+[a-zA-Z_][a-zA-Z0-9_.]*/i },
    { label: 'mysql_query', regex: /\bmysql_query\s*\(/i },
    { label: 'mysql_connect', regex: /\bmysql_connect\s*\(/i },
    { label: 'conn.Execute', regex: /\bconn\.Execute\b/i },
    { label: 'conn.Open', regex: /\bconn\.Open\b/i },
    { label: 'ADODB.Connection', regex: /ADODB\.Connection/i },
    { label: 'ADODB.Recordset', regex: /ADODB\.Recordset/i },
    { label: 'EXEC SQL', regex: /\bEXEC\s+SQL\b/i },
    {
      label: 'ADO.NET DB',
      regex: /\b(?:SqlCommand|SqlConnection|OleDbCommand|OleDbConnection|OdbcCommand)\b/
    },
    {
      label: 'Native SQL API',
      regex: /\b(?:sqlite3_exec|PQexec|PQconnectdb|OCIStmtExecute|mysql_real_query|SQLExecDirect)\b/
    },
    { label: 'Perl DBI', regex: /\bDBI\s*->\s*connect\b/i }
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    for (const { label, regex } of patterns) {
      if (regex.test(line)) {
        calls.push(`Line ${i + 1}: ${label} — ${line.slice(0, 100)}`);
      }
    }
  }

  return [...new Set(calls)];
}

function extractSideEffects(lines: string[]): string[] {
  const effects: string[] = [];
  const patterns: Array<{ label: string; regex: RegExp }> = [
    { label: 'Output (echo/print)', regex: /\b(?:echo|print)\b/i },
    { label: 'Session state', regex: /\bSession(?:\s*\(|\.Abandon\b)/i },
    { label: 'HTTP Response', regex: /\bResponse\.(?:Redirect|Write)\b/i },
    { label: 'HTTP Request input', regex: /\bRequest\.(?:Form|QueryString|ServerVariables)\b/i },
    { label: 'PHP superglobal', regex: /\$_(?:GET|POST|SESSION|COOKIE|REQUEST|SERVER)\b/ },
    { label: 'UI dialog (MsgBox)', regex: /\bMsgBox\b/i },
    { label: 'UI control mutation', regex: /\.(?:Text|Caption)\s*=/i },
    { label: 'COBOL I/O (DISPLAY/ACCEPT)', regex: /\b(?:DISPLAY|ACCEPT)\b/i },
    {
      label: 'C/C++ stdio/file I/O',
      regex: /\b(?:printf|fprintf|sprintf|scanf|sscanf|gets|fgets|fopen|std::cout|std::cin|cout\s*<<|cin\s*>>)\b/
    },
    { label: 'C# Console I/O', regex: /\bConsole\.(?:Write|WriteLine|Read|ReadLine)\b/ },
    {
      label: 'Fortran I/O (PRINT/WRITE/READ)',
      regex: /^\s*(?:PRINT\s*\*|WRITE\s*\(|READ\s*(?:\(|\*))/i
    }
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    for (const { label, regex } of patterns) {
      if (regex.test(line)) {
        effects.push(`Line ${i + 1}: ${label}`);
      }
    }
  }

  return [...new Set(effects)];
}

function extractExternalDeps(lines: string[]): string[] {
  const deps: string[] = [];
  const patterns: RegExp[] = [
    /\b(?:include|include_once|require|require_once)\s*\(?['"]([^'"]+)['"]\)?/i,
    /Server\.CreateObject\s*\(\s*['"]([^'"]+)['"]\s*\)/i,
    /Attribute\s+VB_Name\s*=\s*"([^"]+)"/i,
    /^\s*uses\s+([^;]+);/i,
    /^\s*#include\s+[<"]([^>"]+)[>"]/i,
    /^\s*COPY\s+([A-Z0-9_-]+)/i,
    /^\s*using\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*;/,
    /^\s*Imports\s+([a-zA-Z_][a-zA-Z0-9_.]*)/i,
    /^\s*(?:USE|INCLUDE)\s+['"]?([a-zA-Z0-9_.-]+)['"]?/i,
    /^\s*use\s+([a-zA-Z0-9_:]+)/
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = pattern.exec(line);
      if (match && match[1]) {
        deps.push(match[1].trim());
      }
    }
  }

  return [...new Set(deps)];
}

function calculateComplexity(functions: string[]): number {
  return functions.length;
}

/**
 * Performs deterministic static analysis on legacy source code before LLM archaeology.
 */
export function parseLegacyCode(content: string, language: string): ParseResult {
  const normalized = normalizeLineEndings(content);
  const lines = normalized.split('\n');
  const lineCount = lines.length;
  const rawLang = language.trim().toLowerCase();
  const lang =
    rawLang && rawLang !== 'unknown' && rawLang !== 'auto'
      ? rawLang
      : (detectLanguageFromContent(normalized) ?? '');

  let functionDetails: FunctionDetail[] = [];
  let globals: string[] = [];
  let dbCalls: string[] = [];
  let sideEffects: string[] = [];
  let externalDeps: string[] = [];

  try {
    switch (lang) {
      case 'php':
        functionDetails = extractPhpFunctions(lines);
        globals = extractPhpGlobals(normalized);
        break;
      case 'asp':
      case 'asp_vbs':
      case 'vbscript':
        functionDetails = extractAspFunctions(lines);
        globals = extractVb6Globals(normalized);
        break;
      case 'vb6':
      case 'vb':
        functionDetails = extractVb6Functions(lines);
        globals = extractVb6Globals(normalized);
        break;
      case 'cobol':
        functionDetails = extractCobolParagraphs(lines);
        globals = extractCobolGlobals(lines);
        break;
      case 'delphi':
      case 'pascal':
        functionDetails = extractDelphiFunctions(lines);
        break;
      case 'c':
        functionDetails = extractCFunctions(lines);
        globals = extractCGlobals(lines);
        break;
      case 'cpp':
      case 'c++':
        functionDetails = extractCppFunctions(lines);
        globals = extractCppGlobals(lines);
        break;
      case 'csharp':
      case 'cs':
        functionDetails = extractCSharpFunctions(lines);
        globals = extractCSharpGlobals(lines);
        break;
      case 'fortran':
      case 'f77':
      case 'f90':
        functionDetails = extractFortranFunctions(lines);
        globals = extractFortranGlobals(lines);
        break;
      case 'perl':
        functionDetails = extractPerlFunctions(lines);
        globals = extractPerlGlobals(normalized);
        break;
      default:
        break;
    }

    dbCalls = extractDbCalls(lines);
    sideEffects = extractSideEffects(lines);
    externalDeps = extractExternalDeps(lines);
  } catch {
    functionDetails = [];
    globals = [];
    dbCalls = [];
    sideEffects = [];
    externalDeps = [];
  }

  const uniqueFunctions = [...new Set(functionDetails.map((f) => f.name))];
  const uniqueGlobals = [...new Set(globals)];

  return {
    functions: uniqueFunctions,
    functionDetails,
    globals: uniqueGlobals,
    dbCalls,
    sideEffects,
    externalDeps,
    language: lang,
    lineCount,
    complexity: calculateComplexity(uniqueFunctions)
  };
}
