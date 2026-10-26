import { z } from 'zod';

const portSchema = z.number().int().min(1).max(65535);
export const controlStateSchema = z.object({ port: portSchema, token: z.string().regex(/^[a-f0-9]{64}$/) });
export const controlResponseSchema = z.object({ ready: z.boolean(), database: z.string(), port: portSchema });
export const databaseOwnerSchema = z.object({ project: z.string(), user: z.string(), password: z.string() });
export const databaseLockSchema = z.object({ pid: z.number().int().positive() });
export const controlMessageSchema = z.object({ token: z.string(), action: z.enum(['status', 'stop']) });
export const rolePrivilegesSchema = z.object({
  rolsuper: z.boolean(),
  rolcreatedb: z.boolean(),
  rolcreaterole: z.boolean(),
});
export const databaseRoleSchema = z.object({ owner: z.string() });
