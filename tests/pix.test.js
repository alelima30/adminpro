// Testes do código Pix "copia e cola" (BR Code do Banco Central).
// Rodar:  node tests/pix.test.js
//
// As funções são lidas do próprio adminpro.html (ver tests/extrair.js).
//
// Desde 14/08/2026 não existe mais imagem de QR Code no sistema: este código
// é o ÚNICO caminho para o morador pagar a taxa da reserva. Se ele sair
// errado, o pagamento não acontece — e o banco recusa em silêncio, sem dizer
// o que está errado. Por isso o formato está fixado aqui.

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

const { _pixCampo, _pixTexto, _pixCRC, pixCopiaECola } =
  carregar(['_pixCampo', '_pixTexto', '_pixCRC', 'pixCopiaECola']);

const CHAVE = '12345678900';
const codigo = (valor, txid) =>
  pixCopiaECola(CHAVE, 'CONDOMINIO VILLAGE CASTELO', 'FLORIANOPOLIS', valor, txid || 'RESR1');

// ── Formato do BR Code ────────────────────────────────────────────────
bloco('O código sai no formato que o banco entende', () => {
  const c = codigo(150);
  checa('começa com a versão do payload', c.slice(0, 6), '000201');
  checa('declara o arranjo Pix', c.includes('0014br.gov.bcb.pix'), true);
  checa('leva a chave do condomínio', c.includes(CHAVE), true);
  checa('moeda é o real (986)', c.includes('5303986'), true);
  checa('país é BR', c.includes('5802BR'), true);
  checa('termina com o CRC de 4 dígitos', /6304[0-9A-F]{4}$/.test(c), true);
});

// ── O valor ───────────────────────────────────────────────────────────
bloco('O valor da taxa entra com duas casas', () => {
  checa('R$ 150 vira 150.00', codigo(150).includes('5406150.00'), true);
  checa('R$ 80,50 vira 80.50', codigo(80.5).includes('540580.50'), true);
  checa('R$ 1000 vira 1000.00', codigo(1000).includes('54071000.00'), true);

  // Taxa zero é "a combinar": o campo de valor SOME, e aí o morador digita
  // quanto vai pagar no próprio banco. Mandar 0.00 faria o banco recusar.
  checa('taxa zero não manda campo de valor', /5400|54040\.00/.test(codigo(0)), false);
});

// ── O CRC, que é o que o banco confere ────────────────────────────────
bloco('O CRC fecha a conta', () => {
  const c = codigo(150);
  // Recalcular sobre tudo menos os 4 dígitos finais tem de dar o mesmo.
  checa('o CRC bate com o conteúdo', _pixCRC(c.slice(0, -4)), c.slice(-4));

  // E precisa MUDAR quando o conteúdo muda — senão não estaria protegendo
  // nada: um valor trocado passaria despercebido.
  checa('valor diferente muda o CRC', codigo(150).slice(-4) === codigo(151).slice(-4), false);
  checa('CRC tem sempre 4 caracteres', _pixCRC('teste').length, 4);
});

// ── Limites de tamanho do padrão ──────────────────────────────────────
bloco('Nome e cidade respeitam o limite do padrão', () => {
  // Nome tem teto de 25 e cidade de 15. Estourar faz o banco recusar.
  const c = pixCopiaECola(CHAVE,
    'CONDOMINIO RESIDENCIAL VILLAGE CASTELO DA SERRA',
    'SAO JOSE DOS CAMPOS DO SUL', 50, 'RESR9');
  checa('nome é cortado em 25', c.includes('5925'), true);
  checa('cidade é cortada em 15', c.includes('6015'), true);
  checa('mesmo assim o CRC fecha', _pixCRC(c.slice(0, -4)), c.slice(-4));

  checa('texto curto não é preenchido à força', _pixTexto('ABC', 25), 'ABC');
  checa('texto longo é cortado', _pixTexto('ABCDEFGHIJ', 4), 'ABCD');
});

bloco('Campos levam o tamanho na frente', () => {
  checa('campo de 3 caracteres', _pixCampo('00', 'ABC'), '0003ABC');
  checa('campo vazio', _pixCampo('00', ''), '0000');
  checa('tamanho com dois dígitos', _pixCampo('01', '0123456789'), '01100123456789');
});

// ── Identificação do pagamento ────────────────────────────────────────
bloco('A reserva é identificada no extrato', () => {
  checa('o txid da reserva entra', codigo(150, 'RESR1').includes('RESR1'), true);
  // Sem identificador, o padrão manda mandar '***' — e não um campo vazio.
  // Chamada direta de propósito: o atalho codigo() acima tem um "|| 'RESR1'"
  // que devolveria o padrão e faria este caso passar sem testar nada.
  const semId = pixCopiaECola(CHAVE, 'CONDOMINIO', 'FLORIANOPOLIS', 150, '');
  checa('sem txid vai o coringa', semId.includes('***'), true);
  checa('e o CRC continua fechando', _pixCRC(semId.slice(0, -4)), semId.slice(-4));
  // Espaço no meio quebraria a leitura do banco.
  checa('espaço é removido do txid', codigo(150, 'RES R1').includes('RESR1'), true);
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.error('FALHARAM ' + falhas + ' DE ' + (ok + falhas)); process.exit(1); }
console.log('TODOS OS TESTES PASSARAM (' + ok + ')');
console.log('-'.repeat(50));
