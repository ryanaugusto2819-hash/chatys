CREATE TABLE public.ai_receipt_review_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.ai_training_queue(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status text NOT NULL,
  detected_amount numeric(12,2),
  final_amount numeric(12,2),
  currency text,
  confidence numeric(5,4),
  responsible_user_id uuid,
  sale_order_id uuid REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_receipt_review_logs_status_check CHECK (status IN ('pending','approved','rejected','failed'))
);

GRANT SELECT ON public.ai_receipt_review_logs TO authenticated;
GRANT ALL ON public.ai_receipt_review_logs TO service_role;

ALTER TABLE public.ai_receipt_review_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view receipt review logs"
ON public.ai_receipt_review_logs
FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id));

CREATE INDEX ai_receipt_review_logs_workspace_created_idx
ON public.ai_receipt_review_logs(workspace_id, created_at DESC);

CREATE UNIQUE INDEX sales_orders_ai_receipt_external_id_unique
ON public.sales_orders(external_id)
WHERE external_id LIKE 'AI-RECEIPT-%';

CREATE OR REPLACE FUNCTION public.log_ai_receipt_review_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.receipt_review_status IN ('pending','approved','rejected','failed')
     AND (TG_OP = 'INSERT' OR NEW.receipt_review_status IS DISTINCT FROM OLD.receipt_review_status) THEN
    INSERT INTO public.ai_receipt_review_logs (
      queue_id, workspace_id, status, detected_amount, final_amount,
      currency, confidence, responsible_user_id, sale_order_id, note
    ) VALUES (
      NEW.id, NEW.workspace_id, NEW.receipt_review_status, NEW.receipt_detected_amount,
      NEW.receipt_reviewed_amount, NEW.receipt_detected_currency,
      NEW.receipt_amount_confidence, NEW.receipt_reviewed_by,
      NEW.receipt_sale_order_id, NEW.receipt_review_note
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER log_ai_receipt_review_change
AFTER INSERT OR UPDATE OF receipt_review_status ON public.ai_training_queue
FOR EACH ROW EXECUTE FUNCTION public.log_ai_receipt_review_change();