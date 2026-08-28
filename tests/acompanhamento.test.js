// Testes da Central de Acompanhamento.
// Rodar:  node tests/acompanhamento.test.js
//
// As funções são lidas do próprio adminpro.html (ver tests/extrair.js).
//
// O módulo existe para que a Diretoria pare de descobrir o andamento das
// coisas perguntando. Isso só funciona se duas coisas forem verdade: a
// contagem dos cards bater com a realidade, e o histórico nunca perder uma
// linha. É o que estes testes protegem.

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

const api = carregar(
  ['acompStatusInfo', 'acompContar', 'acompUltimaAtualizacao', 'acompFiltrar',
   'acompDecisoesVencendo', 'acompRegistrar', 'acompRelatorioTexto',
   'acompData', 'acompDataHora', '_acompCategorias', '_acompResponsaveis',
   'acompPodeEditar', 'acompPodeDecidir', '_acompAgora', '_acompQuem'],
  {
    ACOMP_STATUS: [
      { id:'AGUARDANDO_DIRETORIA', label:'Aguardando Diretoria', classe:'acomp-st-diretoria', icone:'i', cor:'#e05252', desc:'d' },
      { id:'PENDENTE',             label:'Pendente',             classe:'acomp-st-pendente',  icone:'i', cor:'#e87722', desc:'d' },
      { id:'EM_ANDAMENTO',         label:'Em andamento',         classe:'acomp-st-andamento', icone:'i', cor:'#c9a030', desc:'d' },
      { id:'AGUARDANDO_TERCEIROS', label:'Aguardando terceiros', classe:'acomp-st-terceiros', icone:'i', cor:'#3d8fdd', desc:'d' },
      { id:'CONCLUIDO',            label:'Concluído',            classe:'acomp-st-concluido', icone:'i', cor:'#2ea36f', desc:'d' },
    ],
    ACOMP_CATEGORIAS: ['Administração', 'Segurança', 'Manutenção', 'Outros'],
    _reslHojeISO: () => '2026-08-28',
    localStorage: { getItem: () => '{"nome":"Alessandro Lima"}' },
    isSuperAdmin: () => false,
    window: { _userNivel: 'admin' },
  });

const {
  acompStatusInfo, acompContar, acompUltimaAtualizacao, acompFiltrar,
  acompDecisoesVencendo, acompRegistrar, acompRelatorioTexto,
  acompData, _acompCategorias, _acompResponsaveis,
} = api;

function assunto(extra) {
  return Object.assign({
    id: 'A1', titulo: 'Assunto', categoria: 'Manutenção', status: 'PENDENTE',
    responsavel: 'Administração', criadoEm: '2026-08-20T10:00:00.000Z',
    atualizadoEm: '2026-08-20T10:00:00.000Z', historico: [],
  }, extra || {});
}

const BASE = [
  assunto({ id:'1', titulo:'Manutenção das câmeras da portaria', categoria:'Segurança',
            status:'EM_ANDAMENTO', atualizadoEm:'2026-08-28T09:45:00.000Z' }),
  assunto({ id:'2', titulo:'Orçamento pintura da sede', status:'AGUARDANDO_DIRETORIA',
            solicitacao:'Aprovação do orçamento de R$ 3.850,00.', prazoDecisao:'2026-08-30',
            atualizadoEm:'2026-08-27T11:00:00.000Z' }),
  assunto({ id:'3', titulo:'Manutenção da fibra óptica', categoria:'Tecnologia / TI',
            status:'AGUARDANDO_TERCEIROS', responsavel:'Empresa X',
            atualizadoEm:'2026-08-28T08:00:00.000Z' }),
  assunto({ id:'4', titulo:'Revisão de contratos', categoria:'Administração',
            status:'PENDENTE', atualizadoEm:'2026-08-26T10:00:00.000Z' }),
  assunto({ id:'5', titulo:'Poda de árvores', status:'CONCLUIDO', responsavel:'Empresa Verde',
            atualizadoEm:'2026-08-24T10:00:00.000Z' }),
  // Dois pendentes de propósito: situação com um item só não pega erro de
  // contagem que só aparece quando há mais de um.
  assunto({ id:'6', titulo:'Falta de água – CIS', categoria:'Serviços Públicos',
            status:'PENDENTE', responsavel:'CIS', atualizadoEm:'2026-08-25T10:00:00.000Z' }),
];

// ── Os cinco cards ────────────────────────────────────────────────────
bloco('A contagem dos cards bate com a lista', () => {
  const c = acompContar(BASE);
  checa('aguardando Diretoria', c.AGUARDANDO_DIRETORIA, 1);
  checa('pendentes', c.PENDENTE, 2);
  checa('em andamento', c.EM_ANDAMENTO, 1);
  checa('aguardando terceiros', c.AGUARDANDO_TERCEIROS, 1);
  checa('concluídos', c.CONCLUIDO, 1);

  // A soma tem de fechar: card que não soma faz a Diretoria acreditar num
  // número que não existe, que é pior do que não ter card nenhum.
  const soma = Object.keys(c).reduce((s, k) => s + c[k], 0);
  checa('a soma fecha com o total', soma, BASE.length);

  const vazio = acompContar([]);
  checa('sem assuntos, tudo zero e nada indefinido',
        Object.keys(vazio).map((k) => vazio[k]), [0, 0, 0, 0, 0]);
});

bloco('Situação desconhecida não some da tela', () => {
  // Dado antigo ou digitado fora do sistema não pode desaparecer da lista:
  // sumir da tela é, para quem usa, o mesmo que ter sido apagado.
  const c = acompContar([assunto({ status: 'INVENTADO' })]);
  checa('entra na contagem mesmo assim', c.INVENTADO, 1);
  checa('e ganha um rótulo legível', acompStatusInfo('INVENTADO').label, 'INVENTADO');
  checa('sem status vira travessão', acompStatusInfo('').label, '—');
});

// ── Última movimentação ───────────────────────────────────────────────
bloco('O carimbo do topo é a movimentação mais recente', () => {
  checa('pega a maior data', acompUltimaAtualizacao(BASE), '2026-08-28T09:45:00.000Z');
  checa('sem assuntos, vazio', acompUltimaAtualizacao([]), '');
  // Assunto recém-criado ainda não tem 'atualizadoEm': vale a criação, senão
  // o topo diria "nenhum assunto" logo depois de cadastrar o primeiro.
  checa('cai para a data de criação',
        acompUltimaAtualizacao([{ criadoEm: '2026-08-01T00:00:00.000Z' }]), '2026-08-01T00:00:00.000Z');
});

// ── Filtros ───────────────────────────────────────────────────────────
bloco('Filtrar', () => {
  const ids = (f) => acompFiltrar(BASE, f).map((a) => a.id);

  checa('sem filtro, vêm todos', ids({}).length, 6);
  checa('e o mais recente primeiro', ids({})[0], '1');

  // Ordem: mais recente primeiro. O 4 mexeu dia 26, o 6 dia 25.
  checa('por situação', ids({ status: 'PENDENTE' }), ['4', '6']);
  checa('por categoria', ids({ categoria: 'Segurança' }), ['1']);
  checa('por responsável', ids({ responsavel: 'Empresa X' }), ['3']);

  checa('busca no título', ids({ busca: 'câmeras' }), ['1']);
  checa('busca não diferencia maiúscula', ids({ busca: 'CÂMERAS' }), ['1']);
  checa('busca alcança a solicitação à Diretoria', ids({ busca: '3.850' }), ['2']);
  checa('busca sem resultado devolve lista vazia', ids({ busca: 'zzzz' }), []);

  // Período olha a última movimentação, que é o que a pessoa tem em mente ao
  // perguntar "o que andou esta semana".
  checa('período recorta', ids({ de: '2026-08-27' }), ['1', '3', '2']);
  checa('período fechado', ids({ de: '2026-08-26', ate: '2026-08-26' }), ['4']);

  checa('dois filtros ao mesmo tempo',
        ids({ status: 'AGUARDANDO_TERCEIROS', categoria: 'Tecnologia / TI' }), ['3']);
  checa('filtros que se excluem não devolvem nada',
        ids({ status: 'CONCLUIDO', categoria: 'Segurança' }), []);

  // Filtrar não pode mexer na lista original — o card conta a lista inteira.
  const antes = BASE.length;
  acompFiltrar(BASE, { status: 'CONCLUIDO' });
  checa('a lista original fica intacta', BASE.length, antes);
});

// ── Prazo de decisão ──────────────────────────────────────────────────
bloco('Aviso de decisão vencendo', () => {
  const venc = (prazo, st) => acompDecisoesVencendo(
    [assunto({ status: st || 'AGUARDANDO_DIRETORIA', prazoDecisao: prazo })], '2026-08-28').length;

  checa('prazo de ontem avisa', venc('2026-08-27'), 1);
  checa('prazo de hoje avisa', venc('2026-08-28'), 1);
  checa('prazo de amanhã ainda não', venc('2026-08-29'), 0);
  checa('sem prazo não avisa', venc(''), 0);
  // Só faz sentido cobrar quem está esperando decisão. Um assunto já em
  // andamento com prazo velho viraria alarme falso todo dia.
  checa('assunto que não espera decisão não entra', venc('2026-08-01', 'EM_ANDAMENTO'), 0);
});

// ── Histórico ─────────────────────────────────────────────────────────
bloco('O histórico só cresce', () => {
  const a = assunto({ historico: [{ quando: '2026-08-20T10:00:00.000Z', texto: 'Assunto criado.' }] });

  acompRegistrar(a, 'Empresa acionada.');
  checa('a linha nova entra', a.historico.length, 2);
  checa('a antiga continua lá', a.historico[0].texto, 'Assunto criado.');
  checa('e a nova tem autor', !!a.historico[1].quem, true);

  // Mudar de situação NÃO pode limpar o que já aconteceu: o histórico é a
  // resposta para "isso está parado desde quando?".
  a.status = 'CONCLUIDO';
  acompRegistrar(a, 'Concluído.', { statusAnterior: 'EM_ANDAMENTO', novoStatus: 'CONCLUIDO' });
  checa('trocar de situação não apaga nada', a.historico.length, 3);
  checa('a mudança fica registrada', a.historico[2].novoStatus, 'CONCLUIDO');
  checa('com a situação anterior junto', a.historico[2].statusAnterior, 'EM_ANDAMENTO');

  // Registrar move o carimbo de última movimentação — senão o assunto
  // continuaria parecendo parado logo depois de alguém mexer nele.
  checa('o carimbo é atualizado', a.atualizadoEm > '2026-08-20T10:00:00.000Z', true);

  const semHist = assunto({ historico: undefined });
  acompRegistrar(semHist, 'Primeira.');
  checa('assunto sem histórico ganha um', semHist.historico.length, 1);
});

// ── Categorias e responsáveis dos filtros ─────────────────────────────
bloco('As listas dos filtros não escondem o que existe', () => {
  const cats = _acompCategorias(BASE);
  checa('as categorias fixas aparecem', cats.indexOf('Segurança') >= 0, true);
  // Categoria gravada que não está na lista fixa PRECISA aparecer, senão o
  // assunto existe e não há como filtrá-lo.
  checa('e a gravada fora da lista também', cats.indexOf('Tecnologia / TI') >= 0, true);
  checa('sem repetir', cats.filter((c) => c === 'Manutenção').length, 1);

  const resps = _acompResponsaveis(BASE);
  checa('responsáveis saem da lista real', resps.indexOf('Empresa X') >= 0, true);
  checa('e sem repetição', resps.filter((r) => r === 'Administração').length, 1);
});

// ── Relatório ─────────────────────────────────────────────────────────
bloco('Relatório para a reunião', () => {
  const txt = acompRelatorioTexto(BASE, {});
  checa('tem o cabeçalho', /CENTRAL DE ACOMPANHAMENTO/.test(txt), true);
  checa('traz a contagem por situação', /Aguardando Diretoria: 1/.test(txt), true);
  checa('e os pendentes', /Pendente: 2/.test(txt), true);
  checa('lista os assuntos', txt.indexOf('Manutenção das câmeras da portaria') >= 0, true);
  checa('mostra o total', /TOTAL: 6/.test(txt), true);
  checa('e o que a Diretoria precisa decidir', txt.indexOf('R$ 3.850,00') >= 0, true);

  // O relatório sai com os MESMOS filtros da tela: um relatório que ignora o
  // filtro obriga a montar tudo de novo à mão, e aí ninguém usa.
  const soConcluidos = acompRelatorioTexto(BASE, { status: 'CONCLUIDO' });
  checa('respeita o filtro', /TOTAL: 1/.test(soConcluidos), true);
  checa('e não traz o que foi filtrado fora',
        soConcluidos.indexOf('Manutenção das câmeras') >= 0, false);

  const vazio = acompRelatorioTexto([], {});
  checa('sem assuntos ainda gera relatório', /TOTAL: 0/.test(vazio), true);
});

// ── Datas ─────────────────────────────────────────────────────────────
bloco('Datas legíveis, sem "Invalid Date"', () => {
  checa('data solta', acompData('2026-08-28'), '28/08/2026');
  checa('data com hora', acompData('2026-08-28T09:45:00.000Z').length, 10);
  checa('vazio continua vazio', acompData(''), '');
  checa('lixo não vira data inválida', acompData('não é data'), '');
});

// ── Permissões ────────────────────────────────────────────────────────
bloco('Quem faz o quê', () => {
  const perm = (nivel, sup) => carregar(['acompPodeEditar', 'acompPodeDecidir'], {
    isSuperAdmin: () => !!sup,
    window: { _userNivel: nivel },
  });

  const adm = perm('admin');
  checa('administração edita', adm.acompPodeEditar(), true);
  checa('e também decide', adm.acompPodeDecidir(), true);

  // O pedido era claro: "a Diretoria não deve precisar editar o assunto para
  // tomar uma decisão". Então ela decide sem poder editar.
  const sup = perm('supervisor');
  checa('diretoria NÃO edita', sup.acompPodeEditar(), false);
  checa('mas decide', sup.acompPodeDecidir(), true);

  const mor = perm('morador');
  checa('morador não edita', mor.acompPodeEditar(), false);
  checa('nem decide', mor.acompPodeDecidir(), false);

  const su = perm('morador', true);
  checa('super-admin passa por cima', [su.acompPodeEditar(), su.acompPodeDecidir()], [true, true]);
});

// ── O cache não pode ser alterado antes de gravar ─────────────────────
// _acompDados() devolve uma CÓPIA. Sem isso, cada edição mexia direto no
// cache antes de o S() decidir se podia gravar — e o S() recusa quando a
// leitura do banco falhou nesta sessão. A tela mostraria a alteração como
// salva, e ela sumiria no carregamento seguinte, sem erro e sem aviso.
bloco('Editar não mexe no cache antes de salvar', () => {
  const cache = { itens: [assunto({ id: 'X1', titulo: 'Título original', status: 'PENDENTE' })] };
  let gravado = null;

  const campos = {
    'acf-titulo': 'Título NOVO', 'acf-cat': 'Segurança', 'acf-status': 'EM_ANDAMENTO',
    'acf-resp': 'Empresa X', 'acf-prio': 'ALTA', 'acf-inicio': '2026-08-01',
    'acf-previsao': '', 'acf-desc': 'desc', 'acf-proxima': 'prox', 'acf-obs': '',
  };
  const forms = carregar(
    ['acompSalvarForm', '_acompDados', '_acompSalvar', '_acompItem', '_acompAgora',
     '_acompQuem', 'acompRegistrar', 'acompStatusInfo'],
    {
      G: () => cache,
      S: (k, v) => { gravado = v; },
      $: (id) => (campos[id] !== undefined ? { value: campos[id], focus() {} } : null),
      toast: () => {},
      acompPodeEditar: () => true,
      acompFecharModal: () => {},
      renderAcompanhamento: () => {},
      acompAbrir: () => {},
      _acompAberto: '',
      ACOMP_STATUS: [
        { id: 'PENDENTE', label: 'Pendente' },
        { id: 'EM_ANDAMENTO', label: 'Em andamento' },
      ],
      window: { _userNivel: 'admin' },
      localStorage: { getItem: () => '{"nome":"Alessandro"}' },
    });

  forms.acompSalvarForm('X1');

  // O que importa: o cache NÃO mudou, e o que foi entregue ao S() mudou.
  checa('o cache continua com o título antigo', cache.itens[0].titulo, 'Título original');
  checa('e com a situação antiga', cache.itens[0].status, 'PENDENTE');
  checa('mas o S() recebeu a alteração', gravado && gravado.itens[0].titulo, 'Título NOVO');
  checa('com a situação nova', gravado && gravado.itens[0].status, 'EM_ANDAMENTO');

  // A edição precisa chegar no objeto CERTO. Se ela fosse aplicada a uma
  // cópia solta, o S() receberia o registro sem mudança nenhuma — e a tela
  // diria "salvo" sem ter salvado.
  checa('não gravou um registro intacto por engano',
        gravado && gravado.itens[0].titulo === cache.itens[0].titulo, false);
  checa('e o histórico ganhou a linha da mudança',
        gravado && gravado.itens[0].historico.length > 0, true);
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.error('FALHARAM ' + falhas + ' DE ' + (ok + falhas)); process.exit(1); }
console.log('TODOS OS TESTES PASSARAM (' + ok + ')');
console.log('-'.repeat(50));
