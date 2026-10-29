import path from 'node:path';

import { Linter } from 'eslint';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import { describe, expect, it } from 'vitest';

import { handlerNamesConfig } from './react';

function handlerMessages(code: string) {
  const messages = new Linter({ configType: 'flat' }).verify(
    code,
    [...nextVitals, ...nextTypescript, handlerNamesConfig],
    { filename: path.join(import.meta.dirname, 'Editor.tsx') },
  );
  expect(messages.filter(({ fatal }) => fatal)).toEqual([]);
  return messages.filter(({ ruleId }) => ruleId === 'react/jsx-handler-names');
}

describe('기존 핸들러 명명 규칙 옵션', () => {
  it.each([
    'export function Editor() { return <Button onClick={actions.handleSave} />; }',
    'export function Editor() { return <Input onChange={props.onChange} />; }',
    'export function Editor() { const { refetch } = useQuery(); return <Boundary onRetry={refetch} />; }',
    'export function Editor() { const [open, setOpen] = useState(false); return <Dialog onOpenChange={setOpen} />; }',
    'export function Editor() { return <FeedLoadMore onLoadMore={pagination.fetchNextPage} />; }',
    'export function Editor() { return <Button onClick={() => save()} />; }',
  ])('추가 래퍼 없이 기존 참조와 인라인 콜백을 전달할 수 있다: %s', (code) => {
    expect(handlerMessages(code)).toEqual([]);
  });

  it('로컬 식별자는 직접 작성한 함수여도 검사에서 제외되는 한계를 보존한다', () => {
    expect(
      handlerMessages(
        'export function Editor() { const submit = () => save(); return <Button onClick={submit} />; }',
      ),
    ).toEqual([]);
  });

  it('접두사가 맞지 않는 멤버 핸들러는 계속 검사한다', () => {
    expect(handlerMessages('export function Editor() { return <Button onClick={actions.save} />; }')).toEqual(
      [expect.objectContaining({ messageId: 'badHandlerName' })],
    );
  });

  it('핸들러를 받는 prop의 on 접두사를 검사한다', () => {
    expect(
      handlerMessages('export function Editor() { return <Button click={actions.handleSave} />; }'),
    ).toEqual([expect.objectContaining({ messageId: 'badPropKey' })]);
  });
});

describe('Next의 기존 React 플러그인 재사용', () => {
  it('별도 객체로 등록된 플러그인에도 중복 등록 없이 옵션만 더한다', () => {
    const independentNext = nextVitals.map((preset) => {
      const react = preset.plugins?.react;
      if (!react) return preset;
      return { ...preset, plugins: { ...preset.plugins, react: { ...react } } };
    });
    const messages = new Linter({ configType: 'flat' }).verify(
      'export function Editor() { return <Button onClick={actions.save} />; }',
      [...independentNext, ...nextTypescript, handlerNamesConfig],
      { filename: path.join(import.meta.dirname, 'Editor.tsx') },
    );
    expect(messages.filter(({ fatal }) => fatal)).toEqual([]);
    expect(messages.some(({ ruleId }) => ruleId === 'react/jsx-handler-names')).toBe(true);
  });
});
