import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { Output, streamText } from "npm:ai";
import { z } from "npm:zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const SmartConditionSchema = z.object({
  branch: z.enum(["x", "y", "none"]),
  confidence: z.number(),
  reason: z.string(),
});

type SmartConditionDecision = z.infer<typeof SmartConditionSchema>;

async function classifySmartCondition(params: {
  lovableKey: string;
  optionX: string;
  optionY: string;
  transcript: string;
}): Promise<SmartConditionDecision> {
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey: params.lovableKey,
    headers: { "Lovable-API-Key": params.lovableKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  const prompt = [
    "Classifique a ÚLTIMA resposta do lead usando o contexto recente apenas para interpretar intenção e referências.",
    "Escolha exatamente x, y ou none. Use none quando houver ambiguidade, informação insuficiente ou nenhuma correspondência clara.",
    `X significa: ${params.optionX}`,
    `Y significa: ${params.optionY}`,
    `CONVERSA RECENTE:\n${params.transcript}`,
    "Retorne motivo curto e confiança entre 0 e 1.",
  ].join("\n\n");

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = streamText({
        model: provider.responses("openai/gpt-6-astra"),
        output: Output.object({ schema: SmartConditionSchema }),
        prompt,
        maxRetries: 0,
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "low",
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
      });
      return await result.output;
    } catch (error) {
      const status = Number((error as { statusCode?: number })?.statusCode || 0);
      if (attempt >= 2 || (status !== 429 && status < 500)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** attempt));
    }
  }
  throw new Error("A análise inteligente não retornou uma decisão");
}

function createJsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function uploadWhatsAppMedia(params: {
  accessToken: string;
  mediaUrl: string;
  phoneNumberId: string;
  mediaType: "image" | "audio" | "video";
}) {
  const mediaResponse = await fetch(params.mediaUrl);
  if (!mediaResponse.ok) {
    throw new Error(`Falha ao baixar mídia: ${mediaResponse.status}`);
  }

  const blob = await mediaResponse.blob();
  const sourceContentType = mediaResponse.headers.get("content-type");
  const fallbackContentType =
    params.mediaType === "video"
      ? "video/mp4"
      : params.mediaType === "audio"
        ? "audio/ogg; codecs=opus"
        : "image/jpeg";

  // For audio, always force OGG Opus MIME type so WhatsApp renders as voice note (PTT)
  const effectiveContentType = params.mediaType === "audio"
    ? "audio/ogg; codecs=opus"
    : sourceContentType || fallbackContentType;

  const fileName = params.mediaType === "audio"
    ? `automation-audio.ogg`
    : `automation-${params.mediaType}`;

  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append(
    "file",
    new File([blob], fileName, {
      type: effectiveContentType,
    })
  );

  const uploadResponse = await fetch(`https://graph.facebook.com/v21.0/${params.phoneNumberId}/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: formData,
  });

  const uploadResult = await uploadResponse.json();
  if (!uploadResponse.ok || !uploadResult.id) {
    throw new Error(JSON.stringify(uploadResult.error || uploadResult));
  }

  return uploadResult.id as string;
}

async function sendWhatsAppCloudMessage(params: {
  accessToken: string;
  phoneNumberId: string;
  conversationPhone: string;
  nodeType: string;
  config: Record<string, unknown>;
  waPayload: Record<string, unknown>;
}) {
  const directMediaTypes = new Set(["image", "audio", "video"]);
  let payload = params.waPayload;

  if (directMediaTypes.has(params.nodeType)) {
    const mediaUrl = typeof params.config.media_url === "string" ? params.config.media_url : "";
    if (!mediaUrl) {
      throw new Error(`Mídia ausente para nó ${params.nodeType}`);
    }

    const mediaId = await uploadWhatsAppMedia({
      accessToken: params.accessToken,
      mediaUrl,
      phoneNumberId: params.phoneNumberId,
      mediaType: params.nodeType as "image" | "audio" | "video",
    });

    if (params.nodeType === "image") {
      payload = {
        messaging_product: "whatsapp",
        to: params.conversationPhone,
        type: "image",
        image: {
          id: mediaId,
          caption: (params.config.caption as string) || undefined,
        },
      };
    } else if (params.nodeType === "audio") {
      payload = {
        messaging_product: "whatsapp",
        to: params.conversationPhone,
        type: "audio",
        audio: {
          id: mediaId,
        },
      };
    } else if (params.nodeType === "video") {
      payload = {
        messaging_product: "whatsapp",
        to: params.conversationPhone,
        type: "video",
        video: {
          id: mediaId,
          caption: (params.config.caption as string) || undefined,
        },
      };
    }
  }

  const response = await fetch(`https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return response;
}

/** Validates the API response body to detect silent failures */
function validateSendResponse(
  waResponse: Response,
  waResult: Record<string, unknown>,
  useZapi: boolean,
  nodeId: string
): { success: boolean; errorDetail?: string } {
  if (!waResponse.ok) {
    return {
      success: false,
      errorDetail: JSON.stringify(waResult?.error || waResult).slice(0, 500),
    };
  }

  if (useZapi) {
    // Z-API can return 200 with error in body
    const zapiError = (waResult as any)?.error;
    if (zapiError) {
      console.error(`[execute-flow] Z-API 200 but body has error for node ${nodeId}:`, JSON.stringify(zapiError));
      return { success: false, errorDetail: JSON.stringify(zapiError).slice(0, 500) };
    }
    return { success: true };
  }

  // WhatsApp Cloud API validation
  const waError = (waResult as any)?.error;
  if (waError) {
    console.error(`[execute-flow] WA Cloud 200 but body has error for node ${nodeId}:`, JSON.stringify(waError));
    return { success: false, errorDetail: JSON.stringify(waError).slice(0, 500) };
  }

  const waMessages = (waResult as any)?.messages;
  if (!waMessages || !Array.isArray(waMessages) || waMessages.length === 0) {
    console.warn(`[execute-flow] WA Cloud 200 but no messages array for node ${nodeId}:`, JSON.stringify(waResult).slice(0, 300));
  }

  return { success: true };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isTransientProviderFailure(status: number, body?: unknown, errorMessage?: string): boolean {
  const text = `${errorMessage || ""} ${safeStringify(body || "")}`.toLowerCase();
  return (
    [408, 409, 425, 429, 500, 502, 503, 504].includes(status) ||
    /connection closed|connection reset|sendrequest|fetch failed|network|timeout|timed out|econnreset|socket|media upload failed on all hosts/.test(text)
  );
}

function isEvolutionMediaUploadFailure(body?: unknown): boolean {
  return /media upload failed on all hosts/i.test(safeStringify(body || ""));
}

async function readProviderResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : { value: parsed };
  } catch {
    return { raw: text.slice(0, 800) };
  }
}

async function callProviderWithRetry(
  providerLabel: string,
  send: () => Promise<Response>,
  maxAttempts = 3
): Promise<{ response: Response; result: Record<string, unknown>; attempts: number }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await send();
      const result = await readProviderResponse(response);
      if (!isTransientProviderFailure(response.status, result) || attempt === maxAttempts) {
        if (attempt > 1) {
          console.log(`[execute-flow] ${providerLabel} finished after ${attempt} attempts with HTTP ${response.status}`);
        }
        return { response, result, attempts: attempt };
      }
      console.warn(
        `[execute-flow] ${providerLabel} transient failure ${attempt}/${maxAttempts}: HTTP ${response.status} ${safeStringify(result).slice(0, 300)}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isTransientProviderFailure(500, null, message) || attempt === maxAttempts) {
        return {
          response: new Response(JSON.stringify({ error: message }), { status: 500 }),
          result: { error: message },
          attempts: attempt,
        };
      }
      console.warn(`[execute-flow] ${providerLabel} request exception ${attempt}/${maxAttempts}: ${message}`);
    }

    await sleep(700 * attempt);
  }

  return {
    response: new Response(JSON.stringify({ error: "Unknown provider error" }), { status: 500 }),
    result: { error: "Unknown provider error" },
    attempts: maxAttempts,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { flowId, conversationId, senderLabel: requestedLabel, metadata } = await req.json();

    // Helper: replace {{variable}} placeholders with metadata values
    const replaceVariables = (text: string): string => {
      if (!text || !metadata || typeof metadata !== "object") return text;
      return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        const value = (metadata as Record<string, unknown>)[key];
        return value !== null && value !== undefined ? String(value) : match;
      });
    };

    if (!flowId || !conversationId) {
      return createJsonResponse({ error: "flowId and conversationId are required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: conversation } = await supabase
      .from("conversations")
      .select("contact_phone, niche_id, connection_config_id, sale_registered_at, workspace_id")
      .eq("id", conversationId)
      .single();

    if (!conversation) {
      return createJsonResponse({ error: "Conversation not found" }, 404);
    }

    // Only block AI-triggered flows for leads with sale registered
    const isAiTrigger = requestedLabel === "ia-seletora" || requestedLabel === "ia-auto-reply" || requestedLabel === "ia-follow-up";
    if (isAiTrigger && conversation.sale_registered_at) {
      console.log(`[execute-flow] Skipping AI trigger: sale already registered for conversation ${conversationId}`);
      return createJsonResponse({ success: false, skipped: true, reason: "Sale already registered" }, 200);
    }

    console.log(`[execute-flow] Trigger by "${requestedLabel}" for conversation ${conversationId}, metadata:`, metadata ? JSON.stringify(metadata) : "none");

    // Resolve connection for this conversation's niche
    let resolvedConnection: Record<string, unknown> | null = null;
    let useZapi = false;
    let useEvolution = false;
    let useUazapi = false;

    if (conversation.connection_config_id) {
      const { data: directConfig } = await supabase
        .from("connection_configs")
        .select("connection_id, config, is_connected")
        .eq("id", conversation.connection_config_id)
        .eq("is_connected", true)
        .maybeSingle();

      if (directConfig) {
        resolvedConnection = directConfig.config as Record<string, unknown>;
        useZapi = directConfig.connection_id === "zapi";
        useEvolution = directConfig.connection_id === "evolution";
        useUazapi = directConfig.connection_id === "uazapigo";
      }
    }

    if (!resolvedConnection && conversation.niche_id) {
      const { data: nicheConns } = await supabase
        .from("niche_connections")
        .select("connection_config_id")
        .eq("niche_id", conversation.niche_id);

      if (nicheConns?.length) {
        const configIds = nicheConns.map((nc: any) => nc.connection_config_id);
        const { data: configs } = await supabase
          .from("connection_configs")
          .select("connection_id, config, is_connected")
          .in("id", configIds)
          .eq("is_connected", true);

        const zapiConn = configs?.find((c: any) => c.connection_id === "zapi");
        const evoConn = configs?.find((c: any) => c.connection_id === "evolution");
        const waConn = configs?.find((c: any) => c.connection_id === "whatsapp");
        const uazapiConn = configs?.find((c: any) => c.connection_id === "uazapigo");

        if (zapiConn) {
          resolvedConnection = zapiConn.config as Record<string, unknown>;
          useZapi = true;
        } else if (evoConn) {
          resolvedConnection = evoConn.config as Record<string, unknown>;
          useEvolution = true;
        } else if (uazapiConn) {
          resolvedConnection = uazapiConn.config as Record<string, unknown>;
          useUazapi = true;
        } else if (waConn) {
          resolvedConnection = waConn.config as Record<string, unknown>;
        }
      }
    }

    // Fallback to any connected connection
    if (!resolvedConnection) {
      const { data: connections } = await supabase
        .from("connection_configs")
        .select("connection_id, config, is_connected")
        .in("connection_id", ["zapi", "evolution", "uazapigo", "whatsapp"])
        .eq("is_connected", true);

      const zapiConnection = connections?.find((c: any) => c.connection_id === "zapi");
      const evoConnection = connections?.find((c: any) => c.connection_id === "evolution");
      const waConnection = connections?.find((c: any) => c.connection_id === "whatsapp");
      const uazapiConnection = connections?.find((c: any) => c.connection_id === "uazapigo");

      if (zapiConnection) {
        resolvedConnection = zapiConnection.config as Record<string, unknown>;
        useZapi = true;
      } else if (evoConnection) {
        resolvedConnection = evoConnection.config as Record<string, unknown>;
        useEvolution = true;
      } else if (uazapiConnection) {
        resolvedConnection = uazapiConnection.config as Record<string, unknown>;
        useUazapi = true;
      } else if (waConnection) {
        resolvedConnection = waConnection.config as Record<string, unknown>;
      }
    }

    // Conexão configurada para enviar pela extensão do Chrome?
    const useExtension = ((resolvedConnection as Record<string, unknown> | null)?.send_via_extension as string) === "1";

    const zapiInstanceId = useZapi
      ? (resolvedConnection?.instance_id as string) || Deno.env.get("ZAPI_INSTANCE_ID")
      : null;
    const zapiToken = useZapi
      ? (resolvedConnection?.token as string) || Deno.env.get("ZAPI_TOKEN")
      : null;
    const zapiClientToken = useZapi
      ? (resolvedConnection?.client_token as string) || Deno.env.get("ZAPI_CLIENT_TOKEN") || ""
      : "";

    const evoServerUrl = useEvolution
      ? ((resolvedConnection?.server_url as string) || Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/+$/, "")
      : "";
    const evoInstanceName = useEvolution ? ((resolvedConnection?.instance_name as string) || "") : "";
    const evoApiKey = useEvolution
      ? ((resolvedConnection?.api_key as string) || Deno.env.get("EVOLUTION_API_KEY") || "")
      : "";

    const phoneNumberId = (!useZapi && !useEvolution && !useUazapi)
      ? (resolvedConnection?.phone_number_id as string) || Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")
      : null;
    const accessToken = (!useZapi && !useEvolution && !useUazapi)
      ? (resolvedConnection?.access_token as string) || Deno.env.get("WHATSAPP_ACCESS_TOKEN")
      : null;

    if (!useExtension && useZapi && (!zapiInstanceId || !zapiToken)) {
      return createJsonResponse({ error: "Z-API not configured" }, 500);
    }

    if (!useExtension && useEvolution && (!evoServerUrl || !evoInstanceName || !evoApiKey)) {
      return createJsonResponse({ error: "Evolution not configured" }, 500);
    }

    if (!useExtension && !useZapi && !useEvolution && !useUazapi && (!phoneNumberId || !accessToken)) {
      return createJsonResponse({ error: "WhatsApp not configured" }, 500);
    }

    let phone = conversation.contact_phone.replace(/\D/g, "");
    // Normalize Brazilian phone numbers (add 9th digit if missing)
    if (phone.startsWith("55") && phone.length === 12) {
      const ddd = phone.substring(2, 4);
      const localNumber = phone.substring(4);
      if (!localNumber.startsWith("9")) {
        phone = `55${ddd}9${localNumber}`;
        console.log(`[execute-flow] Normalized phone: ${conversation.contact_phone} -> ${phone}`);
      }
    }

    console.log(`[execute-flow] Starting flow ${flowId} for conversation ${conversationId}, phone: ${phone}, provider: ${useZapi ? "Z-API" : useEvolution ? "Evolution" : useUazapi ? "uazapiGO" : "WA Cloud"}`);

    const [{ data: nodes }, { data: edges }] = await Promise.all([
      supabase.from("automation_nodes").select("*").eq("flow_id", flowId).order("sort_order", { ascending: true }),
      supabase.from("automation_edges").select("source_node_id, target_node_id, source_handle").eq("flow_id", flowId),
    ]);

    if (!nodes?.length) {
      return createJsonResponse({ error: "No nodes in flow" }, 400);
    }

    const { data: execution } = await supabase
      .from("flow_executions")
      .insert({
        flow_id: flowId,
        conversation_id: conversationId,
        status: "running",
        total_nodes: nodes.length,
        completed_nodes: 0,
      })
      .select("id")
      .single();

    const executionId = execution?.id;
    const results: { nodeId: string; status: string }[] = [];
    let completedCount = 0;
    let failed = false;
    let reviewRequired = false;
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const incomingIds = new Set((edges || []).map((edge) => edge.target_node_id));
    const outgoingByNode = new Map<string, typeof edges>();
    for (const edge of edges || []) {
      const outgoing = outgoingByNode.get(edge.source_node_id) || [];
      outgoing.push(edge);
      outgoingByNode.set(edge.source_node_id, outgoing);
    }
    const usesGraph = Boolean(edges?.length);
    const firstNode = nodes.find((node) => node.node_type === "trigger" && !incomingIds.has(node.id))
      || nodes.find((node) => !incomingIds.has(node.id))
      || nodes[0];
    let currentNode = firstNode;
    const visited = new Set<string>();
    const nextNode = (nodeId: string, handle?: string) => {
      if (!usesGraph) {
        const index = nodes.findIndex((item) => item.id === nodeId);
        return index >= 0 ? nodes[index + 1] : undefined;
      }
      const outgoing = outgoingByNode.get(nodeId) || [];
      const edge = handle ? outgoing.find((item) => item.source_handle === handle) : outgoing.find((item) => !item.source_handle) || outgoing[0];
      return edge ? nodeById.get(edge.target_node_id) : undefined;
    };

    while (currentNode) {
      const node = currentNode;
      if (visited.has(node.id)) {
        failed = true;
        results.push({ nodeId: node.id, status: "cycle_blocked" });
        break;
      }
      visited.add(node.id);
      const config = node.config as Record<string, unknown>;

      if (node.node_type === "trigger") {
        if (executionId) {
          await supabase.from("flow_step_logs").insert({
            execution_id: executionId,
            node_id: node.id,
            node_type: node.node_type,
            node_label: node.label || "Gatilho",
            sort_order: node.sort_order,
            status: "completed",
          });
        }
        completedCount++;
        results.push({ nodeId: node.id, status: "started" });
        currentNode = nextNode(node.id);
        continue;
      }

      if (node.node_type === "smart_condition") {
        const optionX = typeof config.option_x === "string" ? config.option_x.trim() : "";
        const optionY = typeof config.option_y === "string" ? config.option_y.trim() : "";
        let decision: SmartConditionDecision = { branch: "none", confidence: 0, reason: "Condição inteligente incompleta" };
        try {
          if (!optionX || !optionY) throw new Error("Preencha as definições de X e Y antes de executar o fluxo");
          const lovableKey = Deno.env.get("LOVABLE_API_KEY");
          if (!lovableKey) throw new Error("Lovable AI não está configurada");
          const messageLimit = Math.max(2, Math.min(30, Number(config.context_message_limit) || 20));
          const { data: recentMessages, error: messagesError } = await supabase
            .from("messages")
            .select("sender_type, sender_label, content, message_type, created_at")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(messageLimit);
          if (messagesError) throw messagesError;
          const transcript = [...(recentMessages || [])].reverse().map((message) =>
            `${message.sender_type === "customer" ? "LEAD" : message.sender_label || "ATENDENTE"}: ${message.content || `[${message.message_type}]`}`
          ).join("\n").slice(-24000);
          decision = await classifySmartCondition({ lovableKey, optionX, optionY, transcript });
          decision.confidence = Math.max(0, Math.min(1, Number(decision.confidence) || 0));
          if (decision.confidence < 0.75) decision.branch = "none";
        } catch (error) {
          decision = {
            branch: "none",
            confidence: 0,
            reason: error instanceof Error ? error.message : "Falha ao analisar a resposta do lead",
          };
        }

        const chosenNext = decision.branch === "none" ? undefined : nextNode(node.id, decision.branch);
        const decisionSummary = `saída=${decision.branch}; confiança=${Math.round(decision.confidence * 100)}%; motivo=${decision.reason}`;
        if (executionId) {
          await supabase.from("flow_step_logs").insert({
            execution_id: executionId,
            node_id: node.id,
            node_type: node.node_type,
            node_label: node.label || "Condição Inteligente",
            sort_order: node.sort_order,
            status: decision.branch === "none" || !chosenNext ? "review_required" : "completed",
            error_message: decisionSummary,
          });
        }
        completedCount++;
        if (decision.branch === "none" || !chosenNext) {
          reviewRequired = true;
          results.push({ nodeId: node.id, status: "review_required" });
          currentNode = undefined;
        } else {
          results.push({ nodeId: node.id, status: `branch_${decision.branch}` });
          currentNode = chosenNext;
        }
        continue;
      }

      if (node.node_type === "delay") {
        const delayValue = (config.delay_value as number) || (config.delay_seconds as number) || 5;
        const delayUnit = (config.delay_unit as string) || "seconds";
        const seconds = delayUnit === "minutes" ? delayValue * 60
          : delayUnit === "hours" ? delayValue * 3600
          : delayValue;

        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));

        if (executionId) {
          await supabase.from("flow_step_logs").insert({
            execution_id: executionId,
            node_id: node.id,
            node_type: node.node_type,
            node_label: node.label || `Esperar ${seconds}s`,
            sort_order: node.sort_order,
            status: "completed",
          });
        }
        completedCount++;
        results.push({ nodeId: node.id, status: `delayed ${seconds}s` });
        currentNode = nextNode(node.id);
        continue;
      }

      let waPayload: Record<string, unknown>;

      if (node.node_type === "message") {
        const content = replaceVariables((config.content as string) || "");
        if (!content.trim()) {
          if (executionId) {
            await supabase.from("flow_step_logs").insert({
              execution_id: executionId,
              node_id: node.id,
              node_type: node.node_type,
              node_label: node.label || "Mensagem",
              sort_order: node.sort_order,
              status: "skipped",
              error_message: "Conteúdo vazio",
            });
          }
          results.push({ nodeId: node.id, status: "skipped_empty" });
          currentNode = nextNode(node.id);
          continue;
        }
        waPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: content },
        };
      } else if (node.node_type === "image") {
        waPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "image",
          image: { link: config.media_url, caption: replaceVariables((config.caption as string) || "") || undefined },
        };
      } else if (node.node_type === "audio") {
        waPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "audio",
          audio: { link: config.media_url },
        };
      } else if (node.node_type === "video") {
        waPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "video",
          video: { link: config.media_url, caption: replaceVariables((config.caption as string) || "") || undefined },
        };
      } else if (node.node_type === "quick_reply") {
        const content = replaceVariables((config.content as string) || "");
        const buttons = (config.buttons as string[]) || [];
        if (!content.trim()) {
          if (executionId) {
            await supabase.from("flow_step_logs").insert({
              execution_id: executionId,
              node_id: node.id,
              node_type: node.node_type,
              node_label: node.label || "Resposta Rápida",
              sort_order: node.sort_order,
              status: "skipped",
              error_message: "Conteúdo vazio",
            });
          }
          results.push({ nodeId: node.id, status: "skipped_empty" });
          currentNode = nextNode(node.id);
          continue;
        }
        if (buttons.length > 0 && buttons.length <= 3) {
          waPayload = {
            messaging_product: "whatsapp",
            to: phone,
            type: "interactive",
            interactive: {
              type: "button",
              body: { text: content },
              action: {
                buttons: buttons.map((btn, idx) => ({
                  type: "reply",
                  reply: { id: `btn_${idx}`, title: btn.slice(0, 20) },
                })),
              },
            },
          };
        } else {
          const buttonText = buttons.length > 0
            ? "\n\n" + buttons.map((b, i) => `${i + 1}. ${b}`).join("\n")
            : "";
          waPayload = {
            messaging_product: "whatsapp",
            to: phone,
            type: "text",
            text: { body: content + buttonText },
          };
        }
      } else if (node.node_type === "call_button") {
        const content = replaceVariables((config.content as string) || "");
        const callPhone = (config.call_phone as string) || "";
        const callButtonText = (config.call_button_text as string) || "Ligar agora";
        
        if (!content.trim() || !callPhone.trim()) {
          if (executionId) {
            await supabase.from("flow_step_logs").insert({
              execution_id: executionId,
              node_id: node.id,
              node_type: node.node_type,
              node_label: node.label || "Botão de Ligação",
              sort_order: node.sort_order,
              status: "skipped",
              error_message: !content.trim() ? "Conteúdo vazio" : "Telefone não configurado",
            });
          }
          results.push({ nodeId: node.id, status: "skipped_empty" });
          currentNode = nextNode(node.id);
          continue;
        }

        // WhatsApp Cloud API CTA URL with tel: scheme
        waPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "interactive",
          interactive: {
            type: "cta_url",
            body: { text: content },
            action: {
              name: "cta_url",
              parameters: {
                display_text: callButtonText.slice(0, 20),
                url: callPhone.startsWith("tel:") ? callPhone : `tel:${callPhone}`,
              },
            },
          },
        };
      } else if (node.node_type === "action") {
        // Handle action nodes internally (no message sending)
        const actionType = config.action_type as string;
        let actionError: string | null = null;
        
        if (actionType === "add_tag" || actionType === "remove_tag") {
          let tagId = typeof config.tag_id === "string" ? config.tag_id : "";
          const configuredTagName = typeof config.tag_name === "string" ? config.tag_name.trim() : "";

          // Imported and legacy flows may only contain the tag name.
          if (!tagId && configuredTagName) {
            const { data: tagByName, error: tagByNameError } = await supabase
              .from("tags")
              .select("id")
              .eq("workspace_id", conversation.workspace_id)
              .ilike("name", configuredTagName)
              .limit(1)
              .maybeSingle();

            if (tagByNameError) {
              actionError = tagByNameError.message;
            } else if (tagByName) {
              tagId = tagByName.id;
            }
          }

          if (!tagId && !actionError) {
            actionError = configuredTagName
              ? `Etiqueta "${configuredTagName}" não encontrada neste workspace`
              : "Etiqueta não configurada no bloco de ação";
          } else if (!actionError) {
            const { data: tag, error: tagLookupError } = await supabase
              .from("tags")
              .select("id, name")
              .eq("id", tagId)
              .eq("workspace_id", conversation.workspace_id)
              .maybeSingle();

            if (tagLookupError || !tag) {
              actionError = tagLookupError?.message || "Etiqueta não encontrada neste workspace";
            } else if (actionType === "add_tag") {
              const { data: existingLink, error: existingLinkError } = await supabase
                .from("contact_tags")
                .select("id")
                .eq("contact_phone", conversation.contact_phone)
                .eq("tag_id", tagId)
                .eq("workspace_id", conversation.workspace_id)
                .maybeSingle();

              if (existingLinkError) {
                actionError = existingLinkError.message;
              } else if (!existingLink) {
                const { error: insertTagError } = await supabase.from("contact_tags").insert({
                  contact_phone: conversation.contact_phone,
                  tag_id: tagId,
                  workspace_id: conversation.workspace_id,
                });
                if (insertTagError) actionError = insertTagError.message;
              }

              if (!actionError) {
                console.log(`[execute-flow] Added tag "${tag.name}" to ${conversation.contact_phone}`);
              }
            } else {
              const { error: removeTagError } = await supabase
                .from("contact_tags")
                .delete()
                .eq("contact_phone", conversation.contact_phone)
                .eq("tag_id", tagId)
                .eq("workspace_id", conversation.workspace_id);

              if (removeTagError) {
                actionError = removeTagError.message;
              } else {
                console.log(`[execute-flow] Removed tag "${tag.name}" from ${conversation.contact_phone}`);
              }
            }
          }
        } else if (actionType === "set_funnel_stage") {
          const stage = (config.funnel_stage as string) || "etapa_1";
          await supabase
            .from("conversations")
            .update({ funnel_stage: stage })
            .eq("id", conversationId);
          
          console.log(`[execute-flow] Set funnel stage to "${stage}" for conversation ${conversationId}`);
        } else if (actionType === "set_billing_stage") {
          const billingStage = (config.billing_stage as string) || "";
          if (billingStage) {
            // Get connection label to save and send
            let connectionLabel = "";
            if (conversation.connection_config_id) {
              const { data: connConfig } = await supabase
                .from("connection_configs")
                .select("label")
                .eq("id", conversation.connection_config_id)
                .maybeSingle();
              connectionLabel = connConfig?.label || "";
            }

            // Save locally with connection name
            await supabase
              .from("conversations")
              .update({ billing_stage: billingStage, billing_connection_name: connectionLabel || null })
              .eq("id", conversationId);




            // Send webhook to attendance platform
            const ATTENDANCE_WEBHOOK_URL = "https://gwvhvvmghkpgtiofnivo.supabase.co/functions/v1/receive-attendance-webhook";
            try {
              const webhookPayload = {
                telefone: phone,
                status_cobranca: billingStage,
                wpp_cobranca: connectionLabel,
              };
              const whRes = await fetch(ATTENDANCE_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(webhookPayload),
              });
              const whResult = await whRes.json();
              console.log(`[execute-flow] Billing webhook sent: status=${whRes.status}`, whResult);
            } catch (whErr) {
              console.error(`[execute-flow] Failed to send billing webhook:`, whErr);
            }

            console.log(`[execute-flow] Set billing stage to "${billingStage}" for conversation ${conversationId}`);
          }
        }
        // Other action types (transfer_agent, webhook) can be handled here too

        if (actionError) {
          console.error(`[execute-flow] Action ${actionType} failed on node ${node.id}: ${actionError}`);
          if (executionId) {
            await supabase.from("flow_step_logs").insert({
              execution_id: executionId,
              node_id: node.id,
              node_type: node.node_type,
              node_label: node.label || "Ação",
              sort_order: node.sort_order,
              status: "failed",
              error_message: actionError,
            });
            await supabase
              .from("flow_executions")
              .update({
                status: "failed",
                failed_at_node_id: node.id,
                completed_nodes: completedCount,
                completed_at: new Date().toISOString(),
              })
              .eq("id", executionId);
          }
          failed = true;
          results.push({ nodeId: node.id, status: "error" });
          break;
        }
        
        if (executionId) {
          await supabase.from("flow_step_logs").insert({
            execution_id: executionId,
            node_id: node.id,
            node_type: node.node_type,
            node_label: node.label || "Ação",
            sort_order: node.sort_order,
            status: "completed",
          });
        }
        completedCount++;
        results.push({ nodeId: node.id, status: `action_${actionType}` });
        currentNode = nextNode(node.id);
        continue;
      } else {
        if (executionId) {
          await supabase.from("flow_step_logs").insert({
            execution_id: executionId,
            node_id: node.id,
            node_type: node.node_type,
            node_label: node.label || node.node_type,
            sort_order: node.sort_order,
            status: "skipped",
          });
        }
        results.push({ nodeId: node.id, status: "skipped" });
        currentNode = nextNode(node.id);
        continue;
      }

      let waResponse: Response;
      let waResult: Record<string, unknown> = {};
      let sendValidation: { success: boolean; errorDetail?: string } = { success: false };
      let providerAttempts = 1;
      let messageSavedExternally = false;

      try {
        if (useExtension) {
          // Roteia o envio para a extensão do Chrome (ela executa no WhatsApp Web)
          let extText = "";
          let extMedia: string | null = null;
          let extType = "text";

          if (node.node_type === "image" || node.node_type === "video") {
            extType = node.node_type;
            extMedia = (config.media_url as string) || null;
            extText = replaceVariables((config.caption as string) || "");
          } else if (node.node_type === "audio") {
            extType = "audio";
            extMedia = (config.media_url as string) || null;
          } else if (node.node_type === "call_button") {
            const content = replaceVariables((config.content as string) || "");
            const callPhone = (config.call_phone as string) || "";
            const callButtonText = (config.call_button_text as string) || "Ligar agora";
            extText = `${content}\n\n📞 ${callButtonText}: ${callPhone}`;
          } else {
            const textBody = (waPayload as Record<string, unknown>).text as Record<string, unknown> | undefined;
            const interactiveBody = (waPayload as Record<string, unknown>).interactive as Record<string, unknown> | undefined;
            if (textBody) {
              extText = (textBody.body as string) || "";
            } else if (interactiveBody) {
              const body = ((interactiveBody.body as Record<string, unknown>)?.text as string) || "";
              const action = interactiveBody.action as Record<string, unknown>;
              const buttons = (action?.buttons as Array<Record<string, unknown>>) || [];
              const btnText = buttons
                .map((b, i) => `${i + 1}. ${(b.reply as Record<string, unknown>)?.title || ""}`)
                .join("\n");
              extText = body + (btnText ? "\n\n" + btnText : "");
            }
          }

          console.log(`[execute-flow] Sending via Chrome extension node ${node.id} (${node.node_type}) to ${phone}`);

          const extResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/extension-send`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              conversationId,
              message: extText,
              mediaUrl: extMedia,
              type: extType,
              senderLabel: requestedLabel || "fluxo",
            }),
          });

          waResult = await extResp.json().catch(() => ({}));
          waResponse = new Response(JSON.stringify(waResult), { status: extResp.ok ? 200 : 502 });
          sendValidation = {
            success: extResp.ok,
            errorDetail: extResp.ok ? undefined : ((waResult as Record<string, unknown>)?.error as string) || "Falha ao enviar comando para a extensão",
          };
          messageSavedExternally = extResp.ok && !!(waResult as Record<string, any>)?.savedMessage?.id;
        } else if (useUazapi) {
          let uazapiText = "";
          let uazapiMedia: string | null = null;
          let uazapiType = "text";
          if (["image", "video", "audio"].includes(node.node_type)) {
            uazapiType = node.node_type;
            uazapiMedia = (config.media_url as string) || null;
            uazapiText = node.node_type === "audio" ? "" : replaceVariables((config.caption as string) || "");
          } else if (node.node_type === "call_button") {
            uazapiText = `${replaceVariables((config.content as string) || "")}\n\n📞 ${(config.call_button_text as string) || "Ligar agora"}: ${(config.call_phone as string) || ""}`;
          } else {
            const textBody = (waPayload as Record<string, unknown>).text as Record<string, unknown> | undefined;
            const interactiveBody = (waPayload as Record<string, unknown>).interactive as Record<string, unknown> | undefined;
            uazapiText = (textBody?.body as string) || (((interactiveBody?.body as Record<string, unknown>)?.text as string) || "");
          }
          const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/uazapigo-send`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
            body: JSON.stringify({ conversationId, message: uazapiText, mediaUrl: uazapiMedia, type: uazapiType, senderLabel: requestedLabel || "fluxo" }),
          });
          waResult = await response.json().catch(() => ({}));
          waResponse = new Response(JSON.stringify(waResult), { status: response.status });
          sendValidation = { success: response.ok && (waResult as any)?.success !== false, errorDetail: (waResult as any)?.error };
          messageSavedExternally = Boolean((waResult as any)?.savedMessage?.id);
        } else if (useZapi) {
          let zapiEndpoint: string;
          let zapiBody: Record<string, unknown>;
          const zapiBase = `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}`;

          if (node.node_type === "audio") {
            zapiEndpoint = `${zapiBase}/send-audio`;
            zapiBody = { phone, audio: config.media_url };
          } else if (node.node_type === "image") {
            zapiEndpoint = `${zapiBase}/send-link-image`;
            zapiBody = { phone, imageUrl: config.media_url, caption: replaceVariables((config.caption as string) || "") };
          } else if (node.node_type === "video") {
            zapiEndpoint = `${zapiBase}/send-link-video`;
            zapiBody = { phone, videoUrl: config.media_url, caption: replaceVariables((config.caption as string) || "") };
          } else if (node.node_type === "call_button") {
            // Z-API doesn't support CTA buttons, send as text with phone number
            const content = replaceVariables((config.content as string) || "");
            const callPhone = (config.call_phone as string) || "";
            const callButtonText = (config.call_button_text as string) || "Ligar agora";
            const textContent = `${content}\n\n📞 ${callButtonText}: ${callPhone}`;
            zapiEndpoint = `${zapiBase}/send-text`;
            zapiBody = { phone, message: textContent };
          } else {
            const textBody = (waPayload as Record<string, unknown>).text as Record<string, unknown> | undefined;
            const interactiveBody = (waPayload as Record<string, unknown>).interactive as Record<string, unknown> | undefined;
            let textContent = "";

            if (textBody) {
              textContent = (textBody.body as string) || "";
            } else if (interactiveBody) {
              const body = ((interactiveBody.body as Record<string, unknown>)?.text as string) || "";
              const action = interactiveBody.action as Record<string, unknown>;
              const buttons = (action?.buttons as Array<Record<string, unknown>>) || [];
              const btnText = buttons
                .map((b, i) => `${i + 1}. ${(b.reply as Record<string, unknown>)?.title || ""}`)
                .join("\n");
              textContent = body + (btnText ? "\n\n" + btnText : "");
            }

            zapiEndpoint = `${zapiBase}/send-text`;
            zapiBody = { phone, message: textContent };
          }

          console.log(`[execute-flow] Sending via Z-API node ${node.id} (${node.node_type}) to ${phone}`);

          const sendResult = await callProviderWithRetry("Z-API", () => fetch(zapiEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Client-Token": zapiClientToken,
            },
            body: JSON.stringify(zapiBody),
          }));
          waResponse = sendResult.response;
          waResult = sendResult.result;
          providerAttempts = sendResult.attempts;
        } else if (useEvolution) {
          let evoEndpoint: string;
          let evoBody: Record<string, unknown>;
          const evoBase = `${evoServerUrl}/message`;
          const inst = encodeURIComponent(evoInstanceName);

          if (node.node_type === "audio") {
            evoEndpoint = `${evoBase}/sendWhatsAppAudio/${inst}`;
            evoBody = { number: phone, audio: config.media_url };
          } else if (node.node_type === "image" || node.node_type === "video") {
            evoEndpoint = `${evoBase}/sendMedia/${inst}`;
            evoBody = {
              number: phone,
              mediatype: node.node_type === "video" ? "video" : "image",
              media: config.media_url,
              caption: replaceVariables((config.caption as string) || ""),
            };
          } else if (node.node_type === "call_button") {
            const content = replaceVariables((config.content as string) || "");
            const callPhone = (config.call_phone as string) || "";
            const callButtonText = (config.call_button_text as string) || "Ligar agora";
            evoEndpoint = `${evoBase}/sendText/${inst}`;
            evoBody = { number: phone, text: `${content}\n\n📞 ${callButtonText}: ${callPhone}` };
          } else {
            const textBody = (waPayload as Record<string, unknown>).text as Record<string, unknown> | undefined;
            const interactiveBody = (waPayload as Record<string, unknown>).interactive as Record<string, unknown> | undefined;
            let textContent = "";
            if (textBody) {
              textContent = (textBody.body as string) || "";
            } else if (interactiveBody) {
              const body = ((interactiveBody.body as Record<string, unknown>)?.text as string) || "";
              const action = interactiveBody.action as Record<string, unknown>;
              const buttons = (action?.buttons as Array<Record<string, unknown>>) || [];
              const btnText = buttons
                .map((b, i) => `${i + 1}. ${(b.reply as Record<string, unknown>)?.title || ""}`)
                .join("\n");
              textContent = body + (btnText ? "\n\n" + btnText : "");
            }
            evoEndpoint = `${evoBase}/sendText/${inst}`;
            evoBody = { number: phone, text: textContent };
          }

          console.log(`[execute-flow] Sending via Evolution node ${node.id} (${node.node_type}) to ${phone}`);

          let sendResult = await callProviderWithRetry("Evolution", () => fetch(evoEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoApiKey },
            body: JSON.stringify(evoBody),
          }));

          if (node.node_type === "audio" && !sendResult.response.ok && isEvolutionMediaUploadFailure(sendResult.result)) {
            const fallbackEndpoint = `${evoBase}/sendMedia/${inst}`;
            const fallbackBody = {
              number: phone,
              mediatype: "audio",
              media: config.media_url,
              caption: "",
            };
            console.warn(`[execute-flow] Evolution audio upload failed; retrying with sendMedia fallback for node ${node.id}`);
            sendResult = await callProviderWithRetry("Evolution audio fallback", () => fetch(fallbackEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evoApiKey },
              body: JSON.stringify(fallbackBody),
            }));
          }

          waResponse = sendResult.response;
          waResult = sendResult.result;
          providerAttempts = sendResult.attempts;
        } else {
          console.log(`[execute-flow] Sending via WA Cloud node ${node.id} (${node.node_type}) to ${phone}`);

          const sendResult = await callProviderWithRetry("WhatsApp Cloud", () => sendWhatsAppCloudMessage({
            accessToken: accessToken || '',
            phoneNumberId: phoneNumberId || '',
            conversationPhone: phone,
            nodeType: node.node_type,
            config,
            waPayload,
          }));
          waResponse = sendResult.response;
          waResult = sendResult.result;
          providerAttempts = sendResult.attempts;
        }

        console.log(`[execute-flow] API response node ${node.id}: HTTP ${waResponse.status}, attempts: ${providerAttempts}, body: ${JSON.stringify(waResult).slice(0, 400)}`);

        // Validate response body beyond just HTTP status
        if (!useExtension) {
          sendValidation = validateSendResponse(waResponse, waResult, useZapi || useEvolution || useUazapi, node.id);
        }
      } catch (error) {
        console.error("[execute-flow] Send exception for node", node.id, ":", error);
        waResponse = new Response(null, { status: 500 });
        waResult = {
          error: error instanceof Error ? error.message : "Unknown send error",
        };
        sendValidation = {
          success: false,
          errorDetail: error instanceof Error ? error.message : "Unknown send error",
        };
      }

      if (!sendValidation.success) {
        const errorDetail = sendValidation.errorDetail || JSON.stringify(waResult).slice(0, 500);
        console.error(`[execute-flow] FAILED node ${node.id} (${node.node_type}) to ${phone}: ${errorDetail}`);

        // Save the failed message to chat so the user can see it failed
        let failedContent = "";
        let failedMediaUrl: string | null = null;
        let failedType = "text";

        if (node.node_type === "message") {
          failedContent = (config.content as string) || "";
        } else if (node.node_type === "image") {
          failedContent = (config.caption as string) || "";
          failedMediaUrl = (config.media_url as string) || null;
          failedType = "image";
        } else if (node.node_type === "audio") {
          failedMediaUrl = (config.media_url as string) || null;
          failedType = "audio";
        } else if (node.node_type === "video") {
          failedContent = (config.caption as string) || "";
          failedMediaUrl = (config.media_url as string) || null;
          failedType = "video";
        } else if (node.node_type === "quick_reply") {
          const qrContent = (config.content as string) || "";
          const qrButtons = (config.buttons as string[]) || [];
          failedContent = qrButtons.length > 0
            ? qrContent + "\n\n" + qrButtons.map((b, i) => `${i + 1}. ${b}`).join("\n")
            : qrContent;
        } else if (node.node_type === "call_button") {
          const cbContent = (config.content as string) || "";
          const cbPhone = (config.call_phone as string) || "";
          failedContent = `${cbContent}\n\n📞 ${cbPhone}`;
        }

        const providerErrorPayload = JSON.stringify({
          code: waResponse.status,
          title: useEvolution ? "Evolution API" : useUazapi ? "uazapiGO" : useZapi ? "Z-API" : "WhatsApp",
          message: errorDetail,
          error_data: {
            attempts: providerAttempts,
            details: typeof waResult === "string" ? waResult : JSON.stringify(waResult).slice(0, 500),
          },
        }).slice(0, 800);

        // Insert message with status 'failed' so it appears in chat with error indicator
        // (skipped when the extension route already saved the message)
        if (!messageSavedExternally) await supabase.from("messages").insert({
          conversation_id: conversationId,
          content: failedContent || `[${failedType}]`,
          sender_type: "agent",
          message_type: failedType,
          media_url: failedMediaUrl,
          status: "failed",
          provider_status: String(waResponse.status),
          provider_error: providerErrorPayload,
          sender_label: requestedLabel || "fluxo",
        });

        if (executionId) {
          await supabase.from("flow_step_logs").insert({
            execution_id: executionId,
            node_id: node.id,
            node_type: node.node_type,
            node_label: node.label || node.node_type,
            sort_order: node.sort_order,
            status: "failed",
            error_message: errorDetail,
          });

          await supabase
            .from("flow_executions")
            .update({
              status: "failed",
              failed_at_node_id: node.id,
              completed_nodes: completedCount,
              completed_at: new Date().toISOString(),
            })
            .eq("id", executionId);
        }
        failed = true;
        results.push({ nodeId: node.id, status: "error" });
        break;
      }

      const providerMessageId = useZapi
        ? ((waResult as Record<string, unknown>)?.messageId as string | undefined) || null
        : useEvolution
        ? (((waResult as any)?.key?.id as string | undefined) || ((waResult as any)?.messageId as string | undefined) || null)
        : (((waResult as Record<string, unknown>)?.messages as Array<Record<string, unknown>> | undefined)?.[0]?.id as string | undefined) || null;

      let msgContent = "";
      let msgMediaUrl: string | null = null;
      let normalizedType = "text";

      if (node.node_type === "message") {
        msgContent = (config.content as string) || "";
      } else if (node.node_type === "image") {
        msgContent = (config.caption as string) || "";
        msgMediaUrl = (config.media_url as string) || null;
        normalizedType = "image";
      } else if (node.node_type === "audio") {
        msgMediaUrl = (config.media_url as string) || null;
        normalizedType = "audio";
      } else if (node.node_type === "video") {
        msgContent = (config.caption as string) || "";
        msgMediaUrl = (config.media_url as string) || null;
        normalizedType = "video";
      } else if (node.node_type === "quick_reply") {
        const qrContent = (config.content as string) || "";
        const qrButtons = (config.buttons as string[]) || [];
        msgContent = qrButtons.length > 0
          ? qrContent + "\n\n" + qrButtons.map((b, i) => `${i + 1}. ${b}`).join("\n")
          : qrContent;
      }

      // A extensão já salva a mensagem como "pending/queued" — não duplicar
      const messageInsertError = messageSavedExternally ? null : (await supabase.from("messages").insert({
        conversation_id: conversationId,
        content: msgContent,
        sender_type: "agent",
        message_type: normalizedType,
        media_url: msgMediaUrl,
        status: useEvolution ? "sent" : providerMessageId ? "pending" : "sent",
        provider_message_id: providerMessageId,
        provider_status: providerMessageId ? (useEvolution ? "sent" : "accepted") : null,
        sender_label: requestedLabel || "fluxo",
      })).error;

      if (messageInsertError) {
        console.error("[execute-flow] Message insert error:", messageInsertError);
      }

      if (executionId) {
        await supabase.from("flow_step_logs").insert({
          execution_id: executionId,
          node_id: node.id,
          node_type: node.node_type,
          node_label: node.label || node.node_type,
          sort_order: node.sort_order,
          status: "completed",
          error_message: messageInsertError ? `message_insert: ${messageInsertError.message}` : null,
        });
      }
      completedCount++;
      results.push({ nodeId: node.id, status: "sent" });
      currentNode = nextNode(node.id);
    }

    if (executionId && !failed) {
      await supabase
        .from("flow_executions")
        .update({
          status: reviewRequired ? "review_required" : "completed",
          completed_nodes: completedCount,
          completed_at: new Date().toISOString(),
        })
        .eq("id", executionId);
    }

    const { data: currentFlow } = await supabase
      .from("automation_flows")
      .select("trigger_count")
      .eq("id", flowId)
      .single();

    await supabase
      .from("automation_flows")
      .update({ trigger_count: (currentFlow?.trigger_count || 0) + 1 })
      .eq("id", flowId);

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    console.log(`[execute-flow] Flow ${flowId} finished: ${failed ? "FAILED" : "SUCCESS"}, ${completedCount}/${nodes.length} nodes completed`);

    return createJsonResponse({ success: !failed && !reviewRequired, reviewRequired, executionId, results }, 200);
  } catch (error) {
    console.error("[execute-flow] Fatal error:", error);
    return createJsonResponse({ error: "Internal server error" }, 500);
  }
});
