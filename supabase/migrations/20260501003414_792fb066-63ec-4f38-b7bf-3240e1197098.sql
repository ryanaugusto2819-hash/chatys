ALTER TABLE public.connection_configs ADD COLUMN IF NOT EXISTS status_since timestamp with time zone DEFAULT now();

CREATE OR REPLACE FUNCTION public.update_status_since()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_since := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_connection_status_since ON public.connection_configs;
CREATE TRIGGER trg_connection_status_since
  BEFORE UPDATE ON public.connection_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_status_since();

UPDATE public.connection_configs SET status_since = COALESCE(last_checked_at, updated_at, now()) WHERE status_since IS NULL;