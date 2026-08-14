// Testes do cadastro de unidades — o vínculo com o condômino.
// Rodar:  node tests/unidades.test.js
//
// As funções são lidas do próprio adminpro.html (ver tests/extrair.js).
//
// Duas coisas se protegem aqui, e as duas apagavam dado em silêncio:
//   1. o proprietário gravado sumir do <select> e o Salvar seguinte gravar
//      vazio por cima;
//   2. o atalho "Novo condômino" trocar de tela e levar junto tudo o que
//      já tinha sido digitado na unidade.

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

// Um <select> de mentira, com o comportamento que importa do de verdade:
// atribuir um value que não existe entre as <option> não pega — o navegador
// descarta em silêncio, e é disso que nasce o bug.
function selectFalso() {
  const s = {
    _v: '', _ops: [],
    get value() { return s._v; },
    set value(v) { if (v === '' || s._ops.indexOf(v) !== -1) s._v = v; },
    set innerHTML(h) {
      s._ops = [];
      const re = /value="([^"]*)"/g;
      let m;
      while ((m = re.exec(h))) if (m[1]) s._ops.push(m[1]);
      s._v = '';
    },
    appendChild(o) { s._ops.push(o.value); },
  };
  return s;
}

function montar(condominos, valores) {
  const els = {
    'uni-proprietario': selectFalso(),
    'uni-morador': selectFalso(),
    'uni-cond-box': null,
  };
  const api = carregar(['popUnidadeCondominos', 'uniDefinirVinculo'], {
    $: (id) => els[id],
    getCondominos: () => condominos,
    escU: (t) => String(t == null ? '' : t),
    document: { createElement: () => ({ value: '', textContent: '', style: {} }) },
  });
  // Estado inicial: o que já estava gravado na unidade.
  Object.keys(valores).forEach((id) => {
    els[id]._ops = [valores[id]];
    els[id]._v = valores[id];
  });
  api.popUnidadeCondominos();
  return els;
}

// ── O vínculo gravado não pode evaporar ───────────────────────────────
bloco('Proprietário gravado sobrevive a recarregar a lista', () => {
  const cs = { C001: { nome: 'Ana' }, C002: { nome: 'Bruno' } };

  const normal = montar(cs, { 'uni-proprietario': 'C001', 'uni-morador': 'C002' });
  checa('quem está na lista continua marcado', normal['uni-proprietario'].value, 'C001');
  checa('o morador também', normal['uni-morador'].value, 'C002');

  // O caso perigoso: o condômino foi excluído, ou a lista ainda não carregou.
  // Sem a opção de resgate, o value virava '' e o Salvar apagava o dono.
  const sumiu = montar(cs, { 'uni-proprietario': 'C999', 'uni-morador': '' });
  checa('vínculo fora da lista não é descartado', sumiu['uni-proprietario'].value, 'C999');

  const vazia = montar({}, { 'uni-proprietario': 'C001', 'uni-morador': '' });
  checa('lista ainda não carregada não apaga o dono', vazia['uni-proprietario'].value, 'C001');

  const semNada = montar(cs, { 'uni-proprietario': '', 'uni-morador': '' });
  checa('unidade sem dono continua sem dono', semNada['uni-proprietario'].value, '');
});

// ── O caminho de verdade: abrir a unidade para editar ─────────────────
// O bloco acima testava popUnidadeCondominos() sozinho, com o valor já no
// campo. Só que editarUnidade() faz o contrário — monta a lista e SÓ ENTÃO
// escreve o proprietário. A primeira versão da correção não cobria isso, e o
// bug continuava vivo exatamente no caminho mais usado. Este bloco testa por
// onde a pessoa realmente passa.
bloco('Abrir unidade para editar não perde o proprietário', () => {
  function abrir(condominos, unidade) {
    const els = {
      'uni-proprietario': selectFalso(),
      'uni-morador': selectFalso(),
      'uni-cod': { value: '' }, 'uni-tipo': { value: '' }, 'uni-rua': { value: '' },
      'uni-numero': { value: '' }, 'uni-bairro': { value: '' }, 'uni-cidade': { value: '' },
      'uni-estado': { value: '' }, 'uni-form-title': { textContent: '' },
      'uni-form-card': { style: {}, scrollIntoView(){} },
      'uni-btn-novo': { style: {} },
      'uni-btn-excluir': { style: {}, dataset: {} },
      'uni-cond-titulo': { style: {} },
      'uni-cond-box': null,
    };
    const api = carregar(
      ['editarUnidade', 'uniDefinirVinculo', 'popUnidadeCondominos', 'uniAplicarModuloCondominos',
       'uniTemModuloCondominos'],
      {
        $: (id) => els[id],
        getUnidades: () => ({ '15': unidade }),
        getCondominos: () => condominos,
        escU: (t) => String(t == null ? '' : t),
        modulosVisiveis: () => ['unidades', 'condominos'],
        popUnidadeSelects: () => {}, // o datalist de rua/UF não interessa aqui
        document: { createElement: () => ({ value: '', textContent: '', style: {} }) },
      });
    api.popUnidadeCondominos();      // como a tela faz ao abrir
    api.editarUnidade('15');
    return els;
  }

  const cs = { C001: { nome: 'Ana' } };

  const normal = abrir(cs, { proprietario: 'C001', morador: 'C001' });
  checa('dono conhecido aparece marcado', normal['uni-proprietario'].value, 'C001');

  // O caso que apagava dado: a lista de condôminos ainda não chegou do
  // servidor. Antes o campo abria vazio e o Salvar gravava vazio por cima.
  const carregando = abrir({}, { proprietario: 'C001', morador: '' });
  checa('lista vazia não apaga o dono ao abrir', carregando['uni-proprietario'].value, 'C001');

  // Condômino excluído: o vínculo continua visível em vez de sumir calado.
  const excluido = abrir(cs, { proprietario: 'C777', morador: 'C001' });
  checa('dono excluído continua no campo', excluido['uni-proprietario'].value, 'C777');
  checa('e o morador válido não é afetado', excluido['uni-morador'].value, 'C001');

  const semDono = abrir(cs, { proprietario: '', morador: '' });
  checa('unidade sem dono abre sem dono', semDono['uni-proprietario'].value, '');
});

// ── O módulo Condôminos pode estar desligado ──────────────────────────
bloco('Bloco de condôminos acompanha o módulo do condomínio', () => {
  function comModulos(mods) {
    const estilos = { 'uni-cond-titulo': {}, 'uni-cond-box': {} };
    const api = carregar(['uniTemModuloCondominos', 'uniAplicarModuloCondominos'], {
      $: (id) => (estilos[id] ? { style: estilos[id] } : null),
      modulosVisiveis: () => mods,
    });
    const mostrou = api.uniAplicarModuloCondominos();
    return { mostrou, titulo: estilos['uni-cond-titulo'].display, box: estilos['uni-cond-box'].display };
  }

  const ligado = comModulos(['unidades', 'localizacoes', 'condominos']);
  checa('módulo ligado: bloco aparece', [ligado.mostrou, ligado.box], [true, '']);

  // Condomínio novo, com só o básico liberado: não há quem escolher, e o
  // botão levaria a uma tela que a pessoa não pode abrir.
  const desligado = comModulos(['unidades', 'localizacoes']);
  checa('módulo desligado: bloco some', [desligado.mostrou, desligado.box], [false, 'none']);
  checa('e o título some junto', desligado.titulo, 'none');
});

// ── O atalho não pode levar o formulário embora ───────────────────────
bloco('Atalho "Novo condômino" guarda o que já foi digitado', () => {
  const memoria = {};
  const campos = {
    'uni-cod': '15', 'uni-tipo': 'Terreno', 'uni-rua': 'Rua das Palmeiras',
    'uni-numero': '123', 'uni-bairro': 'Centro', 'uni-cidade': 'Florianópolis',
    'uni-estado': 'SC', 'uni-proprietario': '', 'uni-morador': '',
  };
  const els = {};
  Object.keys(campos).forEach((id) => { els[id] = { value: campos[id] }; });
  els['uni-btn-excluir'] = { style: { display: 'none' }, dataset: {} };

  let avisos = [], foiPara = '';
  const stubs = {
    $: (id) => els[id] || null,
    _condAtual: 'NOVO',
    sessionStorage: {
      setItem: (k, v) => { memoria[k] = v; },
      getItem: (k) => (k in memoria ? memoria[k] : null),
      removeItem: (k) => { delete memoria[k]; },
    },
    toast: (m) => avisos.push(String(m)),
    showPanel: (p) => { foiPara = p; },
    setTimeout: () => {},
    modulosVisiveis: () => ['unidades', 'condominos'],
    // Constantes do arquivo: o extrator recorta funções, não declarações
    // soltas. Ficam aqui com o MESMO valor do adminpro.html.
    _UNI_RASCUNHO: 'apvc_uni_rascunho',
    _UNI_CAMPOS: Object.keys(campos),
  };
  const api = carregar(
    ['_uniRascunhoChave', 'uniGuardarRascunho', 'uniTemModuloCondominos', 'uniNovoCondomino'],
    stubs);

  api.uniNovoCondomino();

  const guardado = JSON.parse(memoria['apvc_uni_rascunho_NOVO'] || 'null');
  checa('foi para a tela de condôminos', foiPara, 'condominos');
  checa('a rua digitada ficou guardada', guardado && guardado['uni-rua'], 'Rua das Palmeiras');
  checa('o código também', guardado && guardado['uni-cod'], '15');
  checa('sabe que era cadastro novo, não edição', guardado && guardado._editando, false);
  checa('e a pessoa é avisada de que nada se perdeu',
        /ficou guardado/i.test(avisos.join(' ')), true);

  // Cada condomínio tem a sua gaveta: trocar de condomínio não pode fazer o
  // rascunho de um reaparecer no formulário do outro.
  checa('o rascunho é por condomínio', api._uniRascunhoChave(), 'apvc_uni_rascunho_NOVO');
});

bloco('Sem o módulo, o atalho avisa em vez de levar a lugar nenhum', () => {
  let avisos = [], foiPara = '';
  const api = carregar(['uniTemModuloCondominos', 'uniNovoCondomino'], {
    $: () => null,
    _condAtual: 'NOVO',
    sessionStorage: { setItem(){}, getItem: () => null, removeItem(){} },
    toast: (m) => avisos.push(String(m)),
    showPanel: (p) => { foiPara = p; },
    setTimeout: () => {},
    modulosVisiveis: () => ['unidades', 'localizacoes'],
    _UNI_RASCUNHO: 'apvc_uni_rascunho',
    _UNI_CAMPOS: [],
  });

  api.uniNovoCondomino();
  checa('não troca de tela', foiPara, '');
  checa('e explica o porquê', /não está liberado/i.test(avisos.join(' ')), true);
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.error('FALHARAM ' + falhas + ' DE ' + (ok + falhas)); process.exit(1); }
console.log('TODOS OS TESTES PASSARAM (' + ok + ')');
console.log('-'.repeat(50));
