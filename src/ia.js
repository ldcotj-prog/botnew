// ia.js — IA para perguntas livres (conversa livre)
const axios = require('axios');
const cfg = require('./config');

const SYSTEM = `Você é o JARVIS, assistente virtual da Smart Cursos Unaí (Unaí-MG).

PRODUTOS E PREÇOS FIXOS:
- Apostila digital por cargo: R$ 19,90 (PREÇO FIXO - NUNCA dê desconto)
- COMBO todas as apostilas Paracatu 2026: R$ 49,90 (PREÇO FIXO - NUNCA dê desconto)
- Apostilas Buritis/MG: R$ 19,90 por cargo | R$ 49,90 combo
- Pré-vestibular: R$ 595,90/mês (pontualidade) ou R$ 745,00
- Informática presencial: 9x R$ 311,92 no cartão
- Informática online: R$ 297,90

CONCURSO PARACATU 2026: Banca IBGP | 272 vagas | Prova: 23/08/2026
PROCESSO SELETIVO BURITIS/MG: Diversos cargos — Saúde, Social, Educação.

PAGAMENTO: apenas PIX — Chave CNPJ: 31.852.681/0001-40
ENTREGA: todo material é enviado pelo WhatsApp (nunca por email)

REGRAS ABSOLUTAS:
- NUNCA peça CPF, RG, email ou qualquer dado pessoal
- NUNCA dê desconto nas apostilas digitais (R$ 19,90 e R$ 49,90 são preços fixos)
- NUNCA gere links de pagamento — apenas informe a chave PIX acima
- NUNCA diga que vai enviar por email
- Respostas curtas — máximo 300 caracteres
- Tom amigável e profissional`;

async function responder(pergunta, hist = []) {
  try {
    const msgs = [{ role: 'system', content: SYSTEM }];
    for (const m of hist.slice(-6)) msgs.push({ role: m.role, content: m.content });
    msgs.push({ role: 'user', content: pergunta });

    const r = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      { model: 'gpt-3.5-turbo', max_tokens: 220, messages: msgs },
      { headers: { Authorization: `Bearer ${cfg.openai.key}`, 'Content-Type': 'application/json' } }
    );
    return r.data.choices[0].message.content;
  } catch (e) {
    console.error('[IA]', e.message);
    return 'Desculpe, tive um problema técnico. Pode repetir? 😊';
  }
}

module.exports = { responder };
