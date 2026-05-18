export type InvoiceTranslation = {
  original: string;
  translated: string;
  confidence: number;
  matchedBy: string;
  category?: string;
};

export type InvoiceType = 'astrafund' | 'horti_fair' | 'unknown';

export type ParsedInvoice = {
  type: InvoiceType;
  translations: InvoiceTranslation[];
  fileName: string;
  totalItems: number;
};
