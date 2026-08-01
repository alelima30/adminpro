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
function montar(cfg, nivel) {
  return carregar(['reservaViolaRegra', '_chvEsp', 'hrIni', 'hrFim'], {
    getCfgRes: () => cfg,
    window: { _userNivel: nivel || 'morador' },
    G: () => [],
    _DIAS_SEM: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'],
  });
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

// ── Resultado ──────────────────────────────────────────────────────────
console.log('\n' + '-'.repeat(50));
console.log(falhas === 0 ? `TODOS OS TESTES PASSARAM (${ok})` : `${ok} passaram, ${falhas} FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
