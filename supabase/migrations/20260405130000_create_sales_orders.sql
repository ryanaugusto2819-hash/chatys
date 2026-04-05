-- Sales Orders table for vendor ranking system
CREATE TABLE IF NOT EXISTS sales_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor      TEXT NOT NULL DEFAULT 'Desconhecido',
  produto       TEXT,
  quantidade    INTEGER DEFAULT 1,
  valor         NUMERIC(12, 2) DEFAULT 0,
  nome          TEXT,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  workspace_id  UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sales_orders_vendedor    ON sales_orders(vendedor);
CREATE INDEX idx_sales_orders_created_at  ON sales_orders(created_at);
CREATE INDEX idx_sales_orders_workspace   ON sales_orders(workspace_id);

ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_orders_all" ON sales_orders FOR ALL USING (true) WITH CHECK (true);
