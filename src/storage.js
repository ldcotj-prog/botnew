// storage.js — Gerenciamento de sessões em memória

const sessions = new Map();

// Etapas do fluxo — nomes curtos para evitar erros de digitação
const E = {
  INICIO:           'inicio',
  AGUARDA_NOME:     'aguarda_nome',
  AGUARDA_CIDADE:   'aguarda_cidade',
  MENU:             'menu',
  // Apostilas
  CONCURSO:         'concurso',        // escolhe paracatu ou buritis
  // Paracatu
  P_AREA:           'p_area',          // escolhe área
  P_CARGO:          'p_cargo',         // escolhe cargo dentro da área
  P_APOSTILA:       'p_apostila',      // vê detalhes + confirma compra
  P_COMBO:          'p_combo',         // vê combo + confirma
  // Buritis
  B_AREA:           'b_area',
  B_CARGO:          'b_cargo',
  B_APOSTILA:       'b_apostila',
  B_COMBO:          'b_combo',
  // Pagamento
  AGUARDA_PIX:      'aguarda_pix',
  // Outros
  PRE_VEST:         'pre_vest',
  INFORMATICA:      'informatica',
  ONLINE:           'online',
  LIVRE:            'livre',
};

function getSession(tel) {
  if (!sessions.has(tel)) {
    sessions.set(tel, {
      etapa:  E.INICIO,
      nome:   null,
      cidade: null,
      areaId: null,
      pedido: null,   // { produto, valor, tipo, driveId }
      humano: false,
      hist:   [],
      ts:     Date.now(),
    });
  }
  return sessions.get(tel);
}

function set(tel, obj) {
  const s = getSession(tel);
  Object.assign(s, obj, { ts: Date.now() });
}

function reset(tel) { sessions.delete(tel); }

// Limpa sessões inativas > 48h
setInterval(() => {
  const lim = Date.now() - 172800000;
  for (const [t, s] of sessions) if (s.ts < lim) sessions.delete(t);
}, 3600000);

module.exports = { E, getSession, set, reset };
