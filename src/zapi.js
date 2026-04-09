// zapi.js — Integração com a Z-API
const axios = require('axios');
const cfg = require('./config');

const headers = () => ({
  'Client-Token': cfg.zapi.clientToken,
  'Content-Type': 'application/json',
});

// Envia mensagem de texto
async function texto(tel, msg) {
  if (!msg || !tel) return;
  try {
    const r = await axios.post(
      `${cfg.zapi.url()}/send-text`,
      { phone: String(tel), message: String(msg) },
      { headers: headers() }
    );
    console.log(`[ZAPI] texto OK → ${tel}`);
    return r.data;
  } catch (e) {
    console.error('[ZAPI] texto ERR:', e.response?.data || e.message);
  }
}

// Envia link do Google Drive como mensagem
async function apostila(tel, driveId, titulo, nome) {
  const url = cfg.driveLink(driveId);
  const msg =
`📄 *${titulo}*

📥 Acesse sua apostila aqui:
${url}

Bons estudos, *${nome || 'aluno(a)'}*! 🎓
_Smart Cursos Unaí — Sua aprovação é nossa missão!_`;
  return texto(tel, msg);
}

// Notifica o atendente sobre um lead
async function notificar(telCliente, nome, origem) {
  const hora = new Date().toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
  });
  const msg =
`🔔 *LEAD AGUARDANDO*

👤 *${nome || 'não informado'}*
📱 ${telCliente}
📍 ${origem}
🕐 ${hora}

_Clique no número pra responder!_ 👆`;
  return texto(cfg.atendente, msg);
}

// Encaminha comprovante não reconhecido para confirmação manual
async function comprovante(telCliente, nome, produto, imgUrl) {
  const msg =
`📨 *COMPROVANTE PARA VERIFICAR*

👤 *${nome || '?'}*
📱 ${telCliente}
🛒 ${produto}

Confirme o pagamento respondendo:
CONFIRMAR ${telCliente}
ou
RECUSAR ${telCliente}`;
  await texto(cfg.atendente, msg);
  // Tenta encaminhar a imagem
  if (imgUrl) {
    try {
      await axios.post(
        `${cfg.zapi.url()}/send-image`,
        { phone: String(cfg.atendente), image: imgUrl, caption: 'Comprovante do cliente acima' },
        { headers: headers() }
      );
    } catch {}
  }
}

module.exports = { texto, apostila, notificar, comprovante };
