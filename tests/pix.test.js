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

// ── Passo 2: mandar o comprovante ─────────────────────────────────────
// O raciocínio do fluxo: o morador paga e manda o comprovante. Se ele tiver
// de sair do sistema para procurar o telefone da administração, muita gente
// não manda — e aí a reserva fica pendente sem ninguém saber por quê.
bloco('Botão de comprovante no WhatsApp', () => {
  const { _pixWhatsLink } = carregar(['_pixWhatsLink', '_igWhatsLink', '_igDigitos']);
  const reserva = { espaco: 'Campo de Futebol', data: '2026-08-14' };
  const link = (num, r, v) => _pixWhatsLink(num, r === undefined ? reserva : r, v === undefined ? 20 : v);
  const texto = (l) => decodeURIComponent((l.split('text=')[1] || ''));

  const l = link('(11) 99999-9999');
  checa('vira link do WhatsApp com DDI', l.indexOf('https://wa.me/5511999999999') === 0, true);
  checa('a mensagem já vem escrita', /Segue o comprovante/i.test(texto(l)), true);
  checa('diz qual espaço', texto(l).includes('Campo de Futebol'), true);
  checa('diz a data em português', texto(l).includes('14/08/2026'), true);
  checa('e o valor pago', /R\$.?20,00/.test(texto(l)), true);

  // Taxa "a combinar" não pode virar "R$ 0,00" na mensagem: seria uma
  // informação errada chegando na administração.
  checa('taxa zero vira "a combinar"', /valor a combinar/i.test(texto(link('11999999999', undefined, 0))), true);
  checa('e não manda R$ 0,00', texto(link('11999999999', undefined, 0)).includes('0,00'), false);

  // Sem número utilizável o botão não aparece — abrir uma aba em branco na
  // mão de quem está tentando pagar é pior do que não ter botão.
  checa('sem número não há link', link(''), '');
  checa('número nulo não há link', link(null), '');
  checa('número curto (190) não há link', link('190'), '');
  checa('número sem DDD não há link', link('99999999'), '');

  // Reserva incompleta não pode gerar "em Invalid Date".
  const semData = link('11999999999', { espaco: 'Salão' });
  checa('sem data não escreve data inválida', /invalid/i.test(texto(semData)), false);
  checa('mas ainda cita o espaço', texto(semData).includes('Salão'), true);
  checa('sem reserva nenhuma ainda gera link', link('11999999999', null).indexOf('https://wa.me/') === 0, true);
});

// ── Caução: um segundo pagamento, não uma soma ────────────────────────
// A taxa é do condomínio e fica. O caução é garantia: volta para o morador
// depois da vistoria. Somar os dois num Pix só pouparia um clique e cobraria
// caro depois — na hora de devolver, ninguém saberia quanto do que entrou era
// caução, e a conferência viraria arqueologia no extrato.
bloco('Taxa e caução são pagamentos separados', () => {
  const taxa   = pixCopiaECola(CHAVE, 'ASSOC VILLAGE', 'ITU', 150, 'RES7');
  const caucao = pixCopiaECola(CHAVE, 'ASSOC VILLAGE', 'ITU', 300, 'CAU7');

  checa('a taxa leva RES no extrato', taxa.includes('RES7'), true);
  checa('o caução leva CAU', caucao.includes('CAU7'), true);
  checa('e um não leva o prefixo do outro', caucao.includes('RES7'), false);

  checa('cada um com o seu valor', taxa.includes('5406150.00'), true);
  checa('o caução com o dele', caucao.includes('5406300.00'), true);

  // Se os dois códigos fossem iguais, o banco veria um pagamento só e a
  // separação existiria apenas na tela — que é o mesmo que não existir.
  checa('são códigos diferentes', taxa === caucao, false);
  checa('os dois fecham o CRC',
        [_pixCRC(taxa.slice(0, -4)), _pixCRC(caucao.slice(0, -4))],
        [taxa.slice(-4), caucao.slice(-4)]);

  // A soma NÃO pode aparecer em lugar nenhum: 450 seria o valor de um Pix
  // único, que é justamente o que se decidiu não fazer.
  checa('ninguém manda a soma', taxa.includes('450.00') || caucao.includes('450.00'), false);
});

bloco('O comprovante diz o que foi pago', () => {
  const { _pixWhatsLink } = carregar(['_pixWhatsLink', '_igWhatsLink', '_igDigitos']);
  const r = { espaco: 'Salão de Festas', data: '2026-09-05' };
  const texto = (tipo, v) => decodeURIComponent(_pixWhatsLink('11999999999', r, v, tipo).split('text=')[1] || '');

  // Taxa e caução chegam pelo MESMO WhatsApp. Sem essa palavra, a
  // administração não sabe se o comprovante quita a taxa ou se é a garantia
  // que um dia vai ter de ser devolvida.
  checa('a taxa se identifica', /comprovante do Pix da taxa/i.test(texto('taxa', 150)), true);
  checa('o caução se identifica', /comprovante do Pix do cauç?ão/i.test(texto('caucao', 300)), true);
  checa('e não se confundem', /da taxa/i.test(texto('caucao', 300)), false);
  checa('o valor acompanha o tipo', /R\$.?300,00/.test(texto('caucao', 300)), true);

  // Sem tipo informado, o padrão continua sendo a taxa — é o caminho antigo,
  // e ele não pode passar a dizer "caução" de repente.
  checa('sem tipo, é a taxa', /da taxa/i.test(texto(undefined, 150)), true);
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.error('FALHARAM ' + falhas + ' DE ' + (ok + falhas)); process.exit(1); }
console.log('TODOS OS TESTES PASSARAM (' + ok + ')');
console.log('-'.repeat(50));
