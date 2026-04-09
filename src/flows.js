// flows.js — Lógica completa do bot JARVIS
'use strict';

const zapi = require('./zapi');
const ia   = require('./ia');
const pix  = require('./pagamento');
const cfg  = require('./config');
const rmk  = require('./remarketing');
const { E, getSession, set, reset } = require('./storage');

const fmt  = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ──────────────────────────────────────────────────────────────
// HORA → saudação
// ──────────────────────────────────────────────────────────────
function saudacao() {
  const h = parseInt(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }));
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

// ──────────────────────────────────────────────────────────────
// DETECTA se o texto é um nome real
// ──────────────────────────────────────────────────────────────
function ehNome(txt) {
  const t = txt.trim();
  if (t.length < 2 || t.length > 25)      return false;
  if (t.split(' ').length > 3)             return false;
  if (/\d/.test(t))                        return false;
  if (/[?!,.]/.test(t))                   return false;
  if (!/^[A-ZÀ-Ú]/i.test(t))             return false;
  const neg = ['apostila','concurso','paracatu','buritis','cargo','quero','preciso','gostaria',
    'informação','informatica','curso','enem','vestibular','preço','valor','quanto','como',
    'quando','onde','material','comprar','adquirir','oi','olá','ola','tudo','bem','bom dia',
    'boa tarde','boa noite','tenho','interesse','para','sobre','sim','não','ok','ajudar',
    'saber','falar','mensagem','whatsapp','professor','escola','aluno'];
  return !neg.some(w => t.toLowerCase().includes(w));
}

// ──────────────────────────────────────────────────────────────
// FORMATA nome (capitaliza primeiras letras)
// ──────────────────────────────────────────────────────────────
function nomeFmt(txt) {
  return txt.trim().split(' ').slice(0, 2)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

// ═══════════════════════════════════════════════════════════════
// PROCESSADOR PRINCIPAL
// ═══════════════════════════════════════════════════════════════
async function processar(tel, dados) {
  const s = getSession(tel);
  const { tipo, conteudo, caption } = dados;
  const txt  = (tipo === 'texto' ? conteudo : caption || '').trim();
  const low  = txt.toLowerCase();

  // Cancela remarketing quando a pessoa responde
  rmk.cancelar(tel);

  console.log(`[BOT] ${tel} | etapa:${s.etapa} | tipo:${tipo} | "${txt.slice(0, 50)}"`);

  // ── Comprovante PIX ────────────────────────────────────────
  if (tipo === 'imagem' && s.etapa === E.AGUARDA_PIX) {
    await processarComprovante(tel, conteudo, s);
    return;
  }

  // ── Comandos globais ───────────────────────────────────────
  if (['menu', 'inicio', 'início', 'voltar', 'home'].includes(low)) {
    if (s.nome) {
      set(tel, { etapa: E.MENU });
      await zapi.texto(tel, menuGeral(s.nome));
    } else {
      reset(tel);
      set(tel, { etapa: E.AGUARDA_NOME });
      await zapi.texto(tel, boasVindas());
    }
    rmk.agendar(tel);
    return;
  }

  if (['oi', 'olá', 'ola', 'oii', 'hey', 'hi', 'hello', 'bom dia', 'boa tarde', 'boa noite'].includes(low)) {
    if (s.etapa === E.INICIO || !s.nome) {
      reset(tel);
      set(tel, { etapa: E.AGUARDA_NOME });
      await zapi.texto(tel, boasVindas());
      rmk.agendar(tel);
      return;
    }
    await zapi.texto(tel, `${saudacao()}, *${s.nome}*! 😊 Como posso te ajudar?\n\nDigite *menu* pra ver as opções!`);
    rmk.agendar(tel);
    return;
  }

  // ── Roteamento por etapa ───────────────────────────────────
  switch (s.etapa) {

    case E.INICIO:
      set(tel, { etapa: E.AGUARDA_NOME });
      await zapi.texto(tel, boasVindas());
      break;

    case E.AGUARDA_NOME:
      await fluxoNome(tel, txt, s);
      break;

    case E.AGUARDA_CIDADE:
      await fluxoCidade(tel, txt, s);
      break;

    case E.MENU:
      await fluxoMenu(tel, txt, s);
      break;

    case E.CONCURSO:
      await fluxoConcurso(tel, txt, s);
      break;

    // ── PARACATU ────────────────────────────────────────────
    case E.P_AREA:
      await fluxoParacatuArea(tel, txt, s);
      break;

    case E.P_CARGO:
      await fluxoParacatuCargo(tel, txt, s);
      break;

    case E.P_APOSTILA:
      await fluxoParacatuApostila(tel, txt, s);
      break;

    case E.P_COMBO:
      await fluxoParacatuCombo(tel, txt, s);
      break;

    // ── BURITIS ─────────────────────────────────────────────
    case E.B_AREA:
      await fluxoBuritisArea(tel, txt, s);
      break;

    case E.B_CARGO:
      await fluxoBuritisCargo(tel, txt, s);
      break;

    case E.B_APOSTILA:
      await fluxoBuritisApostila(tel, txt, s);
      break;

    case E.B_COMBO:
      await fluxoBuritisCombo(tel, txt, s);
      break;

    // ── PAGAMENTO ───────────────────────────────────────────
    case E.AGUARDA_PIX:
      await zapi.texto(tel,
        `Estou aguardando o comprovante do PIX! 😊\n\nChave: *${cfg.pix}*\nValor: *${fmt(s.pedido?.valor || 19.90)}*\n\nApós pagar, é só enviar o print aqui! 📸`
      );
      break;

    // ── OUTROS ──────────────────────────────────────────────
    case E.PRE_VEST:
      await fluxoPreVest(tel, txt, s);
      break;

    case E.INFORMATICA:
      await fluxoInfo(tel, txt, s);
      break;

    case E.ONLINE:
      await fluxoOnline(tel, txt, s);
      break;

    case E.LIVRE:
      await fluxoLivre(tel, txt, s);
      break;

    default:
      reset(tel);
      set(tel, { etapa: E.AGUARDA_NOME });
      await zapi.texto(tel, boasVindas());
  }

  rmk.agendar(tel);
}

// ═══════════════════════════════════════════════════════════════
// MENSAGENS PRINCIPAIS
// ═══════════════════════════════════════════════════════════════
function boasVindas() {
  return `${saudacao()}! 👋 Que bom ter você aqui!\n\nEu sou o *JARVIS* 🤖, assistente virtual da *Smart Cursos Unaí* — pronto pra te ajudar a conquistar sua aprovação! 🏆\n\nComo posso te chamar?`;
}

function menuGeral(nome) {
  return `Como posso te ajudar, *${nome}*? 😊\n\n*1️⃣* 📄 Apostilas para *Concursos*\n*2️⃣* 🎓 *Pré-vestibular / ENEM*\n*3️⃣* 💻 Cursos de *Informática*\n*4️⃣* 🌐 Cursos *Online*\n*5️⃣* 💬 Tenho uma *dúvida*\n*6️⃣* 👤 Falar com *atendente*\n\n_Digite o número_ 👇`;
}

function msgPix(produto, valor) {
  return `✅ Ótimo! Para garantir sua apostila, faça o pagamento via PIX:\n\n🏷 *${produto}*\n💰 *${fmt(valor)}*\n\n📲 *Chave PIX (CNPJ):*\n\`${cfg.pix}\`\n\nApós pagar, *envie o comprovante (print ou foto)* aqui! 📸`;
}

// ═══════════════════════════════════════════════════════════════
// FLUXOS DE COLETA DE DADOS
// ═══════════════════════════════════════════════════════════════
async function fluxoNome(tel, txt, s) {
  if (ehNome(txt)) {
    const nome = nomeFmt(txt);
    set(tel, { nome, etapa: E.AGUARDA_CIDADE });
    await zapi.texto(tel, `Prazer, *${nome}*! 😊\n\nDe qual cidade você é?`);
  } else {
    // Texto não é nome — tenta detectar intenção e ainda pede nome
    set(tel, { etapa: E.AGUARDA_NOME, _intencao: txt });
    await zapi.texto(tel, `Entendido! 😊\n\nMas primeiro, como posso te chamar?\n\n_(Pode digitar só seu primeiro nome)_`);
  }
}

async function fluxoCidade(tel, txt, s) {
  const cidade = nomeFmt(txt);
  set(tel, { cidade, etapa: E.MENU });

  const intencao = s._intencao || '';
  set(tel, { _intencao: null });

  await zapi.texto(tel,
    `Legal, *${cidade}*! 😊\n\nSeja bem-vindo(a) à *Smart Cursos Unaí*!\n\nAgora posso te ajudar direitinho 👇`
  );
  await wait(600);

  // Se veio com intenção de concurso/apostila, vai direto
  if (/paracatu/i.test(intencao)) {
    set(tel, { etapa: E.P_AREA });
    await zapi.texto(tel, menuParacatu());
    return;
  }
  if (/buritis/i.test(intencao)) {
    set(tel, { etapa: E.B_AREA });
    await zapi.texto(tel, menuBuritis());
    return;
  }
  if (/apostila|concurso|cargo|material/i.test(intencao)) {
    set(tel, { etapa: E.CONCURSO });
    await zapi.texto(tel, menuConcurso());
    return;
  }

  await zapi.texto(tel, menuGeral(s.nome || ''));
}

// ═══════════════════════════════════════════════════════════════
// MENU PRINCIPAL
// ═══════════════════════════════════════════════════════════════
async function fluxoMenu(tel, txt, s) {
  switch (txt) {
    case '1':
      set(tel, { etapa: E.CONCURSO });
      await zapi.texto(tel, menuConcurso());
      break;
    case '2':
      set(tel, { etapa: E.PRE_VEST });
      await fluxoPreVest(tel, '', s);
      break;
    case '3':
      set(tel, { etapa: E.INFORMATICA });
      await fluxoInfo(tel, '', s);
      break;
    case '4':
      set(tel, { etapa: E.ONLINE });
      await fluxoOnline(tel, '', s);
      break;
    case '5':
      set(tel, { etapa: E.LIVRE });
      await zapi.texto(tel, `Claro! Pode perguntar à vontade 😊\n\n_(Digite *menu* quando quiser voltar às opções)_`);
      break;
    case '6':
      set(tel, { etapa: E.LIVRE });
      await zapi.texto(tel, `Certo, *${s.nome}*! Vou avisar nossa equipe. 😊\n\n_Seg-Sex 8h-18h | Sáb 8h-12h_ ⏱️`);
      await zapi.notificar(tel, s.nome, 'Pediu atendente humano');
      break;
    default:
      // Tenta detectar intenção no texto livre
      await intencao(tel, txt, s);
  }
}

// ═══════════════════════════════════════════════════════════════
// SELEÇÃO DE CONCURSO
// ═══════════════════════════════════════════════════════════════
function menuConcurso() {
  return `Para qual concurso você quer a apostila? 👇\n\n*1️⃣* 🏛 *Prefeitura de Paracatu/MG 2026*\n   IBGP | 272 vagas | Prova: 23/08/2026\n\n*2️⃣* 🏛 *Prefeitura de Buritis/MG*\n   Processo Seletivo — vários cargos\n\n*0️⃣* ← Voltar`;
}

async function fluxoConcurso(tel, txt, s) {
  if (txt === '0') { set(tel, { etapa: E.MENU }); await zapi.texto(tel, menuGeral(s.nome)); return; }
  if (txt === '1') { set(tel, { etapa: E.P_AREA });  await zapi.texto(tel, menuParacatu()); return; }
  if (txt === '2') { set(tel, { etapa: E.B_AREA });  await zapi.texto(tel, menuBuritis()); return; }
  await zapi.texto(tel, menuConcurso());
}

// ═══════════════════════════════════════════════════════════════
// PARACATU — ÁREA
// ═══════════════════════════════════════════════════════════════
function menuParacatu() {
  return `📄 *Apostilas — Paracatu 2026*\n(IBGP | 272 vagas | Prova: 23/08)\n\n*1️⃣* 🎯 Ver apostila do *meu cargo*\n*2️⃣* 🔥 *COMBO COMPLETO* — R$ 49,90\n   _27 apostilas por menos de R$ 2 cada!_\n*3️⃣* ❓ Não sei meu cargo\n\n*0️⃣* ← Voltar`;
}

async function fluxoParacatuArea(tel, txt, s) {
  if (txt === '0') { set(tel, { etapa: E.CONCURSO }); await zapi.texto(tel, menuConcurso()); return; }
  if (txt === '2') { set(tel, { etapa: E.P_COMBO });  await comboParacatu(tel, s.nome); return; }
  if (txt === '3') {
    set(tel, { etapa: E.LIVRE });
    await zapi.texto(tel, `Sem problema! Me conta sua formação ou área de atuação que te indico o cargo certo para Paracatu 2026! 😊`);
    return;
  }
  if (txt === '1') {
    set(tel, { etapa: E.P_CARGO, areaId: null });
    const areas = cfg.paracatu.areas;
    const linhas = areas.map((a, i) => `*${i + 1}️⃣* ${a.emoji} ${a.titulo}`).join('\n');
    await zapi.texto(tel, `Qual é a sua área? 👇\n\n${linhas}\n\n*0️⃣* ← Voltar`);
    return;
  }
  await zapi.texto(tel, menuParacatu());
}

// ═══════════════════════════════════════════════════════════════
// PARACATU — CARGO (dentro da área)
// ═══════════════════════════════════════════════════════════════
async function fluxoParacatuCargo(tel, txt, s) {
  if (txt === '0') {
    set(tel, { etapa: E.P_AREA });
    await zapi.texto(tel, menuParacatu());
    return;
  }

  // Se ainda não escolheu área, o número é a área
  if (!s.areaId) {
    const areas = cfg.paracatu.areas;
    const idx = parseInt(txt) - 1;
    const area = areas[idx];
    if (!area) {
      const linhas = areas.map((a, i) => `*${i + 1}️⃣* ${a.emoji} ${a.titulo}`).join('\n');
      await zapi.texto(tel, `Opção inválida. Escolha:\n\n${linhas}\n\n*0️⃣* ← Voltar`);
      return;
    }
    set(tel, { areaId: area.id });
    const linhas = area.cargos.map((c, i) => `*${i + 1}️⃣* ${c.titulo}`).join('\n');
    await zapi.texto(tel, `${area.emoji} *${area.titulo}*\n\nQual é o seu cargo? 👇\n\n${linhas}\n\n*0️⃣* ← Voltar\n\n_Dica: COMBO 27 apostilas por R$ 49,90! 😉_`);
    return;
  }

  // Já tem área — escolhe cargo
  const area = cfg.paracatu.areas.find(a => a.id === s.areaId);
  if (!area) { set(tel, { etapa: E.P_AREA }); await zapi.texto(tel, menuParacatu()); return; }

  const idx = parseInt(txt) - 1;
  const cargo = area.cargos[idx];
  if (!cargo) {
    const linhas = area.cargos.map((c, i) => `*${i + 1}️⃣* ${c.titulo}`).join('\n');
    await zapi.texto(tel, `Opção inválida. Escolha:\n\n${linhas}\n\n*0️⃣* ← Voltar`);
    return;
  }

  // Mostra detalhes da apostila
  set(tel, {
    etapa: E.P_APOSTILA,
    pedido: { produto: `Apostila ${cargo.titulo} — Paracatu 2026`, valor: cfg.paracatu.precoCargo, tipo: 'cargo_paracatu', driveId: cargo.drive },
  });

  await zapi.texto(tel,
    `📘 *Apostila ${cargo.titulo}*\nParacatu 2026 — IBGP\n\n📄 *${cargo.pags} páginas*\n\n📦 *Módulos Base:* LP, Raciocínio Lógico, Informática, Conhecimentos Gerais\n\n🎯 *Específico:* ${cargo.esp}\n\n💰 *R$ 19,90* — acesso imediato via PIX\n\n*1️⃣* ✅ Comprar — R$ 19,90\n*2️⃣* 🔥 COMBO completo — R$ 49,90\n*3️⃣* 🔄 Escolher outro cargo`
  );
}

// ═══════════════════════════════════════════════════════════════
// PARACATU — APOSTILA (confirma compra)
// ═══════════════════════════════════════════════════════════════
async function fluxoParacatuApostila(tel, txt, s) {
  if (txt === '1') {
    set(tel, { etapa: E.AGUARDA_PIX });
    await zapi.texto(tel, msgPix(s.pedido.produto, s.pedido.valor));
    return;
  }
  if (txt === '2') { set(tel, { etapa: E.P_COMBO }); await comboParacatu(tel, s.nome); return; }
  if (txt === '3') {
    set(tel, { etapa: E.P_CARGO, areaId: null });
    const areas = cfg.paracatu.areas;
    const linhas = areas.map((a, i) => `*${i + 1}️⃣* ${a.emoji} ${a.titulo}`).join('\n');
    await zapi.texto(tel, `Qual é a sua área? 👇\n\n${linhas}\n\n*0️⃣* ← Voltar`);
    return;
  }
  // Texto livre — responde com IA mantendo contexto de venda
  await fluxoLivre(tel, txt, s);
}

// ═══════════════════════════════════════════════════════════════
// PARACATU — COMBO
// ═══════════════════════════════════════════════════════════════
async function comboParacatu(tel, nome) {
  const total = (cfg.paracatu.precoCargo * 27).toFixed(2).replace('.', ',');
  const eco   = (cfg.paracatu.precoCargo * 27 - cfg.paracatu.precoCombo).toFixed(2).replace('.', ',');
  const n = nome ? `*${nome}*` : 'você';

  await zapi.texto(tel, `${n}, deixa eu te mostrar o melhor custo-benefício... 👀`);
  await wait(1200);
  await zapi.texto(tel,
    `🔥 *COMBO COMPLETO — Paracatu 2026*\n\n27 apostilas de uma vez:\n🏥 7 de Saúde | 📚 6 de Educação\n🗂 6 Administrativas | ⚖ 4 Jurídica\n⚙ 4 Técnicas\n\n✅ Conteúdo conforme edital IBGP\n✅ Módulos base + específico em cada\n✅ Questões comentadas`
  );
  await wait(1500);
  await zapi.texto(tel,
    `💡 *Comparação:*\n27 apostilas separadas = *R$ ${total}*\nCOMBO = *R$ ${fmt(cfg.paracatu.precoCombo)}*\n\n💰 Economia de *R$ ${eco}*!\n_É como levar 25 apostilas de graça_ 🎁`
  );
  await wait(1500);
  await zapi.texto(tel,
    `⚡ Pagamento via PIX — acesso imediato!\nA prova é em *23 de agosto*. Quanto antes estudar, maior a vantagem! ⏰\n\n*1️⃣* ✅ Quero o COMBO — R$ 49,90\n*2️⃣* 🔍 Ver apostila por cargo\n*3️⃣* ← Voltar ao menu`
  );
}

async function fluxoParacatuCombo(tel, txt, s) {
  if (txt === '1') {
    set(tel, {
      etapa: E.AGUARDA_PIX,
      pedido: { produto: 'COMBO Completo Paracatu 2026 — 27 apostilas', valor: cfg.paracatu.precoCombo, tipo: 'combo_paracatu' },
    });
    await zapi.texto(tel, msgPix('COMBO Completo Paracatu 2026', cfg.paracatu.precoCombo));
    return;
  }
  if (txt === '2') { set(tel, { etapa: E.P_CARGO, areaId: null }); const areas = cfg.paracatu.areas; const linhas = areas.map((a, i) => `*${i + 1}️⃣* ${a.emoji} ${a.titulo}`).join('\n'); await zapi.texto(tel, `Qual área? 👇\n\n${linhas}\n\n*0️⃣* ← Voltar`); return; }
  if (txt === '3') { set(tel, { etapa: E.MENU }); await zapi.texto(tel, menuGeral(s.nome)); return; }
  await zapi.texto(tel, `Digite *1* pra comprar o COMBO, *2* pra ver por cargo ou *3* pra voltar! 😊`);
}

// ═══════════════════════════════════════════════════════════════
// BURITIS — ÁREA
// ═══════════════════════════════════════════════════════════════
function menuBuritis() {
  return `📄 *Apostilas — Processo Seletivo Buritis/MG*\n\n*1️⃣* 🎯 Ver apostila do *meu cargo*\n*2️⃣* 🔥 *COMBO COMPLETO* — R$ 49,90\n   _Todos os cargos de uma vez!_\n\n*0️⃣* ← Voltar`;
}

async function fluxoBuritisArea(tel, txt, s) {
  if (txt === '0') { set(tel, { etapa: E.CONCURSO }); await zapi.texto(tel, menuConcurso()); return; }
  if (txt === '2') { set(tel, { etapa: E.B_COMBO }); await comboBuritis(tel, s.nome); return; }
  if (txt === '1') {
    set(tel, { etapa: E.B_CARGO, areaId: null });
    const areas = cfg.buritis.areas;
    const linhas = areas.map((a, i) => `*${i + 1}️⃣* ${a.emoji} ${a.titulo} (${a.qtd} cargos)`).join('\n');
    await zapi.texto(tel, `Qual é a sua área? 👇\n\n${linhas}\n\n*0️⃣* ← Voltar`);
    return;
  }
  await zapi.texto(tel, menuBuritis());
}

// ═══════════════════════════════════════════════════════════════
// BURITIS — CARGO
// ═══════════════════════════════════════════════════════════════
async function fluxoBuritisCargo(tel, txt, s) {
  if (txt === '0') {
    if (!s.areaId) { set(tel, { etapa: E.B_AREA }); await zapi.texto(tel, menuBuritis()); }
    else { set(tel, { areaId: null }); const areas = cfg.buritis.areas; const linhas = areas.map((a, i) => `*${i + 1}️⃣* ${a.emoji} ${a.titulo}`).join('\n'); await zapi.texto(tel, `Qual área?\n\n${linhas}\n\n*0️⃣* ← Voltar`); }
    return;
  }

  if (!s.areaId) {
    const areas = cfg.buritis.areas;
    const idx = parseInt(txt) - 1;
    const area = areas[idx];
    if (!area) { const linhas = areas.map((a, i) => `*${i + 1}️⃣* ${a.emoji} ${a.titulo}`).join('\n'); await zapi.texto(tel, `Opção inválida:\n\n${linhas}\n\n*0️⃣* ← Voltar`); return; }
    set(tel, { areaId: area.id });
    const cargos = cfg.buritis.cargos[area.id] || [];
    // Exibe em grupos de 10 para não cortar no WhatsApp
    let linhas = '';
    for (let i = 0; i < Math.min(cargos.length, 20); i++) linhas += `*${i + 1}️⃣* ${cargos[i]}\n`;
    if (cargos.length > 20) linhas += `\n_...e mais ${cargos.length - 20} cargos. Digite o número ou o nome do cargo._`;
    await zapi.texto(tel, `${area.emoji} *${area.titulo}*\n\nQual é o seu cargo? 👇\n\n${linhas}\n*0️⃣* ← Voltar`);
    return;
  }

  const cargos = cfg.buritis.cargos[s.areaId] || [];
  let cargo = null;
  const idx = parseInt(txt) - 1;
  if (!isNaN(idx) && idx >= 0 && idx < cargos.length) {
    cargo = cargos[idx];
  } else {
    // Tenta buscar por nome
    cargo = cargos.find(c => c.toLowerCase().includes(txt.toLowerCase()));
  }

  if (!cargo) {
    await zapi.texto(tel, `Não encontrei esse cargo. Pode digitar o *número* ou parte do *nome* do cargo! 😊`);
    return;
  }

  set(tel, {
    etapa: E.B_APOSTILA,
    pedido: { produto: `Apostila ${cargo} — Buritis/MG`, valor: cfg.buritis.precoCargo, tipo: 'cargo_buritis' },
  });
  await zapi.texto(tel,
    `📘 *Apostila ${cargo}*\nProcesso Seletivo Buritis/MG\n\n📦 Módulos Base + Conteúdo Específico do cargo\n✅ Questões comentadas\n\n💰 *R$ 19,90* — pagamento via PIX\n📲 Material enviado pelo WhatsApp após confirmação\n\n*1️⃣* ✅ Comprar — R$ 19,90\n*2️⃣* 🔥 COMBO todos os cargos — R$ 49,90\n*3️⃣* 🔄 Escolher outro cargo`
  );
}

async function fluxoBuritisApostila(tel, txt, s) {
  if (txt === '1') { set(tel, { etapa: E.AGUARDA_PIX }); await zapi.texto(tel, msgPix(s.pedido.produto, s.pedido.valor)); return; }
  if (txt === '2') { set(tel, { etapa: E.B_COMBO }); await comboBuritis(tel, s.nome); return; }
  if (txt === '3') { set(tel, { etapa: E.B_CARGO, areaId: null }); const areas = cfg.buritis.areas; const linhas = areas.map((a, i) => `*${i + 1}️⃣* ${a.emoji} ${a.titulo}`).join('\n'); await zapi.texto(tel, `Qual área?\n\n${linhas}\n\n*0️⃣* ← Voltar`); return; }
  await fluxoLivre(tel, txt, s);
}

async function comboBuritis(tel, nome) {
  const n = nome ? `*${nome}*` : 'você';
  await zapi.texto(tel, `🔥 *COMBO COMPLETO — Buritis/MG*\n\n🏥 35 cargos da Saúde\n🤝 20 de Assistência Social\n📚 9 da Educação\n\n✅ Módulos base + específico em cada\n\nSeparado: mais de *R$ 1.200,00*\nCOMBO: *R$ 49,90* 🎁\n\n*1️⃣* ✅ Quero o COMBO — R$ 49,90\n*2️⃣* 🔍 Ver por cargo — R$ 19,90\n*3️⃣* ← Voltar`);
}

async function fluxoBuritisCombo(tel, txt, s) {
  if (txt === '1') {
    set(tel, { etapa: E.AGUARDA_PIX, pedido: { produto: 'COMBO Completo Buritis/MG', valor: cfg.buritis.precoCombo, tipo: 'combo_buritis' } });
    await zapi.texto(tel, msgPix('COMBO Completo Buritis/MG', cfg.buritis.precoCombo));
    return;
  }
  if (txt === '2') { set(tel, { etapa: E.B_CARGO, areaId: null }); const areas = cfg.buritis.areas; const linhas = areas.map((a, i) => `*${i + 1}️⃣* ${a.emoji} ${a.titulo}`).join('\n'); await zapi.texto(tel, `Qual área?\n\n${linhas}\n\n*0️⃣* ← Voltar`); return; }
  if (txt === '3') { set(tel, { etapa: E.MENU }); await zapi.texto(tel, menuGeral(s.nome)); return; }
  await zapi.texto(tel, `Digite *1* pro COMBO, *2* pra ver por cargo ou *3* pra voltar! 😊`);
}

// ═══════════════════════════════════════════════════════════════
// COMPROVANTE PIX
// ═══════════════════════════════════════════════════════════════
async function processarComprovante(tel, imgUrl, s) {
  await zapi.texto(tel, `🔍 Verificando seu comprovante...`);
  const pedido = s.pedido;
  if (!pedido) { await zapi.texto(tel, `Não encontrei seu pedido. Digite *menu* pra recomeçar! 😊`); return; }

  const r = await pix.validar(imgUrl, pedido.valor);
  console.log(`[PIX] resultado:`, r);

  if (r.ok === true) {
    await zapi.texto(tel, `✅ *Pagamento confirmado!*\n\nObrigado, *${s.nome || 'aluno(a)'}*! 🎉\n\nEnviando seu material agora... 📦`);
    await wait(800);
    await liberarProduto(tel, pedido, s.nome);
    set(tel, { etapa: E.MENU, pedido: null });
    rmk.cancelar(tel);

  } else if (r.ok === false) {
    if (r.motivo === 'valor_errado') {
      await zapi.texto(tel, `O comprovante mostra *${fmt(r.valorPago || 0)}* mas o valor do pedido é *${fmt(pedido.valor)}* 🤔\n\nVerifica se foi o valor certo e envia novamente! 😊`);
    } else if (r.motivo === 'nao_pix') {
      await zapi.texto(tel, `Não identifiquei um comprovante PIX nessa imagem 🤔\n\nPode enviar um *print mais nítido* do comprovante? 📸`);
    } else {
      await zapi.texto(tel, `Não consegui confirmar seu pagamento 😔\n\nVerifica e envia o comprovante novamente, ou chama um atendente!`);
    }
  } else {
    // ok === null — erro técnico — confirmação manual
    await zapi.texto(tel, `Recebi seu comprovante! 📨\n\nVou repassar pra nossa equipe confirmar. Em breve você recebe o material, *${s.nome || 'aluno(a)'}*! ⏱️`);
    await zapi.comprovante(tel, s.nome, pedido.produto, imgUrl);
  }
}

// ═══════════════════════════════════════════════════════════════
// LIBERAÇÃO DO PRODUTO
// ═══════════════════════════════════════════════════════════════
async function liberarProduto(tel, pedido, nome) {
  const n = nome || 'aluno(a)';

  // BURITIS — manual
  if (pedido.tipo === 'cargo_buritis' || pedido.tipo === 'combo_buritis') {
    await zapi.texto(tel,
      `🎉 *Pedido confirmado, ${n}!*\n\nSua apostila de *${pedido.produto}* foi registrada!\n\n📲 Nossa equipe vai te enviar o material *aqui pelo WhatsApp* em breve.\n_Seg-Sex 8h-18h | Sáb 8h-12h_ ⏱️\n\nQualquer dúvida é só chamar! 😊`
    );
    await zapi.notificar(tel, nome, `⚠️ ENVIAR MANUALMENTE: ${pedido.produto}`);
    return;
  }

  // PARACATU — link automático
  if (pedido.tipo === 'cargo_paracatu' && pedido.driveId) {
    await zapi.apostila(tel, pedido.driveId, pedido.produto, n);
    await wait(500);
    await zapi.texto(tel, `Pronto, *${n}*! 🎉\n\nBons estudos e boa sorte na prova! 💪🏆\n\nQualquer dúvida sobre o conteúdo, pode chamar! 😊`);
    return;
  }

  if (pedido.tipo === 'combo_paracatu') {
    await zapi.texto(tel, `📦 Enviando todas as apostilas... pode levar alguns minutos! ⏳`);
    for (const area of cfg.paracatu.areas) {
      for (const cargo of area.cargos) {
        if (cargo.drive) {
          await zapi.apostila(tel, cargo.drive, `Apostila ${cargo.titulo}`, n);
          await wait(3000);
        }
      }
    }
    await zapi.texto(tel, `✅ Tudo enviado, *${n}*! 🎉\n\nBons estudos! 💪`);
    return;
  }

  await zapi.texto(tel, `Seu material está sendo processado. Em breve nossa equipe envia! 😊`);
  await zapi.notificar(tel, nome, `Material a enviar: ${pedido.produto}`);
}

// ═══════════════════════════════════════════════════════════════
// OUTROS FLUXOS
// ═══════════════════════════════════════════════════════════════
async function fluxoPreVest(tel, txt, s) {
  if (txt === '2') {
    set(tel, { etapa: E.LIVRE });
    await zapi.texto(tel, `Ótimo, *${s.nome}*! 🎉\n\nVou avisar nossa equipe pra entrar em contato! 😊\n_Seg-Sex 8h-18h_`);
    await zapi.notificar(tel, s.nome, 'Pré-vestibular / Matrícula');
    return;
  }
  if (txt === '3') { set(tel, { etapa: E.MENU }); await zapi.texto(tel, menuGeral(s.nome)); return; }
  // Apresentação
  await zapi.texto(tel,
    `🎓 *Pré-Vestibular Smart Cursos Unaí*\n\n✅ Aulas Seg-Sex 19h-22h\n✅ Plataforma + aulas gravadas\n✅ Apostilas trimestrais (~540 questões)\n✅ Sala de estudos 8h-22h\n✅ Professores especializados\n\n💰 A partir de *R$ 595,90/mês*\n\n*1️⃣* Ver mais detalhes\n*2️⃣* Quero me matricular\n*3️⃣* ← Voltar`
  );
}

async function fluxoInfo(tel, txt, s) {
  if (txt === '0') { set(tel, { etapa: E.MENU }); await zapi.texto(tel, menuGeral(s.nome)); return; }
  if (['1', '2', '3'].includes(txt)) {
    const infos = {
      '1': '🏫 *Presencial* — 9 meses / 120h\n• Cartão: 9x R$ 311,92\n• À vista: R$ 2.456,37',
      '2': '🏢 *Empresarial* — 3 meses\n• Cartão: 10x R$ 99,79\n• À vista: R$ 899,90',
      '3': '🌐 *Online* — no seu ritmo\n• Cartão: 10x R$ 29,79\n• À vista: R$ 297,90',
    };
    set(tel, { etapa: E.LIVRE });
    await zapi.texto(tel, `${infos[txt]}\n\nGostou? Nossa equipe finaliza sua matrícula! 😊`);
    await zapi.notificar(tel, s.nome, `Informática — opção ${txt}`);
    return;
  }
  await zapi.texto(tel,
    `💻 *Cursos de Informática*\n\n*1️⃣* 🏫 Presencial — 9 meses / 120h\n*2️⃣* 🏢 Empresarial — 3 meses\n*3️⃣* 🌐 Online — no seu ritmo\n\n*0️⃣* ← Voltar`
  );
}

async function fluxoOnline(tel, txt, s) {
  if (txt === '0') { set(tel, { etapa: E.MENU }); await zapi.texto(tel, menuGeral(s.nome)); return; }
  const cursos = cfg.cursosOnline;
  const idx = parseInt(txt) - 1;
  if (idx >= 0 && idx < cursos.length) {
    const c = cursos[idx];
    set(tel, { etapa: E.LIVRE });
    await zapi.texto(tel, `Ótima escolha, *${s.nome}*! 🎉\n\n*${c.titulo}* — ${fmt(c.valor)}\n\nVou avisar nossa equipe pra te dar acesso! 😊`);
    await zapi.notificar(tel, s.nome, `Curso Online — ${c.titulo}`);
    return;
  }
  const linhas = cursos.map((c, i) => `*${i + 1}️⃣* ${c.titulo} — *${fmt(c.valor)}*`).join('\n');
  await zapi.texto(tel, `🌐 *Cursos Online*\n\n${linhas}\n\n*0️⃣* ← Voltar`);
}

// ═══════════════════════════════════════════════════════════════
// CONVERSA LIVRE COM IA
// ═══════════════════════════════════════════════════════════════
async function fluxoLivre(tel, txt, s) {
  const hist = s.hist || [];
  hist.push({ role: 'user', content: txt });
  const resp = await ia.responder(txt, hist);
  hist.push({ role: 'assistant', content: resp });
  set(tel, { hist: hist.slice(-10), etapa: E.LIVRE });
  await zapi.texto(tel, resp);
  await wait(400);
  await zapi.texto(tel, `_Digite *menu* pra ver as opções ou continue perguntando!_ 😊`);
}

// ═══════════════════════════════════════════════════════════════
// DETECÇÃO DE INTENÇÃO EM TEXTO LIVRE
// ═══════════════════════════════════════════════════════════════
async function intencao(tel, txt, s) {
  const low = txt.toLowerCase();
  if (/apostila|concurso|cargo|material/.test(low)) { set(tel, { etapa: E.CONCURSO }); await zapi.texto(tel, menuConcurso()); return; }
  if (/paracatu|ibgp/.test(low)) { set(tel, { etapa: E.P_AREA }); await zapi.texto(tel, menuParacatu()); return; }
  if (/buritis/.test(low)) { set(tel, { etapa: E.B_AREA }); await zapi.texto(tel, menuBuritis()); return; }
  if (/enem|vestibular|pré-vest/.test(low)) { set(tel, { etapa: E.PRE_VEST }); await fluxoPreVest(tel, '', s); return; }
  if (/informática|informatica|excel|word|computador/.test(low)) { set(tel, { etapa: E.INFORMATICA }); await fluxoInfo(tel, '', s); return; }
  if (/preço|valor|quanto|custa/.test(low)) {
    await zapi.texto(tel, `💰 *Preços:*\n• Apostila por cargo: *R$ 19,90*\n• COMBO completo: *R$ 49,90*\n• Pré-vestibular: a partir de *R$ 595,90/mês*\n\nO que te interessa? 😊`);
    return;
  }
  await fluxoLivre(tel, txt, s);
}

module.exports = { processar };
