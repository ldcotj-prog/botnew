// index.js — Servidor Express + Webhook Z-API
require('dotenv').config();
const express = require('express');
const path    = require('path');
const cfg     = require('./config');
const { processar } = require('./flows');
const { set, getSession } = require('./storage');

const app = express();
app.use(express.json({ limit: '10mb' }));

// ── Landing page ─────────────────────────────────────────────
app.get('/',        (_, r) => r.redirect('/produtos'));
app.get('/produtos', (_, r) => r.sendFile(path.join(__dirname, 'landing.html')));
app.get('/health',   (_, r) => r.json({ ok: true, bot: 'JARVIS v4.0' }));

// ── Webhook Z-API ────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.status(200).json({ ok: true }); // responde rápido pra Z-API não reenviar

  try {
    const b = req.body;
    if (!b || b.isStatusReply) return;

    const tel  = String(b.phone || '').replace(/\D/g, '');
    const txt  = b.text?.message || b.message || '';

    console.log(`\n[WH] fromMe:${b.fromMe} | tel:${tel} | "${txt.slice(0, 60)}"`);

    // ── Mensagem enviada pelo atendente → pausa o bot ─────────
    if (b.fromMe === true || b.fromMe === 'true') {
      if (txt.toUpperCase().startsWith('BOT ON ')) {
        const alvo = txt.split(' ')[2]?.trim().replace(/\D/g, '');
        if (alvo) { set(alvo, { humano: false }); console.log(`[HUM] ✅ Bot reativado → ${alvo}`); }
      } else if (tel) {
        set(tel, { humano: true });
        console.log(`[HUM] 🤝 Bot pausado → ${tel}`);
      }
      return;
    }

    if (!tel) return;

    // ── Comando PAUSAR (via número do atendente) ─────────────
    if (txt.toUpperCase().startsWith('PAUSAR ')) {
      const alvo = txt.split(' ')[1]?.trim().replace(/\D/g, '');
      if (alvo) { set(alvo, { humano: true }); console.log(`[HUM] 🔕 Bot pausado via comando → ${alvo}`); }
      return;
    }

    // ── Bot pausado para esse número ─────────────────────────
    const s = getSession(tel);
    if (s.humano) { console.log(`[HUM] 🔕 Ignorado (humano ativo) → ${tel}`); return; }

    // ── Extrai dados da mensagem ─────────────────────────────
    const dados = extrair(b);
    if (!dados) return;

    console.log(`[MSG] ${tel} | tipo:${dados.tipo} | "${(dados.conteudo || '').slice(0, 50)}"`);

    // ── Processa ─────────────────────────────────────────────
    await processar(tel, dados);

  } catch (e) {
    console.error('[ERR]', e.message, e.stack?.split('\n')[1]);
  }
});

// ── Extrai dados da mensagem Z-API ───────────────────────────
function extrair(b) {
  if (b.text?.message)  return { tipo: 'texto',   conteudo: b.text.message };
  if (b.image) {
    const url = b.image.imageUrl || b.image.url || b.image.downloadUrl
             || b.image.mediaUrl || b.image.link || '';
    if (!url) { console.warn('[WH] imagem sem URL'); return null; }
    return { tipo: 'imagem', conteudo: url, caption: b.image.caption || '' };
  }
  if (b.document) return { tipo: 'documento', conteudo: b.document.documentUrl || '', caption: b.document.caption || '' };
  if (b.audio)    return { tipo: 'texto',   conteudo: '[áudio]' };
  return null;
}

// ── Inicia servidor ──────────────────────────────────────────
app.listen(cfg.port, () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  🤖  JARVIS v4.0 — Smart Cursos Unaí    ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Porta:   ${cfg.port}                             ║`);
  console.log(`║  Webhook: /webhook                       ║`);
  console.log(`║  Landing: /produtos                      ║`);
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  Comandos:                               ║');
  console.log('║  PAUSAR 5538XXXXX  → pausa o bot        ║');
  console.log('║  BOT ON 5538XXXXX  → reativa o bot      ║');
  console.log('╚══════════════════════════════════════════╝\n');
});
