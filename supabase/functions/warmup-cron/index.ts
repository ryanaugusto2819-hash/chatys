import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const TZ = "America/Sao_Paulo";
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

function localHour(): number {
  const s = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  return parseInt(s, 10);
}

function dailyTarget(p: any): number {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(p.started_at).getTime()) / 86400000)
  );
  const target = Math.ceil(p.base_daily_target * Math.pow(1 + Number(p.growth_rate), days));
  return Math.min(p.max_daily, Math.max(1, target));
}

const LENGTH_RULES: Record<string, string> = {
  muito_curto: "- Responda com apenas 1 frase bem curta.",
  curto: "- Responda com no máximo 2 frases curtas.",
  medio: "- Responda com no máximo 4 frases.",
};

const EMOJI_RULES: Record<string, string> = {
  nenhum: "- Não use emojis.",
  raro: "- Use no máximo 1 emoji, e raramente.",
  frequente: "- Pode usar 1 a 2 emojis quando fizer sentido.",
};

const STYLE_RULES: Record<string, string> = {
  casual: "- Tom casual e amigável, como uma conversa entre conhecidos.",
  formal: "- Tom educado e formal, sem gírias.",
  curioso: "- Demonstre curiosidade e faça perguntas de volta com frequência.",
  objetivo: "- Seja objetivo e direto, sem rodeios.",
  brincalhao: "- Tom descontraído e brincalhão, com leveza e bom humor.",
};

async function generateReply(
  persona: string,
  history: { role: string; content: string }[],
  language = "pt-BR",
  opts: {
    behavior_style?: string;
    reply_length?: string;
    emoji_usage?: string;
    extra_instructions?: string;
  } = {},
) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY not configured");

  const style = STYLE_RULES[opts.behavior_style || "casual"] || STYLE_RULES.casual;
  const length = LENGTH_RULES[opts.reply_length || "curto"] || LENGTH_RULES.curto;
  const emoji = EMOJI_RULES[opts.emoji_usage || "raro"] || EMOJI_RULES.raro;
  const extra = (opts.extra_instructions || "").trim();

  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0.9,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content:
            `${persona}\n\nRegras obrigatórias:\n` +
            `${length}\n` +
            `${style}\n` +
            `${emoji}\n` +
            "- Escreva como uma pessoa real no WhatsApp (informal, pode usar gírias leves).\n" +
            "- Não use listas nem markdown.\n" +
            "- Nunca revele que é uma IA, robô ou automação.\n" +
            "- Não invente preços, links, prazos ou dados oficiais.\n" +
            `- Responda sempre no idioma: ${language}.` +
            (extra ? `\n\nInstruções adicionais:\n${extra}` : ""),
        },
        ...history,
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI gateway ${res.status}: ${body}`);
  }

  const data = await res.json();
  return (data?.choices?.[0]?.message?.content || "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results: any[] = [];

  try {
    const { data: profiles } = await supabase
      .from("warmup_profiles")
      .select("*")
      .eq("is_active", true)
      .eq("status", "active");

    const hour = localHour();

    for (const p of profiles ?? []) {
      if (hour < p.active_hours_start || hour >= p.active_hours_end) {
        results.push({ warmup: p.id, skipped: "fora do horário ativo" });
        continue;
      }

      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);

      const { count: sentToday } = await supabase
        .from("warmup_logs")
        .select("*", { count: "exact", head: true })
        .eq("warmup_id", p.id)
        .eq("direction", "out")
        .eq("status", "sent")
        .gte("created_at", startOfDay.toISOString());

      const target = dailyTarget(p);
      if ((sentToday ?? 0) >= target) {
        results.push({ warmup: p.id, skipped: `meta diária atingida (${sentToday}/${target})` });
        continue;
      }

      // Conversas dessa conexão com atividade recente
      const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { data: convs } = await supabase
        .from("conversations")
        .select("id, contact_name, contact_phone, updated_at")
        .eq("connection_config_id", p.connection_config_id)
        .gte("updated_at", since)
        .not("contact_phone", "like", "%-group")
        .order("updated_at", { ascending: false })
        .limit(25);

      let sent = 0;
      const budget = Math.min(3, target - (sentToday ?? 0));

      for (const conv of convs ?? []) {
        if (sent >= budget) break;

        const { data: msgs } = await supabase
          .from("messages")
          .select("content, sender_type, created_at")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(10);

        const last = msgs?.[0];
        if (!last || last.sender_type !== "customer") continue;

        const ageSec = (Date.now() - new Date(last.created_at).getTime()) / 1000;
        if (ageSec < p.min_delay_seconds || ageSec > 12 * 3600) continue;

        const history = (msgs ?? [])
          .slice()
          .reverse()
          .map((m: any) => ({
            role: m.sender_type === "customer" ? "user" : "assistant",
            content: (m.content || "").slice(0, 500),
          }))
          .filter((m: any) => m.content);

        if (!history.length) continue;

        let reply = "";
        try {
          reply = await generateReply(p.persona_prompt, history, p.language || "pt-BR");
        } catch (err) {
          await supabase.from("warmup_logs").insert({
            warmup_id: p.id,
            workspace_id: p.workspace_id,
            connection_config_id: p.connection_config_id,
            conversation_id: conv.id,
            contact_phone: conv.contact_phone,
            contact_name: conv.contact_name,
            direction: "out",
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          });
          continue;
        }

        if (!reply) continue;

        const sendRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/evolution-send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            conversationId: conv.id,
            message: reply,
            type: "text",
            senderLabel: "Aquecimento IA",
          }),
        });

        const sendBody = await sendRes.text();
        const ok = sendRes.ok;

        await supabase.from("warmup_logs").insert({
          warmup_id: p.id,
          workspace_id: p.workspace_id,
          connection_config_id: p.connection_config_id,
          conversation_id: conv.id,
          contact_phone: conv.contact_phone,
          contact_name: conv.contact_name,
          direction: "out",
          content: reply,
          status: ok ? "sent" : "failed",
          error: ok ? null : sendBody.slice(0, 500),
        });

        if (ok) {
          sent += 1;
          await supabase
            .from("warmup_profiles")
            .update({
              messages_sent: (p.messages_sent ?? 0) + sent,
              last_activity_at: new Date().toISOString(),
            })
            .eq("id", p.id);
        }
      }

      results.push({ warmup: p.id, sent, target, sentToday: sentToday ?? 0 });
    }

    return json({ success: true, results });
  } catch (err) {
    console.error("[warmup-cron] error:", err);
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
