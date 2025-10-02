// ⚠️ Solo para desarrollo en localhost
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
// -----------------------------------------------


require('dotenv').config();
const axios = require('axios')

const { createBot, createProvider, createFlow, addKeyword } = require('@bot-whatsapp/bot')

const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MockAdapter = require('@bot-whatsapp/database/mock')
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const { EVENTS } = require('@bot-whatsapp/bot')

// --- API ---
const AgenteChatboxApi = async (textoEntrada, userId, imageBase64 = null, imageMimeType = null) => {
  try {
    const payload = {
      question: textoEntrada,
      userId: userId,
      topK: 3
    };

    if (imageBase64 && imageMimeType) {
      payload.imageBase64 = imageBase64;
      payload.imageMimeType = imageMimeType;
    }

    const { data } = await axios.post(
      "https://chatbot.netesacloud.com/AppNTSNDLAutomatizacionIA/api/ConversacionAgente/PostAgenteNTS",
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

// ================== SPEECH-TO-TEXT ==================
async function transcribeAudio(base64Audio, mimeType = "audio/ogg") {
  try {
    // Determinar el encoding basado en el mimeType
    let encoding = "LINEAR16"; // por defecto
    let sampleRateHertz = 16000;
    
    if (mimeType.includes("ogg") || mimeType.includes("opus")) {
      encoding = "OGG_OPUS";
    } else if (mimeType.includes("mp4") || mimeType.includes("aac")) {
      encoding = "MP4";
    } else if (mimeType.includes("amr")) {
      encoding = "AMR";
    } else if (mimeType.includes("webm")) {
      encoding = "WEBM_OPUS";
    }

    const response = await axios.post(
      `https://speech.googleapis.com/v1/speech:recognize?key=${process.env.GOOGLE_SPEECH_KEY}`,
      {
        config: {
          encoding: encoding,
          sampleRateHertz: sampleRateHertz,
          languageCode: "es-PE", 
          enableAutomaticPunctuation: true
        },
        audio: { content: base64Audio }
      },
      { 
        headers: { "Content-Type": "application/json" },
        timeout: 30000 
      }
    );

    // 👇 Aquí extraemos la transcripción del response
    let transcript = "";
    if (response.data?.results?.length > 0) {
      transcript = response.data.results
        .map(r => r.alternatives[0].transcript)
        .join(" ");
    }

    return transcript;
    
  } catch (err) {
    console.error("❌ Error transcribiendo audio:", err.response?.data || err.message);
    
    // Si hay detalles del error, los mostramos
    if (err.response?.data?.error) {
      console.error("📋 Detalles del error:", err.response.data.error);
    }
    
    return "";
  }
}

const flowPrincipal = addKeyword([EVENTS.WELCOME, EVENTS.VOICE_NOTE, EVENTS.MEDIA])
  .addAction(async (ctx, { flowDynamic }) => {
        let textoEntrada = "";
        let imageBase64 = null;
        let imageMimeType = null;

    // 👇 Audio
    if (ctx.message?.audioMessage) {
        try {
            const wrapperMessage = 
            {
                key: ctx.key, 
                message:
                    {
                        audioMessage: ctx.message.audioMessage
                    }
            };

        const buffer = await downloadMediaMessage(
        wrapperMessage,
        'buffer',
        {},
        { logger: { level: 'silent', child: () => ({ level: 'silent' }) } }
        );

        const base64Audio = buffer.toString("base64");

        textoEntrada = await transcribeAudio(base64Audio, ctx.message.audioMessage.mimetype);

        if (!textoEntrada || textoEntrada.trim() === "") {
          textoEntrada = "⚠️ No pude entender el audio.";
        }
      } catch (err) {
        console.error("Error procesando audio:", err);
        textoEntrada = "⚠️ Error al procesar el audio.";
      }
    } 
    // 👇 Imagen
    else if (ctx.message?.imageMessage) {
      try {
        const wrapperMessage = {
          key: ctx.key,
          message: {
            imageMessage: ctx.message.imageMessage
          }
        };

        const buffer = await downloadMediaMessage(
          wrapperMessage,
          'buffer',
          {},
          { logger: { level: 'silent', child: () => ({ level: 'silent' }) } }
        );

        imageBase64 = buffer.toString("base64");
        imageMimeType = ctx.message.imageMessage.mimetype;

        textoEntrada = ctx.message.imageMessage.caption;
      } catch (err) {
        console.error("Error procesando imagen:", err);
        textoEntrada = "⚠️ Error al procesar la imagen.";
      }
    }
    // 👇 Texto normal
    else {
      textoEntrada = ctx.body;
    }

    // 👇 Llamamos a tu API
    const apiResponse = await AgenteChatboxApi(textoEntrada, ctx.from, imageBase64, imageMimeType);

    // 👇 El backend ahora devuelve "answer"
    const mensaje = [{ body: apiResponse.answer }];
    await flowDynamic(mensaje);
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
