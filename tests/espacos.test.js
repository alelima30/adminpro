// Testes da escolha de espaço por cartão e do status da reserva.
// Rodar:  node tests/espacos.test.js
//
// Duas mudanças no formulário de reserva estão cobertas aqui:
//
// 1. O espaço virou cartão com foto. A foto é guardada por CHAVE derivada do
//    nome ("Salão de Festa" -> "sal_o_de_festa"), então renomear e excluir
//    espaço precisam mexer nessa foto — senão ela fica órfã (ninguém a acha
//    pela chave nova) ou sobra para sempre ocupando lugar.
//
// 2. O campo Status saiu do formulário. O risco de tirar um campo é o valor
//    dele virar lixo no salvamento: uma reserva já aprovada voltando para
//    "pendente" porque alguém corrigiu um telefone.

const { carregar, lerFonte } = require('./extrair');

const api = carregar(
  ['resStatusAoSalvar', 'espFotosRenomear', 'espFotosExcluir', '_chvEsp', '_espIcone', 'semAcento',
   'espListaParaForm', 'mresLoteEscolhaTeclado', 'resEhAdministracao'],
  // Sem nível informado, a função olha quem está logado — por isso o window.
  { window: { _userNivel: 'morador' } },
);

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

// ── Status, agora que o campo não existe mais na tela ─────────────────
bloco('Editar reserva não mexe no status', () => {
  const r = { status: 'confirmada' };
  checa('admin salvando reserva confirmada mantém confirmada',
        api.resStatusAoSalvar('admin', r, true), 'confirmada');
  checa('gestor idem', api.resStatusAoSalvar('gestor', r, true), 'confirmada');
  checa('realizada continua realizada',
        api.resStatusAoSalvar('admin', { status: 'realizada' }, false), 'realizada');
  checa('cancelada continua cancelada',
        api.resStatusAoSalvar('admin', { status: 'cancelada' }, true), 'cancelada');
  // O caso que motivou a função: sem ela, o valor do campo escondido (sempre
  // "pendente" numa reserva recém-aberta) apagaria a aprovação.
  checa('pendente continua pendente',
        api.resStatusAoSalvar('admin', { status: 'pendente' }, true), 'pendente');
});

bloco('Reserva nova feita pela administração já nasce confirmada', () => {
  checa('admin, espaço que exige aprovação',
        api.resStatusAoSalvar('admin', null, true), 'confirmada');
  checa('admin, espaço que não exige',
        api.resStatusAoSalvar('admin', null, false), 'confirmada');
  checa('gestor idem', api.resStatusAoSalvar('gestor', null, true), 'confirmada');
});

bloco('Morador segue a regra do espaço, como antes', () => {
  checa('espaço que exige aprovação entra pendente',
        api.resStatusAoSalvar('morador', null, true), 'pendente');
  checa('espaço livre entra confirmada',
        api.resStatusAoSalvar('morador', null, false), 'confirmada');
  checa('morador editando reserva já tratada mantém o status',
        api.resStatusAoSalvar('morador', { status: 'confirmada' }, true), 'confirmada');
  checa('morador editando reserva ainda pendente continua pela regra',
        api.resStatusAoSalvar('morador', { status: 'pendente' }, true), 'pendente');
  /* O supervisor MUDOU de lado aqui, a pedido: ele administra as reservas e
     marca para qualquer unidade, como o admin. Antes caía na regra do morador
     e a reserva que ele criava nascia pendente -- esperando a aprovação de
     alguém, sendo que ele é quem aprovaria. */
  checa('supervisor cria confirmada, como a administração',
        api.resStatusAoSalvar('supervisor', null, true), 'confirmada');
  checa('e editando, mantém o status atual',
        api.resStatusAoSalvar('supervisor', { status: 'realizada' }, true), 'realizada');
});

// ── A foto do espaço acompanha o espaço ───────────────────────────────
bloco('Renomear leva a foto junto', () => {
  const mapa = { quadra_de_areia: 'FOTO-A', sal_o_de_festa: 'FOTO-B' };
  const r = api.espFotosRenomear(mapa, 'Quadra de Areia', 'Quadra de Areia Nova');
  checa('a foto aparece sob a chave nova', r.quadra_de_areia_nova, 'FOTO-A');
  checa('e sai da chave velha', r.quadra_de_areia, undefined);
  checa('as outras ficam', r.sal_o_de_festa, 'FOTO-B');
  checa('o mapa original não é tocado', mapa.quadra_de_areia, 'FOTO-A');
});

bloco('Renomear espaço sem foto não inventa foto', () => {
  const r = api.espFotosRenomear({ sal_o_de_festa: 'FOTO-B' }, 'Quiosque', 'Quiosque Novo');
  checa('nada foi criado', Object.keys(r).sort(), ['sal_o_de_festa']);
});

bloco('Excluir leva a foto embora', () => {
  const mapa = { quadra_de_areia: 'FOTO-A', sal_o_de_festa: 'FOTO-B' };
  const r = api.espFotosExcluir(mapa, 'Salão de Festa');
  checa('a foto do excluído some', r.sal_o_de_festa, undefined);
  checa('a outra fica', r.quadra_de_areia, 'FOTO-A');
  checa('o mapa original não é tocado', Object.keys(mapa).length, 2);
});

bloco('Mapa vazio ou ausente não quebra', () => {
  checa('renomear em mapa nulo', api.espFotosRenomear(null, 'A', 'B'), {});
  checa('excluir em mapa nulo', api.espFotosExcluir(null, 'A'), {});
});

// ── Ícone de quem ainda não tem foto ──────────────────────────────────
bloco('Sem foto, o cartão mostra um ícone que diz algo', () => {
  checa('quadra de tênis', api._espIcone('Quadra de tênis - saibro'), 'fa-table-tennis-paddle-ball');
  checa('campo de futebol', api._espIcone('Campo de Futebol'), 'fa-futbol');
  checa('ginásio (com acento)', api._espIcone('Ginásio'), 'fa-dumbbell');
  checa('salão de festa', api._espIcone('Salão de Festa'), 'fa-champagne-glasses');
  checa('cozinha / espaço lazer', api._espIcone('Cozinha / Espaço Lazer'), 'fa-utensils');
  checa('sala coworking', api._espIcone('Sala coworking'), 'fa-laptop');
  checa('espaço que ninguém previu tem ícone genérico',
        api._espIcone('Espaço do Zezinho'), 'fa-location-dot');
});

// ── Espaço desativado continua na tela, mas travado ───────────────────
bloco('Espaço desativado aparece para todo mundo, sem poder ser escolhido', () => {
  const LISTA = ['Quadra de areia', 'Sala de jogos', 'Quiosque'];
  const CFG = { disp_sala_de_jogos_ativo: false };
  const r = api.espListaParaForm(LISTA, CFG, '');

  checa('nenhum espaço some da lista', r.map((e) => e.nome), LISTA);
  checa('o desativado vem travado', r[1].travado, true);
  checa('e marcado como inativo', r[1].ativo, false);
  checa('os ativos não vêm travados', [r[0].travado, r[2].travado], [false, false]);
});

bloco('A reserva aberta não perde o próprio espaço', () => {
  // Reserva antiga marcada num espaço que o condomínio desativou depois:
  // se ele viesse travado, abrir a reserva para corrigir um telefone a
  // faria perder o espaço no salvamento.
  const r = api.espListaParaForm(
    ['Quadra de areia', 'Sala de jogos'], { disp_sala_de_jogos_ativo: false }, 'Sala de jogos');
  checa('o espaço da própria reserva continua selecionável', r[1].travado, false);
  checa('mas segue sinalizado como inativo', r[1].ativo, false);
});

bloco('Sem configuração, todo espaço está ativo', () => {
  const r = api.espListaParaForm(['Quiosque', 'Ginásio'], {}, '');
  checa('nada travado', r.map((e) => e.travado), [false, false]);
  // Só `false` desativa: uma chave ausente, ou qualquer outro valor, é ativo.
  const r2 = api.espListaParaForm(['Quiosque'], { disp_quiosque_ativo: true }, '');
  checa('true também é ativo', r2[0].travado, false);
});

bloco('Lista vazia ou ausente não quebra', () => {
  checa('lista nula', api.espListaParaForm(null, {}, ''), []);
  checa('cfg nula', api.espListaParaForm(['Quiosque'], null, '').length, 1);
});

// ── Tab no campo de unidade ───────────────────────────────────────────
// O dropdown de unidade so respondia a clique. Quem digitava "B01" e apertava
// Tab via o campo preenchido e por baixo nao tinha acontecido nada: a unidade
// de verdade continuava vazia e a lista de moradores seguia dizendo
// "selecione a unidade acima".
bloco('Tab/Enter confirmam a unidade quando nao ha duvida', () => {
  const L = ['B01', 'B02', 'K15'];
  checa('digitou a unidade inteira', api.mresLoteEscolhaTeclado('B01', L, -1), 'B01');
  checa('minuscula tambem vale', api.mresLoteEscolhaTeclado('b01', L, -1), 'B01');
  checa('com espaco sobrando', api.mresLoteEscolhaTeclado(' B01 ', L, -1), 'B01');
  checa('sobrou uma so na lista filtrada',
        api.mresLoteEscolhaTeclado('K', ['K15'], -1), 'K15');
  checa('escolheu com as setas', api.mresLoteEscolhaTeclado('B', L, 1), 'B02');
  checa('a seta ganha do texto digitado', api.mresLoteEscolhaTeclado('K15', L, 0), 'B01');
});

bloco('Com duvida, nao adivinha', () => {
  const L = ['B01', 'B02', 'K15'];
  // Marcar a reserva na casa errada e pior do que pedir para terminar de
  // escolher. "B0" casa com B01 e B02: nao se escolhe nenhuma.
  checa('prefixo ambiguo nao escolhe', api.mresLoteEscolhaTeclado('B0', ['B01','B02'], -1), '');
  checa('campo vazio nao escolhe', api.mresLoteEscolhaTeclado('', L, -1), '');
  checa('so espacos nao escolhe', api.mresLoteEscolhaTeclado('   ', L, -1), '');
  checa('unidade que nao existe nao escolhe', api.mresLoteEscolhaTeclado('XX9', L, -1), '');
  checa('lista vazia nao escolhe', api.mresLoteEscolhaTeclado('B01', [], -1), '');
  checa('lista ausente nao quebra', api.mresLoteEscolhaTeclado('B01', null, -1), '');
  checa('indice fora da lista cai na regra do texto',
        api.mresLoteEscolhaTeclado('B01', L, 99), 'B01');
});

// ── Supervisor administra as reservas ─────────────────────────────────
// Ele existe para fazer o trabalho da administração num módulo só. Em
// Reservas isso quer dizer marcar para qualquer unidade, como o admin. Vinha
// caindo nas regras de morador em oito lugares diferentes — o seletor de
// unidade nem abria, a lista mostrava só as reservas dele, o formulário já
// vinha com o nome dele e a reserva nascia pendente.
bloco('Quem administra as reservas', () => {
  const quem = (n) => api.resEhAdministracao(n);
  checa('admin', quem('admin'), true);
  checa('gestor', quem('gestor'), true);
  checa('supervisor', quem('supervisor'), true);
  checa('morador NÃO', quem('morador'), false);
  checa('nível desconhecido NÃO', quem('financeiro'), false);
  // Sem nível informado, vale o de quem está logado (morador, no teste).
  checa('sem nível informado, olha quem está logado', quem(''), false);
});

bloco('A regra mora num lugar so', () => {
  const src = lerFonte();
  /* Espalhada em oito comparações, bastava esquecer uma para o supervisor
     voltar a ser morador em algum canto -- que é exatamente o que tinha
     acontecido. Estes são os pontos do fluxo de reserva. */
  [
    ['o seletor de unidade abre',        "if(!resEhAdministracao()) return;"],
    ['a lista mostra as de todos',       "const isMorador = !resEhAdministracao(nivel);"],
    ['o formulário deixa escolher',      "const isMorador = !resEhAdministracao(nivel);"],
    ['o salvamento trata como admin',    "const _isAdminRes = resEhAdministracao(_nivelRes);"],
    ['o status nasce confirmado',        "var souAdm = resEhAdministracao(nivel);"],
    ['o intervalo mínimo não barra',     "!resEhAdministracao(_nivelR)"],
    ['o contador de pendentes conta',    "if(!resEhAdministracao(nivel)) return 0;"],
  ].forEach(([oque, trecho]) => checa(oque, src.includes(trecho), true));

  // E o painel analítico NÃO entrou: lá o supervisor segue vendo a grade de
  // números, decisão antiga que "fazer reserva" não é motivo para desfazer.
  checa('o painel analítico ficou como estava',
    src.includes("var isMorador = (_nv !== 'admin' && _nv !== 'gestor');"), true);
});

// ── Clicar fora não pode apagar o formulário ──────────────────────────
bloco('A janela de reserva nao fecha por clique fora', () => {
  const src = lerFonte();
  /* O formulário de reserva é o mais longo do sistema: unidade, pessoa,
     telefone, espaço, data, horário, finalidade e os aceites do termo. Um
     toque errado na borda apagava tudo -- e no celular, onde a janela ocupa
     quase a tela inteira, a borda é justamente onde o dedo escorrega. */
  checa('o clique no fundo nao chama o fechamento',
    /id="m-res" onclick="event\.stopPropagation\(\)"/.test(src), true);
  checa('e nao sobrou o fechamento por clique fora',
    src.includes('id="m-res" onclick="if(event.target===this)fecharModalRes()"'), false);
  // Sai pelo X, que continua perguntando antes de descartar o que foi digitado.
  checa('o X continua fechando',
    /modal-close-x" onclick="fecharModalRes\(\)"/.test(src), true);
  checa('e o fechamento ainda oferece salvar',
    /function fecharModalRes\(\)[\s\S]{0,260}Deseja salvar a reserva antes de fechar/.test(src), true);
});

// ── Salvar a configuracao de reservas ─────────────────────────────────
bloco('Salvar horarios permitidos nao perde nem minte', () => {
  const src = lerFonte();

  /* Relato: "quando digito os horários nas quadra de saibro, quadra de tênis
     não está salvando... eu clico em salvar e não está salvando".
     Eram tres falhas somadas, todas com a mesma aparencia na tela. */

  // 1. Comecava de uma leitura crua do localStorage. Vazio ou atrasado, o
  //    salvamento partia de {} e apagava a lista de espacos do condominio e
  //    os horarios de todos os espacos fora da tela.
  checa('parte da configuracao em uso, nao do localStorage cru',
    /async function salvarCfgReservas\(\)[\s\S]{0,900}const cfgRes = getCfgRes\(\);/.test(src), true);
  checa('nao sobrou a leitura crua no salvamento',
    /function salvarCfgReservas\(\)[\s\S]{0,900}const cfgRes = JSON\.parse\(localStorage\.getItem/.test(src), false);

  // 2. O "✓ salvas!" aparecia antes da resposta do servidor. Quando ele
  //    recusava, setCfgRes desfazia tudo depois -- com um visto verde no meio.
  checa('espera o servidor antes de anunciar',
    /await setCfgRes\(cfgRes\);/.test(src), true);
  checa('e nao anuncia sucesso quando o servidor recusa',
    /_r\.ok === false[\s\S]{0,220}return;[\s\S]{0,420}Configuracoes de reservas salvas|_r\.ok === false[\s\S]{0,220}return;[\s\S]{0,420}Configurações de reservas salvas/.test(src), true);

  // 3. getCfgRes entregava o proprio objeto do cache, que o salvamento altera
  //    no lugar: a configuracao recusada ficava valendo e o desfazer nao tinha
  //    mais estado anterior para restaurar.
  checa('getCfgRes devolve uma copia',
    /function getCfgRes\(\)[\s\S]{0,700}return JSON\.parse\(JSON\.stringify\(m\)\);/.test(src), true);
  checa('o desfazer restaura tambem o cache em memoria',
    /function setCfgRes[\s\S]{0,3000}if\(_tinhaMem\) DB_CACHE\['cfg_reservas'\] = _antesMem;/.test(src), true);

  // Falta de espaco no aparelho tambem nao pode passar calada: a tela
  // continuaria mostrando a configuracao velha depois de salvar.
  checa('avisa quando o aparelho esta sem espaco',
    /_lsOk = false[\s\S]{0,700}Sem espaço para guardar neste aparelho/.test(src), true);
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.error('FALHARAM ' + falhas + ' DE ' + (ok + falhas)); process.exit(1); }
console.log('TODOS OS TESTES PASSARAM (' + ok + ')');
console.log('-'.repeat(50));
