import { z } from "zod";

// Bsale API returns IDs as strings in the real API, despite documentation showing numbers
// Use coercion to handle both cases
const numericId = z.union([z.number(), z.string().transform((val) => parseInt(val, 10))]);

export const StockItemSchema = z.object({
  id: numericId,
  quantity: z.number(),
  quantityReserved: z.number(),
  quantityAvailable: z.number(),
  variant: z.object({
    href: z.string(),
    id: numericId,
  }),
  office: z
    .object({
      href: z.string(),
      id: numericId,
    })
    .nullable(),
});

export const StockResponseSchema = z.object({
  href: z.string(),
  count: z.number(),
  limit: z.number(),
  offset: z.number(),
  items: z.array(StockItemSchema),
});

export const VariantSchema = z.object({
  id: numericId,
  code: z.string().nullable(),
  barCode: z.string().nullable(),
  description: z.string().nullable(),
  product: z
    .object({
      name: z.string().optional(),
    })
    .nullable()
    .optional(),
});

export const OAuthTokenResponseSchema = z.object({
  code: z.number(),
  data: z.object({
    accessToken: z.string(),
    clientName: z.string(),
    clientCode: z.string(),
  }),
});

export type StockItem = z.infer<typeof StockItemSchema>;
export type StockResponse = z.infer<typeof StockResponseSchema>;
export type Variant = z.infer<typeof VariantSchema>;
export type OAuthTokenResponse = z.infer<typeof OAuthTokenResponseSchema>;
