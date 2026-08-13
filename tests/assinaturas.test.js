// Testes do controle de assinaturas (clientes da plataforma).
// Rodar:  node tests/assinaturas.test.js
//
// As funções são lidas do próprio adminpro.html (ver tests/extrair.js).
//
// Aqui mora a conta que vira nota fiscal. Errar por um centavo em cada
// unidade, num condomínio de 329, são R$ 3,29 por mês que ninguém confere —
// e a conta antiga precisa continuar batendo com a nota já emitida.

const { carregar } = require('./extrair');

let ok = 0, falhas = 0;
function checa(descricao, obtido, esperado) {
  const igual = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (igual) { ok++; console.log('  ✓ ' + descricao); }
  else { falhas++; console.log('  ✗ ' + descricao + '\n      esperado: ' + JSON.stringify(esperado) + '\n      obtido:   ' + JSON.stringify(obtido)); }
}
function bloco(titulo, fn) { console.log('\n' + titulo); fn(); }

const { assinValorMes, assinSituacaoCobranca, assinVencimento } =
  carregar(['assinValorMes', 'assinSituacaoCobranca', 'assinVencimento'],
           { _reslHojeISO: () => '2026-08-13' });

// ── A conta do mês ────────────────────────────────────────────────────
bloco('Valor do mês: por unidade, com piso opcional', () => {
  checa('329 unidades × R$ 2,50', assinValorMes(2.5, 329, null), 822.5);
  checa('sem piso definido, vale a conta', assinValorMes(1, 100, null), 100);
  checa('piso menor que a conta não interfere', assinValorMes(2, 100, 150), 200);
  checa('piso maior que a conta prevalece', assinValorMes(2, 30, 150), 150);
  checa('piso igual à conta', assinValorMes(2, 75, 150), 150);
});

bloco('Centavos não escapam', () => {
  // 0.07 × 3 dá 0.21000000000000002 em ponto flutuante. Sem arredondar,
  // isso vira o valor gravado na cobrança e some com um centavo na nota.
  checa('multiplicação quebrada é arredondada', assinValorMes(0.07, 3, null), 0.21);
  checa('valor alto continua exato', assinValorMes(12.34, 329, null), 4059.86);
  checa('centavo cheio × muitas unidades', assinValorMes(0.01, 329, null), 3.29);

  // O preço unitário é arredondado para centavos ANTES de multiplicar — que é
  // o mesmo que o banco faz, porque a coluna é numeric(10,2). Terceira casa
  // não existe nem na tela (step 0,01) nem no banco; se chegar aqui, some do
  // mesmo jeito nos dois lugares, em vez de a conta divergir da nota.
  checa('terceira casa arredonda para cima', assinValorMes(1.019, 3, null), 3.06);
  checa('terceira casa arredonda para baixo', assinValorMes(1.011, 3, null), 3.03);
});

bloco('Entradas ruins não viram cobrança errada', () => {
  checa('sem valor por unidade dá zero', assinValorMes(null, 300, null), 0);
  checa('texto vazio dá zero', assinValorMes('', 300, null), 0);
  checa('condomínio sem unidades dá zero', assinValorMes(5, 0, null), 0);
  checa('unidades indefinidas dão zero', assinValorMes(5, undefined, null), 0);
  checa('valor negativo é tratado como zero', assinValorMes(-5, 100, null), 0);
  checa('piso negativo é ignorado', assinValorMes(2, 10, -99), 20);
  checa('texto no lugar de número dá zero', assinValorMes('abc', 10, null), 0);
  // Sem valor e sem unidades, mas COM piso: o piso ainda vale — é o caso do
  // cliente de valor fechado, que é o piso e mais nada.
  checa('só o piso, sem unidades', assinValorMes(0, 0, 200), 200);
});

// ── Vencimento ────────────────────────────────────────────────────────
bloco('Vencimento cai dentro do mês', () => {
  checa('dia normal', assinVencimento('2026-08', 10), '2026-08-10');
  checa('dia 1', assinVencimento('2026-08', 1), '2026-08-01');
  checa('dia 28 em fevereiro', assinVencimento('2026-02', 28), '2026-02-28');
  // O campo é limitado a 28 na tela justamente por isto, mas a função não
  // pode depender da tela: se um dia entrar 31, fevereiro não pode virar março.
  checa('dia 31 em fevereiro cai no último dia', assinVencimento('2026-02', 31), '2026-02-28');
  checa('dia 31 em abril cai no dia 30', assinVencimento('2026-04', 31), '2026-04-30');
  checa('ano bissexto tem 29 de fevereiro', assinVencimento('2028-02', 31), '2028-02-29');
  checa('dezembro não vira janeiro', assinVencimento('2026-12', 31), '2026-12-31');
  checa('sem dia definido usa o 10', assinVencimento('2026-08', null), '2026-08-10');
  checa('competência inválida não inventa data', assinVencimento('', 10), '');
  checa('competência sem mês também não', assinVencimento('2026', 10), '');
});

// ── Situação da cobrança ──────────────────────────────────────────────
bloco('Situação do pagamento', () => {
  const em = (c) => assinSituacaoCobranca(c, '2026-08-13').chave;

  checa('sem cobrança gerada', em(null), 'sem');
  checa('pago é pago, mesmo vencido', em({ pago_em: '2026-08-20', vencimento: '2026-08-10' }), 'pago');
  checa('vence hoje ainda está em aberto', em({ pago_em: null, vencimento: '2026-08-13' }), 'aberto');
  checa('vence amanhã está em aberto', em({ pago_em: null, vencimento: '2026-08-14' }), 'aberto');
  checa('venceu ontem está vencido', em({ pago_em: null, vencimento: '2026-08-12' }), 'vencido');
  checa('pagamento em branco não conta como pago',
        em({ pago_em: '', vencimento: '2026-08-01' }), 'vencido');

  checa('cada situação tem texto próprio',
        [em(null), em({ pago_em: '2026-08-01' }), em({ vencimento: '2026-09-01' })],
        ['sem', 'pago', 'aberto']);
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.log('FALHARAM ' + falhas + ' DE ' + (ok + falhas)); process.exit(1); }
console.log('TODOS OS TESTES PASSARAM (' + ok + ')');
console.log('-'.repeat(50));
