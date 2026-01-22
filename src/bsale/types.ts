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
  // Price fields - finalPrice is the price including taxes
  finalPrice: z.number().nullable().optional(),
  // When expanded, product includes full details; otherwise just href/id reference
  product: z
    .object({
      id: numericId.optional(),
      href: z.string().optional(),
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

export const PriceListSchema = z.object({
  id: numericId,
  name: z.string(),
  state: z.number(),
});

export const PriceListsResponseSchema = z.object({
  href: z.string(),
  count: z.number(),
  limit: z.number(),
  offset: z.number(),
  items: z.array(PriceListSchema),
});

export const PriceListDetailSchema = z.object({
  id: numericId,
  variantValue: z.number(),
  variantValueWithTaxes: z.number(),
  variant: z.object({
    href: z.string(),
    id: numericId,
  }),
});

export const PriceListDetailsResponseSchema = z.object({
  href: z.string(),
  count: z.number(),
  limit: z.number(),
  offset: z.number(),
  items: z.array(PriceListDetailSchema),
});

export type StockItem = z.infer<typeof StockItemSchema>;
export type StockResponse = z.infer<typeof StockResponseSchema>;
export type Variant = z.infer<typeof VariantSchema>;
export type OAuthTokenResponse = z.infer<typeof OAuthTokenResponseSchema>;
export type PriceList = z.infer<typeof PriceListSchema>;
export type PriceListsResponse = z.infer<typeof PriceListsResponseSchema>;
export type PriceListDetail = z.infer<typeof PriceListDetailSchema>;
export type PriceListDetailsResponse = z.infer<typeof PriceListDetailsResponseSchema>;

// Document types for sales data
export const BsaleDocumentDetailSchema = z.object({
  id: numericId,
  quantity: z.number(),
  variant: z.object({
    id: numericId,
    code: z.string().nullable(),
  }),
});

export const BsaleDocumentSchema = z.object({
  id: numericId,
  emissionDate: z.number(), // Unix timestamp
  state: z.number(),
  details: z.object({
    items: z.array(BsaleDocumentDetailSchema),
  }),
});

export const DocumentsResponseSchema = z.object({
  href: z.string().optional(),
  count: z.number(),
  limit: z.number(),
  offset: z.number(),
  items: z.array(BsaleDocumentSchema),
  next: z.string().nullable().optional(),
});

export interface GetDocumentsOptions {
  startDate: Date;
  endDate: Date;
  expand?: string[];
  state?: number;
  limit?: number;
  offset?: number;
}

export type BsaleDocumentDetail = z.infer<typeof BsaleDocumentDetailSchema>;
export type BsaleDocument = z.infer<typeof BsaleDocumentSchema>;
export type DocumentsResponse = z.infer<typeof DocumentsResponseSchema>;
