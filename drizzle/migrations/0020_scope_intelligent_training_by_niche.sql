ALTER TABLE public.ai_training_queue
  ADD COLUMN niche_id uuid REFERENCES public.niches(id) ON DELETE SET NULL;

ALTER TABLE public.ai_trained_message_rules
  ADD COLUMN niche_id uuid REFERENCES public.niches(id) ON DELETE SET NULL;

CREATE INDEX ai_training_queue_niche_country_idx
  ON public.ai_training_queue(workspace_id, niche_id, detected_country_code, created_at DESC);

CREATE INDEX ai_trained_message_rules_niche_country_idx
  ON public.ai_trained_message_rules(workspace_id, niche_id, country_code, active);

COMMENT ON COLUMN public.ai_training_queue.niche_id IS 'Business niche assigned from the conversation when the message entered intelligent training.';
COMMENT ON COLUMN public.ai_trained_message_rules.niche_id IS 'Business niche that exclusively owns this learned scenario; null preserves uncategorized legacy rules.';

CREATE OR REPLACE FUNCTION public.validate_ai_training_niche()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_niche_workspace uuid;
  v_flow_niche uuid;
BEGIN
  IF NEW.niche_id IS NOT NULL THEN
    SELECT workspace_id INTO v_niche_workspace FROM public.niches WHERE id = NEW.niche_id;
    IF NOT FOUND OR v_niche_workspace IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'O nicho selecionado não pertence a este espaço de trabalho';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'ai_trained_message_rules' AND NEW.flow_id IS NOT NULL THEN
    SELECT niche_id INTO v_flow_niche FROM public.automation_flows WHERE id = NEW.flow_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'O fluxo selecionado não existe';
    END IF;
    IF v_flow_niche IS DISTINCT FROM NEW.niche_id THEN
      RAISE EXCEPTION 'O fluxo selecionado deve pertencer ao mesmo nicho do aprendizado';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_ai_training_queue_niche
BEFORE INSERT OR UPDATE OF niche_id, workspace_id ON public.ai_training_queue
FOR EACH ROW EXECUTE FUNCTION public.validate_ai_training_niche();

CREATE TRIGGER validate_ai_trained_rule_niche
BEFORE INSERT OR UPDATE OF niche_id, workspace_id, flow_id ON public.ai_trained_message_rules
FOR EACH ROW EXECUTE FUNCTION public.validate_ai_training_niche();