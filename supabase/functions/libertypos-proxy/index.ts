import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Action = 'list' | 'get' | 'create' | 'update' | 'delete' | 'options';

const OPTION_FIELDS = [
  'status_cobranca',
  'status_pagamento', 'pagamento',
  'forma_pagamento', 'forma_pgto',
  'logistica', 'tipo_entrega',
  'status_envio', 'envio',
  'wpp_cobranca',
];

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

    const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');
    const normalizedPhone = digits(body.telefone);

    // For list/get by phone, fetch ALL and filter locally by normalized digits
    // (upstream stores phones with spaces/dashes and doesn't normalize on filter).
    // For 'options', we also fetch the full list to derive distinct values.
    const upstreamBody =
      body.action === 'options'
        ? { action: 'list' }
        : (body.action === 'list' || body.action === 'get') && normalizedPhone
        ? { action: 'list' }
        : body;

    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Chatys-Token': token,
      },
      body: JSON.stringify(upstreamBody),
    });

    const text = await upstream.text();
    let parsed: any = text;
    try { parsed = JSON.parse(text); } catch { /* keep raw */ }

    if (!upstream.ok) {
      return json(
        { ok: false, error: `LibertyPOS ${upstream.status}`, detail: parsed },
        upstream.status,
      );
    }

    // Local phone-suffix filter (match last 8+ digits for BR robustness)
    if (normalizedPhone && parsed && Array.isArray(parsed.data)) {
      const needle = normalizedPhone.slice(-8);
      parsed.data = parsed.data.filter((row: any) => {
        const cand = digits(row?.telefone ?? row?.phone ?? row?.whatsapp);
        return cand && (cand.endsWith(needle) || needle.endsWith(cand.slice(-8)));
      });
    }

    // Derive distinct option values per field from all upstream rows
    if (body.action === 'options' && parsed && Array.isArray(parsed.data)) {
      const options: Record<string, string[]> = {};
      for (const field of OPTION_FIELDS) {
        const set = new Set<string>();
        for (const row of parsed.data) {
          const v = row?.[field];
          if (v != null && String(v).trim() !== '') set.add(String(v).trim());
        }
        if (set.size > 0) options[field] = Array.from(set).sort();
      }
      return json({ ok: true, options }, 200);
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
