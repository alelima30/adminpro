// Testes do cadastro de localizações (as ruas).
// Rodar:  node tests/localizacoes.test.js
//
// As funções são lidas do próprio adminpro.html (ver tests/extrair.js).
//
// O código da rua vinha em branco e a pessoa inventava o número. Cadastrando
// trinta ruas de um condomínio novo, são trinta chances de repetir um código
// — e repetir código aqui SUBSTITUÍA a rua anterior sem avisar, porque esta
// tela não tinha a proteção que o cadastro de unidades já tinha.

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

const { _locProximoCodigo } = carregar(['_locProximoCodigo']);
const prox = (cods) => {
  const d = {};
  (cods || []).forEach((c) => { d[c] = { tipo: 'Rua', nome: 'x' }; });
  return _locProximoCodigo(d);
};

// ── A sequência 1, 2, 3 ───────────────────────────────────────────────
bloco('O próximo código sai sozinho', () => {
  checa('condomínio novo começa no 1', prox([]), '1');
  checa('depois do 1 vem o 2', prox(['1']), '2');
  checa('depois de 1,2,3 vem o 4', prox(['1', '2', '3']), '4');
  checa('sem dados nenhum também dá 1', _locProximoCodigo(null), '1');
});

bloco('O formato acompanha o que a casa já usa', () => {
  // Quem chegou primeiro define o padrão: não adianta eu impor "4" onde as
  // ruas existentes são "001", "002", "003".
  checa('três dígitos continuam três dígitos', prox(['001', '002', '003']), '004');
  checa('dois dígitos continuam dois', prox(['01', '02']), '03');
  checa('número cru continua cru', prox(['1', '2']), '3');
  checa('um só, com zeros, mantém o formato', prox(['007']), '008');

  // Ao virar a casa decimal o número CRESCE, em vez de ser truncado.
  checa('009 vira 010', prox(['001', '009']), '010');
  checa('099 vira 100', prox(['099']), '100');
  checa('999 vira 1000, e não 000', prox(['999']), '1000');
});

// ── Buracos e bagunça não podem repetir código ────────────────────────
bloco('Nunca devolve um código que já existe', () => {
  // O ponto todo: se sair um número já usado, salvar apaga a rua anterior.
  checa('buraco no meio não é reaproveitado', prox(['1', '2', '5']), '6');
  checa('fora de ordem também', prox(['10', '3', '7']), '11');
  checa('repetido some na conta', prox(['2', '2', '1']), '3');

  const usados = ['1', '2', '3', '5', '8', '13'];
  checa('o resultado não está entre os existentes', usados.includes(prox(usados)), false);
});

bloco('Códigos que não são número não atrapalham', () => {
  // Alguém pode ter cadastrado "AV-CENTRAL" à mão. Isso não entra na conta,
  // mas o cadastro continua valendo — o campo segue livre para digitar.
  checa('texto no meio é ignorado', prox(['1', 'AV-CENTRAL', '2']), '3');
  checa('só texto volta para o 1', prox(['AV-CENTRAL', 'BECO-A']), '1');
  checa('espaço em volta não confunde', prox([' 4 ', '2']), '5');
  checa('número com letra não conta', prox(['1', '2A']), '2');
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.error('FALHARAM ' + falhas + ' DE ' + (ok + falhas)); process.exit(1); }
console.log('TODOS OS TESTES PASSARAM (' + ok + ')');
console.log('-'.repeat(50));
