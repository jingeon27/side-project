import type { TSESTree } from '@typescript-eslint/utils';

// 두 라이브러리의 deprecated API·fix 타입 차이에 기대지 않고 실제로 쓰는 계약만 받는다.
export interface IRuleContext<TMessageId extends string> {
  readonly filename: string;
  report(descriptor: { node: TSESTree.Node; messageId: TMessageId; data?: Record<string, unknown> }): void;
}
