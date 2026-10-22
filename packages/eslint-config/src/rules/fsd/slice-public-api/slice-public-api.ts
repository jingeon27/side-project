import type { TSESLint } from '@typescript-eslint/utils';

import {
  createImportVisitor,
  fsdOptionsSchema,
  isBarrel,
  isLayerRootBarrel,
  isOwnBarrel,
  isPublicDeepImport,
  SLICED_LAYERS,
  SRC_DIR_MESSAGE,
  type TFsdOptions,
} from '../fsd.helper';

export const slicePublicApi: TSESLint.RuleModule<
  'deep' | 'ownBarrel' | 'layerBarrel' | 'srcDir',
  TFsdOptions
> = {
  defaultOptions: [{}],
  meta: {
    type: 'problem',
    docs: { description: '다른 slice는 공개 API로 가져오고 자기 배럴은 import하지 않는다.' },
    schema: fsdOptionsSchema,
    messages: {
      deep: '{{layer}}/{{slice}}의 내부 파일 대신 공개 API(index.ts)를 import하세요: {{source}}',
      ownBarrel:
        '자기 slice의 index.ts를 import하면 순환 참조가 생깁니다. 상대 경로로 직접 가져오세요: {{source}}',
      layerBarrel:
        '{{layer}} 레이어 루트에는 공개 API가 없습니다. slice의 index.ts를 import하세요: {{source}}',
      srcDir: SRC_DIR_MESSAGE,
    },
  },
  create(context) {
    return createImportVisitor(context, ({ node, source, importer, target }) => {
      if (!SLICED_LAYERS.has(target.layer)) return;
      if (isLayerRootBarrel(target)) {
        context.report({ node, messageId: 'layerBarrel', data: { layer: target.layer, source } });
        return;
      }
      if (importer.layer === target.layer && importer.slice === target.slice) {
        if (isOwnBarrel(target.rest)) context.report({ node, messageId: 'ownBarrel', data: { source } });
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
