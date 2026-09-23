ALTER TABLE public.ai_training_queue
  ADD COLUMN receipt_review_status text NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN receipt_detected_amount numeric(12,2),
  ADD COLUMN receipt_detected_currency text,
  ADD COLUMN receipt_amount_confidence numeric(5,4),
  ADD COLUMN receipt_reviewed_at timestamptz,
  ADD COLUMN receipt_reviewed_by uuid,
  ADD COLUMN receipt_reviewed_amount numeric(12,2),
  ADD COLUMN receipt_review_note text,
  ADD COLUMN receipt_sale_order_id uuid REFERENCES public.sales_orders(id) ON DELETE SET NULL;

ALTER TABLE public.ai_training_queue
  ADD CONSTRAINT ai_training_queue_receipt_review_status_check
  CHECK (receipt_review_status IN ('not_applicable','pending','approved','rejected','failed')),
  ADD CONSTRAINT ai_training_queue_receipt_detected_amount_check
  CHECK (receipt_detected_amount IS NULL OR receipt_detected_amount > 0),
  ADD CONSTRAINT ai_training_queue_receipt_reviewed_amount_check
  CHECK (receipt_reviewed_amount IS NULL OR receipt_reviewed_amount > 0),
  ADD CONSTRAINT ai_training_queue_receipt_amount_confidence_check
  CHECK (receipt_amount_confidence IS NULL OR (receipt_amount_confidence >= 0 AND receipt_amount_confidence <= 1));

CREATE INDEX ai_training_queue_receipt_review_idx
  ON public.ai_training_queue(workspace_id, receipt_review_status, created_at DESC);

COMMENT ON COLUMN public.ai_training_queue.receipt_review_status IS 'Manual review state for an AI-detected payment receipt.';
COMMENT ON COLUMN public.ai_training_queue.receipt_detected_amount IS 'Amount visually extracted by AI; never confirms payment by itself.';
COMMENT ON COLUMN public.ai_training_queue.receipt_sale_order_id IS 'Sale created by an approved receipt review.';

CREATE OR REPLACE FUNCTION public.review_ai_payment_receipt(
  p_queue_id uuid,
  p_action text,
  p_amount numeric DEFAULT NULL,
  p_currency text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue public.ai_training_queue%ROWTYPE;
  v_conversation public.conversations%ROWTYPE;
  v_sale_id uuid;
  v_amount numeric(12,2);
  v_currency text;
  v_country text;
  v_campaign text;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória';
  END IF;
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Ação de revisão inválida';
  END IF;

  SELECT * INTO v_queue
  FROM public.ai_training_queue
  WHERE id = p_queue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Análise de comprovante não encontrada';
  END IF;
  IF NOT public.is_workspace_admin(v_queue.workspace_id) THEN
    RAISE EXCEPTION 'Apenas administradores podem revisar comprovantes';
  END IF;
  IF v_queue.receipt_review_status = 'approved' THEN
    RETURN jsonb_build_object('success', true, 'status', 'approved', 'sale_order_id', v_queue.receipt_sale_order_id, 'already_reviewed', true);
  END IF;
  IF v_queue.receipt_review_status = 'rejected' THEN
    RETURN jsonb_build_object('success', true, 'status', 'rejected', 'already_reviewed', true);
  END IF;
  IF v_queue.receipt_review_status <> 'pending' THEN
    RAISE EXCEPTION 'Este item não está pendente de revisão';
  END IF;

  IF p_action = 'reject' THEN
    UPDATE public.ai_training_queue
    SET receipt_review_status = 'rejected',
        receipt_reviewed_at = v_now,
        receipt_reviewed_by = auth.uid(),
        receipt_reviewed_amount = NULL,
        receipt_review_note = 'Comprovante rejeitado na revisão manual'
    WHERE id = v_queue.id;
    RETURN jsonb_build_object('success', true, 'status', 'rejected');
  END IF;

  v_amount := round(COALESCE(p_amount, v_queue.receipt_detected_amount), 2);
  v_currency := upper(left(trim(COALESCE(NULLIF(p_currency, ''), v_queue.receipt_detected_currency, 'MXN')), 3));
  IF v_amount IS NULL OR v_amount <= 0 OR v_amount > 9999999999.99 THEN
    RAISE EXCEPTION 'Informe um valor válido maior que zero';
  END IF;
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Informe uma moeda válida com três letras';
  END IF;

  SELECT * INTO v_conversation
  FROM public.conversations
  WHERE id = v_queue.conversation_id
    AND workspace_id = v_queue.workspace_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversa não encontrada neste espaço de trabalho';
  END IF;

  IF v_conversation.sale_registered_at IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.sales_orders WHERE conversation_id = v_conversation.id
  ) THEN
    RAISE EXCEPTION 'Esta conversa já possui uma venda registrada';
  END IF;

  v_country := CASE
    WHEN regexp_replace(v_conversation.contact_phone, '\D', '', 'g') LIKE '52%' THEN 'mexico'
    WHEN regexp_replace(v_conversation.contact_phone, '\D', '', 'g') LIKE '598%' THEN 'uruguai'
    WHEN regexp_replace(v_conversation.contact_phone, '\D', '', 'g') LIKE '54%' THEN 'argentina'
    ELSE 'brasil'
  END;
  v_campaign := COALESCE(NULLIF(split_part(COALESCE(v_conversation.ad_title, ''), ' › ', 1), ''), 'direto');

  INSERT INTO public.sales_orders (
    vendedor, valor, quantidade, nome, conversation_id, workspace_id,
    pais, moeda, campanha, external_id
  ) VALUES (
    'Automação Inteligente — revisão manual', v_amount, 1,
    v_conversation.contact_name, v_conversation.id, v_queue.workspace_id,
    v_country, v_currency, v_campaign, 'AI-RECEIPT-' || v_queue.id::text
  ) RETURNING id INTO v_sale_id;

  UPDATE public.conversations
  SET sale_registered_at = v_now
  WHERE id = v_conversation.id;

  UPDATE public.ai_training_queue
  SET receipt_review_status = 'approved',
      receipt_reviewed_at = v_now,
      receipt_reviewed_by = auth.uid(),
      receipt_reviewed_amount = v_amount,
      receipt_detected_currency = v_currency,
      receipt_sale_order_id = v_sale_id,
      receipt_review_note = 'Comprovante aprovado e venda registrada manualmente'
  WHERE id = v_queue.id;

  RETURN jsonb_build_object('success', true, 'status', 'approved', 'sale_order_id', v_sale_id, 'amount', v_amount, 'currency', v_currency);
END;
$$;

REVOKE ALL ON FUNCTION public.review_ai_payment_receipt(uuid, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_ai_payment_receipt(uuid, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_ai_payment_receipt(uuid, text, numeric, text) TO service_role;