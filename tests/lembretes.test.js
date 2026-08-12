// Testes dos lembretes de reserva do AdminPro.
// Rodar:  node tests/lembretes.test.js
//
// As funções são lidas do próprio adminpro.html (ver tests/extrair.js),
// então o teste valida exatamente o código que vai para o ar.
//
// O que motivou este arquivo: marcar uma reserva como PAGA fazia a cobrança
// REAPARECER. O aviso saía da lista de pendências, deixava de ser filtrado
// como "já está na tela" e voltava pelo histórico, ainda dizendo que a
// pessoa devia. Quem pagava virava o único nome na tela.

const { carregar } = require('./extrair');

let ok = 0, falhas = 0;
function checa(descricao, obtido, esperado) {
  const igual = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (igual) { ok++; console.log('  ✓ ' + descricao); }
  else { falhas++; console.log('  ✗ ' + descricao + '\n      esperado: ' + JSON.stringify(esperado) + '\n      obtido:   ' + JSON.stringify(obtido)); }
}
function bloco(titulo, fn) { console.log('\n' + titulo); fn(); }

// ── Ambiente mínimo: as reservas e o armazenamento do navegador ────────
let RESERVAS = [];
const STORE = {};
const stubs = {
  G: (k) => (k === 'reservas' ? RESERVAS : []),
  localStorage: {
    getItem: (k) => (k in STORE ? STORE[k] : null),
    setItem: (k, v) => { STORE[k] = v; },
  },
  _RESL_HIST_DIAS: 7,
};

const { _reslHistLer, _reslHistPgtoVencido, _reslHojeISO } =
  carregar(['_reslHistLer', '_reslHistPgtoVencido', '_reslHojeISO'], stubs);

const AGORA = Date.now();
const AVISO_FABRICIO = {
  chave: '99|pgto', ts: AGORA,
  texto: 'Fabricio — taxa de R$ 150,00 em aberto',
  detalhe: 'Salão de Festas • 14:00–18:00',
};

function cenario(reservas, historico) {
  RESERVAS = reservas;
  STORE['apvc_res_lembrete_hist'] = JSON.stringify(historico);
}

// ── A cobrança que já foi paga ─────────────────────────────────────────
bloco('Cobrança em aberto continua cobrando', () => {
  cenario([{ id: 99, status: 'confirmada', pgto: 'pendente', taxa: 150 }], [AVISO_FABRICIO]);
  checa('quem não pagou aparece', _reslHistLer().length, 1);
});

bloco('Pagou: a cobrança tem de sumir (era o bug)', () => {
  cenario([{ id: 99, status: 'confirmada', pgto: 'pago', taxa: 150 }], [AVISO_FABRICIO]);
  checa('não aparece mais', _reslHistLer().length, 0);
  checa('e sai do armazenamento, não volta amanhã',
        JSON.parse(STORE['apvc_res_lembrete_hist']).length, 0);
});

bloco('Outros jeitos de a cobrança deixar de existir', () => {
  cenario([{ id: 99, status: 'confirmada', pgto: 'isento', taxa: 150 }], [AVISO_FABRICIO]);
  checa('isento não é pendência', _reslHistLer().length, 0);

  cenario([{ id: 99, status: 'cancelada', pgto: 'pendente', taxa: 150 }], [AVISO_FABRICIO]);
  checa('reserva cancelada não cobra', _reslHistLer().length, 0);

  cenario([{ id: 99, status: 'confirmada', pgto: 'pendente', taxa: 0 }], [AVISO_FABRICIO]);
  checa('taxa zerada depois não cobra', _reslHistLer().length, 0);

  cenario([], [AVISO_FABRICIO]);
  checa('reserva apagada não cobra', _reslHistLer().length, 0);
});

// ── O que o histórico deve preservar ───────────────────────────────────
bloco('Fato do passado continua sendo fato', () => {
  cenario([{ id: 99, status: 'confirmada', pgto: 'pago', taxa: 150 }],
          [{ chave: '99|agora', ts: AGORA, texto: 'Começou a reserva de Fabricio' }]);
  checa('"a reserva começou" não vence com o pagamento', _reslHistLer().length, 1);
});

bloco('Ids parecidos não se confundem', () => {
  cenario([{ id: '9',  status: 'confirmada', pgto: 'pendente', taxa: 50 },
           { id: '99', status: 'confirmada', pgto: 'pago',     taxa: 150 }],
          [{ chave: '9|pgto', ts: AGORA }, { chave: '99|pgto', ts: AGORA }]);
  const r = _reslHistLer();
  checa('só o devedor de verdade sobra', r.map((x) => x.chave), ['9|pgto']);
});

bloco('Avisos velhos saem por idade', () => {
  const velho = AGORA - 8 * 86400000;   // 8 dias: passou dos 7
  cenario([{ id: 99, status: 'confirmada', pgto: 'pendente', taxa: 150 }],
          [{ chave: '99|pgto', ts: velho }]);
  checa('mais de 7 dias não aparece', _reslHistLer().length, 0);
});

bloco('Armazenamento corrompido não derruba a tela', () => {
  RESERVAS = [];
  STORE['apvc_res_lembrete_hist'] = '{isto não é json';
  checa('lixo vira lista vazia', _reslHistLer(), []);
  STORE['apvc_res_lembrete_hist'] = '{"nao":"array"}';
  checa('objeto no lugar de lista vira lista vazia', _reslHistLer(), []);
});

// ── A data de hoje, do ponto de vista de quem olha ─────────────────────
bloco('Data de hoje', () => {
  const d = new Date();
  const esperado = d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
  checa('usa o fuso de quem está olhando, não UTC', _reslHojeISO(), esperado);
  checa('formato aceito pelo campo de data', /^\d{4}-\d{2}-\d{2}$/.test(_reslHojeISO()), true);
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.log('FALHARAM ' + falhas + ' DE ' + (ok + falhas)); process.exit(1); }
console.log('TODOS OS TESTES PASSARAM (' + ok + ')');
console.log('-'.repeat(50));
