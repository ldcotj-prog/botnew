// pagamento.js — Validação de comprovante PIX via GPT-4o-mini
const axios = require('axios');
const cfg = require('./config');

async function validar(imgUrl, valorEsperado) {
  if (!imgUrl) return { ok: null, motivo: 'sem_imagem' };

  try {
    const resp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        max_tokens: 120,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imgUrl, detail: 'low' } },
            {
              type: 'text',
              text: 'Analise esta imagem. É um comprovante PIX concluído? Qual o valor? Responda SOMENTE em JSON válido: {"isPix":true,"concluido":true,"valor":19.90} — sem texto extra, sem markdown.',
            },
          ],
        }],
      },
      { headers: { Authorization: `Bearer ${cfg.openai.key}`, 'Content-Type': 'application/json' } }
    );

    const raw = resp.data.choices[0].message.content.trim();
    console.log('[PIX] Resposta IA:', raw);
    const r = JSON.parse(raw);

    if (!r.isPix)       return { ok: false, motivo: 'nao_pix' };
    if (!r.concluido)   return { ok: false, motivo: 'nao_concluido' };

    const valorPago = parseFloat(r.valor) || 0;
    const diff = Math.abs(valorPago - valorEsperado);
    if (diff > 1.00)    return { ok: false, motivo: 'valor_errado', valorPago };

    return { ok: true };
  } catch (e) {
    console.error('[PIX] Erro:', e.message);
    return { ok: null, motivo: 'erro_tecnico' }; // null = precisa confirmação manual
  }
}

module.exports = { validar };
