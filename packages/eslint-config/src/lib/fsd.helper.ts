import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import path from 'node:path';

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
  node: TSESTree.StringLiteral;
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
const ROOT_FILES = new Set(['proxy', 'instrumentation', 'instrumentation-client']);

function locate(srcDir: string, filename: string): ILocation | null {
  const relative = path.relative(srcDir, filename);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  const parts = relative.replace(/\.(d\.)?[cm]?[jt]sx?$/, '').split(path.sep);
  if (parts[0] === 'app' || (parts.length === 1 && ROOT_FILES.has(parts[0] ?? '')))
    return { layer: 'routes', slice: null, rest: parts };
  const layer = LAYER_DIRS[parts[0] ?? ''];
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

export function isBarrel(rest: readonly string[]) {
  return rest.length === 0 || (rest.length === 1 && rest[0] === 'index');
}

export function isPublicDeepImport(rest: readonly string[]) {
  return PUBLIC_SEGMENTS.has(rest[0] ?? '') || /\.(schema|server)$/.test(rest[rest.length - 1] ?? '');
}

export function createImportVisitor<TMessageId extends string>(
  context: Readonly<TSESLint.RuleContext<TMessageId, TFsdOptions>>,
  check: (reference: IImportReference) => void,
): TSESLint.RuleListener {
  const srcDir = path.resolve(context.cwd, context.options[0]?.srcDir ?? 'src');
  const importer = locate(srcDir, context.filename);
  const visit = (node: TSESTree.Node | null | undefined) => {
    if (!importer || node?.type !== 'Literal' || typeof node.value !== 'string') return;
    const targetPath = resolveImport(srcDir, node.value, context.filename);
    if (!targetPath) return;
    const target = locate(srcDir, targetPath);
    if (!target) return;
    check({ node, source: node.value, importer, target });
  };
  return {
    ImportDeclaration: (node) => visit(node.source),
    ExportNamedDeclaration: (node) => visit(node.source),
    ExportAllDeclaration: (node) => visit(node.source),
    ImportExpression: (node) => visit(node.source),
  };
}
