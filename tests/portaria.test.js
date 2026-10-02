// Tela da Portaria — o que pode e o que NÃO pode aparecer no portão.
// Rodar:  node tests/portaria.test.js
//
// Esta tela é lida por quem não é da administração. Por isso os testes aqui
// são, na maioria, sobre o que NÃO deve aparecer:
//
//   - reserva pendente no portão faria alguém entrar num espaço que a
//     administração ainda não liberou;
//   - reserva cancelada faria o contrário: barrar quem foi avisado de que
//     está tudo certo;
//   - valor nenhum aparece — a portaria não cobra ninguém, e um valor no
//     portão só cria constrangimento e discussão que não é dali.

const { carregar, lerFonte } = require('./extrair');

const api = carregar(['portariaFiltrar', '_portSoma', 'hrIni'], {
  PORTARIA_STATUS: ['confirmada', 'realizada', 'concluida'],
});

let ok = 0, falhas = 0;
function checa(descricao, obtido, esperado) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) { ok++; console.log('  ✓ ' + descricao); }
  else {
    falhas++;
    console.log('  ✗ ' + descricao +
      '\n      esperado: ' + JSON.stringify(esperado) +
      '\n      obtido:   ' + JSON.stringify(obtido));
  }
}
function bloco(titulo, fn) { console.log('\n' + titulo); fn(); }

const HOJE = '2026-10-02';
const r = (o) => Object.assign({
  nome: 'Fulano', lote: 'L17', espaco: 'Salão de Festa',
  data: HOJE, horario: '14:00–18:00', status: 'confirmada',
}, o);

const nomes = (lista) => lista.map((x) => x.nome);
const filtra = (lista, o) => api.portariaFiltrar(lista, Object.assign({ hoje: HOJE }, o || {}));

// ── O que não pode aparecer ───────────────────────────────────────────
bloco('Só reserva aprovada chega ao portão', () => {
  const lista = [
    r({ nome: 'Aprovada',  status: 'confirmada' }),
    r({ nome: 'Pendente',  status: 'pendente' }),
    r({ nome: 'Cancelada', status: 'cancelada' }),
    r({ nome: 'Realizada', status: 'realizada' }),
    r({ nome: 'Concluida', status: 'concluida' }),
    r({ nome: 'SemStatus', status: '' }),
  ];
  checa('pendente e cancelada ficam de fora',
        nomes(filtra(lista)).sort(), ['Aprovada', 'Concluida', 'Realizada']);
  // Status desconhecido (de uma versão futura, ou dado estranho) não entra:
  // no portão, o padrão seguro é não mostrar.
  checa('status que ninguém conhece não entra',
        nomes(filtra([r({ nome: 'Estranha', status: 'aguardando_algo' })])), []);
});

// ── Período ───────────────────────────────────────────────────────────
bloco('Hoje é o padrão', () => {
  const lista = [
    r({ nome: 'Hoje',   data: HOJE }),
    r({ nome: 'Amanha', data: '2026-10-03' }),
    r({ nome: 'Ontem',  data: '2026-10-01' }),
  ];
  checa('só o de hoje', nomes(filtra(lista)), ['Hoje']);
  checa('amanhã mostra só o de amanhã',
        nomes(filtra(lista, { periodo: 'amanha' })), ['Amanha']);
  // Ontem nunca aparece sozinho: o portão olha para frente.
  checa('ontem não entra em nenhum período',
        nomes(filtra(lista, { periodo: 'semana' })), ['Hoje', 'Amanha']);
});

bloco('Próximos 7 dias conta a partir de hoje', () => {
  const lista = [
    r({ nome: 'Hoje',  data: HOJE }),
    r({ nome: 'D6',    data: '2026-10-08' }),   // último dia da janela
    r({ nome: 'D7',    data: '2026-10-09' }),   // já fora
  ];
  checa('pega até o sétimo dia', nomes(filtra(lista, { periodo: 'semana' })), ['Hoje', 'D6']);
});

bloco('Data escolhida a dedo', () => {
  const lista = [r({ nome: 'Natal', data: '2026-12-25' }), r({ nome: 'Hoje', data: HOJE })];
  checa('mostra só aquele dia',
        nomes(filtra(lista, { periodo: 'data', data: '2026-12-25' })), ['Natal']);
  checa('sem data informada, cai em hoje',
        nomes(filtra(lista, { periodo: 'data' })), ['Hoje']);
});

bloco('Virada de mês e de ano não quebram a conta', () => {
  checa('fim de mês', api._portSoma('2026-10-31', 1), '2026-11-01');
  checa('fim de ano', api._portSoma('2026-12-31', 1), '2027-01-01');
  checa('ano bissexto', api._portSoma('2028-02-28', 1), '2028-02-29');
  checa('sete dias virando o mês', api._portSoma('2026-10-30', 6), '2026-11-05');
});

// ── Ordem: o portão lê de cima para baixo, na ordem do dia ────────────
bloco('Sai em ordem de dia e hora', () => {
  const lista = [
    r({ nome: 'Tarde',  data: HOJE, horario: '14:00–18:00' }),
    r({ nome: 'Manha',  data: HOJE, horario: '08:00–12:00' }),
    r({ nome: 'Amanha', data: '2026-10-03', horario: '07:00–09:00' }),
    r({ nome: 'Noite',  data: HOJE, horario: '20:00–23:00' }),
  ];
  checa('hora certa dentro do dia, dia certo no geral',
        nomes(filtra(lista, { periodo: 'semana' })), ['Manha', 'Tarde', 'Noite', 'Amanha']);
});

// ── Busca ─────────────────────────────────────────────────────────────
bloco('Busca por unidade, nome ou espaço', () => {
  const lista = [
    r({ nome: 'Alessandra', lote: 'L17', espaco: 'Salão de Festa' }),
    r({ nome: 'Carlos',     lote: 'B01', espaco: 'Quadra de Areia' }),
  ];
  checa('por unidade', nomes(filtra(lista, { busca: 'l17' })), ['Alessandra']);
  checa('por nome', nomes(filtra(lista, { busca: 'carlos' })), ['Carlos']);
  checa('por espaço', nomes(filtra(lista, { busca: 'quadra' })), ['Carlos']);
  checa('maiúscula não atrapalha', nomes(filtra(lista, { busca: 'B01' })), ['Carlos']);
  checa('espaço sobrando não atrapalha', nomes(filtra(lista, { busca: '  l17 ' })), ['Alessandra']);
  checa('busca sem resultado devolve vazio', filtra(lista, { busca: 'zzz' }), []);
});

// ── Dados estranhos não derrubam a tela do portão ─────────────────────
bloco('Dado faltando não quebra', () => {
  checa('lista nula', api.portariaFiltrar(null, { hoje: HOJE }), []);
  checa('sem opções', api.portariaFiltrar([], undefined), []);
  checa('reserva sem data não entra', nomes(filtra([r({ nome: 'SemData', data: '' })])), []);
  checa('reserva sem horário ainda aparece',
        nomes(filtra([r({ nome: 'SemHora', horario: '' })])), ['SemHora']);
});

// ── Nenhum valor na tela ──────────────────────────────────────────────
// Aqui a verificação é sobre o código-fonte: o defeito que importa não é uma
// função errada, é alguém acrescentar um campo de dinheiro no desenho.
bloco('A tela do portão não desenha valor nenhum', () => {
  const src = lerFonte();
  const ini = src.indexOf('function renderPortaria()');
  const fim = src.indexOf('\n}', src.indexOf('lista.innerHTML=html;', ini));
  const corpo = src.slice(ini, fim);
  checa('o trecho foi encontrado', ini > 0 && fim > ini, true);
  ['taxa', 'caucao', 'pgto', 'comprovante', 'valor', 'R$'].forEach((proibido) => {
    checa('não cita "' + proibido + '"', corpo.indexOf(proibido) < 0, true);
  });
  // E nada que altere uma reserva.
  ['salvarRes', 'aprovarReserva', 'excluirRes', 'abrirModalRes'].forEach((acao) => {
    checa('não chama ' + acao, corpo.indexOf(acao) < 0, true);
  });
});

// ── Onde a tela mora ──────────────────────────────────────────────────
// Virou aba de Reservas, e saiu do menu Operações. Isso cria uma armadilha:
// a barra de abas é só para admin/gestor, então a portaria — que é morador —
// não a enxerga. Sem um caminho próprio, ela entraria na tela pelo login e,
// ao sair uma vez, nunca mais voltaria.
bloco('A portaria tem como chegar na propria tela', () => {
  const src = lerFonte();
  checa('existe item de menu proprio',
    src.includes("id=\"nav-portaria-wrap\""), true);
  checa('ele nasce escondido (quem o mostra e o aplicarSaas)',
    /id="nav-portaria-wrap" style="display:none"/.test(src), true);
  checa('e e escondido de quem tem a barra de abas',
    src.includes('&& !_temAbas) ?'), true);
  /* "O modulo esta ligado" nao basta: para o morador, modulo sem configuracao
     conta como liberado, entao o item aparecia para TODO morador -- e clicar
     nele dava "Acesso restrito ao seu perfil". A pergunta tem de ser a mesma
     que o showPanel faz. */
  checa('e so aparece para quem realmente pode abrir a tela',
    src.includes("var _podeAbrir = paineisPermitidos(_n).indexOf('portaria') >= 0;"), true);
  // Sem isto, quem so tem esta tela entrava no sistema e caia no Inicio.
  checa('quem so tem esta tela entra nela',
    /const ordem = \['dashboard','portaria'/.test(src), true);
});

bloco('A aba aparece junto das outras de Reservas', () => {
  const src = lerFonte();
  const abas = (src.match(/showPanel\('portaria'\)/g) || []).length;
  // Uma aba em cada um dos quatro paineis irmaos: Reservas, Relatorios,
  // Criar espacos e o proprio Painel de Reservas.
  checa('as quatro barras de abas levam a ela', abas, 4);
  checa('e o modulo nao esta mais em nenhum grupo do menu',
    /portaria:\s*\{ label:'Painel de Reservas',\s*grupo:null/.test(src), true);
});

// ── Atualizar sozinho ─────────────────────────────────────────────────
// A tela fica o dia inteiro aberta na portaria, sem ninguém mexendo. Sem
// releitura, uma reserva aprovada às 10h só apareceria no portão quando
// alguém lembrasse de apertar F5 — e a pessoa chegaria para usar um espaço
// que, para a portaria, não estava reservado.
bloco('Quando vale ir ao banco', () => {
  const r = carregar(['_reslDeveReler'], { _RESL_TELAS: ['reservas', 'portaria'] });
  const deve = (painel, temSB, escondido, forcar) =>
    r._reslDeveReler(painel, temSB, escondido, forcar);

  checa('no painel da portaria, com banco e tela a vista', deve('portaria', true, false, false), true);
  checa('na tela de reservas tambem', deve('reservas', true, false, false), true);

  // Reler o que ninguem esta olhando e gasto sem dono.
  checa('em outra tela, nao le', deve('inicio', true, false, false), false);
  checa('aba em segundo plano, nao le', deve('portaria', true, true, false), false);
  checa('sem banco, nao le', deve('portaria', false, false, false), false);

  // O botao "Atualizar" nao espera nada: quem apertou esta olhando.
  checa('o botao ignora a aba escondida', deve('portaria', true, true, true), true);
  checa('mas nem o botao inventa banco', deve('portaria', false, true, true), false);
  checa('e nem o botao le de outra tela', deve('inicio', true, false, true), false);
});

bloco('O relogio cobre a tela da portaria', () => {
  const src = lerFonte();
  checa('a portaria esta na lista de telas que releem',
    /_RESL_TELAS = \['reservas','portaria'\]/.test(src), true);
  checa('o intervalo e de 15 minutos',
    /_RESL_RELEITURA_MIN = 15/.test(src), true);
  // Tela aberta desde ontem seguiria mostrando "hoje" como sendo ontem.
  checa('o tique redesenha a portaria mesmo se a leitura falhar',
    /currentPanel === 'portaria'\) renderPortaria\(\);/.test(src), true);
  // Voltar para a aba e quando o dado mais provavelmente esta velho.
  checa('voltar para a aba tambem rele',
    src.includes("addEventListener('visibilitychange'"), true);
  // O botao antes so redesenhava a memoria: parecia atualizar e nao atualizava.
  checa('o botao Atualizar vai ao banco',
    src.includes('onclick="portAtualizar()"'), true);
});

// ── Nome de quem reservou é dado de outra pessoa ──────────────────────
// O morador precisa saber que o horário está ocupado — sem isso não escolhe
// outro. Mas QUEM reservou não é da conta dele: é saber que a vizinha do B07
// vai fazer festa no sábado, quem recebe e quem não recebe. A agenda do
// espaço comum é pública; a vida de quem usa, não.
bloco('Quem pode ver o nome de quem reservou', () => {
  const quem = (nivel) => carregar(['resPodeVerNomes'], { window: { _userNivel: nivel } })
    .resPodeVerNomes();
  checa('admin vê', quem('admin'), true);
  checa('gestor vê', quem('gestor'), true);
  checa('supervisor vê', quem('supervisor'), true);
  checa('morador NÃO vê', quem('morador'), false);
  checa('nível desconhecido não vê', quem('qualquer_coisa'), false);
  checa('sem nível definido não vê', quem(undefined), false);
});

bloco('O nome sai pelos dois caminhos que o morador alcança', () => {
  const src = lerFonte();
  // 1) O aviso de conflito ao tentar marcar por cima de outra reserva.
  checa('o aviso de conflito pergunta antes de citar o nome',
    src.includes("(resPodeVerNomes() ? ' ('+conflito.nome+')' : '. Escolha outro horário.')"), true);
  // 2) O calendário, que mostra as reservas de todo mundo — o nome ia no
  //    title e aparecia em qualquer passada de mouse.
  checa('a dica do calendário pergunta antes de citar o nome',
    /_dica=.*resPodeVerNomes\(\)&&r\.nome/.test(src), true);
  checa('e nenhum title do calendário monta o nome direto',
    src.includes("title=\"'+escHtml((r.horario||'')+' '+(r.espaco||'')+' — '+(r.nome||''))"), false);
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.error('FALHARAM ' + falhas + ' DE ' + (ok + falhas)); process.exit(1); }
console.log('TODOS OS TESTES PASSARAM (' + ok + ')');
console.log('-'.repeat(50));
