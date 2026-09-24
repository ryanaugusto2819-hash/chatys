import { createOpenAI } from "npm:@ai-sdk/openai";
import { Output, streamText } from "npm:ai";
import { z } from "npm:zod";

const ReceiptSchema = z.object({
  is_possible_receipt: z.boolean(),
  confidence: z.number(),
  reason: z.string(),
  detected_amount: z.number().positive().nullable(),
  detected_currency: z.string().length(3).nullable(),
  amount_confidence: z.number(),
});

export type ReceiptAnalysis = z.infer<typeof ReceiptSchema>;

const clampConfidence = (value: number) => Math.max(0, Math.min(1, Number(value) || 0));

export async function analyzePaymentReceipt(imageUrl: string, lovableKey: string): Promise<{
  analysis: ReceiptAnalysis;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
}> {
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey: lovableKey,
    headers: { "Lovable-API-Key": lovableKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = streamText({
        model: provider.responses("openai/gpt-6-astra"),
        output: Output.object({ schema: ReceiptSchema }),
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: "Analise esta imagem. Identifique se ela parece ser um comprovante de pagamento, depósito, transferência, OXXO ou recibo financeiro. Extraia somente o valor total efetivamente pago e a moeda de três letras quando estiverem claramente visíveis; não use saldo, tarifa, troco, limite ou valor de referência. Se houver dúvida, retorne detected_amount e detected_currency como null. Uma imagem pode ser um possível comprovante, mas nunca confirme que o pagamento foi aprovado. Retorne motivo curto, confiança geral e confiança do valor entre 0 e 1.",
            },
            { type: "image", image: new URL(imageUrl) },
          ],
        }],
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
      const [output, usage] = await Promise.all([result.output, result.usage]);
      return {
        analysis: {
          ...output,
          confidence: clampConfidence(output.confidence),
          amount_confidence: clampConfidence(output.amount_confidence),
          detected_amount: Number.isFinite(output.detected_amount) ? Number(output.detected_amount) : null,
          detected_currency: output.detected_currency?.toUpperCase() || null,
        },
        usage: {
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
          totalTokens: usage.totalTokens || 0,
        },
      };
    } catch (error) {
      const status = Number((error as { statusCode?: number })?.statusCode || 0);
      if (attempt >= 2 || (status !== 429 && status < 500)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** attempt));
    }
  }

  throw new Error("A análise do comprovante não retornou um resultado");
}