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

// ── Migração do formato antigo para abas ───────────────────────────────
// O teste que mais importa deste arquivo: a administração JÁ tem dados
// cadastrados. Se a conversão perder um telefone ou um horário, o
// condomínio perde informação de verdade.
// _igMigrar consulta o ponto de partida do condomínio para preencher
// campo que nunca existiu no registro, então precisa dessas duas junto.
const mig = carregar(['_igMigrar', '_igPadrao', '_igColetaPadrao'],
  { _condAtual: 'APVC', _IG_HISTORIA_APVC: 'história de teste' });
const mig2 = mig;

bloco('Migração: nada do que estava cadastrado pode sumir', () => {
  const antigo = {
    historia: 'Fundado em 1996.',
    mapa: { storagePath: 'APVC/infogerais/1.pdf', nome: 'mapa.pdf' },
    telefones: [
      { nome: 'Portaria', numero: '11987654321', whats: true },
      { nome: 'Zeladoria', numero: '1134567890' },
    ],
    horarioAdm: 'Seg a sex, 8h às 17h',
    horarioPortaria: 'Portaria 24 horas',
    coleta: 'Lixo comum: seg, qua, sex',
    emergencia: [{ nome: 'Polícia Militar', numero: '190' }],
  };
  const d = mig._igMigrar(JSON.parse(JSON.stringify(antigo)));
  const por = (id) => d.abas.find((a) => a.id === id);

  checa('virou uma lista de abas', Array.isArray(d.abas), true);
  checa('seis abas', d.abas.length, 6);

  checa('a história foi preservada', por('historia').texto, 'Fundado em 1996.');
  checa('o mapa foi preservado', por('mapa').arquivo.nome, 'mapa.pdf');
  checa('o caminho do arquivo veio junto',
    por('mapa').arquivo.storagePath, 'APVC/infogerais/1.pdf');
  checa('os dois telefones vieram', por('telefones').itens.length, 2);
  checa('a marcação de WhatsApp veio junto', por('telefones').itens[0].whats, true);
  checa('a coleta foi preservada', por('coleta').texto, 'Lixo comum: seg, qua, sex');
  checa('a emergência foi preservada', por('emergencia').itens[0].numero, '190');
  checa('emergência continua sem WhatsApp', por('emergencia').semWhats, true);

  // Os dois horários eram campos separados e viram um texto só.
  const h = por('horarios').texto;
  checa('o horário da administração está no texto', h.indexOf('8h às 17h') > 0, true);
  checa('o horário da portaria também', h.indexOf('24 horas') > 0, true);
  checa('cada um com seu rótulo',
    [h.indexOf('Administração') >= 0, h.indexOf('Portaria') > 0], [true, true]);

  checa('os campos antigos continuam no registro (rede de segurança)',
    [d.historia, d.telefones.length], ['Fundado em 1996.', 2]);
  checa('toda aba nasce visível', d.abas.every((a) => a.ativa === true), true);
  checa('toda aba tem tipo', d.abas.every((a) => !!a.tipo), true);
  checa('toda aba tem ícone', d.abas.every((a) => /^fa-/.test(a.icone)), true);
});

bloco('Migração: não roda duas vezes', () => {
  const jaMigrado = { abas: [{ id: 'x', nome: 'Só esta', tipo: 'texto', ativa: true, texto: 'oi' }] };
  const d = mig._igMigrar(jaMigrado);
  checa('mantém as abas que já existiam', d.abas.length, 1);
  checa('não recria as antigas', d.abas[0].nome, 'Só esta');
});

bloco('Migração: registro vazio não quebra', () => {
  // Registro vazio do APVC herda o ponto de partida do condomínio — os
  // horários e a coleta que a administração encontraria numa instalação
  // nova. Antes vinha tudo em branco, o que fazia quem já usava o sistema
  // perder esses textos ao migrar.
  const d = mig._igMigrar({});
  checa('cria as abas mesmo sem dado antigo', d.abas.length, 6);
  checa('telefones começam vazios', d.abas.find((a) => a.id === 'telefones').itens, []);
  checa('horários herdam o ponto de partida',
    d.abas.find((a) => a.id === 'horarios').texto.indexOf('8h às 17h') > 0, true);
  checa('emergência herda os números públicos',
    d.abas.find((a) => a.id === 'emergencia').itens.length > 0, true);

  // Condomínio que não é o Village Castelo não tem história nem coleta
  // prontas — esses textos são dele, não do sistema.
  const outroCond = carregar(['_igMigrar', '_igPadrao', '_igColetaPadrao'],
    { _condAtual: 'XPTO', _IG_HISTORIA_APVC: 'história do village' });
  const e = outroCond._igMigrar({});
  checa('outro condomínio começa sem história', e.abas[0].texto, '');
  checa('e sem coleta', e.abas.find((a) => a.id === 'coleta').texto, '');
  checa('mas com os horários, que são genéricos',
    e.abas.find((a) => a.id === 'horarios').texto.indexOf('8h às 17h') > 0, true);
});

// ── _igDados devolve CÓPIA, não o próprio cache ────────────────────────
// Sem isso, editar a tela alterava o cache antes de o servidor responder.
// E o "desfazer" de _igSalvar, que guarda a referência do estado anterior,
// guardaria o objeto já alterado — a tela diria "nada foi salvo" com a
// alteração ainda aplicada.
bloco('Editar não pode mexer no cache antes de salvar', () => {
  const CACHE = { infogerais: { historia: 'Original', telefones: [{ nome: 'Portaria', numero: '11987654321' }] } };
  const api = carregar(
    ['_igDados', '_igMigrar', '_igPadrao', '_igColetaPadrao', 'getInfoGerais'],
    { G: (k) => CACHE[k] || null, _condAtual: 'APVC', _IG_HISTORIA_APVC: 'h' },
  );

  const d = api._igDados();
  d.abas[0].texto = 'ALTERADO NA TELA';
  d.abas.push({ id: 'z', nome: 'Nova', tipo: 'texto', ativa: true, texto: '' });

  checa('o cache não foi tocado', CACHE.infogerais.historia, 'Original');
  checa('nem ganhou abas', CACHE.infogerais.abas, undefined);
  checa('a lista de telefones do cache é outra referência',
    CACHE.infogerais.telefones[0].nome, 'Portaria');

  const d2 = api._igDados();
  checa('uma nova leitura não enxerga a edição descartada',
    d2.abas[0].texto, 'Original');
});

// ── Migração de registro salvo antes de a aba existir ──────────────────
bloco('Migração: campo que nunca existiu herda o ponto de partida', () => {
  // Registro do APVC salvo antes de a aba "Coleta de lixo" ser criada.
  const antigo = { historia: 'Fundado em 1996.', telefones: [] };
  const d = mig2._igMigrar(JSON.parse(JSON.stringify(antigo)));
  const por = (id) => d.abas.find((a) => a.id === id);

  checa('a coleta vem preenchida, não vazia', por('coleta').texto.indexOf('EPPO') > 0, true);
  checa('os horários também', por('horarios').texto.indexOf('8h às 17h') > 0, true);
  checa('mas o que ESTAVA gravado prevalece sobre o padrão',
    por('historia').texto, 'Fundado em 1996.');
  checa('campo gravado vazio de propósito continua vazio',
    mig2._igMigrar({ coleta: '' }).abas.find((a) => a.id === 'coleta').texto, '');
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.log(`FALHOU: ${falhas} de ${ok + falhas}`); process.exit(1); }
console.log(`TODOS OS TESTES PASSARAM (${ok})`);
