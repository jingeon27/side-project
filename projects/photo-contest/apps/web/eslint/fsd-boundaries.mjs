// 이 앱 전용 FSD 경계 규칙. src/modules의 레이어(app → pages → widgets → features → shared)와
// Next 라우트(src/app)의 import 방향, slice 공개 API(index.ts), 화면 slice 사이 import를 검사한다.
import path from 'node:path';

const SRC_DIR = path.resolve(import.meta.dirname, '../src');

/** 위에 있을수록 큰 값. 자기보다 아래 레이어만 import할 수 있다. */
const LAYER_RANK = { routes: 5, app: 4, pages: 3, widgets: 2, features: 1, shared: 0 };
const SLICED_LAYERS = new Set(['pages', 'widgets', 'features']);
/** Next 라우트는 화면(pages)과 앱 조립(app), 기반(shared)만 쓴다. */
const ROUTE_IMPORTABLE_LAYERS = new Set(['app', 'pages', 'shared']);
/** 다른 slice가 index.ts를 거치지 않고 가져와도 되는 것: 타입, 테스트 목, 폼 스키마, 서버 전용 모듈 */
const PUBLIC_SEGMENTS = new Set(['types', 'mocks']);
const PUBLIC_FILE = /\.(schema|server)$/;
const ROOT_FILES = new Set(['proxy', 'instrumentation', 'instrumentation-client']);

const stripExtension = (file) => file.replace(/\.(d\.)?[cm]?[jt]sx?$/, '');

/**
 * src 기준 경로를 레이어·slice로 나눈다. src/modules와 src/app 밖(옛 위치 등)은 null.
 * @param {string} absolutePath
 */
export function locate(absolutePath) {
  const relative = path.relative(SRC_DIR, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  const parts = stripExtension(relative).split(path.sep);
  if (parts[0] === 'app' || (parts.length === 1 && ROOT_FILES.has(parts[0])))
    return { layer: 'routes', slice: null, rest: parts };
  if (parts[0] !== 'modules' || !(parts[1] in LAYER_RANK) || parts[1] === 'routes') return null;
  const layer = parts[1];
  if (!SLICED_LAYERS.has(layer)) return { layer, slice: null, rest: parts.slice(2) };
  return { layer, slice: parts[2] ?? null, rest: parts.slice(3) };
}

/**
 * import 문자열을 절대 경로로 바꾼다. 패키지 import는 null.
 * @param {string} source
 * @param {string} filename
 */
export function resolveImport(source, filename) {
  if (source.startsWith('@/')) return path.join(SRC_DIR, source.slice(2));
  if (source === '.' || source === '..' || source.startsWith('./') || source.startsWith('../'))
    return path.resolve(path.dirname(filename), source);
  return null;
}

const isBarrel = (rest) => rest.length === 0 || (rest.length === 1 && rest[0] === 'index');
const isPublicDeepImport = (rest) =>
  PUBLIC_SEGMENTS.has(rest[0] ?? '') || PUBLIC_FILE.test(rest[rest.length - 1] ?? '');

/** 파일의 모든 import·re-export·동적 import 문자열에 check를 적용한다. */
function createImportVisitor(context, check) {
  const visit = (node, sourceNode) => {
    if (!sourceNode || sourceNode.type !== 'Literal' || typeof sourceNode.value !== 'string') return;
    const importer = locate(context.filename);
    const targetPath = resolveImport(sourceNode.value, context.filename);
    if (!importer || !targetPath) return;
    const target = locate(targetPath);
    if (!target) return;
    check({ node: sourceNode, source: sourceNode.value, importer, target });
  };
  return {
    ImportDeclaration: (node) => visit(node, node.source),
    ExportNamedDeclaration: (node) => visit(node, node.source),
    ExportAllDeclaration: (node) => visit(node, node.source),
    ImportExpression: (node) => visit(node, node.source),
  };
}

/** @type {import('eslint').Rule.RuleModule} */
const layerImports = {
  meta: {
    type: 'problem',
    docs: {
      description: '레이어는 자기보다 아래 레이어만 import한다(app → pages → widgets → features → shared).',
    },
    schema: [],
    messages: {
      upward: '{{importer}} 레이어는 위 레이어({{target}})를 import할 수 없습니다: {{source}}',
      route:
        'Next 라우트는 화면(pages)·app·shared만 import합니다. {{target}}은 화면 slice를 거쳐 쓰세요: {{source}}',
    },
  },
  create: (context) =>
    createImportVisitor(context, ({ node, source, importer, target }) => {
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
    }),
};

/** @type {import('eslint').Rule.RuleModule} */
const slicePublicApi = {
  meta: {
    type: 'problem',
    docs: {
      description:
        '다른 slice는 index.ts(공개 API)로만 import하고, 자기 slice의 index.ts는 import하지 않는다.',
    },
    schema: [],
    messages: {
      deep: '{{layer}}/{{slice}}의 내부 파일 대신 공개 API(index.ts)를 import하세요: {{source}}',
      ownBarrel:
        '자기 slice의 index.ts를 import하면 순환 참조가 생깁니다. 상대 경로로 직접 가져오세요: {{source}}',
    },
  },
  create: (context) =>
    createImportVisitor(context, ({ node, source, importer, target }) => {
      if (!SLICED_LAYERS.has(target.layer) || !target.slice) return;
      const sameSlice = importer.layer === target.layer && importer.slice === target.slice;
      if (sameSlice) {
        if (isBarrel(target.rest)) context.report({ node, messageId: 'ownBarrel', data: { source } });
        return;
      }
      if (!isBarrel(target.rest) && !isPublicDeepImport(target.rest))
        context.report({
          node,
          messageId: 'deep',
          data: { layer: target.layer, slice: target.slice, source },
        });
    }),
};

/** @type {import('eslint').Rule.RuleModule} */
const noCrossPage = {
  meta: {
    type: 'problem',
    docs: {
      description:
        '화면 slice(pages)끼리는 import하지 않는다. 함께 쓰는 것은 widgets·features·shared로 내린다.',
    },
    schema: [],
    messages: {
      crossPage: 'pages/{{importer}}에서 다른 화면 pages/{{target}}을 import할 수 없습니다: {{source}}',
    },
  },
  create: (context) =>
    createImportVisitor(context, ({ node, source, importer, target }) => {
      if (importer.layer === 'pages' && target.layer === 'pages' && importer.slice !== target.slice)
        context.report({
          node,
          messageId: 'crossPage',
          data: { importer: importer.slice, target: target.slice, source },
        });
    }),
};

/** @type {{ meta: { name: string; version: string }; rules: Record<'layer-imports' | 'slice-public-api' | 'no-cross-page', import('eslint').Rule.RuleModule> }} */
const plugin = {
  meta: { name: 'fsd-boundaries', version: '1.0.0' },
  rules: {
    'layer-imports': layerImports,
    'slice-public-api': slicePublicApi,
    'no-cross-page': noCrossPage,
  },
};

export default plugin;
