ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE INDEX IF NOT EXISTS idx_sales_orders_external_id ON public.sales_orders(external_id);