CREATE TABLE public.extension_devices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  phone_number text,
  token text not null unique,
  status text not null default 'offline',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.extension_devices TO authenticated;
GRANT ALL ON public.extension_devices TO service_role;
ALTER TABLE public.extension_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage extension devices" ON public.extension_devices FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.extension_commands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  device_id uuid not null references public.extension_devices(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  command_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  result jsonb,
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  completed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.extension_commands TO authenticated;
GRANT ALL ON public.extension_commands TO service_role;
ALTER TABLE public.extension_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage extension commands" ON public.extension_commands FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_extension_commands_device_status ON public.extension_commands(device_id, status, created_at);
CREATE INDEX idx_extension_commands_created ON public.extension_commands(created_at DESC);
CREATE INDEX idx_extension_devices_token ON public.extension_devices(token);

CREATE TRIGGER update_extension_devices_updated_at
BEFORE UPDATE ON public.extension_devices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();