import { createClient } from '@supabase/supabase-js';

const betwiseUrl = import.meta.env.VITE_BETWISE_SUPABASE_URL as string;
const betwiseKey = import.meta.env.VITE_BETWISE_SUPABASE_KEY as string;

export const betwiseEnabled = Boolean(betwiseUrl && betwiseKey);

export const betwise = betwiseEnabled
  ? createClient(betwiseUrl, betwiseKey)
  : null;
