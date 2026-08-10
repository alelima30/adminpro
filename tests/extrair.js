// Extrai funções do adminpro.html para poderem ser testadas em Node.
// O app é um arquivo único; em vez de duplicar o código nos testes,
// lemos as funções reais direto do HTML — assim o teste valida o que está no ar.

const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'adminpro.html');

function lerFonte() {
  return fs.readFileSync(HTML, 'utf8');
}

// Recorta "function nome(...) { ... }" equilibrando as chaves.
function recortarFuncao(src, nome) {
  const marca = 'function ' + nome + '(';
  let ini = src.indexOf(marca);
  if (ini < 0) throw new Error('Função não encontrada no adminpro.html: ' + nome);
  // "async function X" começa em "function": sem levar o "async" junto, o
  // corpo extraído tem await sem async e nem chega a ser código válido.
  const ASYNC = 'async ';
  if (src.slice(ini - ASYNC.length, ini) === ASYNC) ini -= ASYNC.length;

  const abre = src.indexOf('{', ini);
  let nivel = 0;
  for (let i = abre; i < src.length; i++) {
    const c = src[i];
    if (c === '{') nivel++;
    else if (c === '}') {
      nivel--;
      if (nivel === 0) return src.slice(ini, i + 1);
    }
  }
  throw new Error('Não consegui delimitar a função: ' + nome);
}

// Carrega as funções pedidas num escopo isolado, com os "stubs" informados.
function carregar(nomes, stubs = {}) {
  const src = lerFonte();
  const corpo = nomes.map((n) => recortarFuncao(src, n)).join('\n');
  const chaves = Object.keys(stubs);
  const fabrica = new Function(
    ...chaves,
    corpo + '\nreturn {' + nomes.join(',') + '};',
  );
  return fabrica(...chaves.map((k) => stubs[k]));
}

module.exports = { carregar, recortarFuncao, lerFonte };
