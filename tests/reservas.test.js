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
function bloco(titulo, fn) { console.log('\n' + titulo); fn(); }

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

console.log('\n' + '-'.repeat(50));
console.log(falhas === 0 ? `TODOS OS TESTES PASSARAM (${ok})` : `${ok} passaram, ${falhas} FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
