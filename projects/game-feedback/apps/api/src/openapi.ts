import { writeFileSync } from 'node:fs';

import { omit } from 'es-toolkit';
import { z } from 'zod';

import {
  BattleModeSchema,
  BoardKindSchema,
  CoachingRoleSchema,
  FeedbackStatusSchema,
  operations,
  ReportStatusSchema,
  schemas,
} from '@game-feedback/contracts';

export function createOpenApi() {
  const components: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(schemas)) {
    components[name] = omit(z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }), ['$schema']);
  }
  const schemaRef = (schema: z.ZodType) => {
    const found = Object.entries(schemas).find(([, value]) => value === schema);
    if (found) return { $ref: `#/components/schemas/${found[0]}` };
    return omit(z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }), ['$schema']);
  };
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of operations) {
    const parameters: unknown[] = [...operation.path.matchAll(/\{(\w+)\}/g)].map((m) => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }));
    if (operation.query)
      parameters.push(
        ...[
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 12 } },
          ...(operation.id === 'listPosts'
            ? [
                { name: 'authorId', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 100 } },
                {
                  name: 'battleMode',
                  in: 'query',
                  schema: { type: 'string', enum: BattleModeSchema.options },
                },
                {
                  name: 'coachingRole',
                  in: 'query',
                  schema: { type: 'string', enum: CoachingRoleSchema.options },
                },
                {
                  name: 'feedbackStatus',
                  in: 'query',
                  schema: { type: 'string', enum: FeedbackStatusSchema.options },
                },
                { name: 'category', in: 'query', schema: { type: 'string' } },
                { name: 'unanswered', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
                { name: 'q', in: 'query', schema: { type: 'string' } },
                {
                  name: 'board',
                  in: 'query',
                  schema: {
                    type: 'string',
                    enum: ['ALL', ...BoardKindSchema.options],
                  },
                },
              ]
            : []),
          ...(operation.id === 'listReports'
            ? [
                {
                  name: 'status',
                  in: 'query',
                  schema: { type: 'string', enum: ReportStatusSchema.options, default: 'OPEN' },
                },
              ]
            : []),
        ],
      );
    const pathItem = (paths[operation.path] ??= {});
    pathItem[operation.method] = {
      operationId: operation.id,
      parameters,
      ...(operation.body
        ? {
            requestBody: {
              required: true,
              content: {
                'application/json': { schema: schemaRef(operation.body) },
              },
            },
          }
        : {}),
      responses: {
        '200': {
          description: 'Success',
          content: { 'application/json': { schema: schemaRef(operation.response) } },
        },
        default: {
          description: 'Stable API error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: { title: 'Game Mate API', version: '0.1.0' },
    servers: [{ url: '/' }],
    paths,
    components: {
      schemas: components,
      securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'gamefeedback_session' } },
    },
  };
}
if (require.main === module) writeFileSync('openapi.json', JSON.stringify(createOpenApi(), null, 2) + '\n');
