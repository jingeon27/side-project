import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Preserve positions/newlines while ignoring comments, quoted identifiers and SQL literals.
// Nested comments and dollar-quoted function bodies must not trigger destructive-DDL rules.
export function maskSql(sql) {
  const output = sql.split('');
  let cursor = 0;
  const mask = (end, identifier = false) => {
    for (let index = cursor; index < end; index++)
      if (sql[index] !== '\n') output[index] = identifier ? '_' : ' ';
    cursor = end;
  };
  while (cursor < sql.length) {
    if (sql.startsWith('--', cursor)) {
      const end = sql.indexOf('\n', cursor);
      mask(end < 0 ? sql.length : end);
      continue;
    }
    if (sql.startsWith('/*', cursor)) {
      let depth = 1;
      let end = cursor + 2;
      while (end < sql.length && depth) {
        if (sql.startsWith('/*', end)) {
          depth++;
          end += 2;
          continue;
        }
        if (sql.startsWith('*/', end)) {
          depth--;
          end += 2;
          continue;
        }
        end++;
      }
      mask(end);
      continue;
    }
    const quote = sql[cursor];
    if (quote === "'" || quote === '"') {
      let end = cursor + 1;
      while (end < sql.length) {
        if (sql[end] !== quote) {
          end++;
          continue;
        }
        if (sql[end + 1] === quote) {
          end += 2;
          continue;
        }
        end++;
        break;
      }
      mask(end, quote === '"');
      continue;
    }
    const tag = sql.slice(cursor).match(/^\$(?:[a-zA-Z_][\w]*)?\$/)?.[0];
    if (tag) {
      const end = sql.indexOf(tag, cursor + tag.length);
      mask(end < 0 ? sql.length : end + tag.length);
      continue;
    }
    cursor++;
  }
  return output.join('');
}
const rules = [
  ['DROP TABLE', /\bDROP\s+TABLE\b/gi],
  ['DROP COLUMN', /\bDROP\s+(?:COLUMN\s+)?(?!(?:TABLE|INDEX|CONSTRAINT|NOT)\b)[\w\s]*?(?=,|;|$)/gi],
  ['ALTER COLUMN TYPE', /\bALTER\s+(?:COLUMN\s+)?\w*\s+(?:TYPE|SET\s+DATA\s+TYPE)\b/gi],
  ['SET NOT NULL', /\bSET\s+NOT\s+NULL\b/gi],
  ['DROP NOT NULL', /\bDROP\s+NOT\s+NULL\b/gi],
  ['RENAME', /\bRENAME\b/gi],
  ['DROP CONSTRAINT', /\bDROP\s+CONSTRAINT\b/gi],
  ['DROP INDEX', /\bDROP\s+INDEX\b/gi],
];
export function checkMigration(sql) {
  const masked = maskSql(sql);
  const lines = sql.split('\n');
  const errors = [];
  for (const [rule, pattern] of rules) {
    for (const match of masked.matchAll(pattern)) {
      const line = masked.slice(0, match.index).split('\n').length;
      // Require the exact rule and a nonempty reason on the immediately preceding line.
      const allowance = lines[line - 2]?.match(
        /^\s*--\s*migration-lint:\s*allow\s+(.+?)\s+[—–]\s+(.+?)\s*$/i,
      );
      if (allowance?.[1]?.toUpperCase() === rule && (allowance[2]?.trim().length ?? 0) >= 5) continue;
      errors.push({ line, rule });
    }
  }
  return errors;
}
export function newlyAddedMigrations({ base, head = 'HEAD', cwd = process.cwd() }) {
  const args = [
    'diff',
    '--name-only',
    '--diff-filter=A',
    '-z',
    `${base}...${head}`,
    '--',
    'projects/*/apps/api/prisma/migrations/*/migration.sql',
  ];
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).split('\0').filter(Boolean);
}
// 강제 push의 before는 새 HEAD의 조상이 아니라서, 그대로 쓰면 그 사이 develop에 합쳐진 migration까지 새 파일로 센다.
export function migrationBase({
  requested,
  head = 'HEAD',
  fallback = 'origin/develop',
  cwd = process.cwd(),
}) {
  if (!requested || /^0+$/.test(requested)) return fallback;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', requested, head], { cwd, stdio: 'ignore' });
    return requested;
  } catch {
    return fallback;
  }
}
export function main() {
  const base = migrationBase({ requested: process.env.MIGRATION_BASE_REF });
  const files = newlyAddedMigrations({ base });
  const errors = files.flatMap((file) =>
    checkMigration(readFileSync(file, 'utf8')).map(
      (error) =>
        `${file}:${error.line}: ${error.rule} requires expand/deploy/contract or a reviewed migration-lint allowance.`,
    ),
  );
  for (const error of errors) console.error(error);
  console.log(`Migration compatibility: ${files.length} newly added SQL files checked against ${base}.`);
  if (errors.length) process.exitCode = 1;
}
