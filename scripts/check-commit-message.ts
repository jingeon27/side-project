import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Types from the project commit skills plus the ones already used in history.
export const COMMIT_TYPES = [
  'feat',
  'fix',
  'refactor',
  'test',
  'docs',
  'chore',
  'perf',
  'ci',
  'build',
  'style',
  'revert',
  'merge',
];

// Scope is optional because cross-project changes are written as `docs: …`. When present it is a
// lowercase workspace/area name, or several joined by commas (`game-feedback,photo-contest`).
const SCOPE = '[a-z0-9]+(?:-[a-z0-9]+)*';
const HEADER = new RegExp(`^(?:${COMMIT_TYPES.join('|')})(?:\\(${SCOPE}(?:,${SCOPE})*\\))?!?: \\S`);

// Subjects Git writes itself: merge, revert/reapply and autosquash markers.
const GIT_GENERATED = /^(?:Merge |Revert "|Reapply "|(?:fixup|squash|amend)! )/;

// `git commit -v` appends the diff below this line; Git drops it together with comment lines.
const SCISSORS = /^# -+ >8 -+$/;

/** First line Git keeps after its default cleanup, without trailing whitespace. */
export function commitSubject(message: string) {
  for (const line of message.split(/\r?\n/)) {
    if (SCISSORS.test(line)) break;
    if (line.startsWith('#') || !line.trim()) continue;
    return line.trimEnd();
  }
  return '';
}

/** Returns a message describing the problem, or null when the commit message is acceptable. */
export function checkCommitMessage(message: string) {
  const subject = commitSubject(message);
  // Git itself aborts an empty message, so there is nothing to add.
  if (!subject || GIT_GENERATED.test(subject) || HEADER.test(subject)) return null;
  return [
    `커밋 메시지 형식이 맞지 않습니다: ${subject}`,
    '',
    '  <type>(<scope>): <무엇을 ~한다>',
    `  type: ${COMMIT_TYPES.join(' · ')}`,
    '  scope: 선택. 소문자·숫자·하이픈, 여러 개는 쉼표로 잇는다(game-feedback,photo-contest).',
    '  예: feat(web): 사진 좋아요 버튼을 추가한다',
    '      chore: husky로 커밋 전 포맷과 커밋 메시지를 검사한다',
    '',
    '병합·되돌리기·fixup/squash 자동 메시지는 그대로 통과합니다. 비상시에만 --no-verify로 건너뜁니다.',
  ].join('\n');
}

export function main(file = process.argv[2]) {
  if (!file) {
    console.error('사용법: node scripts/check-commit-message.ts <커밋 메시지 파일>');
    process.exitCode = 2;
    return;
  }
  const error = checkCommitMessage(readFileSync(file, 'utf8'));
  if (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
