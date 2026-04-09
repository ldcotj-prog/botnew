// remarketing.js — Follow-up automático a cada 20 minutos (3 rodadas)
const zapi = require('./zapi');
const { getSession, E } = require('./storage');

const timers = new Map();
const INTERVALO_MS = 20 * 60 * 1000; // 20 minutos

function getMensagem(session, rodada) {
  const n = session.nome ? `*${session.nome}*` : 'você';
  const e = session.etapa;

  if ([E.INICIO, E.AGUARDA_NOME, E.AGUARDA_CIDADE].includes(e)) {
    return rodada === 0 ? `Oi! 👋 Ainda estou aqui pra te ajudar.\n\nComo posso te chamar? 😊` : null;
  }
  if (e === E.MENU) {
    return rodada === 0 ? `${n}, posso te ajudar com alguma coisa? 😊\n\nDigite *menu* pra ver as opções!` : null;
  }
  if ([E.CONCURSO, E.P_AREA, E.B_AREA].includes(e)) {
    return rodada === 0 ? `${n}, ficou com dúvida? 😊\n\nDigite *menu* pra continuar escolhendo!` : null;
  }
  if ([E.P_CARGO, E.B_CARGO].includes(e)) {
    const msgs = [
      `${n}, ainda está escolhendo o cargo? 😊\n\nÉ só digitar o número da lista!`,
      `${n}, posso te ajudar a escolher! Me fala sua área de atuação. 👇`,
    ];
    return msgs[rodada] || null;
  }
  if ([E.P_APOSTILA, E.B_APOSTILA].includes(e)) {
    const prod = session.pedido?.produto || 'a apostila';
    const msgs = [
      `${n}, ainda pensando em ${prod}? 😊\n\nDigite *1* pra garantir por *R$ 19,90* via PIX! ⚡`,
      `${n}, 🔥 A prova tá chegando — quem estuda antes sai na frente!\n\nDigite *1* pra comprar ou *2* pro COMBO completo!`,
      `${n}, última mensagem! 😊 Se tiver dúvida, pode perguntar.`,
    ];
    return msgs[rodada] || null;
  }
  if ([E.P_COMBO, E.B_COMBO].includes(e)) {
    const msgs = [
      `${n}, ainda no COMBO? 🔥 27 apostilas por *R$ 49,90* — menos de R$ 2 cada!\n\nDigite *1* pra garantir!`,
      `${n}, o COMBO de *R$ 49,90* ainda está disponível! 😊\n\nQualquer dúvida pode perguntar!`,
    ];
    return msgs[rodada] || null;
  }
  if (e === E.AGUARDA_PIX) {
    const val = session.pedido?.valor;
    const v = val ? `R$ ${val.toFixed(2).replace('.', ',')}` : 'R$ 19,90';
    const msgs = [
      `${n}, tudo certo com o PIX? 😊\n\nChave: *31.852.681/0001-40*\nValor: *${v}*\n\nMandou? É só enviar o comprovante aqui! 📸`,
      `${n}, ainda esperando o comprovante de *${v}* 🙂\n\nQualquer problema, é só chamar!`,
      `${n}, seu pedido ainda está reservado! ❤️\n\nSe precisar de ajuda com o pagamento, estou aqui!`,
    ];
    return msgs[rodada] || null;
  }
  return null;
}

function agendar(tel) {
  cancelar(tel);
  disparar(tel, 0);
}

function disparar(tel, rodada) {
  if (rodada > 2) return;

  const t = setTimeout(async () => {
    try {
      const s = getSession(tel);
      if (s.humano || !s.etapa || s.etapa === E.INICIO) return;
      const m = getMensagem(s, rodada);
      if (!m) return;
      console.log(`[RMK] rodada ${rodada + 1}/3 → ${tel} (etapa: ${s.etapa})`);
      await zapi.texto(tel, m);
      disparar(tel, rodada + 1);
    } catch (e) { console.error('[RMK]', e.message); }
  }, INTERVALO_MS);

  timers.set(tel, t);
}

function cancelar(tel) {
  if (timers.has(tel)) { clearTimeout(timers.get(tel)); timers.delete(tel); }
}

module.exports = { agendar, cancelar };
