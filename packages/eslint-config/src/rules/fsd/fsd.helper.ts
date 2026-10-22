import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

export interface IFsdOptions {
  srcDir?: string;
}
export type TFsdOptions = [IFsdOptions?];

export const fsdOptionsSchema: TSESLint.RuleMetaData<string>['schema'] = [
  {
    type: 'object',
    properties: { srcDir: { type: 'string' } },
    additionalProperties: false,
  },
];

export const LAYER_RANK = { routes: 5, app: 4, pages: 3, widgets: 2, features: 1, shared: 0 } as const;
type TLayer = keyof typeof LAYER_RANK;
interface ILocation {
  layer: TLayer;
  slice: string | null;
  rest: string[];
}
interface IImportReference {
  node: TSESTree.Node;
  source: string;
  importer: ILocation;
  target: ILocation;
}
const LAYER_DIRS: Readonly<Record<string, TLayer | undefined>> = {
  _app: 'app',
  _pages: 'pages',
  widgets: 'widgets',
  features: 'features',
  shared: 'shared',
};
export const SLICED_LAYERS = new Set<TLayer>(['pages', 'widgets', 'features']);
export const ROUTE_IMPORTABLE_LAYERS = new Set<TLayer>(['app', 'pages', 'shared']);
const PUBLIC_SEGMENTS = new Set(['types', 'mocks']);
const SRC_DIR_MARKERS = new Set(['app', ...Object.keys(LAYER_DIRS)]);

// src 바로 아래 파일(Next proxy·instrumentation, Vite main.tsx 같은 진입 파일)은 라우트와 같은 최상위로 본다.
function locate(srcDir: string, filename: string): ILocation | null {
  const relative = path.relative(srcDir, filename);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  const parts = relative.replace(/\.(d\.)?[cm]?[jt]sx?$/, '').split(path.sep);
  const layer = LAYER_DIRS[parts[0] ?? ''];
  if (parts[0] === 'app' || (!layer && parts.length === 1))
    return { layer: 'routes', slice: null, rest: parts };
  if (!layer) return null;
  if (!SLICED_LAYERS.has(layer)) return { layer, slice: null, rest: parts.slice(1) };
  return { layer, slice: parts[1] ?? null, rest: parts.slice(2) };
}

function resolveImport(srcDir: string, source: string, filename: string): string | null {
  if (source.startsWith('@/')) return path.join(srcDir, source.slice(2));
  if (source === '.' || source === '..' || source.startsWith('./') || source.startsWith('../'))
    return path.resolve(path.dirname(filename), source);
  return null;
}

const srcDirChecks = new Map<string, boolean>();
// srcDir이 없거나 FSD 레이어 폴더가 하나도 없으면 모든 파일이 분류 밖이 되어 규칙이 조용히 아무것도 하지 않는다.
function isFsdSrcDir(srcDir: string) {
  const cached = srcDirChecks.get(srcDir);
  if (cached !== undefined) return cached;
  const valid =
    existsSync(srcDir) &&
    statSync(srcDir).isDirectory() &&
    readdirSync(srcDir).some((entry) => SRC_DIR_MARKERS.has(entry));
  srcDirChecks.set(srcDir, valid);
  return valid;
}

export const SRC_DIR_MESSAGE =
  'FSD srcDir({{srcDir}})이 없거나 app·_app·_pages·widgets·features·shared 폴더가 없어 경계를 검사하지 못합니다. 앱의 src 경로를 넘기세요.';

export function isBarrel(rest: readonly string[]) {
  return rest.length === 0 || (rest.length === 1 && rest[0] === 'index');
}

export function isPublicDeepImport(rest: readonly string[]) {
  return PUBLIC_SEGMENTS.has(rest[0] ?? '') || /\.(schema|server)$/.test(rest[rest.length - 1] ?? '');
}

function staticSource(node: TSESTree.Node | null | undefined) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0)
    return node.quasis[0]?.value.cooked ?? null;
  return null;
}

// typescript-eslint 8.x 초기 파서는 TSImportType.source 없이 argument(TSLiteralType)만 채운다.
function importTypeSource(node: TSESTree.TSImportType): TSESTree.Node | null {
  const source = (node as Partial<TSESTree.TSImportType>).source;
  if (source) return source;
  return node.argument.type === 'TSLiteralType' ? node.argument.literal : null;
}

export function createImportVisitor<TMessageId extends string>(
  context: Readonly<TSESLint.RuleContext<TMessageId | 'srcDir', TFsdOptions>>,
  check: (reference: IImportReference) => void,
): TSESLint.RuleListener {
  const srcDir = path.resolve(context.cwd, context.options[0]?.srcDir ?? 'src');
  if (!isFsdSrcDir(srcDir))
    return {
      Program: (node) => context.report({ node, messageId: 'srcDir', data: { srcDir } }),
    };
  const importer = locate(srcDir, context.filename);
  if (!importer) return {};
  const visit = (node: TSESTree.Node | null | undefined) => {
    const source = staticSource(node);
    if (!node || source === null) return;
    const targetPath = resolveImport(srcDir, source, context.filename);
    if (!targetPath) return;
    const target = locate(srcDir, targetPath);
    if (!target) return;
    check({ node, source, importer, target });
  };
  return {
    ImportDeclaration: (node) => visit(node.source),
    ExportNamedDeclaration: (node) => visit(node.source),
    ExportAllDeclaration: (node) => visit(node.source),
    ImportExpression: (node) => visit(node.source),
    TSImportType: (node) => visit(importTypeSource(node)),
    TSExternalModuleReference: (node) => visit(node.expression),
    CallExpression: (node) => {
      if (node.callee.type === 'Identifier' && node.callee.name === 'require') visit(node.arguments[0]);
    },
  };
}
