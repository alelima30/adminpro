// Cadastro rápido de pessoa na tela de reserva — as travas contra duplicata.
// Rodar:  node tests/pessoas.test.js
//
// O problema que estas regras resolvem: a mesma pessoa pode entrar no sistema
// por dois caminhos. A administração cadastra ("Alessandra, inquilina do
// L17"), e a própria pessoa se cadastra pelo link do app declarando o L17. Se
// os dois registros não se reconhecerem, a lista da unidade passa a mostrar
// "Alessandra" duas vezes — e a reserva feita por uma não é achada pela
// outra.
//
// Os nomes NUNCA vêm iguais na vida real: "ALESSANDRA SOUZA", "Alessandra
// Souza", "Alessandra  Souza". Por isso a comparação é normalizada, e por
// isso o CPF existe no formulário.

const { carregar } = require('./extrair');

let CONDOMINOS = {};
const api = carregar(
  ['mresConflitoPessoa', 'mresCondominoPorCpf', '_musrNorm', '_soDigitos'],
  { getCondominos: () => CONDOMINOS },
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

// ── Trava 1: já está no cadastro do condomínio ────────────────────────
bloco('Quem já está no cadastro não é cadastrado de novo', () => {
  const ja = { cod: '0001', papel: 'morador', tel: '11911111111', dep: -1 };
  const r = api.mresConflitoPessoa('Alessandra Souza', '', ja, []);
  checa('a ação é selecionar, não criar', r.acao, 'ja-cadastrado');
  checa('e diz em que papel ela está', r.papel, 'morador');
});

// ── Trava 2: tem conta no app, fora do cadastro ───────────────────────
bloco('Quem tem conta no app é aproveitado, não duplicado', () => {
  const pessoas = [
    { nome: 'Carlos Pereira', origem: 'cadastro' },
    { nome: 'Alessandra Souza', origem: 'app', tel: '11977776666' },
  ];
  const r = api.mresConflitoPessoa('Alessandra Souza', '', null, pessoas);
  checa('reconhece a conta do app', r.acao, 'vincular-conta-app');
  checa('traz o telefone que ela mesma informou', r.tel, '11977776666');

  // O ponto todo: os nomes nunca vêm iguais.
  const caixa = api.mresConflitoPessoa('ALESSANDRA SOUZA', '', null, pessoas);
  checa('caixa alta reconhece', caixa.acao, 'vincular-conta-app');
  const acento = api.mresConflitoPessoa('Alessandra Souza', '', null,
    [{ nome: 'Aléssandra Sóuza', origem: 'app' }]);
  checa('acento reconhece', acento.acao, 'vincular-conta-app');
  const espaco = api.mresConflitoPessoa('Alessandra  Souza ', '', null, pessoas);
  checa('espaço sobrando reconhece', espaco.acao, 'vincular-conta-app');

  // E o nome guardado é o do app, para os dois colapsarem numa linha só.
  checa('fica com o nome da conta do app', caixa.nome, 'Alessandra Souza');
});

bloco('Quem está no cadastro não é confundido com conta do app', () => {
  // Alguém do cadastro (origem 'cadastro') não dispara o caminho do app.
  const r = api.mresConflitoPessoa('Carlos Pereira', '', null,
    [{ nome: 'Carlos Pereira', origem: 'cadastro' }]);
  checa('cai no caminho de criar', r.acao, 'criar');
});

// ── Pessoa realmente nova ─────────────────────────────────────────────
bloco('Pessoa nova é criada', () => {
  const r = api.mresConflitoPessoa('  Alessandra Souza  ', ' 222.222.222-22 ', null, []);
  checa('ação criar', r.acao, 'criar');
  checa('nome sem espaço sobrando', r.nome, 'Alessandra Souza');
  checa('cpf vem junto', r.cpf, '222.222.222-22');
});

bloco('Sem nome não cadastra nada', () => {
  checa('vazio', api.mresConflitoPessoa('', '', null, []).acao, 'sem-nome');
  checa('só espaços', api.mresConflitoPessoa('    ', '', null, []).acao, 'sem-nome');
  checa('nulo', api.mresConflitoPessoa(null, '', null, []).acao, 'sem-nome');
});

bloco('Lista de pessoas ausente não quebra', () => {
  checa('null', api.mresConflitoPessoa('Fulano', '', null, null).acao, 'criar');
});

// ── Trava 3: mesma pessoa, outro lote (mudou de casa) ─────────────────
bloco('CPF encontra a pessoa em qualquer unidade', () => {
  CONDOMINOS = {
    '0001': { nome: 'Carlos Pereira', cpf: '111.111.111-11' },
    '0002': { nome: 'Alessandra S. Souza', cpf: '22222222222' },
  };
  // Criar ficha nova para quem já tem uma é a pior duplicata: duas fichas da
  // mesma pessoa, cada uma com seu histórico.
  const r = api.mresCondominoPorCpf('222.222.222-22');
  checa('acha mesmo com pontuação diferente', r && r.cod, '0002');
  checa('e devolve o registro', r && r.reg.nome, 'Alessandra S. Souza');

  checa('CPF que não existe não acha', api.mresCondominoPorCpf('99999999999'), null);
  checa('CPF incompleto não arrisca', api.mresCondominoPorCpf('2222'), null);
  checa('vazio não acha', api.mresCondominoPorCpf(''), null);
  checa('nulo não acha', api.mresCondominoPorCpf(null), null);
});

bloco('Cadastro sem CPF não dá falso positivo', () => {
  CONDOMINOS = { '0001': { nome: 'Sem CPF' }, '0002': { nome: 'Outro', cpf: '' } };
  checa('ninguém é encontrado por CPF vazio', api.mresCondominoPorCpf('22222222222'), null);
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.error('FALHARAM ' + falhas + ' DE ' + (ok + falhas)); process.exit(1); }
console.log('TODOS OS TESTES PASSARAM (' + ok + ')');
console.log('-'.repeat(50));
