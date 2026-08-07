// Testes da aba "Informações Gerais" (dentro de Comunicação).
// Rodar:  node tests/infogerais.test.js
//
// O que importa aqui: o ícone do WhatsApp só pode aparecer quando o link
// realmente abre uma conversa. Um ícone verde que abre em branco é pior do
// que ícone nenhum — a pessoa acha que avisou a portaria e não avisou.

const { carregar } = require('./extrair');

let ok = 0, falhas = 0;
function checa(descricao, obtido, esperado) {
  const igual = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (igual) { ok++; console.log('  ✓ ' + descricao); }
  else { falhas++; console.log('  ✗ ' + descricao + '\n      esperado: ' + JSON.stringify(esperado) + '\n      obtido:   ' + JSON.stringify(obtido)); }
}
function bloco(titulo, fn) { console.log('\n' + titulo); fn(); }

const {
  _igDigitos, _igWhatsLink, _igTelLink, _igFormataTel, _igPadrao, _igColetaPadrao,
} = carregar(
  ['_igDigitos', '_igWhatsLink', '_igTelLink', '_igFormataTel', '_igColetaPadrao', '_igPadrao'],
  { _condAtual: 'APVC', _IG_HISTORIA_APVC: 'história de teste' },
);

// Mesmas funções, mas para um condomínio que não é o Village Castelo.
const outro = carregar(
  ['_igColetaPadrao', '_igPadrao'],
  { _condAtual: 'XPTO', _IG_HISTORIA_APVC: 'história de teste' },
);

bloco('Link do WhatsApp', () => {
  checa('celular com DDD ganha o 55 do Brasil',
    _igWhatsLink('(11) 98765-4321'), 'https://wa.me/5511987654321');
  checa('fixo com DDD também vale',
    _igWhatsLink('11 3456-7890'), 'https://wa.me/551134567890');
  checa('número que já vem com 55 não ganha outro',
    _igWhatsLink('5511987654321'), 'https://wa.me/5511987654321');
  checa('190 não tem WhatsApp', _igWhatsLink('190'), '');
  checa('número sem DDD não vira link', _igWhatsLink('98765-4321'), '');
  checa('número absurdo não vira link', _igWhatsLink('55119876543210000'), '');
  checa('vazio não vira link', _igWhatsLink(''), '');
  checa('texto no lugar do número não vira link', _igWhatsLink('não tem'), '');
});

bloco('Link de ligação', () => {
  checa('emergência vira tel:', _igTelLink('190'), 'tel:190');
  checa('celular vira tel: só com dígitos', _igTelLink('(11) 98765-4321'), 'tel:11987654321');
  checa('vazio não vira link', _igTelLink(''), '');
});

bloco('Telefone na tela', () => {
  checa('celular', _igFormataTel('11987654321'), '(11) 98765-4321');
  checa('fixo com DDD', _igFormataTel('1134567890'), '(11) 3456-7890');
  checa('com o 55 na frente, mostra sem o 55', _igFormataTel('5511987654321'), '(11) 98765-4321');
  checa('emergência fica como está', _igFormataTel('190'), '190');
  checa('celular sem DDD', _igFormataTel('987654321'), '98765-4321');
  checa('o que não reconhece, mostra como veio', _igFormataTel('ramal 20'), 'ramal 20');
  checa('só dígitos, sem inventar', _igDigitos('(11) 98765-4321'), '11987654321');
});

bloco('Ponto de partida cadastrado', () => {
  const d = _igPadrao();
  checa('horário da administração já vem preenchido',
    d.horarioAdm.indexOf('8h às 17h') > 0, true);
  checa('sábado incluído', d.horarioAdm.indexOf('8h às 12h') > 0, true);
  checa('portaria 24 horas', d.horarioPortaria.indexOf('24 horas') > 0, true);
  checa('emergência já vem com 190 e 193',
    [d.emergencia.some((e) => e.numero === '190'), d.emergencia.some((e) => e.numero === '193')],
    [true, true]);
  checa('todo contato de emergência tem nome',
    d.emergencia.every((e) => !!e.nome), true);
  checa('nenhum contato de emergência gera link de WhatsApp',
    d.emergencia.every((e) => _igWhatsLink(e.numero) === ''), true);
  checa('telefones úteis começam vazios (a administração cadastra)',
    d.telefones.length, 0);
  checa('nenhum mapa no começo', d.mapa, null);
});

// ── Coleta de lixo ─────────────────────────────────────────────────────
bloco('Coleta de lixo', () => {
  const t = _igColetaPadrao();
  checa('lixo comum: segunda, quarta e sexta', t.indexOf('segunda, quarta e sexta') > 0, true);
  checa('empresa do lixo comum', t.indexOf('EPPO') > 0, true);
  checa('telefone da EPPO', t.indexOf('(11) 94824-0175') > 0, true);
  checa('reciclagem na terça', t.indexOf('Reciclagem — terça') > 0, true);
  checa('empresa da reciclagem', t.indexOf('COMAREI') > 0, true);
  checa('telefone da COMAREI', t.indexOf('(11) 96337-3849') > 0, true);
  checa('lixo verde na terça e sexta', t.indexOf('terça e sexta') > 0, true);
  checa('entra no ponto de partida do condomínio', _igPadrao().coleta === t, true);
  checa('outro condomínio começa em branco', outro._igColetaPadrao(), '');
  checa('e o ponto de partida dele também', outro._igPadrao().coleta, '');
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.log(`FALHOU: ${falhas} de ${ok + falhas}`); process.exit(1); }
console.log(`TODOS OS TESTES PASSARAM (${ok})`);
