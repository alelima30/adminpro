// Testes da navegação entre telas.
// Rodar:  node tests/navegacao.test.js
//
// As funções são lidas do próprio adminpro.html (ver tests/extrair.js).
//
// O bug que originou este arquivo: clicar na aba "Localizações (ruas)" dentro
// do Cadastro de Unidades levava para a tela de Comunicação. Não era link
// trocado — o módulo Localizações estava desligado para o condomínio, e o
// showPanel, em vez de dizer isso, redirecionava CALADO para a primeira tela
// liberada da lista. Do lado de quem usa, o sistema simplesmente ia para o
// lugar errado.

const { carregar } = require('./extrair');

// showPanel termina chamando a funcao de desenho da tela escolhida. Nenhuma
// delas interessa aqui — o que se testa e a DECISAO de trocar ou nao de tela —
// entao todas entram como no-op.
const RENDERS = {};
['acompEntrar','renderAcompanhamento','renderDashboard','renderLotes','renderUnidades','renderLocalizacoes','renderClassificacoes',
 'renderCondominos','renderFTabela','renderFin','renderManut','renderComun','renderEventos',
 'renderPreventivas','aplicarFiltroInicialRes','renderReservas','verificarAlertas',
 'resLembreteChecar','renderEncomendas','renderRelatorios','renderEspacos','renderReg',
 'renderAssistente','renderInfoGerais','renderInadimplencia','renderUsuarios',
 'renderCfgReservas','renderSaas','renderAssinaturas','renderInicio']
  .forEach((n) => { RENDERS[n] = () => {}; });

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

// ── Abas que levam a tela bloqueada não ficam na tela ─────────────────
bloco('Aba some quando o destino está bloqueado', () => {
  function montar(visiveis) {
    const abas = [
      { alvo: 'unidades',     estilo: {} },
      { alvo: 'localizacoes', estilo: {} },
      { alvo: 'inicio',       estilo: {} },   // sem módulo próprio: sempre passa
      { alvo: null,           estilo: {} },   // botão que não navega
    ].map((a) => ({
      _alvo: a.alvo,
      style: a.estilo,
      getAttribute: () => (a.alvo ? `showPanel('${a.alvo}')` : 'setTab("lista")'),
    }));

    const api = carregar(['_ocultarAbasBloqueadas'], {
      document: { querySelectorAll: () => abas },
      modulosVisiveis: () => visiveis,
      painelModulo: (id) => (['unidades', 'localizacoes', 'reservas'].includes(id) ? id : null),
    });
    api._ocultarAbasBloqueadas();
    return abas;
  }

  const bloqueado = montar(['unidades', 'condominos']);
  checa('a aba do módulo desligado some', bloqueado[1].style.display, 'none');
  checa('a do módulo ligado fica', bloqueado[0].style.display, '');
  checa('tela sem módulo próprio nunca é escondida', bloqueado[2].style.display, '');
  // Intocado mesmo: a função nem chega a escrever no style dele. 'undefined'
  // aqui é o resultado certo — se virasse '', seria sinal de que passou por
  // um botão que não é dela.
  checa('botão que não navega não é tocado', bloqueado[3].style.display, undefined);

  // Religar o módulo tem de trazer a aba de volta — esconder não pode ser
  // um caminho só de ida.
  const liberado = montar(['unidades', 'localizacoes']);
  checa('religando o módulo, a aba volta', liberado[1].style.display, '');
});

// ── O clique bloqueado explica, em vez de teleportar ──────────────────
bloco('Módulo desligado avisa e não muda de tela', () => {
  function tentar(opcoes) {
    const o = opcoes || {};
    let avisado = '', foiPara = null, redirecionou = null;
    const api = carregar(['showPanel'], {
      ...RENDERS,
      window: { _userNivel: 'admin' },
      currentPanel: o.telaAberta === undefined ? 'unidades' : o.telaAberta,
      paineisPermitidos: () => ['unidades', 'localizacoes', 'comunicados', 'inicio'],
      isSuperAdmin: () => false,
      painelModulo: (id) => (['unidades', 'localizacoes', 'comunicados'].includes(id) ? id : null),
      modulosVisiveis: () => o.visiveis || ['unidades', 'comunicados'],
      MODULOS_SAAS: { localizacoes: { label: 'Localizações' } },
      panelNames: { localizacoes: 'Cadastro de Localizações' },
      painelInicial: () => { redirecionou = 'comunicados'; return 'comunicados'; },
      toast: (m) => { avisado = String(m); },
      // Se chegar aqui, mudou de tela — o que neste caso seria o bug.
      document: { querySelectorAll: () => { foiPara = 'MUDOU'; return []; } },
      $: () => ({ classList: { add(){} }, textContent: '' }),
      sbMarkActive: () => {}, sbFecharFlyout: () => {}, closeSidebar: () => {},
      localStorage: { setItem(){} },
      _sincronizarTravaRolagem: () => {},
      _ocultarAbasBloqueadas: () => {},
    });
    api.showPanel('localizacoes');
    return { avisado, foiPara, redirecionou };
  }

  const r = tentar();
  checa('não troca de tela', r.foiPara, null);
  checa('não redireciona para outro painel', r.redirecionou, null);
  checa('avisa qual módulo falta', /módulo Localizações/i.test(r.avisado), true);
  checa('e diz que é coisa do condomínio',
        /não está liberado para este condomínio/i.test(r.avisado), true);

  // Na primeira carga não há tela nenhuma no ar: aí parar seria pior do que
  // escolher um lugar, e o redirecionamento continua valendo.
  const primeira = tentar({ telaAberta: null });
  checa('sem tela aberta, ainda escolhe um destino', primeira.redirecionou, 'comunicados');
});

bloco('Módulo ligado continua abrindo normalmente', () => {
  let abriu = false;
  const api = carregar(['showPanel'], {
    ...RENDERS,
    window: { _userNivel: 'admin' },
    currentPanel: 'unidades',
    paineisPermitidos: () => ['unidades', 'localizacoes'],
    isSuperAdmin: () => false,
    painelModulo: (id) => id,
    modulosVisiveis: () => ['unidades', 'localizacoes'],
    MODULOS_SAAS: {}, panelNames: { localizacoes: 'Cadastro de Localizações' },
    painelInicial: () => 'inicio',
    toast: () => {},
    document: { querySelectorAll: () => { abriu = true; return []; } },
    $: () => ({ classList: { add(){} }, textContent: '' }),
    sbMarkActive: () => {}, sbFecharFlyout: () => {}, closeSidebar: () => {},
    localStorage: { setItem(){} },
    _sincronizarTravaRolagem: () => {},
    _ocultarAbasBloqueadas: () => {},
  });
  api.showPanel('localizacoes');
  checa('a tela abre', abriu, true);
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.error('FALHARAM ' + falhas + ' DE ' + (ok + falhas)); process.exit(1); }
console.log('TODOS OS TESTES PASSARAM (' + ok + ')');
console.log('-'.repeat(50));
