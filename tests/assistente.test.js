// Testes do Assistente Condomínio (busca nos regulamentos).
// Rodar:  node tests/assistente.test.js
//
// O que estes testes protegem, na prática:
//   1. TODO documento cadastrado em Regulamentos entra na base — nenhum
//      pode ficar de fora, senão o assistente responde "não existe regra"
//      quando a regra existe em outro arquivo.
//   2. Os pedaços saem quebrados POR ARTIGO, para a IA conseguir citar
//      "Art. 42" em vez de citar só o nome do arquivo.
//   3. A pergunta puxa o trecho certo, com e sem acento.

const { carregar, lerFonte } = require('./extrair');

let ok = 0, falhas = 0;
function checa(descricao, obtido, esperado) {
  const igual = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (igual) { ok++; console.log('  ✓ ' + descricao); }
  else { falhas++; console.log('  ✗ ' + descricao + '\n      esperado: ' + JSON.stringify(esperado) + '\n      obtido:   ' + JSON.stringify(obtido)); }
}
function bloco(titulo, fn) { console.log('\n' + titulo); fn(); }

// ── Base falsa de documentos ───────────────────────────────────────────
let DOCS = [];

const {
  _iaPalavras, _iaPedacos, _iaBaseDocs, _iaSelecionar, _iaPrimeirosPedacos,
} = carregar(
  ['semAcento', '_regLimpaTexto', '_iaPalavras', '_iaPedacos', '_iaBaseDocs',
   '_iaSelecionar', '_iaPrimeirosPedacos'],
  {
    G: (k) => (k === 'reg' ? DOCS : null),
    _condAtual: 'TESTE',
    // _IA_STOP é declarado fora das funções; recriamos igual ao do app.
    _IA_STOP: ('a as o os um uma uns umas de do da dos das em no na nos nas por para com sem sob sobre '
      + 'e ou mas que se ao aos à às pelo pela é são ser está estão eu meu minha meus minhas '
      + 'posso pode podem poderia devo deve tem tenho há qual quais quando onde como porque por que '
      + 'isso isto aquilo lá aqui já não sim muito mais menos meu no meu do meu').split(/\s+/),
    _iaCache: { chave: '', docs: null },
  },
);

const REGULAMENTO = [
  'REGULAMENTO INTERNO DO CONDOMÍNIO',
  'Art. 1º É vedada a construção de piscina nos lotes residenciais sem prévia aprovação por escrito da administração.',
  'Art. 2º O horário de silêncio vai das 22h às 7h, todos os dias da semana.',
  'Art. 3º É permitida a criação de animais domésticos de pequeno porte, desde que mantidos na coleira nas áreas comuns.',
  'Art. 4º O descumprimento do horário de silêncio implica multa de 10% do valor da taxa condominial.',
].join('\n');

const CONVENCAO = [
  'CONVENÇÃO DE CONDOMÍNIO',
  'Art. 1º A assembleia ordinária ocorre anualmente no mês de março.',
  'Art. 2º A alteração desta convenção depende de aprovação de dois terços dos condôminos.',
  'Art. 3º A taxa condominial vence todo dia 10 de cada mês.',
].join('\n');

// ── Palavras-chave ─────────────────────────────────────────────────────
bloco('Palavras que a busca considera', () => {
  checa('tira palavras vazias e mantém as úteis',
    _iaPalavras('posso fazer uma piscina no meu lote?'), ['fazer', 'piscina', 'lote']);
  checa('ignora acento', _iaPalavras('convenção'), ['convencao']);
  checa('pergunta só com palavras vazias devolve nada', _iaPalavras('eu posso?'), []);
  checa('pontuação não gruda na palavra', _iaPalavras('multa, barulho!'), ['multa', 'barulho']);
});

// ── Quebra por artigo ──────────────────────────────────────────────────
bloco('Quebra do documento em artigos', () => {
  const pedacos = _iaPedacos(REGULAMENTO);
  checa('um pedaço por artigo, mais o preâmbulo', pedacos.length, 5);
  checa('o preâmbulo vem primeiro', pedacos[0], 'REGULAMENTO INTERNO DO CONDOMÍNIO');
  checa('cada pedaço começa no artigo', pedacos[1].slice(0, 7), 'Art. 1º');
  checa('o artigo do silêncio está inteiro num pedaço só',
    pedacos[2].indexOf('22h às 7h') > 0, true);
  checa('texto sem artigo nenhum ainda vira pedaço',
    _iaPedacos('Aviso simples sem numeração alguma neste documento aqui.').length, 1);
  checa('texto vazio não vira pedaço', _iaPedacos('').length, 0);
});

// ── A base é o conjunto COMPLETO de documentos ─────────────────────────
bloco('Base de consulta', () => {
  DOCS = [
    { id: 1, titulo: 'Regulamento Interno', texto: REGULAMENTO },
    { id: 2, titulo: 'Convenção', texto: CONVENCAO },
  ];
  const base = _iaBaseDocs();
  checa('os dois documentos entram na base', base.length, 2);
  checa('os títulos são preservados', base.map((d) => d.titulo), ['Regulamento Interno', 'Convenção']);

  DOCS = DOCS.concat([{ id: 3, titulo: 'Escaneado', texto: '' }]);
  checa('documento sem texto (PDF escaneado) fica de fora', _iaBaseDocs().length, 2);

  DOCS = [];
  checa('sem documento, base vazia', _iaBaseDocs().length, 0);
});

// ── Seleção do que vai para a IA ───────────────────────────────────────
bloco('O que é enviado para a IA', () => {
  DOCS = [
    { id: 1, titulo: 'Regulamento Interno', texto: REGULAMENTO },
    { id: 2, titulo: 'Convenção', texto: CONVENCAO },
  ];

  // Documentos pequenos cabem inteiros: manda tudo, sem escolher nada.
  const tudo = _iaSelecionar('posso fazer uma piscina?', 45000);
  const titulosTudo = tudo.map((t) => t.titulo).filter((v, i, a) => a.indexOf(v) === i);
  checa('cabendo no limite, os dois documentos vão inteiros', titulosTudo.length, 2);
  checa('o artigo da piscina está no que foi enviado',
    tudo.some((t) => t.texto.indexOf('piscina') > 0), true);
  checa('o artigo da assembleia também vai (base completa)',
    tudo.some((t) => t.texto.indexOf('assembleia') > 0), true);

  // Limite apertado: aí sim escolhe — e tem que escolher o trecho certo.
  const poucos = _iaSelecionar('posso construir uma piscina?', 300);
  checa('com limite apertado, seleciona pouca coisa', poucos.length <= 2, true);
  checa('e o que sobra é o artigo da piscina',
    poucos.some((t) => t.texto.indexOf('piscina') > 0), true);

  const silencio = _iaSelecionar('qual o horário de silêncio?', 300);
  checa('acha o silêncio mesmo escrevendo com acento',
    silencio.some((t) => t.texto.indexOf('22h') > 0), true);

  const nada = _iaSelecionar('helicóptero no heliponto', 300);
  checa('pergunta sem nenhuma correspondência ainda manda algo (a IA julga)',
    nada.length > 0, true);

  DOCS = [];
  checa('sem documento, não manda nada', _iaSelecionar('qualquer coisa', 45000).length, 0);
});

// ── Rodízio entre documentos ───────────────────────────────────────────
bloco('Reserva de emergência (rodízio)', () => {
  const base = [
    { titulo: 'A', pedacos: ['aaa', 'aaaa'] },
    { titulo: 'B', pedacos: ['bbb'] },
  ];
  const r = _iaPrimeirosPedacos(base, 100);
  checa('nenhum documento fica de fora',
    r.map((x) => x.titulo).filter((v, i, a) => a.indexOf(v) === i).sort(), ['A', 'B']);
  checa('limite pequeno corta sem quebrar', _iaPrimeirosPedacos(base, 3).length, 1);
});

// ── Formatação do resultado da busca em Regulamentos ───────────────────
const fmt = carregar(
  ['_regLimpaTexto', '_regFormataTrecho', '_regNegritoRotulo', '_regRealca'],
  { escHtml: (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') },
);

bloco('Texto do PDF: limpeza', () => {
  checa('cola o "s" que a extração solta',
    fmt._regLimpaTexto('casa s de máquinas'), 'casas de máquinas');
  checa('cola também antes de vírgula',
    fmt._regLimpaTexto('construída s, nos recuos'), 'construídas, nos recuos');
  checa('não cola "a", que é palavra de verdade',
    fmt._regLimpaTexto('lotes a montante'), 'lotes a montante');
  checa('não cola "e"', fmt._regLimpaTexto('muro e, preservando'), 'muro e, preservando');
  checa('cola quando vem palavra de ligação depois',
    fmt._regLimpaTexto('máquina s não subterrâneas'), 'máquinas não subterrâneas');
  checa('NÃO cola quando o que vem depois não confirma o plural',
    fmt._regLimpaTexto('vaga s ão do bloco'), 'vaga s ão do bloco');
  checa('palavra partida no fim da linha é remontada',
    fmt._regLimpaTexto('constru-\nção'), 'construção');
  checa('número do artigo partido é remontado',
    fmt._regLimpaTexto('Artigo 3 7 – O associado'), 'Artigo 37 – O associado');
  checa('vale também para "Art."',
    fmt._regLimpaTexto('Art. 1 0 8 diz'), 'Art. 108 diz');
  checa('número solto em texto comum NÃO é mexido',
    fmt._regLimpaTexto('a sala 3 7 do bloco'), 'a sala 3 7 do bloco');
});

bloco('Texto do PDF: uma linha por artigo', () => {
  const t = fmt._regFormataTrecho(
    'decorativos; Parágrafo segundo - Somente casas poderão ser construídas, '
    + 'conforme previsto no Artigo 29º deste Código; Parágrafo terceiro – Casas de máquina. '
    + 'Art. 30º Os lotes não poderão ser desmembrados.');
  const linhas = t.split('\n');
  checa('cada dispositivo em sua linha', linhas.length, 4);
  checa('a 2ª linha abre no Parágrafo segundo', linhas[1].slice(0, 18), 'Parágrafo segundo ');
  checa('a 4ª linha abre no Art. 30º', linhas[3].slice(0, 8), 'Art. 30º');
  checa('citação "no Artigo 29º" NÃO quebra linha',
    linhas[1].indexOf('no Artigo 29º') > 0, true);
  checa('inciso romano ganha linha',
    fmt._regFormataTrecho('regras: I - primeira; II - segunda.').split('\n').length, 3);
  checa('alínea ganha linha',
    fmt._regFormataTrecho('obedecer: a) recuo; b) altura.').split('\n').length, 3);
  checa('número de página do rodapé não gruda no artigo seguinte',
    fmt._regFormataTrecho('CNPJ 02.861.216/0001-77 12 Artigo 37 – O associado')
      .split('\n')[1].slice(0, 9), 'Artigo 37');
  checa('citação depois de palavra continua sem quebrar',
    fmt._regFormataTrecho('previsto no Artigo 29º deste Código').split('\n').length, 1);
});

bloco('Rótulo em negrito e realce juntos', () => {
  const html = fmt._regNegritoRotulo(fmt._regRealca('Art. 5º Casas de máquina.', 'casa'));
  checa('o rótulo fica em negrito', html.indexOf('<strong class="reg-rotulo">Art. 5º</strong>'), 0);
  checa('o termo procurado fica realçado', html.indexOf('<mark>Casa</mark>') > 0, true);
  checa('o texto do PDF continua escapado (sem XSS)',
    fmt._regNegritoRotulo(fmt._regRealca('Art. 1º <script>x</script>', 'zzz'))
      .indexOf('<script>'), -1);
});

// ── A chave da IA nunca pode estar no arquivo público ──────────────────
bloco('Segurança', () => {
  const src = lerFonte();
  checa('nenhuma chave da Anthropic no adminpro.html', /sk-ant-/.test(src), false);
  checa('a página não chama a API da IA direto', /api\.anthropic\.com/.test(src), false);
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.log(`FALHOU: ${falhas} de ${ok + falhas}`); process.exit(1); }
console.log(`TODOS OS TESTES PASSARAM (${ok})`);
