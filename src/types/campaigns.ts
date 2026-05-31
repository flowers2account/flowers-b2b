// TypeScript типы для Campaigns API

export type CampaignType = 'europe' | 'china';
export type CampaignStatus = 'draft' | 'published' | 'closed' | 'delivered' | 'cancelled';

export interface Campaign {
  id: number;
  title: string;
  type: CampaignType;
  description: string | null;
  closes_at: string; // ISO timestamp
  delivery_date: string; // ISO date
  status: CampaignStatus;
  allowed_price_groups: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignItem {
  id: number;
  campaign_id: number;
  product_id: number;
  price: number;
  min_qty: number;
  pack_size: number;
  notes: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  // Joined data
  product?: {
    id: number;
    name: string;
    variety_name: string | null;
    length_str: string | null;
    image_url: string | null;
    campaign_image_url: string | null;
    category: string;
  };
}

export interface CampaignOrder {
  id: number;
  campaign_id: number;
  client_id: string | null;
  guest_phone: string | null;
  guest_name: string | null;
  status: string;
  total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  converted_to_order_id: number | null;
}

export interface CampaignOrderItem {
  id: number;
  campaign_order_id: number;
  campaign_item_id: number;
  qty: number;
  price: number;
  created_at: string;
}

export interface CampaignSummaryRow {
  campaign_item_id: number;
  product_id: number;
  product_name: string;
  variety_name: string | null;
  length_str: string | null;
  price: number;
  pack_size: number;
  total_qty_ordered: number;
  total_orders: number;
  orders_breakdown: Array<{
    client_id: string | null;
    client_name: string;
    qty: number;
  }>;
}

export interface CampaignStats {
  total_items: number;
  total_orders: number;
  total_clients: number;
  total_amount: number;
  status: CampaignStatus;
  closes_in_hours: number;
}

// API Request/Response types
export interface CreateCampaignRequest {
  title: string;
  type: CampaignType;
  description?: string;
  closes_at: string;
  delivery_date: string;
  allowed_price_groups?: string[];
  items?: Array<{
    product_id: number;
    price: number;
    min_qty?: number;
    pack_size?: number;
    notes?: string;
  }>;
}

export interface CreateCampaignOrderRequest {
  campaign_id: number;
  client_id?: string;
  guest_phone?: string;
  guest_name?: string;
  items: Array<{
    campaign_item_id: number;
    qty: number;
    price: number;
  }>;
}

export interface CampaignWithStats extends Campaign {
  stats: CampaignStats;
  items_count: number;
  access_code?: string | null;
  markup_percent?: number | null;
  eur_kzt_rate?: number | null;
}

export interface CampaignDetailResponse {
  campaign: Campaign;
  items: CampaignItem[];
  stats: CampaignStats;
  my_order?: CampaignOrder & {
    items: (CampaignOrderItem & { campaign_item: CampaignItem })[];
  };
}
