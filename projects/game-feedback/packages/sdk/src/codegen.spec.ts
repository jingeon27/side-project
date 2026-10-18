import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it } from 'vitest';
it('passes a response schema to every generated OpenAPI operation after caller options', () => {
  const spec = JSON.parse(
    readFileSync(new URL('../../../apps/api/openapi.json', import.meta.url), 'utf8'),
  ) as { paths: Record<string, Record<string, { operationId: string }>> };
  const source = ts.createSourceFile(
    'client.ts',
    readFileSync(new URL('./generated/client.ts', import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const operations = Object.values(spec.paths).flatMap((path) =>
    Object.values(path).map((operation) => operation.operationId),
  );
  const declarations = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations]);
  expect(operations.length).toBeGreaterThan(0);
  for (const operation of operations) {
    const declaration = declarations.find(
      (item) => ts.isIdentifier(item.name) && item.name.text === operation,
    );
    const fn = declaration?.initializer;
    if (!fn || !ts.isArrowFunction(fn) || !ts.isBlock(fn.body))
      throw new Error(`Missing generated operation ${operation}`);
    const call = fn.body.statements.filter(ts.isReturnStatement).at(-1)?.expression;
    if (!call || !ts.isCallExpression(call) || call.expression.getText(source) !== 'apiFetch')
      throw new Error(`Missing validated transport for ${operation}`);
    const options = call.arguments[1];
    if (!options || !ts.isObjectLiteralExpression(options))
      throw new Error(`Missing request options for ${operation}`);
    const properties = [...options.properties];
    const schemaIndex = properties.findIndex(
      (item) => ts.isPropertyAssignment(item) && item.name.getText(source) === 'schema',
    );
    expect(schemaIndex, operation).toBeGreaterThan(properties.map(ts.isSpreadAssignment).lastIndexOf(true));
  }
});
