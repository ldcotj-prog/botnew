// index.js — Servidor Multi-Bot JARVIS v5.0
require('dotenv').config();
const express = require('express');
const path    = require('path');
const cfg     = require('./config');
const { set, getSession } = require('./storage');

// Importa cada bot
const botConcursos  = require('./bots/concursos');
const botVestibular = require('./bots/vestibular');
const botInformatica= require('./bots/informatica');
const botOnline     = require('./bots/online');

const BOTS = {
  concursos:  botConcursos,
  vestibular: botVestibular,
  informatica:botInformatica,
  online:     botOnline,
};

const app = express();
app.use(express.json({ limit: '10mb' }));

// ── Landing pages ────────────────────────────────────────────
app.get('/',           (_, r) => r.redirect('/produtos'));
app.get('/produtos',   (_, r) => r.sendFile(path.join(__dirname, 'landing.html')));
app.get('/health',     (_, r) => r.json({ ok: true, bots: Object.keys(BOTS) }));

// ── Webhook por bot ──────────────────────────────────────────
// Cada instância Z-API aponta para sua rota específica:
//   /webhook/concursos
//   /webhook/vestibular
//   /webhook/informatica
//   /webhook/online
app.post('/webhook/:botId', async (req, res) => {
  res.status(200).json({ ok: true }); // responde rápido

  try {
    const botId = req.params.botId;
    const bot   = BOTS[botId];

    if (!bot) {
      console.warn(`[WH] Bot desconhecido: ${botId}`);
      return;
    }

    const b   = req.body;
    if (!b || b.isStatusReply) return;

    const tel = String(b.phone || '').replace(/\D/g, '');
    const txt = b.text?.message || b.message || '';

    console.log(`\n[${botId.toUpperCase()}] fromMe:${b.fromMe} | ${tel} | "${txt.slice(0, 60)}"`);

    // ── Mensagem enviada pelo atendente → pausa o bot ─────────
    if (b.fromMe === true || b.fromMe === 'true') {
      if (txt.toUpperCase().startsWith('BOT ON ')) {
        const alvo = txt.split(' ')[2]?.trim().replace(/\D/g, '');
        if (alvo) { set(botId, alvo, { humano: false }); console.log(`[${botId}] ✅ Bot reativado → ${alvo}`); }
      } else if (tel) {
        set(botId, tel, { humano: true });
        console.log(`[${botId}] 🤝 Bot pausado → ${tel}`);
      }
      return;
    }

    if (!tel) return;

    // ── Comando PAUSAR ─────────────────────────────────────
    if (txt.toUpperCase().startsWith('PAUSAR ')) {
      const alvo = txt.split(' ')[1]?.trim().replace(/\D/g, '');
      if (alvo) { set(botId, alvo, { humano: true }); console.log(`[${botId}] 🔕 Pausado via cmd → ${alvo}`); }
      return;
    }

    // ── Verifica se bot está pausado para esse número ─────────
    const s = getSession(botId, tel);
    if (s.humano) { console.log(`[${botId}] 🔕 Ignorado (humano ativo) → ${tel}`); return; }

    // ── Extrai dados da mensagem ──────────────────────────────
    const dados = extrair(b);
    if (!dados) return;

    // ── Processa no bot correto ───────────────────────────────
    await bot.processar(tel, dados);

  } catch (e) {
    console.error('[ERR]', e.message, e.stack?.split('\n')[1]);
  }
});

// ── Suporte ao webhook antigo (redireciona para concursos) ────
app.post('/webhook', async (req, res) => {
  req.params = { botId: 'concursos' };
  // Re-usa a mesma lógica chamando a rota /webhook/concursos
  const b   = req.body;
  res.status(200).json({ ok: true });
  if (!b || b.isStatusReply) return;
  const tel = String(b.phone || '').replace(/\D/g, '');
  const txt = b.text?.message || b.message || '';
  if (b.fromMe === true || b.fromMe === 'true') {
    if (txt.toUpperCase().startsWith('BOT ON ')) {
      const alvo = txt.split(' ')[2]?.trim().replace(/\D/g, '');
      if (alvo) set('concursos', alvo, { humano: false });
    } else if (tel) set('concursos', tel, { humano: true });
    return;
  }
  if (!tel) return;
  const s = getSession('concursos', tel);
  if (s.humano) return;
  const dados = extrair(b);
  if (!dados) return;
  await botConcursos.processar(tel, dados);
});

// ── Extrai dados da mensagem Z-API ────────────────────────────
function extrair(b) {
  if (b.text?.message)  return { tipo: 'texto', conteudo: b.text.message };

  if (b.image) {
    const url = b.image.imageUrl || b.image.url || b.image.downloadUrl
             || b.image.mediaUrl || b.image.link || '';
    if (!url) { console.warn('[WH] imagem sem URL'); return null; }
    return { tipo: 'imagem', conteudo: url, caption: b.image.caption || '' };
  }

  if (b.document) {
    const url = b.document.documentUrl || b.document.url
             || b.document.downloadUrl || b.document.mediaUrl || '';
    const nome = (b.document.fileName || b.document.name || '').toLowerCase();
    const caption = b.document.caption || '';

    // PDF enviado como comprovante → trata como "comprovante"
    const ehComprovante = nome.includes('comprovante') || nome.includes('pix')
      || nome.includes('pagamento') || nome.includes('recibo')
      || nome.endsWith('.pdf') || nome.endsWith('.jpg') || nome.endsWith('.png');

    if (ehComprovante && url) {
      console.log(`[WH] PDF comprovante detectado: ${nome}`);
      return { tipo: 'comprovante_pdf', conteudo: url, caption };
    }
    return { tipo: 'documento', conteudo: url, caption };
  }

  if (b.audio) return { tipo: 'texto', conteudo: '[áudio]' };
  return null;
}

// ── Inicia servidor ───────────────────────────────────────────
app.listen(cfg.port, () => {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  🤖  JARVIS v5.0 Multi-Bot — Smart Cursos Unaí  ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Porta: ${cfg.port}                                      ║`);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  Webhooks Z-API:                                 ║');
  console.log('║  /webhook/concursos   → Bot Concursos            ║');
  console.log('║  /webhook/vestibular  → Bot Pré-Vestibular       ║');
  console.log('║  /webhook/informatica → Bot Informática          ║');
  console.log('║  /webhook/online      → Bot Cursos Online        ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  Comandos (envie pelo WhatsApp do bot):          ║');
  console.log('║  PAUSAR 5538XXXXX  → pausa o bot                ║');
  console.log('║  BOT ON 5538XXXXX  → reativa o bot              ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
});
