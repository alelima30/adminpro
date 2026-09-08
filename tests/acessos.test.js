// Testes do acesso por usuário — a tela liberada caso a caso.
// Rodar:  node tests/acessos.test.js
//
// O pedido que originou este arquivo: o diretor precisa acompanhar a Central
// de Acompanhamento, mas não pode mexer em Reservas. Como gestor ele ganharia
// o sistema inteiro; como supervisor perderia as telas de morador. Então ele
// fica MORADOR e recebe SÓ a tela extra.
//
// O risco que estes testes guardam é o contrário do que se testa de costume:
// não é "será que abre?", é "será que abriu DEMAIS?".

const { carregar } = require('./extrair');

const ACESSO_PAINEIS = {
  admin:   ['inicio', 'dashboard', 'acompanhamento', 'reservas', 'financeiro', 'condominos', 'usuarios'],
  gestor:  ['inicio', 'dashboard', 'acompanhamento', 'reservas', 'financeiro', 'condominos', 'relatorios', 'espacos'],
  morador: ['inicio', 'reservas', 'encomendas', 'comunicados'],
};
const MODULOS_SAAS = {
  acompanhamento: { label: 'Central de Acompanhamento', grupo: 'administrativo' },
  financeiro:     { label: 'Financeiro',                grupo: 'administrativo' },
  reservas:       { label: 'Reservas',                  grupo: 'operacoes' },
  encomendas:     { label: 'Encomendas',                grupo: 'operacoes' },
  comunicados:    { label: 'Comunicados',               grupo: 'operacoes' },
  condominos:     { label: 'Condôminos',                grupo: 'administrativo' },
};
const TODOS = Object.keys(MODULOS_SAAS);

// Monta as funções reais do app para um usuário: nível, o que foi liberado
// caso a caso para ele, e o que o condomínio liberou para os moradores.
function usuario({ nivel, extras = {}, moradores = null, ativos = TODOS, sup = false }) {
  return carregar(
    ['modulosVisiveis', 'paineisPermitidos', '_telasExtras', '_telaExtra', '_grupoTemExtra'],
    {
      window: { _userNivel: nivel },
      isSuperAdmin: () => sup,
      modulosAtivos: () => ativos,
      _supervisorMods: () => extras,
      G: (k) => (k === 'modulos_morador' ? moradores : null),
      ACESSO_PAINEIS,
      MODULOS_SAAS,
    },
  );
}

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

// ── O diretor: morador com uma tela a mais ────────────────────────────
bloco('Morador com tela extra', () => {
  const a = usuario({ nivel: 'morador', extras: { acompanhamento: true } });
  checa('a tela extra entra nos painéis permitidos',
        a.paineisPermitidos('morador').includes('acompanhamento'), true);
  checa('e o módulo fica visível', a.modulosVisiveis().includes('acompanhamento'), true);
  checa('continua com o que é de morador',
        a.paineisPermitidos('morador').includes('reservas'), true);

  // O ponto do pedido: ele NÃO vira gestor. Nada mais pode ter vindo junto.
  checa('não ganha Financeiro', a.paineisPermitidos('morador').includes('financeiro'), false);
  checa('não ganha Condôminos', a.paineisPermitidos('morador').includes('condominos'), false);
  checa('não ganha Usuários',   a.paineisPermitidos('morador').includes('usuarios'), false);
});

bloco('Sem nada marcado, morador é morador', () => {
  const a = usuario({ nivel: 'morador', extras: {} });
  checa('nenhuma tela extra', a._telasExtras(), {});
  checa('não vê a Central', a.paineisPermitidos('morador').includes('acompanhamento'), false);
  checa('painéis são os de morador', a.paineisPermitidos('morador'), ACESSO_PAINEIS.morador);
});

// ── Tirar o acesso é o outro lado do pedido: troca de diretor ─────────
bloco('Desmarcar tira o acesso', () => {
  const a = usuario({ nivel: 'morador', extras: { acompanhamento: false } });
  checa('não entra nos painéis', a.paineisPermitidos('morador').includes('acompanhamento'), false);
  checa('não é tela extra', a._telaExtra('acompanhamento'), false);
});

// ── A liberação individual vale mesmo com a tela fechada no geral ─────
bloco('Fechada para os moradores, aberta para esta pessoa', () => {
  const a = usuario({
    nivel: 'morador',
    extras: { acompanhamento: true },
    moradores: { acompanhamento: false, financeiro: false },
  });
  checa('a tela liberada aparece', a.modulosVisiveis().includes('acompanhamento'), true);
  checa('a que não foi liberada continua fora', a.modulosVisiveis().includes('financeiro'), false);
});

// ── Módulo desligado pelo condomínio ganha de tudo ────────────────────
bloco('Módulo desligado pela plataforma não volta pela porta dos fundos', () => {
  const a = usuario({
    nivel: 'morador',
    extras: { acompanhamento: true },
    ativos: TODOS.filter((k) => k !== 'acompanhamento'),
  });
  checa('não fica visível', a.modulosVisiveis().includes('acompanhamento'), false);
});

// ── Registro antigo não pode reviver ──────────────────────────────────
bloco('Registro de outro nível não vale sozinho', () => {
  // Quem foi supervisor e virou gestor deixa registro para trás. Ele não pode
  // continuar valendo: em gestor o acesso vem do nível, e um dia esta pessoa
  // pode voltar a ser morador.
  ['admin', 'gestor'].forEach((n) => {
    const a = usuario({ nivel: n, extras: { acompanhamento: true } });
    checa(n + ' não usa o registro por usuário', a._telasExtras(), {});
  });
  const s = usuario({ nivel: 'supervisor', extras: { acompanhamento: true } });
  checa('supervisor também não (o acesso dele já é a própria lista)', s._telasExtras(), {});
  checa('e o supervisor continua enxergando só o que foi marcado',
        s.modulosVisiveis(), ['acompanhamento']);
  checa('supervisor não herda as telas de morador',
        s.paineisPermitidos('supervisor').includes('reservas'), false);
});

bloco('Super-admin não passa por aqui', () => {
  const a = usuario({ nivel: 'morador', extras: { acompanhamento: true }, sup: true });
  checa('nenhuma tela extra (ele já vê tudo por outro caminho)', a._telasExtras(), {});
});

// ── O menu precisa ter por onde abrir a tela ──────────────────────────
bloco('O grupo do menu aparece por causa da tela extra', () => {
  const a = usuario({ nivel: 'morador', extras: { acompanhamento: true } });
  checa('grupo Administrativo aparece', a._grupoTemExtra('administrativo'), true);
  checa('grupo Operações não aparece por isso', a._grupoTemExtra('operacoes'), false);
  const b = usuario({ nivel: 'morador', extras: {} });
  checa('sem tela extra, nenhum grupo é forçado', b._grupoTemExtra('administrativo'), false);
});

// ── Relatórios/Espaços dependem do módulo reservas ────────────────────
bloco('Relatórios e Espaços seguem o módulo Reservas', () => {
  const a = usuario({ nivel: 'morador', extras: { reservas: true } });
  checa('liberar reservas traz Relatórios', a._telaExtra('relatorios'), true);
  checa('e traz Espaços', a._telaExtra('espacos'), true);
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.error('FALHARAM ' + falhas + ' DE ' + (ok + falhas)); process.exit(1); }
console.log('TODOS OS TESTES PASSARAM (' + ok + ')');
console.log('-'.repeat(50));
