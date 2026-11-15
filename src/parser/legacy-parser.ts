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
  '.cbl': 'cobol',
  '.cob': 'cobol',
  '.pas': 'delphi',
  '.dpr': 'delphi'
};

/**
 * Infers a legacy source language identifier from a filename extension.
 */
export function detectLanguageFromFilename(filename: string, fallback = 'php'): string {
  const ext = path.extname(filename).toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] ?? fallback;
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
  const pattern = /^([A-Z][A-Z0-9-]*)\.?\s*$/;
  const ignored = new Set(['PROCEDURE', 'DATA', 'ENVIRONMENT', 'IDENTIFICATION', 'DIVISION', 'SECTION']);

  for (let i = startIdx; i < lines.length; i++) {
    const match = pattern.exec(lines[i]);
    if (match && !ignored.has(match[1])) {
      details.push({
        name: match[1],
        signature: `${match[1]}.`,
        lineStart: i + 1,
        lineEnd: i + 1
      });
    }
  }

  for (let idx = 0; idx < details.length; idx++) {
    const nextStart = idx + 1 < details.length ? details[idx + 1].lineStart - 1 : lines.length;
    details[idx].lineEnd = Math.max(details[idx].lineStart, nextStart);
  }

  return details;
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
    { label: 'EXEC SQL', regex: /\bEXEC\s+SQL\b/i }
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
    { label: 'UI control mutation', regex: /\.(?:Text|Caption)\s*=/i }
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
    /^\s*uses\s+([^;]+);/i
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
  const lang = language.toLowerCase();

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
        break;
      case 'delphi':
      case 'pascal':
        functionDetails = extractDelphiFunctions(lines);
        break;
      default:
        functionDetails = extractPhpFunctions(lines);
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
