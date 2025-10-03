const axios = require('axios')

const { createBot, createProvider, createFlow, addKeyword } = require('@bot-whatsapp/bot')

const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MockAdapter = require('@bot-whatsapp/database/mock')
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const { EVENTS } = require('@bot-whatsapp/bot')

// --- API ---
const AgenteChatboxApi = async (textoEntrada, userId, images = []) => {
  try {
    const payload = {
      question: textoEntrada,
      userId: userId,
      topK: 3,
      images: images // 👈 lista de imágenes
    };

    const { data } = await axios.post(
      "https://chatbot.netesacloud.com/AppNTSNDLAutomatizacionIA/api/ConversacionAgente/PostContadorNTS",
      payload,
      {
        headers: { "Content-Type": "application/json" }
      }
    );

    return data;
  } catch (error) {
    console.error("❌ Error en AgenteChatboxApi:", error.response?.data || error.message);
    return { answer: "⚠️ No se pudo obtener respuesta del agente." };
  }
};

const flowPrincipal = addKeyword([EVENTS.MEDIA])
  .addAction(async (ctx, { flowDynamic }) => {
    let textoEntrada = ctx.message?.imageMessage?.caption || "";
    let images = [];

    // Si es solo UNA imagen
    if (ctx.message?.imageMessage) {
      const wrapperMessage = {
        key: ctx.key,
        message: { imageMessage: ctx.message.imageMessage }
      };

      const buffer = await downloadMediaMessage(
        wrapperMessage,
        "buffer",
        {},
        { logger: { level: "silent", child: () => ({ level: "silent" }) } }
      );

      images.push({
        base64: buffer.toString("base64"),
        mimeType: ctx.message.imageMessage.mimetype
      });
    }

    // ⚡ Si llegan varias imágenes en varios mensajes seguidos (ej. un álbum)
    if (ctx.messages && Array.isArray(ctx.messages)) {
      for (const msg of ctx.messages) {
        if (msg.message?.imageMessage) {
          const buffer = await downloadMediaMessage(
            { key: msg.key, message: { imageMessage: msg.message.imageMessage } },
            "buffer",
            {},
            { logger: { level: "silent", child: () => ({ level: "silent" }) } }
          );

          images.push({
            base64: buffer.toString("base64"),
            mimeType: msg.message.imageMessage.mimetype
          });

          // Usa el primer caption como textoEntrada
          if (!textoEntrada && msg.message.imageMessage.caption) {
            textoEntrada = msg.message.imageMessage.caption;
          }
        }
      }
    }

    // 👇 Llamada a tu API
    const apiResponse = await AgenteChatboxApi(textoEntrada, ctx.from, images);

    // 👇 Respuesta al usuario
    await flowDynamic([{ body: apiResponse.answer }]);
  });

const main = async () => {
    const adapterDB = new MockAdapter()
    const adapterFlow = createFlow([flowPrincipal])
    const adapterProvider = createProvider(BaileysProvider)

    createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    QRPortalWeb()
}

main()
