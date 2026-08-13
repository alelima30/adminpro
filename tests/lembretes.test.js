// Testes dos lembretes de reserva do AdminPro.
// Rodar:  node tests/lembretes.test.js
//
// As funções são lidas do próprio adminpro.html (ver tests/extrair.js),
// então o teste valida exatamente o código que vai para o ar.
//
// O que motivou este arquivo: marcar uma reserva como PAGA fazia a cobrança
// REAPARECER. O histórico guardava a frase pronta, congelada no dia — ela
// não tinha como saber que o dinheiro entrou depois.
//
// Hoje a janelinha guarda só CHAVE + HORA, e a frase é remontada da reserva
// a cada desenho. Os testes abaixo cobrem essa promessa: nada que dependa
// de estado atual (pagamento, cancelamento) pode sobreviver congelado.

const { carregar } = require('./extrair');

let ok = 0, falhas = 0;
function checa(descricao, obtido, esperado) {
  const igual = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (igual) { ok++; console.log('  ✓ ' + descricao); }
  else { falhas++; console.log('  ✗ ' + descricao + '\n      esperado: ' + JSON.stringify(esperado) + '\n      obtido:   ' + JSON.stringify(obtido)); }
}
function bloco(titulo, fn) { console.log('\n' + titulo); fn(); }

// ── Ambiente mínimo ───────────────────────────────────────────────────
let RESERVAS = [];
let STORE = {};
let COND = 'APVC';

const stubs = {
  G: (k) => (k === 'reservas' ? RESERVAS : []),
  localStorage: {
    getItem: (k) => (k in STORE ? STORE[k] : null),
    setItem: (k, v) => { STORE[k] = v; },
  },
  // O código lê _condAtual direto; aqui ele muda entre os blocos.
  get _condAtual() { return COND; },
  fmt: (v) => 'R$ ' + Number(v || 0).toFixed(2),
  escHtml: (v) => String(v == null ? '' : v),
  _RESL_HIST_DIAS: 7,
  _RESL_HIST_MAX: 30,
  _RESL_REPETIR_MIN: 15,
};

const api = carregar(
  ['_reslChaveLS', '_reslStore', '_reslStoreSalvar', '_reslCalado', '_reslMarcar',
   '_reslRegistrar', '_reslHistLinha', '_reslHistorico', '_reslFraseSimples',
   '_reslDetalhe', '_reslHojeISO'],
  stubs,
);

const AGORA = Date.now();
const FABRICIO = { id: 99, nome: 'Fabricio', espaco: 'Salão', horario: '14:00–18:00',
                   lote: 'A1', status: 'confirmada', pgto: 'pendente', taxa: 150 };

function zera(reservas = [], apareceu = {}, vistos = {}) {
  RESERVAS = reservas;
  STORE = {};
  STORE['apvc_resl_' + COND] = JSON.stringify({ apareceu, vistos });
}
const chaves = () => api._reslHistorico().map((x) => x.chave);

// ── A cobrança que já foi paga ────────────────────────────────────────
bloco('Cobrança em aberto continua cobrando', () => {
  zera([FABRICIO], { '99|pgto': AGORA });
  checa('quem não pagou aparece', chaves(), ['99|pgto']);
  checa('e a frase é montada com o valor de agora',
        api._reslHistorico()[0].texto, 'Fabricio — taxa de R$ 150.00 em aberto');
});

bloco('Pagou: a cobrança some (era o bug)', () => {
  zera([{ ...FABRICIO, pgto: 'pago' }], { '99|pgto': AGORA });
  checa('não aparece mais', chaves(), []);
  // A chave continua guardada — não é preciso apagar nada para ela sumir
  // da tela, e é isso que impede a leitura de destruir dado.
  checa('e o armazenamento não foi mexido',
        Object.keys(JSON.parse(STORE['apvc_resl_' + COND]).apareceu), ['99|pgto']);
});

bloco('Outros jeitos de a cobrança deixar de existir', () => {
  zera([{ ...FABRICIO, pgto: 'isento' }], { '99|pgto': AGORA });
  checa('isento não é pendência', chaves(), []);

  zera([{ ...FABRICIO, status: 'cancelada' }], { '99|pgto': AGORA });
  checa('reserva cancelada não cobra', chaves(), []);

  zera([{ ...FABRICIO, taxa: 0 }], { '99|pgto': AGORA });
  checa('taxa zerada depois não cobra', chaves(), []);

  zera([{ id: 7, nome: 'Outra', status: 'confirmada', pgto: 'pendente', taxa: 10 }],
       { '99|pgto': AGORA });
  checa('reserva apagada não cobra', chaves(), []);
});

// ── O caso que destruía dado ──────────────────────────────────────────
bloco('Reservas ainda não carregadas não apagam nada', () => {
  zera([], { '99|pgto': AGORA });
  checa('com a lista vazia, não mostra', chaves(), []);
  checa('mas também não apaga',
        Object.keys(JSON.parse(STORE['apvc_resl_' + COND]).apareceu), ['99|pgto']);

  RESERVAS = null;
  checa('cache nulo não quebra nem apaga', chaves(), []);

  // Chegaram os dados: a linha volta sozinha, sem nada ter sido perdido.
  RESERVAS = [FABRICIO];
  checa('com os dados na mão, a cobrança reaparece', chaves(), ['99|pgto']);
});

// ── O que o histórico deve preservar ──────────────────────────────────
bloco('Fato do passado continua sendo fato', () => {
  zera([{ ...FABRICIO, pgto: 'pago' }], { '99|agora': AGORA });
  const h = api._reslHistorico();
  checa('"a reserva começou" não vence com o pagamento', h.length, 1);
  checa('e o texto é remontado da reserva', h[0].texto, 'Começou a reserva de Fabricio');
});

bloco('Ids parecidos não se confundem', () => {
  zera([{ id: '9',  nome: 'Nove',    status: 'confirmada', pgto: 'pendente', taxa: 50 },
        { id: '99', nome: 'Noventa', status: 'confirmada', pgto: 'pago',     taxa: 150 }],
       { '9|pgto': AGORA, '99|pgto': AGORA });
  checa('só o devedor de verdade sobra', chaves(), ['9|pgto']);
});

bloco('Avisos velhos saem por idade', () => {
  zera([FABRICIO], { '99|pgto': AGORA - 8 * 86400000 });
  checa('mais de 7 dias não aparece', chaves(), []);
});

bloco('Armazenamento corrompido não derruba a tela', () => {
  RESERVAS = [FABRICIO];
  STORE['apvc_resl_' + COND] = '{isto não é json';
  checa('lixo vira histórico vazio', chaves(), []);
  STORE['apvc_resl_' + COND] = '{"apareceu":"nao é objeto"}';
  checa('campo com tipo errado vira vazio', chaves(), []);
  checa('chave sem fase não quebra', api._reslHistLinha('semfase', AGORA), null);
});

// ── Silêncio de 15 minutos ────────────────────────────────────────────
bloco('Aviso dispensado cala por 15 minutos', () => {
  zera([FABRICIO]);
  api._reslMarcar(['99|pgto']);
  const vistos = api._reslStore().vistos;
  checa('logo depois de dispensar, está calado', api._reslCalado(vistos, '99|pgto'), true);
  checa('16 minutos depois, volta',
        api._reslCalado({ '99|pgto': AGORA - 16 * 60000 }, '99|pgto'), false);
  checa('o que nunca foi dispensado não está calado',
        api._reslCalado(vistos, '77|pgto'), false);
});

// ── Isolamento entre condomínios ──────────────────────────────────────
// O histórico guarda id de reserva, e id só significa algo dentro do
// condomínio onde nasceu. Antes as chaves eram únicas do navegador:
// trocar de condomínio mostrava cobrança do outro e, pior, apagava o
// histórico do primeiro ao tomar aqueles ids por reservas excluídas.
bloco('Cada condomínio tem o seu registro', () => {
  // O código lê _condAtual direto da variável, e o carregador do teste
  // fixa o valor no momento em que monta as funções. Então cada condomínio
  // precisa da sua própria cópia — é o mais perto que dá de simular a troca
  // sem subir a página inteira.
  const paraCond = (cond) => carregar(
    ['_reslChaveLS', '_reslStore', '_reslStoreSalvar', '_reslRegistrar',
     '_reslHistLinha', '_reslHistorico', '_reslFraseSimples', '_reslDetalhe'],
    { ...stubs, _condAtual: cond },
  );
  const apvc = paraCond('APVC');
  const outro = paraCond('OUTRO');

  checa('cada um usa a sua chave de armazenamento',
        [apvc._reslChaveLS(), outro._reslChaveLS()],
        ['apvc_resl_APVC', 'apvc_resl_OUTRO']);

  STORE = {};
  RESERVAS = [FABRICIO];
  apvc._reslRegistrar(['99|pgto']);
  checa('gravou no registro do APVC',
        apvc._reslHistorico().map((x) => x.chave), ['99|pgto']);

  // Mesmo com a MESMA reserva à vista, o outro condomínio não enxerga o
  // registro do primeiro — é o que impedia a cobrança de vazar de um para
  // o outro, e o que impedia o segundo de apagar o histórico do primeiro.
  checa('o outro condomínio não vê nada disso',
        outro._reslHistorico().map((x) => x.chave), []);

  outro._reslRegistrar(['99|pgto']);
  checa('e ao gravar, não sobrescreve o do primeiro',
        Object.keys(JSON.parse(STORE['apvc_resl_APVC']).apareceu), ['99|pgto']);
  checa('cada chave guarda o seu',
        Object.keys(STORE).sort(), ['apvc_resl_APVC', 'apvc_resl_OUTRO']);
});

// ── Poda na gravação ──────────────────────────────────────────────────
bloco('O registro não cresce para sempre', () => {
  COND = 'APVC';
  STORE = {};
  const muitos = {};
  for (let i = 0; i < 50; i++) muitos[i + '|pgto'] = AGORA - i * 1000;
  muitos['velho|pgto'] = AGORA - 30 * 86400000;
  api._reslStoreSalvar({ apareceu: muitos, vistos: {} });
  const salvos = Object.keys(JSON.parse(STORE['apvc_resl_APVC']).apareceu);
  checa('corta no teto de 30', salvos.length, 30);
  checa('e o que passou do prazo não entra', salvos.includes('velho|pgto'), false);
  checa('ficam os mais recentes', salvos.includes('0|pgto'), true);
});

// ── A data de hoje ────────────────────────────────────────────────────
bloco('Data de hoje', () => {
  const d = new Date();
  const esperado = d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
  checa('usa o fuso de quem está olhando, não UTC', api._reslHojeISO(), esperado);
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.log('FALHARAM ' + falhas + ' DE ' + (ok + falhas)); process.exit(1); }
console.log('TODOS OS TESTES PASSARAM (' + ok + ')');
console.log('-'.repeat(50));
