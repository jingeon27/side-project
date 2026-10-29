import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import reviewedMigrations from './reviewed-migrations.json' with { type: 'json' };

interface IScanResult {
  masked: string;
  opaqueBodies: number[];
}
interface IViolation {
  index: number;
  rule: string;
}
interface IMigrationBaseOptions {
  requested?: string | null;
  event?: string;
  head?: string;
  deployRef?: string;
  fallback?: string;
  cwd?: string;
}
interface IMigrationReview {
  sha256: string;
  reason: string;
}

/** 적용 이력은 SQL 주석도 고치지 않는다. 파일 경로와 원문 해시가 일치한 검토 기록만 인정한다. */
export function migrationReviews({
  cwd,
  reviews = reviewedMigrations,
}: {
  cwd: string;
  reviews?: Record<string, IMigrationReview>;
}) {
  const files = new Set(Object.keys(reviews));
  const errors = Object.entries(reviews).flatMap(([file, review]) => {
    try {
      const digest = createHash('sha256')
        .update(readFileSync(path.join(cwd, file)))
        .digest('hex');
      if (digest === review.sha256 && review.reason.trim().length >= 5) return [];
      return [`${file}: reviewed migration.sql or its review was modified; add a new migration instead.`];
    } catch {
      return [`${file}: reviewed migration.sql is missing or unreadable; do not delete migration history.`];
    }
  });
  return { files, errors };
}

const MIGRATION_PATHSPEC = 'projects/*/apps/api/prisma/migrations/*/migration.sql';
// 식별자를 잇는 글자 뒤의 $·E·U&는 달러 인용이나 접두 문자열이 아니라 식별자의 일부다(`a$$`, `nameE`).
const IDENTIFIER_CHAR = /[\w$]/;
const DOLLAR_TAG = /^\$(?:[A-Za-z_\u0080-￿][\w\u0080-￿]*)?\$/;
// DO 블록과 함수·프로시저 본문은 migration이 실행하거나 정의하는 SQL이라 문자열로 가리지 않고 검사한다.
const CODE_BODY_PREFIX = /\b(?:AS|DO|DO\s+LANGUAGE\s+[A-Za-z_][\w$]*)\s*$/i;
const DO_PREFIX = /\bDO(?:\s+LANGUAGE\s+[A-Za-z_][\w$]*)?\s*$/i;

function scanSql(sql: string): IScanResult {
  const output = sql.split('');
  // 작은따옴표 DO 본문은 이스케이프 때문에 위치를 보존한 채 다시 검사할 수 없어 따로 표시한다.
  const opaqueBodies: number[] = [];
  const position = { cursor: 0 };
  const fill = (start: number, end: number, char: string) => {
    for (const [offset, value] of sql.slice(start, end).split('').entries())
      if (value !== '\n') output[start + offset] = char;
  };
  const quotedEnd = (quoteIndex: number, backslashEscapes: boolean) => {
    const quote = sql[quoteIndex];
    const position = { end: quoteIndex + 1 };
    while (position.end < sql.length) {
      if (backslashEscapes && sql[position.end] === '\\') {
        position.end += 2;
        continue;
      }
      if (sql[position.end] !== quote) {
        position.end++;
        continue;
      }
      if (sql[position.end + 1] === quote) {
        position.end += 2;
        continue;
      }
      return position.end + 1;
    }
    return sql.length;
  };
  const maskedBefore = (index: number) => output.slice(Math.max(0, index - 80), index).join('');
  while (position.cursor < sql.length) {
    const previous = position.cursor > 0 ? (sql[position.cursor - 1] ?? '') : '';
    const prefixAllowed = !IDENTIFIER_CHAR.test(previous);
    if (sql.startsWith('--', position.cursor)) {
      const newline = sql.indexOf('\n', position.cursor);
      const end = newline < 0 ? sql.length : newline;
      fill(position.cursor, end, ' ');
      position.cursor = end;
      continue;
    }
    if (sql.startsWith('/*', position.cursor)) {
      const comment = { depth: 1, end: position.cursor + 2 };
      while (comment.end < sql.length && comment.depth) {
        if (sql.startsWith('/*', comment.end)) {
          comment.depth++;
          comment.end += 2;
          continue;
        }
        if (sql.startsWith('*/', comment.end)) {
          comment.depth--;
          comment.end += 2;
          continue;
        }
        comment.end++;
      }
      fill(position.cursor, comment.end, ' ');
      position.cursor = comment.end;
      continue;
    }
    if (prefixAllowed && /^[uU]&["']/.test(sql.slice(position.cursor, position.cursor + 3))) {
      const end = quotedEnd(position.cursor + 2, false);
      fill(position.cursor, end, sql[position.cursor + 2] === '"' ? '_' : ' ');
      position.cursor = end;
      continue;
    }
    if (prefixAllowed && /^[eE]'/.test(sql.slice(position.cursor, position.cursor + 2))) {
      if (DO_PREFIX.test(maskedBefore(position.cursor))) opaqueBodies.push(position.cursor);
      const end = quotedEnd(position.cursor + 1, true);
      fill(position.cursor, end, ' ');
      position.cursor = end;
      continue;
    }
    const char = sql[position.cursor];
    if (char === "'" || char === '"') {
      if (char === "'" && DO_PREFIX.test(maskedBefore(position.cursor))) opaqueBodies.push(position.cursor);
      const end = quotedEnd(position.cursor, false);
      fill(position.cursor, end, char === '"' ? '_' : ' ');
      position.cursor = end;
      continue;
    }
    const tag = char === '$' && prefixAllowed ? sql.slice(position.cursor).match(DOLLAR_TAG)?.[0] : undefined;
    if (tag) {
      const bodyStart = position.cursor + tag.length;
      const closing = sql.indexOf(tag, bodyStart);
      const bodyEnd = closing < 0 ? sql.length : closing;
      const end = closing < 0 ? sql.length : closing + tag.length;
      if (!CODE_BODY_PREFIX.test(maskedBefore(position.cursor))) {
        fill(position.cursor, end, ' ');
        position.cursor = end;
        continue;
      }
      const inner = scanSql(sql.slice(bodyStart, bodyEnd));
      fill(position.cursor, bodyStart, ' ');
      for (const [index, value] of inner.masked.split('').entries()) output[bodyStart + index] = value;
      opaqueBodies.push(...inner.opaqueBodies.map((index) => bodyStart + index));
      fill(bodyEnd, end, ' ');
      position.cursor = end;
      continue;
    }
    position.cursor++;
  }
  return { masked: output.join(''), opaqueBodies };
}

// Preserve positions/newlines while ignoring comments, quoted identifiers and SQL literals.
// Nested comments and plain dollar-quoted literals are hidden; DO blocks and routine bodies stay visible.
export function maskSql(sql: string) {
  return scanSql(sql).masked;
}

const IDENT = String.raw`[A-Za-z_][\w$]*(?:\s*\.\s*[A-Za-z_][\w$]*)*`;
const KEYWORD_RULES: [string, RegExp][] = [
  ['DROP TABLE', /\bDROP\s+TABLE\b/gi],
  ['DROP COLUMN', /\bDROP\s+COLUMN\b/gi],
  ['SET NOT NULL', /\bSET\s+NOT\s+NULL\b/gi],
  ['DROP NOT NULL', /\bDROP\s+NOT\s+NULL\b/gi],
  ['DROP DEFAULT', /\bDROP\s+DEFAULT\b/gi],
  ['DROP IDENTITY', /\bDROP\s+IDENTITY\b/gi],
  ['DROP EXPRESSION', /\bDROP\s+EXPRESSION\b/gi],
  ['DROP CONSTRAINT', /\bDROP\s+CONSTRAINT\b/gi],
  ['DROP INDEX', /\bDROP\s+INDEX\b/gi],
  // 트리거 이벤트(BEFORE TRUNCATE ON)와 권한(GRANT TRUNCATE, SELECT ON)은 데이터를 지우지 않는다.
  ['TRUNCATE', /\bTRUNCATE\b(?!\s*(?:,|ON\b|OR\b))/gi],
  // 문자열로 만든 SQL은 정적으로 검사할 수 없다. 트리거의 EXECUTE FUNCTION과 GRANT EXECUTE ON은 제외한다.
  ['DYNAMIC SQL', /\bEXECUTE\b(?!\s+(?:ON|FUNCTION|PROCEDURE)\b)/gi],
];
const DROP_OBJECT =
  /\bDROP\s+(MATERIALIZED\s+VIEW|VIEW|TYPE|FUNCTION|PROCEDURE|SEQUENCE|SCHEMA|TRIGGER|EXTENSION|DOMAIN)\b/gi;
const CREATE_TABLE = new RegExp(
  String.raw`\bCREATE\s+(?:(?:GLOBAL|LOCAL)\s+)?(?:(?:TEMP|TEMPORARY|UNLOGGED)\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${IDENT})`,
  'dgi',
);
const CREATE_INDEX = /\bCREATE\s+(UNIQUE\s+)?INDEX\b(\s+CONCURRENTLY\b)?/gi;
const INDEX_TABLE = new RegExp(
  String.raw`^(?:\s+IF\s+NOT\s+EXISTS)?(?:\s+(?!ON\b)${IDENT})?\s+ON\s+(?:ONLY\s+)?(${IDENT})`,
  'di',
);
const ALTER_TABLE = new RegExp(
  String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(${IDENT})(?:\s*\*)?`,
  'dgi',
);
const ALTER_COLUMN_TYPE = new RegExp(
  String.raw`^ALTER\s+(?:COLUMN\s+)?${IDENT}\s+(?:SET\s+DATA\s+)?TYPE\b`,
  'i',
);
const DELETE_FROM = /\bDELETE\s+FROM\b/gi;
const UPDATE_SET = new RegExp(
  String.raw`(?<!\b(?:ON|FOR|OR|OF|BEFORE|AFTER|GRANT|REVOKE)\s+)\bUPDATE\s+(?:ONLY\s+)?${IDENT}(?:\s*\*)?(?:\s+(?:AS\s+)?(?!SET\b)${IDENT})?\s+SET\b`,
  'gi',
);
const ALLOWANCE = /^\s*--\s*migration-lint:\s*allow\s+(.+?)\s+[—–]\s+(.+?)\s*$/i;
export const PRISMA_WARNINGS = 'PRISMA WARNINGS';

// 따옴표 식별자는 대소문자를 보존하고, 따옴표 없는 식별자는 PostgreSQL처럼 소문자로 접는다. 스키마는 무시한다.
function identifierKey(raw: string) {
  const last = raw.match(/(?:U&)?"(?:[^"]|"")*"|[^."\s]+/g)?.at(-1) ?? raw;
  if (last.startsWith('"')) return last.slice(1, -1).replaceAll('""', '"');
  if (/^U&"/i.test(last)) return last;
  return last.toLowerCase();
}

// 괄호 안을 비워 컬럼 정의의 최상위 키워드만 남긴다(CHECK (x IS NOT NULL)의 NOT NULL을 무시).
function topLevel(text: string) {
  const state = { depth: 0 };
  return text.replace(/[\s\S]/g, (char) => {
    if (char === '(') state.depth++;
    const visible = state.depth === 0 ? char : char === '\n' ? '\n' : ' ';
    if (char === ')') state.depth = Math.max(0, state.depth - 1);
    return visible;
  });
}

function splitTopLevel(text: string, separator: string) {
  const parts: { offset: number; text: string }[] = [];
  const state = { depth: 0, begin: 0 };
  for (const [index, char] of (text + '\0').split('').entries()) {
    if (char === '(') state.depth++;
    if (char === ')') state.depth = Math.max(0, state.depth - 1);
    if (index === text.length || (char === separator && state.depth === 0)) {
      parts.push({ offset: state.begin, text: text.slice(state.begin, index) });
      state.begin = index + 1;
    }
  }
  return parts;
}

function hasTopLevelWhere(text: string, from: number) {
  const state = { depth: 0 };
  const pattern = /[()]|\bWHERE\b/gi;
  pattern.lastIndex = from;
  for (const match of text.matchAll(pattern)) {
    if (match[0] === '(') state.depth++;
    if (match[0] === ')') state.depth--;
    if (state.depth === 0 && match[0].toUpperCase() === 'WHERE') return true;
    if (state.depth < 0) return false;
  }
  return false;
}

function alterTableViolations(action: string, isNewTable: boolean): IViolation[] {
  const trimmed = action.trimStart();
  const lead = action.length - trimmed.length;
  const at = (rule: string) => [{ index: lead, rule }];
  if (
    /^DROP\s+(?!(?:COLUMN|CONSTRAINT|NOT|DEFAULT|IDENTITY|EXPRESSION|TABLE|INDEX)\b)(?:IF\s+EXISTS\s+)?[A-Za-z_]/i.test(
      trimmed,
    )
  )
    return at('DROP COLUMN');
  if (ALTER_COLUMN_TYPE.test(trimmed)) return at('ALTER COLUMN TYPE');
  const add = trimmed.match(/^ADD\s+(COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?/i);
  if (!add || isNewTable) return [];
  const body = topLevel(trimmed.slice(add[0].length));
  const notValid = /\bNOT\s+VALID\b/i.test(body);
  const constraint = !add[1] && /^(?:CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|EXCLUDE)\b/i.test(body);
  if (constraint) {
    if (/\bFOREIGN\s+KEY\b/i.test(body) && !notValid) return at('ADD FOREIGN KEY');
    if (/\bCHECK\b/i.test(body) && !notValid) return at('ADD CHECK');
    if (/\bUNIQUE\b/i.test(body) && !/\bUNIQUE\s+USING\s+INDEX\b/i.test(body)) return at('ADD UNIQUE');
    if (/\bPRIMARY\s+KEY\b/i.test(body) && !/\bPRIMARY\s+KEY\s+USING\s+INDEX\b/i.test(body))
      return at('ADD PRIMARY KEY');
    return [];
  }
  const violations: IViolation[] = [];
  const hasDefault = /\b(?:DEFAULT|GENERATED|(?:SMALL|BIG)?SERIAL[248]?)\b/i.test(body);
  if (/\b(?:NOT\s+NULL|PRIMARY\s+KEY)\b/i.test(body) && !hasDefault)
    violations.push(...at('ADD COLUMN NOT NULL'));
  if (/\bUNIQUE\b/i.test(body)) violations.push(...at('ADD UNIQUE'));
  if (/\bPRIMARY\s+KEY\b/i.test(body)) violations.push(...at('ADD PRIMARY KEY'));
  if (/\bREFERENCES\b/i.test(body)) violations.push(...at('ADD FOREIGN KEY'));
  if (/\bCHECK\b/i.test(body)) violations.push(...at('ADD CHECK'));
  return violations;
}

function statementViolations(
  text: string,
  keyOf: (start: number, length: number) => string,
  newTables: Set<string>,
): IViolation[] {
  const violations: IViolation[] = [];
  for (const [rule, pattern] of KEYWORD_RULES)
    for (const match of text.matchAll(pattern)) violations.push({ index: match.index, rule });
  for (const match of text.matchAll(DROP_OBJECT))
    violations.push({
      index: match.index,
      rule: `DROP ${(match[1] ?? '').toUpperCase().replace(/\s+/g, ' ')}`,
    });
  for (const match of text.matchAll(/\bRENAME\b/gi)) {
    const alter = [...text.slice(0, match.index).matchAll(/\bALTER\s+([A-Za-z]+)/gi)].at(-1);
    if (alter?.[1]?.toUpperCase() === 'INDEX') continue;
    violations.push({ index: match.index, rule: 'RENAME' });
  }
  for (const match of text.matchAll(CREATE_INDEX)) {
    const after = match.index + match[0].length;
    const target = INDEX_TABLE.exec(text.slice(after));
    const span = target?.indices?.[1];
    if (span && newTables.has(keyOf(after + span[0], span[1] - span[0]))) continue;
    if (match[1]) violations.push({ index: match.index, rule: 'CREATE UNIQUE INDEX' });
    if (!match[1] && !match[2]) violations.push({ index: match.index, rule: 'CREATE INDEX' });
  }
  for (const match of text.matchAll(ALTER_TABLE)) {
    const span = match.indices?.[1];
    if (!span) continue;
    const [tableStart, tableEnd] = span;
    const isNewTable = newTables.has(keyOf(tableStart, tableEnd - tableStart));
    const actionsStart = match.index + match[0].length;
    for (const action of splitTopLevel(text.slice(actionsStart), ','))
      for (const violation of alterTableViolations(action.text, isNewTable))
        violations.push({ index: actionsStart + action.offset + violation.index, rule: violation.rule });
  }
  for (const match of text.matchAll(DELETE_FROM))
    if (!hasTopLevelWhere(text, match.index + match[0].length))
      violations.push({ index: match.index, rule: 'DELETE WITHOUT WHERE' });
  for (const match of text.matchAll(UPDATE_SET))
    if (!hasTopLevelWhere(text, match.index + match[0].length))
      violations.push({ index: match.index, rule: 'UPDATE WITHOUT WHERE' });
  return violations;
}

export function checkMigration(sql: string) {
  const { masked, opaqueBodies } = scanSql(sql);
  const lines = sql.split('\n');
  const lineStarts = [0, ...[...sql.matchAll(/\n/g)].map((match) => match.index + 1)];
  const lineOf = (index: number) => {
    const next = lineStarts.findIndex((start) => start > index);
    return next < 0 ? lineStarts.length : next;
  };
  const keyOf = (start: number, length: number) => identifierKey(sql.slice(start, start + length));
  const newTables = new Set(
    [...masked.matchAll(CREATE_TABLE)].flatMap(({ indices }) => {
      const span = indices?.[1];
      return span ? [keyOf(span[0], span[1] - span[0])] : [];
    }),
  );
  const errors: { line: number; rule: string }[] = [];
  // Prisma는 데이터 손실·실패 가능성이 있는 migration 맨 위에 Warnings 주석을 넣는다. 검토 후 지워야 한다.
  const warnings = /\/\*\s*Warnings:/.exec(sql);
  if (warnings) errors.push({ line: lineOf(warnings.index), rule: PRISMA_WARNINGS });
  const position = { begin: 0 };
  const ends = [...masked.matchAll(/;/g)].map((match) => match.index).concat(masked.length);
  for (const end of ends) {
    const segment = masked.slice(position.begin, end);
    const offset = segment.search(/\S/);
    const start = position.begin + offset;
    position.begin = end + 1;
    if (offset < 0) continue;
    // 허용 표시는 문장 시작 줄 바로 위에 붙은 주석 줄들이고, 그 뒤 첫 문장 하나에만 적용한다.
    const line = lineOf(start);
    const allowed = new Set();
    if (!masked.slice(lineStarts[line - 1], start).trim())
      for (const comment of lines.slice(0, line - 1).reverse()) {
        const allowance = comment.match(ALLOWANCE);
        if (!allowance) break;
        if ((allowance[2]?.trim().length ?? 0) >= 5)
          allowed.add((allowance[1] ?? '').trim().toUpperCase().replace(/\s+/g, ' '));
      }
    const violations = statementViolations(
      segment.slice(offset),
      (at, length) => keyOf(start + at, length),
      newTables,
    );
    for (const bodyIndex of opaqueBodies)
      if (bodyIndex >= start && bodyIndex < end)
        violations.push({ index: bodyIndex - start, rule: 'DYNAMIC SQL' });
    for (const violation of violations)
      if (!allowed.has(violation.rule))
        errors.push({ line: lineOf(start + violation.index), rule: violation.rule });
  }
  return errors.sort((left, right) => left.line - right.line);
}

const STATUS_LABELS: Record<string, string> = { M: 'modified', D: 'deleted', T: 'changed type' };

// 이동한 migration을 새 파일로 보도록 rename 감지를 끈다. 이미 있던 migration.sql은 고치거나 지우지 않는다.
export function migrationChanges({
  base,
  head = 'HEAD',
  cwd = process.cwd(),
}: {
  base: string;
  head?: string;
  cwd?: string;
}) {
  const args = ['diff', '--name-status', '--no-renames', '-z', `${base}...${head}`, '--', MIGRATION_PATHSPEC];
  const fields = execFileSync('git', args, { cwd, encoding: 'utf8' }).split('\0');
  const added: string[] = [];
  const changed: { file: string; status: string }[] = [];
  for (const [index, status] of fields.entries()) {
    if (index % 2 !== 0) continue;
    const file = fields[index + 1];
    if (!status || !file) continue;
    if (status === 'A') added.push(file);
    if (status !== 'A') changed.push({ file, status: STATUS_LABELS[status] ?? status });
  }
  return { added, changed };
}

function git(args: string[], cwd: string) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}
const commitOf = (ref: string | null | undefined, cwd: string) =>
  ref && !/^0+$/.test(ref) ? git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd) : null;
const isAncestor = (ancestor: string, descendant: string, cwd: string) =>
  git(['merge-base', '--is-ancestor', ancestor, descendant], cwd) !== null;

// 기준은 HEAD와 다른 조상 중 (1) PR base·push before, (2) fallback(origin/develop)과의 merge-base,
// (3) 배포 브랜치(origin/main)와의 merge-base 순서로 고른다. 새 브랜치 첫 push의 before는 0000이고 강제 push의 before는
// 새 HEAD의 조상이 아니다. 기능 브랜치는 develop에서 갈라진 뒤 더한 migration만 보고, develop 자신(merge-base가 HEAD)만
// 아직 배포되지 않은 migration 전체를 origin/main 기준으로 다시 본다.
export function migrationBase({
  requested,
  event,
  head = 'HEAD',
  deployRef = 'origin/main',
  fallback = 'origin/develop',
  cwd = process.cwd(),
}: IMigrationBaseOptions) {
  const headCommit = commitOf(head, cwd);
  if (!headCommit) throw new Error(`Migration compatibility: cannot resolve ${head}.`);
  const mergeBase = (ref: string) => {
    const commit = commitOf(ref, cwd);
    return commit ? git(['merge-base', commit, headCommit], cwd) : null;
  };
  const deployCommit = commitOf(deployRef, cwd);
  for (const candidate of [requested, mergeBase(fallback), mergeBase(deployRef)]) {
    const commit = commitOf(candidate, cwd);
    if (commit && commit !== headCommit && isAncestor(commit, headCommit, cwd) && candidate) return candidate;
  }
  // HEAD가 이미 배포 브랜치에 있으면 새로 배포될 migration이 없다. push는 새 커밋을 가져오므로 빈 비교를 허용하지 않는다.
  if (event !== 'push' && deployCommit && isAncestor(headCommit, deployCommit, cwd)) return headCommit;
  throw new Error(
    `Migration compatibility: no base ref differs from ${head} (requested ${requested || '(none)'}, ${deployRef}, ${fallback}). ` +
      'Set MIGRATION_BASE_REF to the last checked commit.',
  );
}

function explain(rule: string) {
  if (rule === PRISMA_WARNINGS)
    return `${rule}: review the Prisma warning, split risky steps, then delete the Warnings comment.`;
  return `${rule} requires expand/deploy/contract or a reviewed migration-lint allowance.`;
}

export function main({
  env = process.env,
  cwd = process.cwd(),
  reviews = reviewedMigrations,
}: { env?: NodeJS.ProcessEnv; cwd?: string; reviews?: Record<string, IMigrationReview> } = {}) {
  const resolveBase = () => {
    try {
      return migrationBase({ requested: env.MIGRATION_BASE_REF, event: env.GITHUB_EVENT_NAME, cwd });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
      return null;
    }
  };
  const base = resolveBase();
  if (!base) return;
  const { added, changed } = migrationChanges({ base, cwd });
  const reviewed = migrationReviews({ cwd, reviews });
  const errors = [
    ...reviewed.errors,
    ...changed.map(
      ({ file, status }) =>
        `${file}: existing migration.sql was ${status}; add a new migration instead of rewriting history.`,
    ),
    ...added
      .filter((file) => !reviewed.files.has(file))
      .flatMap((file) =>
        checkMigration(readFileSync(path.join(cwd, file), 'utf8')).map(
          (error) => `${file}:${error.line}: ${explain(error.rule)}`,
        ),
      ),
  ];
  for (const error of errors) console.error(error);
  console.log(`Migration compatibility: ${added.length} newly added SQL files checked against ${base}.`);
  if (errors.length) process.exitCode = 1;
}
