import { createClient } from '@supabase/supabase-js';

const betwiseUrl =
  (import.meta.env.VITE_BETWISE_SUPABASE_URL as string | undefined) ||
  'https://eshzfimoeeiaifsggmpv.supabase.co';

const betwiseKey =
  (import.meta.env.VITE_BETWISE_SUPABASE_KEY as string | undefined) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzaHpmaW1vZWVpYWlmc2dnbXB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MzcyOTIsImV4cCI6MjA5MjAxMzI5Mn0.FZ2SVx_11IqNchY9h7pH3ASG_hRgoo402DFWALZ4NPs';

export const betwiseEnabled = true;

export const betwise = createClient(betwiseUrl, betwiseKey);
