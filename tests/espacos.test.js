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

const { carregar } = require('./extrair');

const api = carregar(
  ['resStatusAoSalvar', 'espFotosRenomear', 'espFotosExcluir', '_chvEsp', '_espIcone', 'semAcento'],
  {},
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
  checa('supervisor não é admin aqui (segue a regra do espaço)',
        api.resStatusAoSalvar('supervisor', null, true), 'pendente');
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

console.log('\n' + '-'.repeat(50));
if (falhas) { console.error('FALHARAM ' + falhas + ' DE ' + (ok + falhas)); process.exit(1); }
console.log('TODOS OS TESTES PASSARAM (' + ok + ')');
console.log('-'.repeat(50));
