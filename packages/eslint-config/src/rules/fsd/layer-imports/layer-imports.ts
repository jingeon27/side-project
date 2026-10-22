import type { TSESLint } from '@typescript-eslint/utils';

import {
  createImportVisitor,
  fsdOptionsSchema,
  LAYER_RANK,
  ROUTE_IMPORTABLE_LAYERS,
  type TFsdOptions,
} from '../fsd.helper';

export const layerImports: TSESLint.RuleModule<'upward' | 'route', TFsdOptions> = {
  defaultOptions: [{}],
  meta: {
    type: 'problem',
    docs: { description: '레이어는 자신보다 아래 레이어만 import한다.' },
    schema: fsdOptionsSchema,
    messages: {
      upward: '{{importer}} 레이어는 위 레이어({{target}})를 import할 수 없습니다: {{source}}',
      route:
        'Next 라우트는 화면(pages)·app·shared만 import합니다. {{target}}은 화면 slice를 거쳐 쓰세요: {{source}}',
    },
  },
  create(context) {
    return createImportVisitor(context, ({ node, source, importer, target }) => {
      if (importer.layer === 'routes') {
        if (target.layer !== 'routes' && !ROUTE_IMPORTABLE_LAYERS.has(target.layer))
          context.report({ node, messageId: 'route', data: { target: target.layer, source } });
        return;
      }
      if (LAYER_RANK[target.layer] > LAYER_RANK[importer.layer])
        context.report({
          node,
          messageId: 'upward',
          data: { importer: importer.layer, target: target.layer, source },
        });
    });
  },
};
