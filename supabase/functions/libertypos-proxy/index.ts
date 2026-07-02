import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Action = 'list' | 'get' | 'create' | 'update' | 'delete';

interface Body {
  action: Action;
  telefone?: string;
  id?: string;
  data?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Auth: require a logged-in Chatys user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ ok: false, error: 'Unauthorized' }, 401);
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(
      authHeader.replace('Bearer ', ''),
    );
    if (claimsError || !claims?.claims) {
      return json({ ok: false, error: 'Unauthorized' }, 401);
    }

    const url = Deno.env.get('LIBERTYPOS_FUNCTION_URL');
    const token = Deno.env.get('LIBERTYPOS_INTEGRATION_TOKEN');
    if (!url || !token) {
      return json({ ok: false, error: 'LibertyPOS integration not configured' }, 500);
    }

    const body = (await req.json()) as Body;
    if (!body?.action) return json({ ok: false, error: 'action is required' }, 400);

    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Chatys-Token': token,
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* keep raw */ }

    if (!upstream.ok) {
      return json(
        { ok: false, error: `LibertyPOS ${upstream.status}`, detail: parsed },
        upstream.status,
      );
    }

    return json(parsed as Record<string, unknown>, 200);
  } catch (err) {
    console.error('libertypos-proxy error', err);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
