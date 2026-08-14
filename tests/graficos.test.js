// Testes do desenho de gráficos.
// Rodar:  node tests/graficos.test.js
//
// As funções são lidas do próprio adminpro.html (ver tests/extrair.js).
//
// O Chart.js vem de um CDN externo. Quando ele não chega — internet do
// condomínio bloqueando o domínio, CDN fora do ar, app aberto offline (que o
// service worker promete) — "new Chart" estourava e a exceção subia,
// ABORTANDO o resto da função de desenho da tela.
//
// Não custava só o gráfico: em Inadimplência o gráfico vem ANTES da tabela de
// devedores, em Censo de Lotes antes do histórico, em Financeiro antes das
// listas de receitas e despesas. Sem o CDN essas telas apareciam pela metade,
// sem nada explicando. É isso que estes testes impedem de voltar.

const { carregar } = require('./extrair');

let ok = 0, falhas = 0;
function checa(descricao, obtido, esperado) {
  const igual = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (igual) { ok++; console.log('  ✓ ' + descricao); }
  else {
    falhas++;
    console.log('  ✗ ' + descricao +
      '\n      esperado: ' + JSON.stringify(esperado) +
      '\n      obtido:   ' + JSON.stringify(obtido));
  }
}
function bloco(titulo, fn) { console.log('\n' + titulo); fn(); }

// Um <canvas> de mentira, com o pai onde o recado é pendurado.
function canvasFalso() {
  const pai = {
    filhos: [],
    querySelector: (sel) => pai.filhos.find((f) => ('.' + f.className) === sel) || null,
    appendChild: (f) => { pai.filhos.push(f); },
  };
  return { style: {}, parentNode: pai, _pai: pai };
}

function ambiente(Chart, opcoes) {
  const o = opcoes || {};
  const alvo = canvasFalso();
  const charts = {};
  const stubs = {
    $: () => alvo,
    charts,
    Chart,
    console: { error: () => {} },
    document: {
      createElement: () => ({ className: '', style: { cssText: '' }, textContent: '' }),
    },
  };
  if (o.chartAnterior) charts['g1'] = o.chartAnterior;
  const api = carregar(['mkChart', '_chartIndisponivel'], stubs);
  return { api, alvo, charts };
}

// ── Sem o Chart.js ────────────────────────────────────────────────────
bloco('Sem a biblioteca de gráficos, a tela não cai', () => {
  const { api, alvo } = ambiente(undefined);

  let estourou = false;
  try { api.mkChart('g1', { type: 'bar' }); } catch (_) { estourou = true; }

  // O ponto todo: quem chamou continua rodando e desenha a tabela depois.
  checa('mkChart não lança exceção', estourou, false);
  checa('o canvas some', alvo.style.display, 'none');
  checa('e um recado toma o lugar', alvo._pai.filhos.length, 1);
  checa('o recado explica o motivo',
        /não foi possível carregar o gráfico/i.test(alvo._pai.filhos[0].textContent), true);
  checa('e diz que os dados continuam certos',
        /dados abaixo continuam corretos/i.test(alvo._pai.filhos[0].textContent), true);
  checa('o recado é texto, nunca HTML', typeof alvo._pai.filhos[0].textContent, 'string');
});

bloco('Duas chamadas não empilham dois recados', () => {
  const { api, alvo } = ambiente(undefined);
  api.mkChart('g1', {});
  api.mkChart('g1', {});
  checa('continua com um recado só', alvo._pai.filhos.length, 1);
});

// ── Com o Chart.js, mas quebrando ─────────────────────────────────────
bloco('Biblioteca presente que falha também não derruba', () => {
  function ChartRuim() { throw new Error('config inválida'); }
  const { api, alvo } = ambiente(ChartRuim);

  let estourou = false;
  try { api.mkChart('g1', { type: 'nao-existe' }); } catch (_) { estourou = true; }

  checa('erro fica contido', estourou, false);
  checa('e a pessoa vê o recado', alvo._pai.filhos.length, 1);
});

// ── Caminho normal ────────────────────────────────────────────────────
bloco('Com tudo funcionando, o gráfico é desenhado', () => {
  let criados = 0;
  function ChartBom() { criados++; this.destroy = () => {}; }
  const { api, alvo, charts } = ambiente(ChartBom);

  api.mkChart('g1', { type: 'bar' });
  checa('o gráfico foi criado', criados, 1);
  checa('nenhum recado de falha aparece', alvo._pai.filhos.length, 0);
  checa('e ele fica guardado para ser trocado depois', !!charts['g1'], true);
});

bloco('Trocar de gráfico destrói o anterior', () => {
  let destruiu = 0;
  function ChartBom() { this.destroy = () => {}; }
  const anterior = { destroy: () => { destruiu++; } };
  const { api } = ambiente(ChartBom, { chartAnterior: anterior });

  api.mkChart('g1', { type: 'bar' });
  checa('o antigo foi descartado', destruiu, 1);
});

bloco('Gráfico velho que não destrói não impede o novo', () => {
  // destroy() estourando deixava o charts[id] antigo preso e a tela quebrada.
  let criados = 0;
  function ChartBom() { criados++; this.destroy = () => {}; }
  const ruim = { destroy: () => { throw new Error('já foi removido'); } };
  const { api } = ambiente(ChartBom, { chartAnterior: ruim });

  let estourou = false;
  try { api.mkChart('g1', {}); } catch (_) { estourou = true; }
  checa('não estoura', estourou, false);
  checa('e o novo é desenhado', criados, 1);
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.error('FALHARAM ' + falhas + ' DE ' + (ok + falhas)); process.exit(1); }
console.log('TODOS OS TESTES PASSARAM (' + ok + ')');
console.log('-'.repeat(50));
