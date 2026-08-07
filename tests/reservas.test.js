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

console.log('\n' + '-'.repeat(50));
console.log(falhas === 0 ? `TODOS OS TESTES PASSARAM (${ok})` : `${ok} passaram, ${falhas} FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
