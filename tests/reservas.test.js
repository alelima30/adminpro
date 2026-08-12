// Testes das regras de reserva do AdminPro.
// Rodar:  node tests/reservas.test.js
//
// As funções são lidas do próprio adminpro.html (ver tests/extrair.js),
// então o teste valida exatamente o código que vai para o ar.

const { carregar } = require('./extrair');

let ok = 0, falhas = 0;
function checa(descricao, obtido, esperado) {
  const igual = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (igual) { ok++; console.log('  ✓ ' + descricao); }
  else { falhas++; console.log('  ✗ ' + descricao + '\n      esperado: ' + JSON.stringify(esperado) + '\n      obtido:   ' + JSON.stringify(obtido)); }
}
// Um bloco pode devolver uma promessa (função async sob teste). Quando
// devolve, ela entra na fila e o resumo final só sai depois de resolvida —
// senão o placar seria impresso antes das checagens acontecerem.
const _pendentes = [];
function bloco(titulo, fn) {
  console.log('\n' + titulo);
  const r = fn();
  if (r && typeof r.then === 'function') _pendentes.push(r);
}

// ── Horário: fonte única ───────────────────────────────────────────────
const { hrIni, hrFim, hrConflita } = carregar(['hrIni', 'hrFim', 'hrConflita']);

bloco('Leitura de horário', () => {
  checa('início de "07:00–08:00"', hrIni('07:00–08:00'), 420);
  checa('fim de "07:00–08:00"', hrFim('07:00–08:00'), 480);
  checa('hífen simples "14:00-15:00"', hrFim('14:00-15:00'), 900);
  checa('sem hora de fim assume 1 hora', hrFim('07:00'), 480);
  checa('vira a madrugada "22:00–01:00"', hrFim('22:00–01:00'), 1500);
  checa('horário vazio não quebra', hrIni(''), 0);
  checa('meia-noite "00:00–00:30"', hrFim('00:00–00:30'), 30);
});

bloco('Conflito de horário', () => {
  checa('sobreposição parcial', hrConflita('07:00–08:00', '07:30–08:30'), true);
  checa('um dentro do outro', hrConflita('07:00–10:00', '08:00–09:00'), true);
  checa('horários encostados não conflitam', hrConflita('07:00–08:00', '08:00–09:00'), false);
  checa('horários separados', hrConflita('07:00–08:00', '09:00–10:00'), false);
  checa('madrugada sobrepõe', hrConflita('22:00–01:00', '23:00–23:30'), true);
  checa('mesmo horário conflita', hrConflita('14:00–15:00', '14:00–15:00'), true);
});

// ── Regras de negócio da reserva ───────────────────────────────────────
// reservaViolaRegra devolve uma MENSAGEM quando viola, ou algo falso quando pode.
function montar(cfg, nivel, reservas) {
  return carregar(
    ['reservaViolaRegra', '_chvEsp', 'hrIni', 'hrFim', '_minHora',
     '_resInstante', '_fmtDataBRCurta', '_fmtHorasBR', '_horasReserva'],
    {
      getCfgRes: () => cfg,
      window: { _userNivel: nivel || 'morador' },
      G: () => (reservas || []),
      _DIAS_SEM: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'],
    },
  );
}
const viola = (api, ...args) => !!api.reservaViolaRegra(...args);

function dataDaqui(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

bloco('Antecedência mínima (ex.: salão exige 15 dias)', () => {
  const cfg = { disp_sal_o_de_festa_antmin: '15' };
  const morador = montar(cfg, 'morador');
  const admin = montar(cfg, 'admin');
  checa('morador não reserva para daqui a 2 dias', viola(morador, 'Salão de Festa', dataDaqui(2), '14:00–15:00', 'A01', ''), true);
  checa('morador reserva para daqui a 20 dias', viola(morador, 'Salão de Festa', dataDaqui(20), '14:00–15:00', 'A01', ''), false);
  checa('admin não é barrado pela antecedência', viola(admin, 'Salão de Festa', dataDaqui(2), '14:00–15:00', 'A01', ''), false);
});

bloco('Antecedência máxima', () => {
  const cfg = { disp_quadra_de_areia_antec: '7' };
  const morador = montar(cfg, 'morador');
  checa('morador não reserva além de 7 dias', viola(morador, 'Quadra de Areia', dataDaqui(30), '14:00–15:00', 'A01', ''), true);
  checa('morador reserva dentro de 7 dias', viola(morador, 'Quadra de Areia', dataDaqui(3), '14:00–15:00', 'A01', ''), false);
});

bloco('Horário que já passou (hoje)', () => {
  const api = montar({}, 'admin');
  const hoje = dataDaqui(0);
  checa('00:00–00:01 de hoje está encerrado', viola(api, 'Quadra de Areia', hoje, '00:00–00:01', 'A01', ''), true);
  checa('23:58–23:59 de hoje ainda é válido', viola(api, 'Quadra de Areia', hoje, '23:58–23:59', 'A01', ''), false);
  checa('amanhã de manhã é válido', viola(api, 'Quadra de Areia', dataDaqui(1), '07:00–08:00', 'A01', ''), false);
});

bloco('Dias da semana permitidos', () => {
  // Só domingo (0). Escolhemos uma data que sabidamente não é domingo.
  const cfg = { disp_gin_sio_dias: [0] };
  const api = montar(cfg, 'morador');
  const d = new Date(); d.setDate(d.getDate() + 1);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);   // garante que não é domingo
  const naoDomingo = d.toISOString().slice(0, 10);
  checa('bloqueia dia não permitido', viola(api, 'Ginásio', naoDomingo, '14:00–15:00', 'A01', ''), true);
});

bloco('Bloqueios da administração', () => {
  const hoje = dataDaqui(3);
  // dia inteiro bloqueado
  const diaTodo = montar({ bloqueios: [{ ini: hoje, fim: hoje, motivo: 'Manutenção' }] }, 'morador');
  checa('dia inteiro bloqueado barra qualquer horário',
    viola(diaTodo, 'Quadra de Areia', hoje, '14:00–15:00', 'A01', ''), true);

  // apenas uma faixa de horário bloqueada
  const faixa = montar({ bloqueios: [{ ini: hoje, fim: hoje, h1: '13:00', h2: '16:00' }] }, 'morador');
  checa('horário dentro da faixa bloqueada é barrado',
    viola(faixa, 'Quadra de Areia', hoje, '14:00–15:00', 'A01', ''), true);
  checa('horário fora da faixa bloqueada é liberado',
    viola(faixa, 'Quadra de Areia', hoje, '09:00–10:00', 'A01', ''), false);

  // bloqueio de um espaço não afeta outro
  const porEspaco = montar({ bloqueios: [{ ini: hoje, fim: hoje, espaco: 'Ginásio' }] }, 'morador');
  checa('bloqueio de outro espaço não afeta este',
    viola(porEspaco, 'Quadra de Areia', hoje, '14:00–15:00', 'A01', ''), false);
});

// ── Pix (BR Code) ──────────────────────────────────────────────────────
const pix = carregar(['pixCopiaECola', '_pixCampo', '_pixTexto', '_pixCRC']);

bloco('Pix — código copia e cola', () => {
  const cod = pix.pixCopiaECola('12345678000199', 'Associação Parque Village', 'São Paulo', 20, 'RES7');
  checa('começa com o cabeçalho do BR Code', cod.slice(0, 6), '000201');
  checa('contém o domínio do Pix', cod.includes('br.gov.bcb.pix'), true);
  checa('moeda é real (986)', cod.includes('5303986'), true);
  checa('valor com 2 casas', cod.includes('540520.00'), true);
  checa('país BR', cod.includes('5802BR'), true);
  checa('acento removido do nome', cod.includes('ASSOCIACAO PARQUE VILLAGE'), true);
  checa('CRC final confere', pix._pixCRC(cod.slice(0, -4)), cod.slice(-4));
  checa('sem chave devolve vazio', pix.pixCopiaECola('', 'X', 'Y', 10, 'Z'), '');

  const semValor = pix.pixCopiaECola('chave@teste.com', 'Cond Teste', 'RIO', 0, 'RES1');
  checa('sem valor não inclui campo 54', /54\d{2}0/.test(semValor), false);
  checa('CRC confere também sem valor', pix._pixCRC(semValor.slice(0, -4)), semValor.slice(-4));

  checa('nome longo é cortado em 25', pix._pixTexto('A'.repeat(40), 25).length, 25);
});

// ── Taxa por horário ───────────────────────────────────────────────────
const fin = carregar(['taxaDoHorario', 'hrIni', 'hrFim']);

bloco('Taxa que muda conforme o horário', () => {
  // Campo: grátis de dia, R$ 20 a partir das 18h
  const cfg = {
    fin_campo_de_futebol_taxa: '0',
    fin_campo_de_futebol_hnoite: '18:00',
    fin_campo_de_futebol_taxanoite: '20',
  };
  const t = (h) => fin.taxaDoHorario(cfg, 'Campo de Futebol', h);
  checa('de manhã é grátis', t('10:00–11:00'), 0);
  checa('até 17h continua grátis', t('17:00–18:00'), 0);
  checa('às 18h já cobra', t('18:00–19:00'), 20);
  checa('à noite cobra', t('20:00–21:00'), 20);

  // Sem configuração de horário: taxa única o dia todo
  const unica = { fin_quiosque_taxa: '50' };
  checa('sem horário definido usa a taxa única',
    fin.taxaDoHorario(unica, 'Quiosque', '09:00–10:00'), 50);
  checa('taxa única vale também à noite',
    fin.taxaDoHorario(unica, 'Quiosque', '22:00–23:00'), 50);

  // Serve para qualquer espaço, não só o campo
  const salao = {
    'fin_sal_o_de_festa_taxa': '800',
    'fin_sal_o_de_festa_hnoite': '19:00',
    'fin_sal_o_de_festa_taxanoite': '1500',
  };
  checa('salão de dia', fin.taxaDoHorario(salao, 'Salão de Festa', '14:00–18:00'), 800);
  checa('salão à noite', fin.taxaDoHorario(salao, 'Salão de Festa', '19:00–23:00'), 1500);

  checa('sem horário informado devolve a taxa base',
    fin.taxaDoHorario(cfg, 'Campo de Futebol', ''), 0);
});

// ── Espaços por condomínio ─────────────────────────────────────────────
bloco('Espaços de cada condomínio', () => {
  const comLista = carregar(['espacosDoCondominio'], {
    getCfgRes: () => ({ espacos: ['Piscina', 'Churrasqueira', 'Salão Gourmet'] }),
    ESPACOS_PADRAO: ['Quadra de Areia', 'Salão de Festa'],
  });
  checa('usa os espaços cadastrados pelo condomínio',
    comLista.espacosDoCondominio(), ['Piscina', 'Churrasqueira', 'Salão Gourmet']);

  const semLista = carregar(['espacosDoCondominio'], {
    getCfgRes: () => ({}),
    ESPACOS_PADRAO: ['Quadra de Areia', 'Salão de Festa'],
  });
  checa('sem cadastro próprio, usa a lista padrão',
    semLista.espacosDoCondominio(), ['Quadra de Areia', 'Salão de Festa']);

  const vazia = carregar(['espacosDoCondominio'], {
    getCfgRes: () => ({ espacos: [] }),
    ESPACOS_PADRAO: ['Quadra de Areia'],
  });
  checa('lista vazia volta para o padrão',
    vazia.espacosDoCondominio(), ['Quadra de Areia']);
});

// ── Segurança: escape de HTML ──────────────────────────────────────────
const seg = carregar(['escHtml']);

bloco('Escape de texto do usuário (XSS)', () => {
  checa('script vira texto inofensivo',
    seg.escHtml('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;');
  checa('imagem com onerror é neutralizada',
    seg.escHtml('<img src=x onerror=alert(1)>').includes('<'), false);
  checa('aspas duplas não escapam de atributo',
    seg.escHtml('a" onmouseover="x').includes('"'), false);
  checa('aspas simples não escapam de atributo',
    seg.escHtml("a' onmouseover='x").includes("'"), false);
  checa('& é escapado primeiro (não gera dupla codificação)',
    seg.escHtml('&lt;'), '&amp;lt;');
  checa('nulo vira string vazia', seg.escHtml(null), '');
  checa('indefinido vira string vazia', seg.escHtml(undefined), '');
  checa('texto normal não é alterado', seg.escHtml('Salão de Festa'), 'Salão de Festa');
  checa('número funciona', seg.escHtml(20), '20');
});

// ── Resultado ──────────────────────────────────────────────────────────
// ── Intervalo mínimo entre reservas da mesma unidade ───────────────────
// O condomínio quer espaçar o uso: reservou de manhã, só de novo depois de
// N horas. Conta do FIM de uma reserva ao INÍCIO da outra.
bloco('Intervalo mínimo entre reservas da mesma unidade', () => {
  const cfg = { disp_quadra_interv: 4 };   // 4 horas
  const jaTem = [{
    id: 1, espaco: 'Quadra', data: '2030-06-10', horario: '08:00–09:00',
    lote: 'L01', status: 'confirmada',
  }];
  const api = montar(cfg, 'morador', jaTem);
  const v = (data, hora, lote) => !!api.reservaViolaRegra('Quadra', data, hora, lote || 'L01', null);

  checa('3h depois do fim ainda é cedo', v('2030-06-10', '12:00–13:00'), true);
  checa('exatamente 4h depois já pode', v('2030-06-10', '13:00–14:00'), false);
  checa('5h depois pode', v('2030-06-10', '14:00–15:00'), false);
  checa('vale também para ANTES da reserva existente', v('2030-06-10', '06:00–07:00'), true);
  checa('4h antes já pode', v('2030-06-10', '03:00–04:00'), false);
  checa('outra unidade não é afetada', v('2030-06-10', '12:00–13:00', 'L02'), false);
  checa('outro dia, longe, pode', v('2030-06-11', '08:00–09:00'), false);
  checa('vira o dia: 23h de um dia e 1h do outro é só 2h de distância',
    (() => {
      const noite = [{ id: 9, espaco: 'Quadra', data: '2030-06-10', horario: '22:00–23:00', lote: 'L01', status: 'confirmada' }];
      return !!montar(cfg, 'morador', noite).reservaViolaRegra('Quadra', '2030-06-11', '01:00–02:00', 'L01', null);
    })(), true);
  checa('reserva cancelada não conta',
    (() => {
      const canc = [{ id: 9, espaco: 'Quadra', data: '2030-06-10', horario: '08:00–09:00', lote: 'L01', status: 'cancelada' }];
      return !!montar(cfg, 'morador', canc).reservaViolaRegra('Quadra', '2030-06-10', '12:00–13:00', 'L01', null);
    })(), false);
  checa('outro espaço não conta',
    (() => api.reservaViolaRegra('Piscina', '2030-06-10', '12:00–13:00', 'L01', null))(), null);
  checa('editando a própria reserva não bloqueia a si mesma',
    !!api.reservaViolaRegra('Quadra', '2030-06-10', '08:00–09:00', 'L01', 1), false);
  checa('admin não é barrado pelo intervalo',
    !!montar(cfg, 'admin', jaTem).reservaViolaRegra('Quadra', '2030-06-10', '12:00–13:00', 'L01', null), false);
  checa('sem intervalo configurado, nada bloqueia',
    !!montar({}, 'morador', jaTem).reservaViolaRegra('Quadra', '2030-06-10', '09:30–10:30', 'L01', null), false);
});

bloco('Horas escritas por extenso na mensagem', () => {
  const { _fmtHorasBR } = montar({}, 'morador', []);
  checa('4 horas', _fmtHorasBR(4), '4h');
  checa('1 hora e meia', _fmtHorasBR(1.5), '1h30');
  checa('meia hora', _fmtHorasBR(0.5), '30min');
});

// ── Painel de números das Reservas (ligar/desligar) ────────────────────
// Cada pessoa escolhe se quer ver os números no topo. O que este bloco
// protege: a escolha não pode se perder ao ir e voltar do calendário —
// era exatamente ali que a tela reexibia o painel por conta própria.
//
// _resView NÃO é passado como stub de propósito: assim ele é resolvido no
// escopo global, e o teste consegue trocar a visão de verdade. Passado
// como stub, ficaria congelado no valor inicial e a ida ao calendário
// nunca seria exercitada — que era o defeito da primeira versão deste
// bloco: ele dizia cobrir o calendário e não cobria.
bloco('Painel de números das Reservas', () => {
  const els = {};
  ['res-kpi', 'res-dash', 'res-btn-dash'].forEach((id) => {
    els[id] = { style: { display: '' }, innerHTML: '', title: '' };
  });
  const guardado = {};
  const janela = { _userNivel: 'admin' };

  const api = carregar(
    ['_resDashVisivel', 'resToggleDash', '_resAplicarDash'],
    {
      $: (id) => els[id] || null,
      localStorage: { getItem: (k) => (k in guardado ? guardado[k] : null),
                      setItem: (k, v) => { guardado[k] = String(v); } },
      window: janela,
      toast: () => {},
      renderReservas: () => api._resAplicarDash(),
    },
  );
  const verVisao = (v) => { global._resView = v; api._resAplicarDash(); };
  const visivel = (id) => els[id].style.display === '';

  // ── admin ──
  janela._userNivel = 'admin';
  verVisao('lista');
  checa('admin começa vendo o painel analítico', visivel('res-dash'), true);
  checa('e não a grade simples de números', visivel('res-kpi'), false);

  api.resToggleDash();
  checa('desligou: painel some', visivel('res-dash'), false);
  checa('a escolha ficou registrada', api._resDashVisivel(), false);

  // O ponto do bloco: ir ao calendário e voltar não pode religar sozinho.
  verVisao('calendario');
  checa('no calendário não há painel', visivel('res-dash'), false);
  checa('e o botão some, porque ali não teria efeito', visivel('res-btn-dash'), false);
  verVisao('lista');
  checa('voltou da lista e o painel CONTINUA desligado', visivel('res-dash'), false);
  checa('o botão reaparece', visivel('res-btn-dash'), true);

  api.resToggleDash();
  checa('religou: painel volta', visivel('res-dash'), true);
  verVisao('calendario'); verVisao('lista');
  checa('ligado também sobrevive à ida e volta', visivel('res-dash'), true);

  // ── morador ──
  delete guardado.apvc_res_dash;
  janela._userNivel = 'morador';
  verVisao('lista');
  checa('morador vê a grade de números', visivel('res-kpi'), true);
  checa('e não o painel analítico', visivel('res-dash'), false);
  api.resToggleDash();
  checa('morador desligou: some também', visivel('res-kpi'), false);
  verVisao('calendario'); verVisao('lista');
  checa('e continua desligado depois do calendário', visivel('res-kpi'), false);

  // ── supervisor: nível que existia e ficava sem número nenhum ──
  delete guardado.apvc_res_dash;
  janela._userNivel = 'supervisor';
  verVisao('lista');
  checa('supervisor vê a grade de números, como o morador', visivel('res-kpi'), true);
  checa('e não um painel analítico vazio', visivel('res-dash'), false);

  // ── a escolha é do aparelho ──
  checa('fica guardada no aparelho', guardado.apvc_res_dash, undefined);
  janela._userNivel = 'admin';
  api.resToggleDash();
  checa('depois de desligar, fica gravada', guardado.apvc_res_dash, 'off');
  delete guardado.apvc_res_dash;
  checa('outro aparelho começa com o painel ligado', api._resDashVisivel(), true);
});

// ── Taxa a partir de um horário: os dois campos são necessários ────────
// Caso real relatado: "coloquei R$ 20 a partir das 18h e não funcionou".
// O valor tinha ido para o campo da taxa normal, que vale o dia inteiro.
// Aqui fica registrado o que cada combinação produz, para a tela poder
// avisar em vez de deixar a cobrança errada passar em silêncio.
bloco('Taxa a partir de um horário', () => {
  const { taxaDoHorario } = carregar(['taxaDoHorario', 'hrIni'], {});
  const cobra = (cfg, hora) => taxaDoHorario(cfg, 'Quadra de Areia', hora);
  const K = 'fin_quadra_de_areia_';

  // Configuração correta: grátis de dia, R$ 20 a partir das 18h.
  const certa = { [K + 'taxa']: '0', [K + 'hnoite']: '18:00', [K + 'taxanoite']: '20' };
  checa('de manhã não cobra', cobra(certa, '08:00–09:00'), 0);
  checa('às 17h ainda não cobra', cobra(certa, '17:00–18:00'), 0);
  checa('às 18h em ponto já cobra', cobra(certa, '18:00–19:00'), 20);
  checa('depois das 18h cobra', cobra(certa, '20:00–22:00'), 20);

  // O erro que motivou este bloco: valor no campo da taxa normal.
  const errada = { [K + 'taxa']: '20', [K + 'hnoite']: '18:00', [K + 'taxanoite']: '' };
  checa('valor no campo errado cobra de manhã também', cobra(errada, '08:00–09:00'), 20);
  checa('e cobra o mesmo à noite', cobra(errada, '18:00–19:00'), 20);

  // Horário sem valor, e valor sem horário: nenhum dos dois faz efeito.
  checa('horário sem valor: vale a taxa normal o dia todo',
    cobra({ [K + 'taxa']: '5', [K + 'hnoite']: '18:00' }, '19:00–20:00'), 5);
  checa('valor sem horário: idem',
    cobra({ [K + 'taxa']: '5', [K + 'taxanoite']: '20' }, '19:00–20:00'), 5);

  // Sem horário escolhido ainda, mostra a taxa normal — não a especial.
  checa('sem horário escolhido usa a taxa normal', cobra(certa, ''), 0);

  // Sugestão de fábrica: vale enquanto o condomínio nunca configurou.
  checa('espaço nunca configurado usa a sugestão de fábrica',
    taxaDoHorario({}, 'Campo de Futebol', '08:00–09:00'), 20);
  checa('espaço nunca configurado e sem sugestão é gratuito',
    taxaDoHorario({}, 'Quadra de Areia', '08:00–09:00'), 0);

  // O caso que gerou o relato: o condomínio apagou a taxa do campo para
  // deixá-lo grátis de dia, e o sistema reinstalava os R$ 20 de fábrica —
  // cobrando o dia inteiro. Campo salvo em branco quer dizer SEM TAXA.
  const F = 'fin_campo_de_futebol_';
  const apagada = { [F + 'taxa']: '', [F + 'hnoite']: '18:00', [F + 'taxanoite']: '20' };
  checa('taxa apagada de propósito NÃO volta ao valor de fábrica',
    taxaDoHorario(apagada, 'Campo de Futebol', '14:00–16:00'), 0);
  checa('e a taxa do horário continua valendo',
    taxaDoHorario(apagada, 'Campo de Futebol', '18:00–19:00'), 20);
  checa('taxa apagada sem regra de horário: grátis o dia todo',
    taxaDoHorario({ [F + 'taxa']: '' }, 'Campo de Futebol', '20:00–21:00'), 0);
  checa('taxa zero explícita também é grátis',
    taxaDoHorario({ [F + 'taxa']: '0' }, 'Campo de Futebol', '08:00–09:00'), 0);
});

// ── Comprovante: qual documento o morador aceitou ──────────────────────
// Num processo, o que identifica a peça é o NOME do documento, não o
// endereço do arquivo. E o endereço pode ser trocado depois por outro PDF:
// por isso o nome é gravado NA RESERVA, no momento do aceite.
bloco('Comprovante — documento aceito', () => {
  const { _blocoAceiteTermo } = carregar(
    ['_blocoAceiteTermo', '_fmtDataHoraBR', 'escHtml'], {},
  );
  const doc = (r) => {
    const m = _blocoAceiteTermo(r).match(/Documento aceito<\/span><b>([\s\S]*?)<\/b>/);
    return m ? m[1] : '';
  };
  const base = { chkTermo: true, criadoEm: '2026-08-07T14:30:00Z',
                 criadoPor: 'morador@email.com', lote: 'L01' };

  const completo = doc({ ...base, termoNome: 'Termo de Uso do Salão — 2026',
                                  termoDoc: 'https://ex.com/t.pdf' });
  checa('mostra o nome do documento', completo.indexOf('Termo de Uso do Salão — 2026') === 0, true);
  checa('e o endereço do arquivo abaixo', completo.indexOf('https://ex.com/t.pdf') > 0, true);

  // Reserva feita antes de existir o campo do nome: não se inventa um.
  const soLink = doc({ ...base, termoDoc: 'https://ex.com/t.pdf' });
  checa('sem nome gravado, mostra o endereço', soLink.indexOf('https://ex.com/t.pdf') === 0, true);
  checa('e diz que o nome não foi registrado',
    soLink.indexOf('não registrado nesta reserva') > 0, true);

  checa('sem nada gravado, diz que não consta',
    doc({ ...base }).indexOf('não registrado') >= 0, true);

  // Sem aceite não há bloco de evidência nenhum.
  checa('sem aceite, o comprovante diz que não consta',
    _blocoAceiteTermo({ chkTermo: false }).indexOf('Não consta aceite registrado') > 0, true);

  // O nome do morador e a data continuam saindo.
  const bloco1 = _blocoAceiteTermo({ ...base, termoNome: 'X' });
  checa('quem aceitou aparece', bloco1.indexOf('morador@email.com') > 0, true);
  checa('a unidade aparece', bloco1.indexOf('L01') > 0, true);
});

// ── Quem está ligado a uma unidade ─────────────────────────────────────
// Duas fontes: o cadastro do condomínio (quem RESPONDE pela unidade) e as
// contas do aplicativo (quem USA o sistema). O cadastro manda; as contas
// entram marcadas, porque a divergência entre eles é informação — ou o
// cadastro envelheceu, ou alguém se cadastrou numa unidade que não é dele.
bloco('Pessoas da unidade: cadastro × contas do app', () => {
  const UNIDADES = { L01: { proprietario: 'C1', morador: 'C2' } };
  const CONDOMINOS = {
    C1: { nome: 'Maria Souza', telefone: '1133334444', email: 'maria@old.com',
          dependentes: [{ nome: 'Pedro Souza', telefone: '11955556666' }] },
    C2: { nome: 'João Souza', telefone: '11944443333' },
  };
  let CONTAS = [];

  // _usrCache NÃO entra como stub de propósito: stub é passado como
  // argumento e ficaria congelado no valor do momento da carga. Ficando
  // fora, é resolvido no escopo global e o teste consegue trocá-lo de
  // verdade a cada caso.
  const api = carregar(
    ['encPessoasDaUnidade', '_soDigitos', '_usrDaUnidade'],
    {
      getUnidades: () => UNIDADES,
      G: (k) => (k === 'condominos' ? CONDOMINOS : null),
    },
  );
  const pessoas = (uni) => { global._usrCache = CONTAS; return api.encPessoasDaUnidade(uni); };

  // Sem nenhuma conta no app: só o cadastro, como antes.
  CONTAS = [];
  let p = pessoas('L01');
  checa('titular, cônjuge e dependente', p.map((x) => x.nome),
    ['Maria Souza', 'Pedro Souza', 'João Souza']);
  checa('todos vindos do cadastro', p.every((x) => x.origem === 'cadastro'), true);

  // Mesma pessoa com telefone novo no app.
  CONTAS = [{ nome: 'Maria Souza', tel: '11988887777', email: 'maria@nova.com',
              unidade: 'L01', status: 'ativo' }];
  p = pessoas('L01');
  checa('não duplica quem já está no cadastro', p.length, 3);
  checa('guarda o telefone do app como alternativa',
    p.find((x) => x.nome === 'Maria Souza').telApp, '11988887777');
  checa('e o do cadastro continua lá',
    p.find((x) => x.nome === 'Maria Souza').tel, '1133334444');
  checa('marca que essa pessoa tem conta',
    p.find((x) => x.nome === 'Maria Souza').temConta, true);

  // Telefone igual, escrito diferente: não é divergência.
  CONTAS = [{ nome: 'Maria Souza', tel: '(11) 3333-4444', unidade: 'L01', status: 'ativo' }];
  checa('mesmo número com máscara não vira divergência',
    pessoas('L01').find((x) => x.nome === 'Maria Souza').telApp, undefined);

  // Alguém com conta para a unidade sem constar no cadastro.
  CONTAS = [{ nome: 'Carlos Estranho', tel: '11912345678', unidade: 'L01', status: 'ativo' }];
  p = pessoas('L01');
  checa('entra na lista, marcado', p.find((x) => x.nome === 'Carlos Estranho').origem, 'app');
  checa('sem apagar quem estava no cadastro', p.length, 4);

  // Conta bloqueada não deve entrar — o filtro é feito ao carregar.
  CONTAS = [{ nome: 'Maria Souza', tel: '11988887777', unidade: 'L02', status: 'ativo' }];
  checa('conta de outra unidade não aparece',
    pessoas('L01').find((x) => x.telApp), undefined);

  // Unidade que não existe no cadastro, mas tem conta no app.
  CONTAS = [{ nome: 'Ana Nova', tel: '11911112222', unidade: 'Z99', status: 'ativo' }];
  checa('unidade fora do cadastro ainda mostra quem tem conta',
    pessoas('Z99').map((x) => x.nome), ['Ana Nova']);

  checa('unidade sem nada devolve lista vazia', pessoas('X00'), []);
});

// ── Onde a conta do app entra no cadastro do condomínio ────────────────
// O formulário público só declara. Quem decide a posição no cadastro é a
// administração, na aprovação — que é o único momento em que dá para
// responder "dependente de quem?".
bloco('Conta do app → cadastro do condomínio', () => {
  let UNI, CON, SEQ, SALVOU, ESCOLHA, ESCOLHA_DE, CONFIRMOU, MARCA_TEL, CAIXA;

  function reset() {
    UNI = { L01: { proprietario: '0001', morador: '' }, L02: {} };
    CON = {
      '0001': { nome: 'João Silva', telefone: '11911112222',
                telefones: [{ numero: '11911112222', tipo: 'Celular' }], dependentes: [] },
    };
    SEQ = 1; SALVOU = []; ESCOLHA = 'nada'; ESCOLHA_DE = '0001';
    CONFIRMOU = true; MARCA_TEL = false; CAIXA = '';
  }
  reset();

  // Nenhuma variável mutável entra como stub: stub vira argumento e ficaria
  // congelado. Só entram FUNÇÕES, que leem as variáveis por closure e por
  // isso enxergam o valor do momento da chamada.
  const api = carregar(
    ['_musrNorm', '_musrCondsDaUnidade', '_musrJaNoCadastro', '_musrAplicarCadastro', '_soDigitos'],
    {
      getUnidades: () => UNI,
      getCondominos: () => CON,
      G: (k) => (k === 'condseq' ? SEQ : null),
      S: (k, v) => { SALVOU.push(k); if (k === 'condseq') SEQ = v; },
      conFormatCodigo: (n) => String(n).padStart(4, '0'),
      conProximoCodigoNum: () => {
        let m = SEQ;
        Object.keys(CON).forEach((c) => { const n = parseInt(c, 10); if (!isNaN(n) && n > m) m = n; });
        return m + 1;
      },
      confirm: () => CONFIRMOU,
      $: (id) => {
        if (id === 'musr-cad-box') return { style: { display: CAIXA } };
        if (id === 'musr-cad-de') return { value: ESCOLHA_DE };
        if (id === 'musr-cad-tel') return MARCA_TEL ? { checked: true } : null;
        return null;
      },
      document: { querySelector: () => ({ value: ESCOLHA }) },
    },
  );

  // ── Comparação de nomes ──
  checa('acento e maiúscula não separam a mesma pessoa',
    api._musrNorm('JOSÉ  da Silva'), api._musrNorm('jose da silva'));

  // ── Quem pode ter dependente ──
  checa('só proprietário e morador podem receber dependentes',
    api._musrCondsDaUnidade('L01').map((c) => c.nome), ['João Silva']);
  checa('unidade sem ninguém não oferece ninguém',
    api._musrCondsDaUnidade('L02'), []);
  UNI.L01.morador = '0009';
  CON['0009'] = { nome: 'Maria Silva', dependentes: [] };
  checa('havendo os dois, os dois podem ser o titular do dependente',
    api._musrCondsDaUnidade('L01').map((c) => c.nome + '/' + c.papel),
    ['João Silva/Proprietário', 'Maria Silva/Morador']);
  reset();

  // ── Já está no cadastro? ──
  checa('acha o proprietário pelo nome',
    api._musrJaNoCadastro('L01', 'joão silva').papel, 'proprietário');
  checa('quem não está, não está', api._musrJaNoCadastro('L01', 'Ana Nova'), null);

  // ── "Só liberar o acesso" não pode tocar no cadastro ──
  reset(); ESCOLHA = 'nada';
  checa('opção padrão não escreve nada', api._musrAplicarCadastro('Ana Nova', '11933334444', 'a@x.com', 'L01'), '');
  checa('e nada foi salvo', SALVOU, []);

  // ── Unidade que não existe: não se inventa lote ──
  reset(); ESCOLHA = 'morador';
  checa('unidade fora do cadastro não é criada', api._musrAplicarCadastro('Ana Nova', '', '', 'Z99'), '');
  checa('nem grava nada', SALVOU, []);

  // ── Entrar como morador de uma vaga vazia ──
  reset(); ESCOLHA = 'morador';
  let msg = api._musrAplicarCadastro('Ana Nova', '11933334444', 'ana@x.com', 'L01');
  checa('avisa o que fez', msg, 'Ana Nova entrou no cadastro como morador do L01.');
  checa('criou o condômino seguinte', Object.keys(CON).sort(), ['0001', '0002']);
  checa('ligou à unidade', UNI.L01.morador, '0002');
  checa('sem mexer no proprietário', UNI.L01.proprietario, '0001');
  checa('telefone do app foi junto', CON['0002'].telefone, '11933334444');

  // ── Dependente: o vínculo é com uma pessoa, não com a unidade ──
  reset(); ESCOLHA = 'dependente'; ESCOLHA_DE = '0001';
  msg = api._musrAplicarCadastro('Filho Silva', '11955556666', '', 'L01');
  checa('diz de quem é dependente', msg, 'Filho Silva entrou no cadastro como dependente de João Silva.');
  checa('entrou dentro do condômino', CON['0001'].dependentes.map((d) => d.nome), ['Filho Silva']);
  checa('com código derivado do titular', CON['0001'].dependentes[0].codigo, '0001-01');
  checa('não virou condômino solto', Object.keys(CON), ['0001']);

  // segundo dependente numera em sequência
  api._musrAplicarCadastro('Filha Silva', '', '', 'L01');
  checa('o segundo dependente continua a contagem', CON['0001'].dependentes[1].codigo, '0001-02');

  // ── Trocar o proprietário exige confirmação ──
  reset(); ESCOLHA = 'proprietario'; CONFIRMOU = false;
  checa('recusada a troca, nada acontece', api._musrAplicarCadastro('Ana Nova', '', '', 'L01'), '');
  checa('proprietário continua o mesmo', UNI.L01.proprietario, '0001');

  reset(); ESCOLHA = 'proprietario'; CONFIRMOU = true;
  api._musrAplicarCadastro('Ana Nova', '', '', 'L01');
  checa('confirmada, a posição troca', UNI.L01.proprietario, '0002');
  checa('e o cadastro do anterior NÃO é apagado', CON['0001'].nome, 'João Silva');

  // ── Não duplicar quem já é condômino em outra unidade ──
  reset(); ESCOLHA = 'morador';
  CON['0007'] = { nome: 'Ana Nova', telefone: '', dependentes: [] };
  api._musrAplicarCadastro('Ana Nova', '', '', 'L01');
  checa('reaproveita o condômino existente', UNI.L01.morador, '0007');
  checa('sem criar um segundo registro dela', Object.keys(CON).sort(), ['0001', '0007']);

  // Havendo dois com o mesmo nome é ambíguo: cria novo em vez de chutar.
  reset(); ESCOLHA = 'morador';
  CON['0007'] = { nome: 'Ana Nova', dependentes: [] };
  CON['0008'] = { nome: 'ANA NOVA', dependentes: [] };
  api._musrAplicarCadastro('Ana Nova', '', '', 'L01');
  checa('nome ambíguo não é resolvido no chute', UNI.L01.morador, '0009');

  // ── Atualizar telefone de quem já está no cadastro ──
  reset(); MARCA_TEL = false;
  checa('sem marcar a caixa, telefone não muda',
    api._musrAplicarCadastro('João Silva', '11999998888', '', 'L01'), '');
  checa('telefone intacto', CON['0001'].telefone, '11911112222');

  reset(); MARCA_TEL = true;
  msg = api._musrAplicarCadastro('João Silva', '11999998888', '', 'L01');
  checa('marcando, atualiza', msg, 'Telefone de João Silva atualizado no cadastro.');
  checa('no campo simples', CON['0001'].telefone, '11999998888');
  checa('e na lista de telefones', CON['0001'].telefones[0].numero, '11999998888');
  checa('não criou condômino nenhum', Object.keys(CON), ['0001']);

  // ── A caixa escondida não age ──
  reset(); ESCOLHA = 'morador'; CAIXA = 'none';
  checa('bloco oculto não escreve', api._musrAplicarCadastro('Ana Nova', '', '', 'L01'), '');
});

// ── Carga que falhou não pode virar gravação destrutiva ────────────────
// _sincronizarTabela apaga do banco tudo que não estiver no objeto. Certo
// quando o objeto veio do banco; destruidor quando a leitura falhou e o
// objeto ficou vazio.
bloco('Carga falha não apaga o banco', () => {
  // Nada mutável entra como stub: stub vira argumento e congela. SB e
  // _CARGA_OK ficam no escopo global para o teste conseguir trocá-los.
  const api = carregar(['_cargaMarcar', '_cargaConfiavel', '_sincronizarTabela'], {
    _NORM: {
      unidades:   { tabela: 'unidades',   pk: 'cod', hasCond: true },
      condominos: { tabela: 'condominos', pk: 'cod', hasCond: true },
    },
    _condAtual: 'APVC',
    console: { error: () => {} },
  });

  // ── Quem pode gravar ──
  global.SB = { fake: true };
  global._CARGA_OK = {};
  checa('sem ter carregado, não grava', api._cargaConfiavel('condominos'), false);
  api._cargaMarcar('condominos', true);
  checa('depois de carregar, grava', api._cargaConfiavel('condominos'), true);
  checa('uma chave não libera a outra', api._cargaConfiavel('unidades'), false);

  checa('reservas não dependem disso (vão linha a linha)',
    api._cargaConfiavel('reservas'), true);

  checa('configurações dependem da carga dos módulos',
    api._cargaConfiavel('cfg_reservas'), false);
  api._cargaMarcar('__modulos', true);
  checa('carregados os módulos, as configurações liberam',
    api._cargaConfiavel('cfg_reservas'), true);

  api._cargaMarcar('condominos', false);
  checa('desmarcar volta a bloquear', api._cargaConfiavel('condominos'), false);

  global.SB = null;
  global._CARGA_OK = {};
  checa('sem banco não há o que destruir', api._cargaConfiavel('condominos'), true);

  // ── Salvar NUNCA apaga ──
  // Antes o sincronismo mandava a lista inteira e o banco removia o que
  // nao estivesse nela: um aparelho com a lista velha levava embora o
  // cadastro que o outro tinha acabado de criar.
  function sbFalso(registro) {
    const q = {
      eq(col, val){ (registro.eq = registro.eq || []).push(col + '=' + val); return q; },
      then(res){ return Promise.resolve({ error: null }).then(res); },
    };
    return { from(t){ registro.tabela = t; return {
      upsert(rows){ registro.upsertou = rows.length; return Promise.resolve({ error: null }); },
      delete(){ registro.deletou = true; return q; },
    }; } };
  }
  const cfg = { tabela: 'condominos', pk: 'cod', hasCond: true,
                toRow: (k, v) => ({ cod: k, nome: v.nome }) };

  let reg = {};
  global.SB = sbFalso(reg);
  return api._sincronizarTabela(cfg, {}).then(() => {
    checa('objeto vazio não grava nem apaga', [!!reg.deletou, reg.upsertou], [false, undefined]);

    reg = {}; global.SB = sbFalso(reg);
    return api._sincronizarTabela(cfg, { '0001': { nome: 'João' }, '0002': { nome: 'Maria' } });
  }).then(() => {
    checa('com dados, grava as duas linhas', reg.upsertou, 2);
    // O CORACAO DA CORRECAO: salvar so acrescenta e atualiza.
    checa('salvar NUNCA apaga, nem com lista completa', !!reg.deletou, false);

    // ── Apagar virou pedido proprio, de um registro so ──
    reg = {};
    const apiEx = carregar(['_excluirLinhaSB'], {
      _NORM: { condominos: cfg },
      _condAtual: 'APVC',
      _isSuper: false,
      _podeGravarModulo: () => true,
      SB: sbFalso(reg),          // o stub entra na carga, nao depois
    });
    return apiEx._excluirLinhaSB('condominos', '0007').then((r) => {
      checa('exclusão pede delete de verdade', !!reg.deletou, true);
      checa('só do registro pedido, e dentro do condomínio',
        reg.eq, ['cod=0007', 'condominio_id=APVC']);
      checa('e diz que deu certo', r.ok, true);
    });
  }).then(() => {
    // Modulo em bloco nao tem linha para apagar: nao pode explodir.
    const apiB = carregar(['_excluirLinhaSB'], {
      _NORM: {}, _condAtual: 'APVC', _isSuper: false,
      _podeGravarModulo: () => true, SB: sbFalso({}),
    });
    return apiB._excluirLinhaSB('comun', 'x').then((r) => {
      checa('módulo em bloco é ignorado sem erro', r.ok, true);
    });
  }).then(() => {
    // Sem permissao, nao apaga.
    let reg2 = {};
    const apiP = carregar(['_excluirLinhaSB'], {
      _NORM: { condominos: cfg }, _condAtual: 'APVC', _isSuper: false,
      _podeGravarModulo: () => false, SB: sbFalso(reg2),
    });
    return apiP._excluirLinhaSB('condominos', '0007').then((r) => {
      checa('sem permissão não apaga nada', [!!reg2.deletou, r.ok], [false, false]);
    });
  });
});

// ── Lembrete das reservas que estão para começar ───────────────────────
bloco('Lembrete "daqui a X tem a reserva do Fulano"', () => {
  let RESERVAS = [];
  const JANELA = { _userNivel: 'admin' };
  let GUARDADO = {};

  const api = carregar(
    ['_resComecaEm', '_reslQuando', '_reslVistos', '_reslMarcar', '_reslCalado', '_reslPendentes',
     '_reslFrase', 'hrIni', 'hrFim', '_minHora'],
    {
      window: JANELA,
      G: () => RESERVAS,
      localStorage: {
        getItem: (k) => (GUARDADO[k] === undefined ? null : GUARDADO[k]),
        setItem: (k, v) => { GUARDADO[k] = v; },
      },
      escHtml: (v) => String(v == null ? '' : v),
      _RESL_JANELA: 60,
      _RESL_REPETIR_MIN: 15,
    },
  );

  // Monta uma reserva que começa daqui a `mins` minutos e dura `dur`.
  function daquiA(id, nome, mins, dur) {
    const ini = new Date(Date.now() + mins * 60000);
    const fim = new Date(ini.getTime() + dur * 60000);
    const hh = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return { id, nome, espaco: 'Quadra', lote: 'D17', status: 'confirmada',
             data: ini.getFullYear() + '-' + String(ini.getMonth() + 1).padStart(2, '0')
                   + '-' + String(ini.getDate()).padStart(2, '0'),
             horario: hh(ini) + '–' + hh(fim) };
  }
  const nomes = () => api._reslPendentes().map((x) => x.fase + ':' + x.r.nome);

  // ── A janela ──
  RESERVAS = [daquiA(1, 'Lucas', 45, 120)];
  checa('reserva daqui a 45min entra como "breve"', nomes(), ['breve:Lucas']);

  RESERVAS = [daquiA(2, 'Ana', 300, 120)];
  checa('daqui a 5 horas ainda não avisa', nomes(), []);

  RESERVAS = [daquiA(3, 'Bruno', -10, 120)];
  checa('começou há 10min e ainda está rolando: "agora"', nomes(), ['agora:Bruno']);

  RESERVAS = [daquiA(4, 'Carla', -180, 120)];
  checa('já terminou, não avisa mais', nomes(), []);

  // ── O que não deve aparecer ──
  RESERVAS = [Object.assign(daquiA(5, 'Diego', 30, 60), { status: 'cancelada' })];
  checa('cancelada não avisa', nomes(), []);
  RESERVAS = [Object.assign(daquiA(6, 'Elis', 30, 60), { status: 'realizada' })];
  checa('realizada não avisa', nomes(), []);
  RESERVAS = [Object.assign(daquiA(7, 'Fabio', 30, 60), { data: '' })];
  checa('sem data não quebra nem avisa', nomes(), []);

  // ── Só quem administra ──
  RESERVAS = [daquiA(8, 'Gil', 30, 60)];
  JANELA._userNivel = 'morador';
  checa('morador não recebe o lembrete', nomes(), []);
  JANELA._userNivel = 'supervisor';
  checa('supervisor recebe', nomes(), ['breve:Gil']);
  JANELA._userNivel = 'admin';

  // ── Não repetir o mesmo aviso ──
  RESERVAS = [daquiA(9, 'Helena', 30, 60)];
  checa('primeira vez avisa', nomes(), ['breve:Helena']);
  api._reslMarcar(['9|breve']);
  checa('depois de visto, não repete', nomes(), []);

  // A MESMA reserva volta a avisar quando de fato começa: é outra fase,
  // e é o segundo aviso que interessa de verdade.
  RESERVAS = [daquiA(9, 'Helena', -5, 60)];
  checa('mas volta a avisar quando começa', nomes(), ['agora:Helena']);
  api._reslMarcar(['9|agora']);
  checa('e esse também só uma vez', nomes(), []);

  // Marca de ontem não cala o aviso de hoje.
  GUARDADO['apvc_res_lembrete'] = JSON.stringify({ dia: '2020-01-01', marcas: { '9|agora': Date.now() } });
  checa('marca de outro dia é descartada', nomes(), ['agora:Helena']);

  // A insistência é o ponto: passados 15 minutos, o aviso VOLTA.
  const hoje_ = new Date().toISOString().slice(0, 10);
  GUARDADO['apvc_res_lembrete'] = JSON.stringify(
    { dia: hoje_, marcas: { '9|agora': Date.now() - 5 * 60000 } });
  checa('5 minutos depois ainda cala', nomes(), []);
  GUARDADO['apvc_res_lembrete'] = JSON.stringify(
    { dia: hoje_, marcas: { '9|agora': Date.now() - 16 * 60000 } });
  checa('16 minutos depois volta a avisar', nomes(), ['agora:Helena']);

  // ── Ordem e frase ──
  RESERVAS = [daquiA(10, 'Ivo', 50, 60), daquiA(11, 'Julia', 10, 60), daquiA(12, 'Kim', -5, 60)];
  GUARDADO = {};
  checa('o mais próximo primeiro', api._reslPendentes().map((x) => x.r.nome),
    ['Kim', 'Julia', 'Ivo']);

  const frase = (mins, fase) => api._reslFrase({ r: { nome: 'Lucas' }, mins, fase });
  checa('agora', frase(0, 'agora'), 'Agora vai ter a reserva do(a) <b>Lucas</b>');
  checa('45 minutos', frase(45, 'breve'), 'Daqui a 45 minutos tem a reserva do(a) <b>Lucas</b>');
  checa('1 minuto no singular', frase(1, 'breve'), 'Daqui a 1 minuto tem a reserva do(a) <b>Lucas</b>');
  checa('60 minutos vira "1 hora"', frase(60, 'breve'), 'Daqui a 1 hora tem a reserva do(a) <b>Lucas</b>');
  checa('reserva sem nome não deixa a frase torta',
    api._reslFrase({ r: { nome: '' }, mins: 0, fase: 'agora' }),
    'Agora vai ter a reserva do(a) <b>sem nome</b>');
});

// ── Reservas com pagamento não confirmado ──────────────────────────────
bloco('Aviso de pagamento pendente', () => {
  let RESERVAS = [];
  const JANELA = { _userNivel: 'admin' };
  let GUARDADO = {};

  const api = carregar(
    ['_resComecaEm', '_reslVistos', '_reslMarcar', '_reslCalado', '_reslPagamentos',
     'hrIni', 'hrFim', '_minHora'],
    {
      window: JANELA,
      G: () => RESERVAS,
      localStorage: {
        getItem: (k) => (GUARDADO[k] === undefined ? null : GUARDADO[k]),
        setItem: (k, v) => { GUARDADO[k] = v; },
      },
      _RESL_ATRASO_MAX: 60,
      _RESL_AVISO_H: 48,
      _RESL_REPETIR_MIN: 15,
    },
  );

  // Reserva começando daqui a `horas` (negativo = já passou).
  function em(id, nome, horas, extra) {
    const ini = new Date(Date.now() + horas * 3600000);
    const p = (n) => String(n).padStart(2, '0');
    return Object.assign({
      id, nome, espaco: 'Salão', lote: 'D17', status: 'confirmada',
      pgto: 'pendente', taxa: 1500,
      data: ini.getFullYear() + '-' + p(ini.getMonth() + 1) + '-' + p(ini.getDate()),
      horario: p(ini.getHours()) + ':' + p(ini.getMinutes()) + '–23:59',
    }, extra || {});
  }
  const fases = () => api._reslPagamentos().map((x) => x.fase + ':' + x.r.nome);

  // ── A janela de cobrança ──
  RESERVAS = [em(1, 'Lucas', -24)];
  checa('usou ontem e não pagou: atrasado', fases(), ['atrasado:Lucas']);

  RESERVAS = [em(2, 'Ana', 24)];
  checa('usa amanhã e não pagou: a receber', fases(), ['areceber:Ana']);

  RESERVAS = [em(3, 'Bruno', 240)];
  checa('daqui a 10 dias ainda não incomoda', fases(), []);

  RESERVAS = [em(4, 'Carla', -24 * 90)];
  checa('atraso de 90 dias sai da lista', fases(), []);

  // ── O que não é pendência ──
  RESERVAS = [em(5, 'Diego', -24, { pgto: 'pago' })];
  checa('pago não aparece', fases(), []);
  RESERVAS = [em(6, 'Elis', -24, { pgto: 'isento' })];
  checa('isento é decisão tomada, não pendência', fases(), []);
  RESERVAS = [em(7, 'Fabio', -24, { taxa: 0 })];
  checa('sem taxa não há o que cobrar', fases(), []);
  RESERVAS = [em(8, 'Gil', -24, { taxa: null })];
  checa('taxa vazia também não', fases(), []);
  RESERVAS = [em(9, 'Hugo', -24, { status: 'cancelada' })];
  checa('cancelada não se cobra', fases(), []);
  RESERVAS = [em(10, 'Ines', -24, { data: '' })];
  checa('sem data não quebra', fases(), []);

  // Reserva realizada e não paga CONTINUA sendo cobrada: o serviço foi
  // prestado, a dívida existe.
  RESERVAS = [em(11, 'Joao', -24, { status: 'realizada' })];
  checa('realizada e não paga continua na lista', fases(), ['atrasado:Joao']);

  // ── Quem vê ──
  RESERVAS = [em(12, 'Kelly', -24)];
  JANELA._userNivel = 'morador';
  checa('morador não vê pendência de pagamento', fases(), []);
  JANELA._userNivel = 'gestor';
  checa('gestor vê', fases(), ['atrasado:Kelly']);
  JANELA._userNivel = 'admin';

  // ── Não repetir ──
  checa('avisa uma vez', fases(), ['atrasado:Kelly']);
  api._reslMarcar(['12|pgto']);
  checa('logo depois, cala', fases(), []);
  // Cobranca em aberto tem de voltar: some da vista e ninguem lembra dela.
  const hoje2 = new Date().toISOString().slice(0, 10);
  GUARDADO['apvc_res_lembrete'] = JSON.stringify(
    { dia: hoje2, marcas: { '12|pgto': Date.now() - 16 * 60000 } });
  checa('16 minutos depois a cobranca volta', fases(), ['atrasado:Kelly']);

  // ── Ordem: atrasados na frente, o mais antigo primeiro ──
  GUARDADO = {};
  RESERVAS = [em(20, 'Novo', 12), em(21, 'Antigo', -240), em(22, 'Recente', -12)];
  checa('atrasados antes dos futuros, mais antigo na frente',
    api._reslPagamentos().map((x) => x.r.nome), ['Antigo', 'Recente', 'Novo']);

  checa('o valor devido acompanha a linha',
    api._reslPagamentos()[0].taxa, 1500);
});

// ── Pix abre sozinho depois da reserva ─────────────────────────────────
// Dois modais abertos ao mesmo tempo se atrapalham, então o aviso da
// reserva encadeia o Pix para quando for fechado.
bloco('Aviso da reserva encadeia o Pix', () => {
  const eventos = [];
  // _avisoReservaDepois fica FORA dos stubs de propósito: stub vira
  // argumento e congelaria; global, o teste vê o valor de verdade.
  const api = carregar(['mostrarAvisoReserva', 'fecharAvisoReserva'], {
    $: (id) => ({ textContent: '', classList: { add(){} } }),
    document: { createElement: () => ({ classList:{add(){}}, style:{}, innerHTML:'' }),
                body: { appendChild(){} } },
    closeModal: (id) => eventos.push('fechou:' + id),
    console: { error: (...a) => eventos.push('erro') },
  });

  // Sem ação encadeada: fecha e pronto.
  global._avisoReservaDepois = null;
  api.fecharAvisoReserva();
  checa('sem ação encadeada, só fecha', eventos, ['fechou:m-aviso-reserva']);

  // Com ação: roda ao fechar.
  eventos.length = 0;
  global._avisoReservaDepois = () => eventos.push('abriu o Pix');
  api.fecharAvisoReserva();
  checa('fecha o aviso e então abre o Pix', eventos,
    ['fechou:m-aviso-reserva', 'abriu o Pix']);

  // E não fica pendurada para a próxima reserva.
  eventos.length = 0;
  api.fecharAvisoReserva();
  checa('a ação não se repete no próximo aviso', eventos, ['fechou:m-aviso-reserva']);
  checa('a ação foi mesmo zerada', global._avisoReservaDepois, null);

  // Ação que quebra não derruba o fechamento nem contamina a próxima.
  eventos.length = 0;
  global._avisoReservaDepois = () => { throw new Error('Pix falhou'); };
  api.fecharAvisoReserva();
  checa('ação que falha é contida', eventos, ['fechou:m-aviso-reserva', 'erro']);
  checa('e mesmo falhando, foi zerada', global._avisoReservaDepois, null);

  // mostrarAvisoReserva só aceita função; qualquer outra coisa vira null.
  api.mostrarAvisoReserva('oi', 'isto não é função');
  checa('valor que não é função não vira ação', global._avisoReservaDepois, null);
  const f = () => {};
  api.mostrarAvisoReserva('oi', f);
  checa('função é aceita', global._avisoReservaDepois, f);
});

// ── Confirmar pagamento pelo card ──────────────────────────────────────
bloco('Marcar pago / desmarcar', async () => {
  const CACHE = {};
  let RESPOSTA = { ok: true };
  const avisos = [];
  const hoje = new Date().toISOString().slice(0, 10);

  const api = carregar(['marcarPagoReserva'], {
    G: () => CACHE.reservas,
    DB_CACHE: CACHE,
    localStorage: { setItem(){}, getItem: () => null },
    renderReservas: () => {},
    verificarAlertas: () => {},
    toast: (m) => avisos.push(m),
    _reservaUpsertSB: async () => RESPOSTA,
  });

  const reserva = (extra) => Object.assign(
    { id: 1, nome: 'Lucas', taxa: 1500, pgto: 'pendente', dataPgto: '' }, extra || {});
  const r0 = () => CACHE.reservas[0];

  // Confirmar
  CACHE.reservas = [reserva()];
  await api.marcarPagoReserva(1, true);
  checa('vira pago', r0().pgto, 'pago');
  checa('grava a data de hoje', r0().dataPgto, hoje);
  checa('avisa a confirmação', avisos.pop(), '✓ Pagamento confirmado.');

  // Data já existente não é sobrescrita: se o admin registrou que o
  // dinheiro entrou dia 5, confirmar hoje não muda esse fato.
  CACHE.reservas = [reserva({ dataPgto: '2026-08-05' })];
  await api.marcarPagoReserva(1, true);
  checa('data de pagamento anterior é preservada', r0().dataPgto, '2026-08-05');

  // Desmarcar
  CACHE.reservas = [reserva({ pgto: 'pago', dataPgto: hoje })];
  await api.marcarPagoReserva(1, false);
  checa('volta para pendente', r0().pgto, 'pendente');
  checa('limpa a data — não fica data de pagamento em reserva não paga',
    r0().dataPgto, '');
  checa('avisa que voltou', avisos.pop(), 'Pagamento voltou para pendente.');

  // Servidor recusa: desfaz OS DOIS campos, senão o card diria "Pago"
  // de algo que o banco não gravou.
  RESPOSTA = { ok: false, erro: 'RLS' };
  CACHE.reservas = [reserva()];
  await api.marcarPagoReserva(1, true);
  checa('servidor recusou: pgto volta ao que era', r0().pgto, 'pendente');
  checa('servidor recusou: data volta ao que era', r0().dataPgto, '');
  checa('e o erro é dito, não engolido',
    avisos.pop(), '⚠️ Não foi possível alterar o pagamento: RLS');

  // Desfazer também restaura a data anterior, não apaga.
  CACHE.reservas = [reserva({ pgto: 'pago', dataPgto: '2026-08-05' })];
  await api.marcarPagoReserva(1, false);
  checa('desfazer restaura a data que existia', r0().dataPgto, '2026-08-05');
  checa('e o status também', r0().pgto, 'pago');

  // Id inexistente não quebra nem inventa reserva.
  RESPOSTA = { ok: true };
  CACHE.reservas = [reserva()];
  await api.marcarPagoReserva(999, true);
  checa('id que não existe é ignorado', r0().pgto, 'pendente');
  checa('e não cria reserva nenhuma', CACHE.reservas.length, 1);
});

// ── Aprovar com a taxa em aberto ───────────────────────────────────────
bloco('Aprovação avisa quando o pagamento não foi confirmado', () => {
  let RESERVAS = [], perguntas = [], RESPOSTA = true, mudou = [];
  const api = carregar(['aprovarReserva', '_waAdministracao'], {
    G: () => RESERVAS,
    fmt: (v) => 'R$ ' + Number(v).toFixed(2),
    confirm: (m) => { perguntas.push(m); return RESPOSTA; },
    _mudarStatusReserva: (id, st) => mudou.push(id + '→' + st),
    _getAlertDestinos: () => [{ label: 'Portaria', whats: '' },
                              { label: 'Síndico', whats: '(11) 91234-5678' }],
  });
  const r = (extra) => Object.assign({ id: 1, taxa: 1500, pgto: 'pendente' }, extra || {});
  const reset = () => { perguntas = []; mudou = []; };

  // Taxa pendente → pergunta antes.
  reset(); RESERVAS = [r()]; RESPOSTA = true;
  api.aprovarReserva(1);
  checa('pergunta antes de aprovar', perguntas.length, 1);
  checa('e diz o valor em aberto', perguntas[0].includes('R$ 1500.00'), true);
  checa('confirmando, aprova', mudou, ['1→confirmada']);

  // Recusando a pergunta, NÃO aprova — o ponto todo do aviso.
  reset(); RESERVAS = [r()]; RESPOSTA = false;
  api.aprovarReserva(1);
  checa('recusando, não aprova', mudou, []);

  // Já pago, isento ou sem taxa: aprova direto, sem atrapalhar.
  RESPOSTA = true;
  reset(); RESERVAS = [r({ pgto: 'pago' })];
  api.aprovarReserva(1);
  checa('pago não pergunta', perguntas.length, 0);
  checa('e aprova', mudou, ['1→confirmada']);

  reset(); RESERVAS = [r({ pgto: 'isento' })];
  api.aprovarReserva(1);
  checa('isento não pergunta', perguntas.length, 0);

  reset(); RESERVAS = [r({ taxa: 0 })];
  api.aprovarReserva(1);
  checa('sem taxa não pergunta', perguntas.length, 0);
  checa('e aprova normal', mudou, ['1→confirmada']);

  // Reserva que não existe: aprova sem quebrar (o status cuida do resto).
  reset(); RESERVAS = [];
  api.aprovarReserva(99);
  checa('id inexistente não quebra nem pergunta', perguntas.length, 0);

  // WhatsApp da administração: pula setor sem número.
  checa('usa o primeiro setor COM número', api._waAdministracao(), '(11) 91234-5678');
});

// ── Histórico de lembretes ─────────────────────────────────────────────
bloco('Lembretes recentes', () => {
  let GUARDADO = {};
  const api = carregar(['_reslHistLer', '_reslHistGravar', '_reslQuandoFoi'], {
    localStorage: {
      getItem: (k) => (GUARDADO[k] === undefined ? null : GUARDADO[k]),
      setItem: (k, v) => { GUARDADO[k] = v; },
    },
    _RESL_HIST_DIAS: 7,
    _RESL_HIST_MAX: 30,
  });
  const agora = Date.now();
  const dias = (n) => agora - n * 86400000;
  const chaves = () => api._reslHistLer().map((x) => x.chave);

  GUARDADO = {};
  api._reslHistGravar([{ chave: 'a', ts: agora, texto: 'x', detalhe: 'y' }]);
  checa('guarda o que apareceu', chaves(), ['a']);

  // O mesmo aviso não entra duas vezes — senão o histórico vira ruído.
  api._reslHistGravar([{ chave: 'a', ts: agora + 5, texto: 'x', detalhe: 'y' }]);
  checa('não duplica o mesmo aviso', chaves(), ['a']);

  api._reslHistGravar([{ chave: 'b', ts: agora + 10, texto: 'x', detalhe: 'y' }]);
  checa('mais recente vem na frente', chaves(), ['b', 'a']);

  // Some sozinho depois de 7 dias.
  GUARDADO = {};
  api._reslHistGravar([{ chave: 'velho', ts: dias(9), texto: 'x', detalhe: 'y' },
                       { chave: 'novo', ts: agora, texto: 'x', detalhe: 'y' }]);
  checa('descarta o que passou de 7 dias', chaves(), ['novo']);

  // Não cresce para sempre.
  GUARDADO = {};
  const muitos = [];
  for (let i = 0; i < 45; i++) muitos.push({ chave: 'k' + i, ts: agora - i * 1000, texto: 'x', detalhe: 'y' });
  api._reslHistGravar(muitos);
  checa('guarda no máximo 30', api._reslHistLer().length, 30);
  checa('e mantém os mais recentes', chaves()[0], 'k0');

  // Lixo no armazenamento não derruba a tela.
  GUARDADO = { apvc_res_lembrete_hist: '{isto não é json' };
  checa('conteúdo inválido vira lista vazia', api._reslHistLer(), []);
  GUARDADO = { apvc_res_lembrete_hist: '{"a":1}' };
  checa('objeto em vez de lista também', api._reslHistLer(), []);

  // Como a hora é mostrada.
  const hoje = new Date(); hoje.setHours(14, 32, 0, 0);
  checa('hoje mostra a hora', api._reslQuandoFoi(hoje.getTime()), 'hoje 14:32');
  const ontem = new Date(hoje.getTime() - 86400000);
  checa('ontem é dito por extenso', api._reslQuandoFoi(ontem.getTime()), 'ontem 14:32');
  const antes = new Date(hoje.getTime() - 3 * 86400000);
  const dd = String(antes.getDate()).padStart(2, '0') + '/' + String(antes.getMonth() + 1).padStart(2, '0');
  checa('mais antigo mostra a data', api._reslQuandoFoi(antes.getTime()), dd + ' 14:32');
});

// ── Filtro inicial da lista de reservas ────────────────────────────────
bloco('Filtro inicial: padrão do condomínio + preferência da pessoa', () => {
  let CFG = {}, GUARDADO = {}, select = { value: 'inicial' }, redesenhou = 0;
  const JANELA = {};
  const api = carregar(
    ['_resFiltroChave', '_resFiltroDoCondominio', '_resFiltroInicial',
     'resFiltroStatusMudou', 'aplicarFiltroInicialRes'],
    {
      getCfgRes: () => CFG,
      _condAtual: 'APVC',
      window: JANELA,
      $: () => select,
      renderReservas: () => { redesenhou++; },
      localStorage: {
        getItem: (k) => (k in GUARDADO ? GUARDADO[k] : null),
        setItem: (k, v) => { GUARDADO[k] = String(v); },
        removeItem: (k) => { delete GUARDADO[k]; },
      },
    },
  );
  const CHAVE = 'apvc_res_filtro_APVC';
  const reset = () => { CFG = {}; GUARDADO = {}; JANELA._resFiltroAplicado = false; };

  checa('a chave separa por condomínio', api._resFiltroChave(), CHAVE);

  // ── Padrão do condomínio ──
  reset();
  checa('sem configuração, abre em "todas"', api._resFiltroDoCondominio(), 'todas');
  CFG = { filtro_inicial: '' };
  checa('configurado para "de hoje em diante"', api._resFiltroDoCondominio(), '');
  CFG = { filtro_inicial: 'todas' };
  checa('configurado para "todas"', api._resFiltroDoCondominio(), 'todas');
  // Valor estranho na configuração não pode virar um filtro inválido.
  CFG = { filtro_inicial: 'bananas' };
  checa('valor invalido cai no padrão', api._resFiltroDoCondominio(), 'todas');
  CFG = { filtro_inicial: null };
  checa('nulo também', api._resFiltroDoCondominio(), 'todas');

  // ── A pessoa manda no próprio aparelho ──
  reset(); CFG = { filtro_inicial: 'todas' };
  checa('sem escolha da pessoa, vale o do condomínio', api._resFiltroInicial(), 'todas');
  GUARDADO[CHAVE] = '';
  // A pegadinha: "" é uma ESCOLHA (de hoje em diante), não "não escolheu".
  checa('escolha vazia é respeitada, não confundida com ausência',
    api._resFiltroInicial(), '');
  GUARDADO[CHAVE] = 'pendente';
  checa('e qualquer outra escolha também', api._resFiltroInicial(), 'pendente');
  delete GUARDADO[CHAVE];
  checa('apagada a escolha, volta o do condomínio', api._resFiltroInicial(), 'todas');

  // ── Mexer no filtro grava ──
  reset();
  select.value = ''; redesenhou = 0;
  api.resFiltroStatusMudou();
  checa('mexer no filtro guarda a escolha', GUARDADO[CHAVE], '');
  checa('e redesenha a lista', redesenhou, 1);
  select.value = 'cancelada';
  api.resFiltroStatusMudou();
  checa('troca de novo, guarda a nova', GUARDADO[CHAVE], 'cancelada');

  // ── Ao abrir a tela ──
  reset(); CFG = { filtro_inicial: '' }; select.value = 'sujeira';
  api.aplicarFiltroInicialRes();
  checa('abrir a tela aplica o inicial', select.value, '');
  // Não pode reaplicar e apagar o que a pessoa acabou de escolher.
  select.value = 'pendente';
  api.aplicarFiltroInicialRes();
  checa('voltar à tela não desfaz a escolha da sessão', select.value, 'pendente');
});

// ── Dois administradores no mesmo módulo em bloco ──────────────────────
bloco('Conflito ao gravar módulo em bloco', () => {
  const LIDO = {};
  let noServidor, gravou, avisos;

  const api = carregar(['_modBlocoGravar'], {
    _MOD_LIDO_EM: LIDO,
    _condAtual: 'APVC',
    toast: (m) => avisos.push(m),
    console: { error: () => {} },
    SB: { from: () => ({
      select: () => ({
        eq: function(){ return this; },
        maybeSingle: async () => ({ data: { atualizado_em: noServidor }, error: null }),
      }),
      upsert(row){
        gravou = row;
        return { select: () => ({ maybeSingle: async () => ({
          data: { atualizado_em: '2026-08-12T18:00:00Z' }, error: null }) }) };
      },
    }) },
  });

  const reset = () => { gravou = null; avisos = []; };
  const AVISO = '⚠️ Outra pessoa alterou isto enquanto você editava. '
              + 'Nada foi gravado — recarregue a página (F5) e refaça a alteração.';

  return (async () => {
    // Ninguém mexeu: grava normal.
    reset(); LIDO.infogerais = '2026-08-12T10:00:00Z'; noServidor = '2026-08-12T10:00:00Z';
    let r = await api._modBlocoGravar('infogerais', { x: 1 });
    checa('servidor igual ao que li: grava', r.ok, true);
    checa('e o conteúdo vai mesmo', gravou.valor, { x: 1 });
    checa('preso ao condomínio', gravou.condominio_id, 'APVC');

    // A gravação vira a nova base — senão o próprio aparelho acusaria
    // conflito consigo mesmo no salvar seguinte.
    checa('o carimbo é atualizado após gravar',
      LIDO.infogerais, '2026-08-12T18:00:00Z');
    reset(); noServidor = '2026-08-12T18:00:00Z';
    r = await api._modBlocoGravar('infogerais', { x: 2 });
    checa('salvar duas vezes seguidas não acusa conflito falso', r.ok, true);

    // Outra pessoa mexeu no meio: NÃO grava e avisa.
    reset(); LIDO.comun = '2026-08-12T10:00:00Z'; noServidor = '2026-08-12T11:30:00Z';
    r = await api._modBlocoGravar('comun', { y: 9 });
    checa('servidor mais novo: recusa', [r.ok, r.conflito], [false, true]);
    checa('e NADA foi gravado por cima', gravou, null);
    checa('a pessoa é avisada, não fica no escuro', avisos[0], AVISO);

    // Sem carimbo conhecido (1ª gravação, ou leitura que falhou): grava.
    // Travar sem base de comparação seria só atrapalhar.
    reset(); delete LIDO.novo; noServidor = '2026-08-12T11:30:00Z';
    r = await api._modBlocoGravar('novo', { z: 1 });
    checa('sem carimbo conhecido, grava', r.ok, true);
    checa('e não avisa nada', avisos.length, 0);

    // Módulo que ainda não existe no servidor.
    reset(); LIDO.zerado = '2026-08-12T10:00:00Z'; noServidor = null;
    r = await api._modBlocoGravar('zerado', { a: 1 });
    checa('sem linha no servidor, grava sem reclamar', r.ok, true);
  })();
});

Promise.all(_pendentes).then(() => {
  console.log('\n' + '-'.repeat(50));
  console.log(falhas === 0 ? `TODOS OS TESTES PASSARAM (${ok})` : `${ok} passaram, ${falhas} FALHARAM`);
  process.exit(falhas === 0 ? 0 : 1);
});
