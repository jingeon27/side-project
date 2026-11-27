import { z } from 'zod';

import { elementSchema } from '@/features/reading/contracts';

import { productSchema } from './products';

export const orderIdSchema = z.string().regex(/^dw-[a-f\d]{32}$/);
export const createOrderSchema = z
  .object({
    product: productSchema,
    adult: z.literal(true),
    element: elementSchema.optional(),
    deviceId: z.uuid().optional(),
  })
  .strict();

export const orderRequestSchema = z.object({ action: z.enum(['verify', 'refund']) }).strict();

export const orderSchema = z.object({
  id: orderIdSchema,
  product: productSchema,
  amount: z.number().int().positive(),
  status: z.enum(['pending', 'issued', 'refund_requested', 'refunded']),
  createdAt: z.string(),
  report: z
    .object({
      intro: z.string(),
      cards: z.array(z.object({ title: z.string(), practice: z.string() })).length(7),
    })
    .nullable(),
});
export type TOrder = z.infer<typeof orderSchema>;

const checkoutSchema = z.object({
  storeId: z.string(),
  channelKey: z.string(),
  redirectUrl: z.url(),
  paymentId: orderIdSchema,
  orderName: z.string(),
  totalAmount: z.number().int().positive(),
});

export const checkoutResponseSchema = z.object({
  order: orderSchema,
  checkout: checkoutSchema.nullable(),
});
