ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS upsell_sent boolean NOT NULL DEFAULT false;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS upsell_sent_at timestamptz;