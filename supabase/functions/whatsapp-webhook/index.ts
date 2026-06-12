import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token) {
      // Check verify token against all connection_configs AND env var
      const envVerifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
      let isValid = token === envVerifyToken;

      if (!isValid) {
        // Check if any connection_config has this verify_token
        try {
          const serviceClient = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
          );
          const { data: connections } = await serviceClient
            .from("connection_configs")
            .select("config")
            .eq("connection_id", "whatsapp")
            .eq("is_connected", true);

          isValid = connections?.some((c: any) => {
            const cfg = c.config as Record<string, string>;
            return cfg?.verify_token === token;
          }) || false;
        } catch (err) {
          console.error("Error checking verify tokens:", err);
        }
      }

      if (isValid) {
        console.log("Webhook verified");
        return new Response(challenge, { status: 200, headers: corsHeaders });
      }
    }
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  if (req.method === "POST") {
    const body = await req.json();

    try {
      console.log("[whatsapp-webhook] Incoming webhook received");
      await processWebhook(body);
      return new Response("OK", { status: 200, headers: corsHeaders });
    } catch (err) {
      console.error("Webhook processing error:", err);
      return new Response("Processing error", { status: 500, headers: corsHeaders });
    }
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
});

// Helper: find access_token for a given phone_number_id from connection_configs
async function resolveAccessToken(supabase: any, phoneNumberId: string): Promise<string> {
  try {
    const { data: connections } = await supabase
      .from("connection_configs")
      .select("config")
      .eq("connection_id", "whatsapp")
      .eq("is_connected", true);

    const match = connections?.find((c: any) => {
      const cfg = c.config as Record<string, string>;
      return cfg?.phone_number_id === phoneNumberId;
    });

    if (match) {
      const cfg = match.config as Record<string, string>;
      if (cfg?.access_token) {
        console.log(`[resolveAccessToken] Found token for phone_number_id: ${phoneNumberId}`);
        return cfg.access_token;
      }
    }
  } catch (err) {
    console.error("Error resolving access token:", err);
  }

  // Fallback to env var
  return Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
}

async function downloadWhatsAppMedia(mediaId: string, accessToken: string): Promise<{ url: string; mimeType: string } | null> {
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) {
      console.error("Failed to get media metadata:", await metaRes.text());
      return null;
    }
    const meta = await metaRes.json();
    const downloadUrl = meta.url;
    const mimeType = meta.mime_type || "application/octet-stream";

    const fileRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!fileRes.ok) {
      console.error("Failed to download media:", fileRes.status);
      return null;
    }
    const blob = await fileRes.blob();

    const extMap: Record<string, string> = {
      "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/aac": "aac",
      "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
      "video/mp4": "mp4", "video/3gpp": "3gp",
      "application/pdf": "pdf",
    };
    const ext = extMap[mimeType] || "bin";
    const fileName = `incoming-${mediaId}.${ext}`;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: uploadError } = await supabase.storage
      .from("automation-media")
      .upload(fileName, blob, { contentType: mimeType, upsert: true });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return null;
    }

    const { data: publicUrl } = supabase.storage
      .from("automation-media")
      .getPublicUrl(fileName);

    return { url: publicUrl.publicUrl, mimeType };
  } catch (err) {
    console.error("downloadWhatsAppMedia error:", err);
    return null;
  }
}

async function resolveNicheId(supabase: any, phoneNumberId: string): Promise<string | null> {
  try {
    // Find connection_config with this phone_number_id
    const { data: allConfigs } = await supabase
      .from("connection_configs")
      .select("id, config")
      .eq("connection_id", "whatsapp")
      .eq("is_connected", true);

    const matchedConfig = (allConfigs || []).find((c: any) => {
      const cfg = c.config as Record<string, string> | null;
      return cfg?.phone_number_id === phoneNumberId;
    });

    if (!matchedConfig) return null;

    // Find niche linked via niche_connections
    const { data: nicheConn } = await supabase
      .from("niche_connections")
      .select("niche_id")
      .eq("connection_config_id", matchedConfig.id)
      .limit(1)
      .maybeSingle();

    if (nicheConn?.niche_id) {
      console.log(`[resolveNicheId] Niche ${nicheConn.niche_id} for phone ${phoneNumberId}`);
      return nicheConn.niche_id;
    }
    return null;
  } catch (err) {
    console.error("Error resolving niche_id:", err);
    return null;
  }
}

async function resolveConnectionConfigId(supabase: any, phoneNumberId: string): Promise<string | null> {
  try {
    const { data: allConfigs } = await supabase
      .from("connection_configs")
      .select("id, config")
      .eq("connection_id", "whatsapp")
      .eq("is_connected", true);

    const matchedConfig = (allConfigs || []).find((c: any) => {
      const cfg = c.config as Record<string, string> | null;
      return cfg?.phone_number_id === phoneNumberId;
    });

    return matchedConfig?.id || null;
  } catch (err) {
    console.error("Error resolving connection_config_id:", err);
    return null;
  }
}

async function processWebhook(body: any) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const entries = body?.entry;
  if (!entries?.length) return;

  for (const entry of entries) {
    const changes = entry?.changes;
    if (!changes?.length) continue;

    for (const change of changes) {
      if (change.field !== "messages") continue;

      const value = change.value;
      const messages = value?.messages;
      const contacts = value?.contacts;
      const statuses = value?.statuses;

      if (statuses?.length) {
        for (const status of statuses) {
          const providerStatus = status.status || null;
          const providerMessageId = status.id || null;
          const providerError = Array.isArray(status.errors) && status.errors.length > 0
            ? JSON.stringify(status.errors[0]).slice(0, 500)
            : null;

          console.log(`[whatsapp-webhook] Status update: ${providerMessageId} -> ${providerStatus}`);

          if (!providerMessageId || !providerStatus) continue;

          const normalizedStatus = providerStatus === "failed"
            ? "failed"
            : providerStatus === "read"
              ? "read"
              : providerStatus === "delivered"
                ? "delivered"
                : providerStatus === "sent"
                  ? "sent"
                  : "pending";

          const updatePayload: Record<string, string | null> = {
            status: normalizedStatus,
            provider_status: providerStatus,
            provider_error: providerError,
          };

          await supabase
            .from("messages")
            .update(updatePayload)
            .eq("provider_message_id", providerMessageId)
            .eq("sender_type", "agent");
        }
      }

      if (!messages?.length) continue;

      // Resolve niche and access token from the phone_number_id that received the message
      const receivingPhoneNumberId = value?.metadata?.phone_number_id || "";
      const nicheId = await resolveNicheId(supabase, receivingPhoneNumberId);
      const connectionConfigId = await resolveConnectionConfigId(supabase, receivingPhoneNumberId);
      if (nicheId) {
        console.log(`Niche resolved: ${nicheId} for phone_number_id: ${receivingPhoneNumberId}`);
      }

      // Resolve access token for this specific connection
      const accessToken = await resolveAccessToken(supabase, receivingPhoneNumberId);

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const contact = contacts?.[i] || contacts?.[0];
        const phone = msg.from;
        const contactName = contact?.profile?.name || phone;

        const referral = msg.referral || value?.metadata?.referral;
        const ctwaClid = referral?.ctwa_clid || null;
        let sourceId = referral?.source_id || null;
        let adTitle = referral?.headline || referral?.body || referral?.source_url || null;

        // Fallback: when the referral arrives without source_id/ad_title (common on repeat
        // clicks or when Meta omits the fields), inherit from the most recent prior
        // conversation of the same phone that already has those metadata populated.
        if (ctwaClid && (!sourceId || !adTitle)) {
          const { data: prior } = await supabase
            .from("conversations")
            .select("source_id, ad_title, ad_id, adset_id, campaign_id, source_type")
            .eq("contact_phone", phone)
            .not("ad_title", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (prior) {
            if (!sourceId && prior.source_id) sourceId = prior.source_id;
            if (!adTitle && prior.ad_title) adTitle = prior.ad_title;
            console.log(`[whatsapp-webhook] Inherited ad metadata from prior conversation for ${phone}: ${adTitle}`);
          }
        }

        let conversationId: string;

        let existingQuery = supabase
          .from("conversations")
          .select("id")
          .eq("contact_phone", phone)
          .order("created_at", { ascending: false })
          .limit(1);

        if (connectionConfigId) {
          existingQuery = existingQuery.eq("connection_config_id", connectionConfigId);
        }

        let { data: existing } = await existingQuery.maybeSingle();

        if (!existing && !connectionConfigId) {
          const fallbackResult = await supabase
            .from("conversations")
            .select("id")
            .eq("contact_phone", phone)
            .is("connection_config_id", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          existing = fallbackResult.data;
        }

        if (existing) {
          conversationId = existing.id;
          const updateData: any = { updated_at: new Date().toISOString(), status: "active" };
          if (ctwaClid) updateData.ctwa_clid = ctwaClid;
          if (sourceId) updateData.source_id = sourceId;
          if (adTitle) updateData.ad_title = adTitle;

          if (connectionConfigId !== null) {
            updateData.connection_config_id = connectionConfigId;
            updateData.niche_id = nicheId;
          }

          await supabase
            .from("conversations")
            .update(updateData)
            .eq("id", conversationId);
        } else {
          const { data: newConv, error: convError } = await supabase
            .from("conversations")
            .insert({
              contact_name: contactName,
              contact_phone: phone,
              status: "new",
              tags: [],
              ctwa_clid: ctwaClid,
              source_id: sourceId,
              ad_title: adTitle,
              niche_id: nicheId,
              connection_config_id: connectionConfigId,
            })
            .select("id")
            .single();

          if (convError) {
            console.error("Error creating conversation:", convError);
            continue;
          }
          conversationId = newConv.id;
        }

        let content = "";
        let messageType = msg.type || "text";
        let mediaUrl: string | null = null;

        switch (msg.type) {
          case "text":
            content = msg.text?.body || "";
            break;
          case "image": {
            content = msg.image?.caption || "";
            messageType = "image";
            const imgMediaId = msg.image?.id;
            if (imgMediaId && accessToken) {
              const result = await downloadWhatsAppMedia(imgMediaId, accessToken);
              if (result) mediaUrl = result.url;
            }
            if (!content && !mediaUrl) content = "[Imagem]";
            break;
          }
          case "audio": {
            messageType = "audio";
            const audioMediaId = msg.audio?.id;
            if (audioMediaId && accessToken) {
              const result = await downloadWhatsAppMedia(audioMediaId, accessToken);
              if (result) {
                mediaUrl = result.url;
                const transcription = await transcribeAudio(result.url, "pending-conversation-id");
                if (transcription) {
                  content = `[Áudio transcrito]: ${transcription}`;
                }
              }
            }
            if (!content && !mediaUrl) content = "[Áudio]";
            break;
          }
          case "video": {
            content = msg.video?.caption || "";
            messageType = "video";
            const videoMediaId = msg.video?.id;
            if (videoMediaId && accessToken) {
              const result = await downloadWhatsAppMedia(videoMediaId, accessToken);
              if (result) mediaUrl = result.url;
            }
            if (!content && !mediaUrl) content = "[Vídeo]";
            break;
          }
          case "document":
            content = msg.document?.filename || "[Documento]";
            messageType = "document";
            break;
          case "location":
            content = `[Localização: ${msg.location?.latitude}, ${msg.location?.longitude}]`;
            messageType = "location";
            break;
          case "sticker":
            content = "[Sticker]";
            messageType = "sticker";
            break;
          case "contacts":
            content = "[Contato compartilhado]";
            messageType = "contacts";
            break;
          case "reaction":
            content = msg.reaction?.emoji || "[Reação]";
            messageType = "reaction";
            break;
          case "interactive": {
            const interactive = msg.interactive;
            if (interactive?.type === "button_reply") {
              content = interactive.button_reply?.title || "[Botão]";
            } else if (interactive?.type === "list_reply") {
              content = interactive.list_reply?.title || interactive.list_reply?.description || "[Lista]";
            } else {
              content = interactive?.button_reply?.title || interactive?.list_reply?.title || "[Interativo]";
            }
            messageType = "text";
            break;
          }
          case "button":
            content = msg.button?.text || msg.button?.payload || "[Botão]";
            messageType = "text";
            break;
          default:
            content = `[${msg.type || "Desconhecido"}]`;
        }

        const allowedTypes = ["text", "image", "document", "audio", "video"];
        const normalizedType = allowedTypes.includes(messageType) ? messageType : "text";

        // Deduplication: skip if this provider message was already stored
        const providerMsgId = msg.id || null;
        if (providerMsgId) {
          const { data: duplicate } = await supabase
            .from("messages")
            .select("id")
            .eq("provider_message_id", providerMsgId)
            .limit(1)
            .maybeSingle();
          if (duplicate) {
            console.log(`[whatsapp-webhook] Duplicate message ${providerMsgId}, skipping`);
            continue;
          }
        }

        const { error: msgError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          content,
          sender_type: "customer",
          message_type: normalizedType,
          media_url: mediaUrl,
          status: "delivered",
          provider_message_id: providerMsgId,
        });

        if (msgError) {
          console.error("Error inserting message:", msgError);
        } else {
          if (sourceId) {
            triggerMetaAdLookup(sourceId, conversationId).catch((err) =>
              console.error("Meta ad lookup error:", err)
            );
          }
          triggerAiFlowSelector(conversationId).catch((err) =>
            console.error("Flow selector trigger error:", err)
          );
          triggerAutoReply(conversationId).catch((err) =>
            console.error("Auto-reply trigger error:", err)
          );
        }
      }

    }
  }
}

async function triggerMetaAdLookup(sourceId: string, conversationId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const response = await fetch(`${supabaseUrl}/functions/v1/meta-ad-lookup`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sourceId, conversationId }),
  });

  const result = await response.json();
  console.log("Meta ad lookup result:", result);
}

async function triggerAiFlowSelector(conversationId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const response = await fetch(`${supabaseUrl}/functions/v1/ai-flow-selector`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ conversationId }),
  });

  const result = await response.json();
  console.log("Flow selector result:", result);
}

async function triggerAutoReply(conversationId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const response = await fetch(`${supabaseUrl}/functions/v1/ai-auto-reply`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ conversationId }),
  });

  const result = await response.json();
  console.log("Auto-reply result:", result);
}

async function transcribeAudio(audioUrl: string, conversationId: string): Promise<string | null> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    console.log(`[transcribe] Requesting transcription for audio: ${audioUrl}`);

    const response = await fetch(`${supabaseUrl}/functions/v1/transcribe-audio`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ audioUrl, conversationId }),
    });

    if (!response.ok) {
      console.error("Transcription failed:", response.status);
      return null;
    }

    const result = await response.json();
    if (result.success && result.transcription) {
      console.log(`[transcribe] Success: "${result.transcription.substring(0, 80)}..."`);
      return result.transcription;
    }
    return null;
  } catch (err) {
    console.error("transcribeAudio error:", err);
    return null;
  }
}
