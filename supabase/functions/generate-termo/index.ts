import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function generateTermoPDF(vars: {
  nomeCliente: string;
  cpf: string;
  meses: string;
  valor: string;
  formaPagamento: string;
  dataCompra: string;
  empresa: string;
}): Promise<Uint8Array> {
  const { nomeCliente, cpf, meses, valor, formaPagamento, dataCompra, empresa } = vars;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBoldOblique = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);

  const marginLeft = 50;
  const contentWidth = width - marginLeft - 50;
  const fontSize = 10;
  const lineHeight = 14;

  const purple = rgb(0.502, 0.0, 0.502); // #800080
  const black = rgb(0, 0, 0);

  let y = height - 60;

  // Word wrap using actual font metrics
  const wrapText = (text: string, font: typeof fontRegular, size: number, maxW: number): string[] => {
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const test = current ? current + " " + word : word;
      const w = font.widthOfTextAtSize(test, size);
      if (w > maxW && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  // Draw title centered, bold, purple, larger
  const drawTitle = (text: string) => {
    const titleSize = 16;
    const lines = wrapText(text, fontBold, titleSize, contentWidth);
    for (const line of lines) {
      const w = fontBold.widthOfTextAtSize(line, titleSize);
      const x = marginLeft + (contentWidth - w) / 2;
      page.drawText(line, { x, y, size: titleSize, font: fontBold, color: purple });
      y -= titleSize + 6;
    }
    y -= 10;
  };

  // Draw section title - purple, bold oblique (italic), underlined
  const drawSectionTitle = (text: string) => {
    y -= 10;
    const secSize = 12;
    page.drawText(text, { x: marginLeft, y, size: secSize, font: fontBoldOblique, color: purple });
    // Underline
    const tw = fontBoldOblique.widthOfTextAtSize(text, secSize);
    page.drawLine({
      start: { x: marginLeft, y: y - 2 },
      end: { x: marginLeft + tw, y: y - 2 },
      thickness: 0.8,
      color: purple,
    });
    y -= secSize + 12;
  };

  // Draw paragraph - regular, black
  const drawParagraph = (text: string) => {
    const lines = wrapText(text, fontRegular, fontSize, contentWidth);
    for (const line of lines) {
      page.drawText(line, { x: marginLeft, y, size: fontSize, font: fontRegular, color: black });
      y -= lineHeight;
    }
    y -= 6;
  };

  // Draw bullet with bold label prefix: "Label: rest of text"
  const drawBullet = (label: string, text: string) => {
    const fullText = label + " " + text;
    const labelWidth = fontBold.widthOfTextAtSize(label + " ", fontSize);

    // First line: bold label then regular text
    const firstLineMax = contentWidth;
    // Measure how much regular text fits after the label on first line
    const remainingWidth = firstLineMax - labelWidth;

    const words = text.split(" ");
    let firstLineText = "";
    let wordIdx = 0;
    for (; wordIdx < words.length; wordIdx++) {
      const test = firstLineText ? firstLineText + " " + words[wordIdx] : words[wordIdx];
      if (fontRegular.widthOfTextAtSize(test, fontSize) > remainingWidth && firstLineText) {
        break;
      }
      firstLineText = test;
    }

    // Draw bold label
    page.drawText(label + " ", { x: marginLeft, y, size: fontSize, font: fontBold, color: black });
    // Draw regular text after label
    page.drawText(firstLineText, { x: marginLeft + labelWidth, y, size: fontSize, font: fontRegular, color: black });
    y -= lineHeight;

    // Remaining lines
    const remaining = words.slice(wordIdx).join(" ");
    if (remaining) {
      const lines = wrapText(remaining, fontRegular, fontSize, contentWidth);
      for (const line of lines) {
        page.drawText(line, { x: marginLeft, y, size: fontSize, font: fontRegular, color: black });
        y -= lineHeight;
      }
    }
    y -= 4;
  };

  // Draw centered bold text
  const drawCenteredBold = (text: string, size = fontSize) => {
    const lines = wrapText(text, fontBold, size, contentWidth);
    for (const line of lines) {
      const w = fontBold.widthOfTextAtSize(line, size);
      const x = marginLeft + (contentWidth - w) / 2;
      page.drawText(line, { x, y, size, font: fontBold, color: black });
      y -= size + 4;
    }
  };

  // === CONTENT ===

  drawTitle("DECLARACAO LEGAL DE COMPRA E CONDICOES DE INADIMPLEMENTO:");

  drawParagraph(
    `Eu, ${nomeCliente}, portador(a) do CPF no ${cpf}, confirmo a compra do tratamento de ${meses} meses com ${empresa}, no valor de R$ ${valor}, com pagamento via ${formaPagamento}.`
  );

  drawParagraph(
    `Me comprometo a realizar o pagamento em no maximo 24 horas apos o recebimento, conforme as condicoes previamente acordadas, estando ciente de todos os termos desta compra realizada em ${dataCompra}.`
  );

  drawParagraph(
    "Estou ciente de que as opcoes de pagamento aceitas sao cartao de credito, pix ou boleto a vista. O parcelamento e possivel apenas no cartao de credito, em ate 12 vezes, enquanto o boleto deve ser pago a vista."
  );

  drawSectionTitle("I. CONSEQUENCIAS DO INADIMPLEMENTO:");

  drawParagraph(
    "Em caso de inadimplemento (falta de pagamento), sera aplicada uma multa de 10% ao mes sobre o valor da compra. Caso o pagamento nao seja realizado ate a data de vencimento, sera cobrada uma multa fixa de R$ 150,00. Alem disso, incidirao juros de 1% ao mes, correcao monetaria com base no IGPM-FGV, e honorarios advocaticios no percentual de 20% sobre o valor total devido."
  );

  drawParagraph(
    "Apos o envio, estou ciente de que nao sera possivel cancelar ou devolver o pedido, pois ele ja estara em posse dos Correios e sera entregue normalmente. Se os Correios nao conseguirem a entrega, o produto ficara disponivel na agencia, e e minha obrigacao retira-lo na agencia e efetuar o pagamento."
  );

  drawParagraph(
    "Reconheco que, em caso de inadimplencia, recusa em receber ou nao retirada nos Correios, a empresa podera adotar medidas de recuperacao de credito, incluindo a negativacao do meu CPF e processos judiciais, sendo o valor ainda devido em razao dos custos operacionais, logisticos e demais despesas envolvidas."
  );

  drawSectionTitle("II. ACOES LEGAIS RIGOROSAS:");

  drawBullet(
    "Impacto no Credito:",
    "Seu CPF sera imediatamente inscrito em orgaos de protecao ao credito, como SPC e Serasa, prejudicando sua capacidade de obter credito no futuro."
  );

  drawBullet(
    "Acao Judicial Imediata:",
    "Iniciaremos procedimentos legais para a cobranca do debito, com base nos Artigos 771 a 925 do Codigo de Processo Civil. Este processo pode resultar na penhora de bens e outras medidas severas."
  );

  drawBullet(
    "Implicacoes Criminais:",
    "Qualquer indicio de ma-fe podera levar a consequencias criminais sob o Art. 171 do Codigo Penal."
  );

  y -= 10;
  drawCenteredBold("VOCE ESTA CIENTE E CONFIRMA OS TERMOS ACIMA PARA O ENVIO?");
  y -= 4;
  drawCenteredBold("Responda por escrito, sim ou nao via Whatsapp.");

  return await pdfDoc.save();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { conversationId, nomeCliente, cpf, meses, valor, formaPagamento, dataCompra, empresa, enviar } = body;

    if (!conversationId || !nomeCliente || !cpf || !meses) {
      return new Response(JSON.stringify({ error: "Campos obrigatorios: conversationId, nomeCliente, cpf, meses" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const pdfBytes = await generateTermoPDF({
      nomeCliente,
      cpf,
      meses,
      valor: valor || "397,00",
      formaPagamento: formaPagamento || "boleto a vista",
      dataCompra: dataCompra || new Date().toLocaleDateString("pt-BR"),
      empresa: empresa || "MEGAFIT",
    });

    const fileName = `${conversationId}/termo_${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("chat-media")
      .upload(fileName, pdfBytes, { contentType: "application/pdf" });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(fileName);
    const pdfUrl = urlData.publicUrl;

    if (enviar) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("connection_config_id, contact_phone")
        .eq("id", conversationId)
        .single();

      if (!conv) throw new Error("Conversa nao encontrada");

      let functionName = "whatsapp-send";
      if (conv.connection_config_id) {
        const { data: connConfig } = await supabase
          .from("connection_configs")
          .select("connection_id")
          .eq("id", conv.connection_config_id)
          .single();
        if (connConfig?.connection_id === "zapi") functionName = "zapi-send";
      }

      const sendUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${functionName}`;
      const sendRes = await fetch(sendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          conversationId, message: "TERMO DE COMPROMISSO", mediaUrl: pdfUrl, type: "document", senderLabel: "humano",
        }),
      });
      const sendResult = await sendRes.json();

      return new Response(JSON.stringify({ success: true, pdfUrl, sent: true, sendResult }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, pdfUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("generate-termo error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
