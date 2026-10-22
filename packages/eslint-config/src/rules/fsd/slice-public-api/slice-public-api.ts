import type { TSESLint } from '@typescript-eslint/utils';

import {
  createImportVisitor,
  fsdOptionsSchema,
  isBarrel,
  isPublicDeepImport,
  SLICED_LAYERS,
  type TFsdOptions,
} from '../fsd.helper';

export const slicePublicApi: TSESLint.RuleModule<'deep' | 'ownBarrel', TFsdOptions> = {
  defaultOptions: [{}],
  meta: {
    type: 'problem',
    docs: { description: '다른 slice는 공개 API로 가져오고 자기 배럴은 import하지 않는다.' },
    schema: fsdOptionsSchema,
    messages: {
      deep: '{{layer}}/{{slice}}의 내부 파일 대신 공개 API(index.ts)를 import하세요: {{source}}',
      ownBarrel:
        '자기 slice의 index.ts를 import하면 순환 참조가 생깁니다. 상대 경로로 직접 가져오세요: {{source}}',
    },
  },
  create(context) {
    return createImportVisitor(context, ({ node, source, importer, target }) => {
      if (!SLICED_LAYERS.has(target.layer) || !target.slice) return;
      if (importer.layer === target.layer && importer.slice === target.slice) {
        if (isBarrel(target.rest)) context.report({ node, messageId: 'ownBarrel', data: { source } });
        return;
      }
      if (!isBarrel(target.rest) && !isPublicDeepImport(target.rest))
        context.report({
          node,
          messageId: 'deep',
          data: { layer: target.layer, slice: target.slice, source },
        });
    });
  },
};
