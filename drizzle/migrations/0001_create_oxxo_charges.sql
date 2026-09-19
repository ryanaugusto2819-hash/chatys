CREATE TABLE public.oxxo_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_by uuid,
  external_id text NOT NULL,
  request_number text,
  transaction_id text,
  status text NOT NULL DEFAULT 'creating',
  currency text NOT NULL DEFAULT 'MXN',
  amount numeric(12,2) NOT NULL,
  fee numeric(12,2),
  payer_name text,
  payer_email text,
  reference text,
  barcode_url text,
  provider text NOT NULL DEFAULT 'XPag',
  error_code text,
  error_message text,
  provider_response jsonb,
  confirmed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT oxxo_charges_amount_range CHECK (amount >= 10 AND amount <= 10000),
  CONSTRAINT oxxo_charges_currency_check CHECK (currency = 'MXN'),
  CONSTRAINT oxxo_charges_status_check CHECK (status IN ('creating', 'pending', 'confirmed', 'failed', 'cancelled')),
  CONSTRAINT oxxo_charges_external_id_key UNIQUE (external_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oxxo_charges TO authenticated;
GRANT ALL ON public.oxxo_charges TO service_role;

ALTER TABLE public.oxxo_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view OXXO charges"
ON public.oxxo_charges
FOR SELECT
TO authenticated
USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Workspace members can create OXXO charges"
ON public.oxxo_charges
FOR INSERT
TO authenticated
WITH CHECK (public.is_workspace_member(workspace_id) AND created_by = auth.uid());

CREATE POLICY "Workspace admins can update OXXO charges"
ON public.oxxo_charges
FOR UPDATE
TO authenticated
USING (public.is_workspace_admin(workspace_id))
WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE POLICY "Workspace admins can delete OXXO charges"
ON public.oxxo_charges
FOR DELETE
TO authenticated
USING (public.is_workspace_admin(workspace_id));

CREATE UNIQUE INDEX oxxo_charges_request_number_unique
ON public.oxxo_charges (request_number)
WHERE request_number IS NOT NULL;

CREATE UNIQUE INDEX oxxo_charges_transaction_id_unique
ON public.oxxo_charges (transaction_id)
WHERE transaction_id IS NOT NULL;

CREATE INDEX oxxo_charges_conversation_created_idx
ON public.oxxo_charges (conversation_id, created_at DESC);

CREATE INDEX oxxo_charges_workspace_status_idx
ON public.oxxo_charges (workspace_id, status, created_at DESC);

CREATE TRIGGER update_oxxo_charges_updated_at
BEFORE UPDATE ON public.oxxo_charges
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();