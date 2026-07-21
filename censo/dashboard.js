/* =============================================================================
 * Censo de Idade dos Moradores — Associação Parque Village Castelo
 * dashboard.js — Painel administrativo (dashboard.html)
 * ========================================================================== */

(() => {
  'use strict';

  // ---- Paleta de faixas (alinhada ao data.js) ------------------------------
  const CORES_FAIXA = {};
  CensoData.FAIXAS.forEach((f) => (CORES_FAIXA[f.id] = f.cor));
  const CORES_SEXO = {};
  CensoData.GENEROS.forEach((g) => (CORES_SEXO[g.id] = g.cor));
  const ABBR_SEXO = { homem: 'H', mulher: 'M', nao_informado: 'N/R' };
  const COR_SERIE = '#2a78d6';   // série única (quadra / lote)
  const INK = '#52617a';
  const GRID = '#e4e9f2';

  // ---- Estado ---------------------------------------------------------------
  const state = {
    registros: [],          // todos os registros com moradores
    filtro: { quadra: '', lote: '', faixa: '', sexo: '' },
    ordenacao: { campo: 'lote', dir: 'asc' },
    charts: {},
    eventosVinculados: false
  };

  const $ = (id) => document.getElementById(id);

  /* ==========================================================================
   * Inicialização
   * ======================================================================== */
  async function init() {
    try {
      const registros = await CensoData.listar();
      state.registros = registros.filter((r) => r.moradores.length > 0);
    } catch (e) {
      console.error('Falha ao carregar dados:', e);
      state.registros = [];
    }

    if (state.registros.length === 0) {
      $('conteudo').classList.add('hidden');
      $('semDados').classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
      return;
    }
    $('semDados').classList.add('hidden');
    $('conteudo').classList.remove('hidden');

    popularFiltros();
    if (!state.eventosVinculados) {
      montarFiltros();               // registra os eventos apenas uma vez
      state.eventosVinculados = true;
    }
    renderTudo();

    if (window.lucide) lucide.createIcons();
  }

  // Renderiza indicadores, gráficos, tabela — reaplicando filtros.
  // Os dados (KPIs, tabela) são renderizados antes dos gráficos e de forma
  // independente: se o Chart.js não estiver disponível (offline), o painel de
  // dados continua funcionando.
  function renderTudo() {
    const registrosFiltrados = aplicarFiltros(state.registros);
    renderKPIs();                       // KPIs sempre sobre o total geral
    renderProgresso();
    renderTabela(registrosFiltrados);
    renderResumoRelatorio(registrosFiltrados);
    try {
      if (typeof window.Chart === 'function') {
        renderGraficos(registrosFiltrados);
      } else {
        avisarGraficosIndisponiveis();
      }
    } catch (e) {
      console.error('Falha ao renderizar gráficos:', e);
      avisarGraficosIndisponiveis();
    }
  }

  let avisoGraficos = false;
  function avisarGraficosIndisponiveis() {
    if (avisoGraficos) return;
    avisoGraficos = true;
    document.querySelectorAll('.chart-box').forEach((box) => {
      box.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3);font-size:13px;text-align:center;padding:20px;">Gráficos indisponíveis — verifique a conexão para carregar o Chart.js.</div>';
    });
  }

  /* ==========================================================================
   * Filtros
   * ======================================================================== */
  // (Re)constrói as opções dos selects de filtro — sem registrar eventos
  function popularFiltros() {
    const quadras = [...new Set(state.registros.map((r) => CensoData.quadraDoLote(r.lote)))].sort();
    $('fQuadra').innerHTML = '<option value="">Todas</option>' +
      quadras.map((q) => `<option value="${q}">Quadra ${q}</option>`).join('');
    $('fQuadra').value = state.filtro.quadra || '';

    preencherSelectLotes();

    $('fFaixa').innerHTML = '<option value="">Todas</option>' +
      CensoData.FAIXAS.map((f) => `<option value="${f.id}">${f.label} (${f.intervalo})</option>`).join('');
    $('fFaixa').value = state.filtro.faixa || '';

    $('fSexo').innerHTML = '<option value="">Todos</option>' +
      CensoData.GENEROS.map((g) => `<option value="${g.id}">${g.label}</option>`).join('');
    $('fSexo').value = state.filtro.sexo || '';
  }

  // Registra os eventos dos filtros/tabela — chamado uma única vez
  function montarFiltros() {
    $('fQuadra').addEventListener('change', (e) => {
      state.filtro.quadra = e.target.value;
      state.filtro.lote = '';           // reinicia lote ao trocar quadra
      preencherSelectLotes();
      renderTudo();
    });
    $('fLote').addEventListener('change', (e) => { state.filtro.lote = e.target.value; renderTudo(); });
    $('fFaixa').addEventListener('change', (e) => { state.filtro.faixa = e.target.value; renderTudo(); });
    $('fSexo').addEventListener('change', (e) => { state.filtro.sexo = e.target.value; renderTudo(); });
    $('btnLimparFiltros').addEventListener('click', () => {
      state.filtro = { quadra: '', lote: '', faixa: '', sexo: '' };
      $('fQuadra').value = ''; $('fFaixa').value = ''; $('fSexo').value = '';
      preencherSelectLotes();
      renderTudo();
    });

    $('buscaLote').addEventListener('input', (e) => renderBusca(e.target.value));
    $('btnAtualizar').addEventListener('click', init);

    // Ordenação da tabela
    document.querySelectorAll('#tabelaRelatorio th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const campo = th.dataset.sort;
        if (state.ordenacao.campo === campo) {
          state.ordenacao.dir = state.ordenacao.dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.ordenacao.campo = campo;
          state.ordenacao.dir = 'asc';
        }
        renderTabela(aplicarFiltros(state.registros));
      });
    });

    // Exportações
    $('btnCSV').addEventListener('click', Exportar.csv);
    $('btnXLSX').addEventListener('click', Exportar.xlsx);
    $('btnPDF').addEventListener('click', Exportar.pdf);

    // Exclusão de lote (admin) — delegação de evento na tabela
    $('relatorioBody').addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-excluir]');
      if (!btn) return;
      const lote = btn.dataset.excluir;
      if (!confirm(`Excluir definitivamente o cadastro do lote ${lote}?\n\nEsta ação não pode ser desfeita.`)) return;
      try {
        await CensoData.remover(lote);
        state.registros = state.registros.filter((r) => r.lote !== lote);
        // Se o lote excluído estava filtrado, reseta o filtro de lote
        if (state.filtro.lote === lote) state.filtro.lote = '';
        popularFiltros();     // recria selects sem o lote removido
        renderTudo();
        toast(`Lote ${lote} excluído com sucesso.`, 'ok');
      } catch (e) {
        console.error(e);
        toast('Não foi possível excluir. Tente novamente.', 'erro');
      }
    });
  }

  function preencherSelectLotes() {
    const lotesDisp = state.registros
      .map((r) => r.lote)
      .filter((l) => !state.filtro.quadra || CensoData.quadraDoLote(l) === state.filtro.quadra)
      .sort();
    $('fLote').innerHTML = '<option value="">Todos</option>' +
      lotesDisp.map((l) => `<option value="${l}">${l}</option>`).join('');
    $('fLote').value = state.filtro.lote || '';
  }

  // Aplica os filtros de quadra/lote/faixa/sexo. Ao filtrar por faixa ou sexo,
  // mantém no lote apenas os moradores que atendem (afeta gráficos e relatório).
  function aplicarFiltros(registros) {
    return registros
      .filter((r) => !state.filtro.quadra || CensoData.quadraDoLote(r.lote) === state.filtro.quadra)
      .filter((r) => !state.filtro.lote || r.lote === state.filtro.lote)
      .map((r) => {
        if (!state.filtro.faixa && !state.filtro.sexo) return r;
        let moradores = r.moradores;
        if (state.filtro.faixa) {
          moradores = moradores.filter((m) => {
            const f = CensoData.faixaEtaria(m.idade);
            return f && f.id === state.filtro.faixa;
          });
        }
        if (state.filtro.sexo) {
          moradores = moradores.filter((m) => CensoData.generoPorId(m.sexo).id === state.filtro.sexo);
        }
        return { ...r, moradores };
      })
      .filter((r) => r.moradores.length > 0);
  }

  /* ==========================================================================
   * Indicadores (KPIs)
   * ======================================================================== */
  function renderKPIs() {
    const s = CensoData.estatisticas(state.registros);
    const cards = [
      { icon: 'home',        cor: '#1B2B5E', label: 'Lotes respondidos', valor: s.lotesRespondidos, sub: `de ${s.totalLotes} lotes` },
      { icon: 'users',       cor: '#2a78d6', label: 'Total de moradores', valor: s.totalMoradores, sub: `${s.mediaIdadeGeral.toFixed(1)} anos de idade média` },
      { icon: 'calculator',  cor: '#7c5cff', label: 'Média por lote', valor: s.mediaMoradoresPorLote.toFixed(1), sub: 'moradores por lote respondido' },
      { icon: 'baby',            cor: CORES_FAIXA.criancas,     label: 'Crianças',     valor: s.porFaixa.criancas,     sub: '0–12 anos' },
      { icon: 'backpack',        cor: CORES_FAIXA.adolescentes, label: 'Adolescentes', valor: s.porFaixa.adolescentes, sub: '13–17 anos' },
      { icon: 'graduation-cap',  cor: CORES_FAIXA.jovens,       label: 'Jovens',       valor: s.porFaixa.jovens,       sub: '18–29 anos' },
      { icon: 'briefcase',       cor: CORES_FAIXA.adultos,      label: 'Adultos',      valor: s.porFaixa.adultos,      sub: '30–59 anos' },
      { icon: 'accessibility',   cor: CORES_FAIXA.idosos,       label: 'Idosos',       valor: s.porFaixa.idosos,       sub: '60+ anos' },
      { icon: 'user',            cor: CORES_SEXO.homem,         label: 'Homens',       valor: s.porSexo.homem,         sub: 'sexo masculino' },
      { icon: 'user',            cor: CORES_SEXO.mulher,        label: 'Mulheres',     valor: s.porSexo.mulher,        sub: 'sexo feminino' },
      { icon: 'user',            cor: CORES_SEXO.nao_informado, label: 'Prefiro não responder', valor: s.porSexo.nao_informado, sub: 'sexo não informado' },
      { icon: 'check-circle',    cor: '#0ca30c', label: 'Lotes respondidos', valor: `${s.percRespondidos.toFixed(1)}%`, sub: 'do total de lotes' },
      { icon: 'clock',           cor: '#eda100', label: 'Lotes pendentes',   valor: `${s.percPendentes.toFixed(1)}%`,   sub: `${s.lotesPendentes} lotes` }
    ];

    $('kpiGrid').innerHTML = cards.map((c, i) => `
      <div class="kpi" style="--kpi-color:${c.cor};--kpi-soft:${hexSoft(c.cor)};animation-delay:${i * 0.03}s">
        <div class="kpi-icon"><i data-lucide="${c.icon}"></i></div>
        <div class="kpi-value">${c.valor}</div>
        <div class="kpi-label">${c.label}</div>
        <div class="kpi-sub">${c.sub}</div>
      </div>`).join('');
  }

  function renderProgresso() {
    const s = CensoData.estatisticas(state.registros);
    $('progressTxt').textContent =
      `${s.lotesRespondidos} de ${s.totalLotes} lotes (${s.percRespondidos.toFixed(1)}%)`;
    $('progressFill').style.width = `${s.percRespondidos}%`;
    $('legRespondidos').textContent = s.lotesRespondidos;
    $('legPendentes').textContent = s.lotesPendentes;
  }

  /* ==========================================================================
   * Gráficos (Chart.js)
   * ======================================================================== */
  function destruir(nome) {
    if (state.charts[nome]) { state.charts[nome].destroy(); delete state.charts[nome]; }
  }

  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 700, easing: 'easeOutQuart' },
    plugins: {
      legend: { labels: { color: INK, font: { size: 12 }, usePointStyle: true, padding: 14 } }
    }
  };

  function renderGraficos(registros) {
    const s = CensoData.estatisticas(registros);

    // --- Pizza: distribuição por faixa etária ---
    destruir('pizza');
    const totFaixa = CensoData.FAIXAS.reduce((a, f) => a + s.porFaixa[f.id], 0) || 1;
    state.charts.pizza = new Chart($('chartPizza'), {
      type: 'doughnut',
      data: {
        labels: CensoData.FAIXAS.map((f) => `${f.label} (${f.intervalo})`),
        datasets: [{
          data: CensoData.FAIXAS.map((f) => s.porFaixa[f.id]),
          backgroundColor: CensoData.FAIXAS.map((f) => f.cor),
          borderColor: '#fff', borderWidth: 2, hoverOffset: 6
        }]
      },
      options: {
        ...baseOpts,
        cutout: '58%',
        plugins: {
          ...baseOpts.plugins,
          legend: { ...baseOpts.plugins.legend, position: 'right' },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed;
                const perc = ((v / totFaixa) * 100).toFixed(1);
                return ` ${ctx.label}: ${v} (${perc}%)`;
              }
            }
          }
        }
      }
    });

    // --- Pizza: distribuição por sexo ---
    destruir('sexo');
    const totSexo = CensoData.GENEROS.reduce((a, g) => a + s.porSexo[g.id], 0) || 1;
    state.charts.sexo = new Chart($('chartSexo'), {
      type: 'doughnut',
      data: {
        labels: CensoData.GENEROS.map((g) => g.label),
        datasets: [{
          data: CensoData.GENEROS.map((g) => s.porSexo[g.id]),
          backgroundColor: CensoData.GENEROS.map((g) => g.cor),
          borderColor: '#fff', borderWidth: 2, hoverOffset: 6
        }]
      },
      options: {
        ...baseOpts,
        cutout: '58%',
        plugins: {
          ...baseOpts.plugins,
          legend: { ...baseOpts.plugins.legend, position: 'right' },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed;
                const perc = ((v / totSexo) * 100).toFixed(1);
                return ` ${ctx.label}: ${v} (${perc}%)`;
              }
            }
          }
        }
      }
    });

    // --- Colunas: moradores por faixa etária ---
    destruir('colunas');
    state.charts.colunas = new Chart($('chartColunas'), {
      type: 'bar',
      data: {
        labels: CensoData.FAIXAS.map((f) => f.label),
        datasets: [{
          label: 'Moradores',
          data: CensoData.FAIXAS.map((f) => s.porFaixa[f.id]),
          backgroundColor: CensoData.FAIXAS.map((f) => f.cor),
          borderRadius: 6, borderSkipped: false, maxBarThickness: 60
        }]
      },
      options: { ...baseOpts, plugins: { ...baseOpts.plugins, legend: { display: false } }, scales: eixoY() }
    });

    // --- Barras: moradores por quadra ---
    destruir('quadra');
    const quadrasComDados = Object.keys(s.porQuadra).filter((q) => s.porQuadra[q] > 0);
    state.charts.quadra = new Chart($('chartQuadra'), {
      type: 'bar',
      data: {
        labels: quadrasComDados.map((q) => `Quadra ${q}`),
        datasets: [{
          label: 'Moradores', data: quadrasComDados.map((q) => s.porQuadra[q]),
          backgroundColor: COR_SERIE, borderRadius: 6, borderSkipped: false, maxBarThickness: 44
        }]
      },
      options: { ...baseOpts, plugins: { ...baseOpts.plugins, legend: { display: false } }, scales: eixoY() }
    });

    // --- Barras: moradores por lote (ordenado desc, com largura dinâmica) ---
    destruir('lote');
    const lotes = Object.keys(s.porLote)
      .map((l) => ({ lote: l, n: s.porLote[l] }))
      .sort((a, b) => b.n - a.n);
    const canvasLote = $('chartLote');
    // largura mínima para permitir rolagem horizontal quando há muitos lotes
    canvasLote.parentElement.style.minWidth = Math.max(lotes.length * 34, 400) + 'px';
    state.charts.lote = new Chart(canvasLote, {
      type: 'bar',
      data: {
        labels: lotes.map((x) => x.lote),
        datasets: [{
          label: 'Moradores', data: lotes.map((x) => x.n),
          backgroundColor: COR_SERIE, borderRadius: 5, borderSkipped: false, maxBarThickness: 28
        }]
      },
      options: {
        ...baseOpts,
        plugins: { ...baseOpts.plugins, legend: { display: false } },
        scales: { ...eixoY(), x: { ticks: { color: INK, font: { size: 10 }, maxRotation: 90, minRotation: 45 }, grid: { display: false } } }
      }
    });
  }

  function eixoY() {
    return {
      y: { beginAtZero: true, ticks: { color: INK, precision: 0, stepSize: 1 }, grid: { color: GRID } },
      x: { ticks: { color: INK }, grid: { display: false } }
    };
  }

  /* ==========================================================================
   * Pesquisa de lote específico
   * ======================================================================== */
  function renderBusca(termo) {
    const alvo = String(termo || '').trim().toUpperCase();
    const box = $('buscaResultado');
    if (!alvo) { box.innerHTML = ''; return; }

    if (!CensoData.loteValido(alvo)) {
      box.innerHTML = `<p class="muted">Lote <b>${alvo}</b> não existe na relação de lotes.</p>`;
      return;
    }
    const reg = state.registros.find((r) => r.lote === alvo);
    if (!reg) {
      box.innerHTML = `<p class="muted">O lote <b>${alvo}</b> ainda não foi respondido no censo.</p>`;
      return;
    }

    const idades = reg.moradores.map((m) => m.idade);
    const media = idades.reduce((a, b) => a + b, 0) / idades.length;
    const chips = reg.moradores.map((m) => {
      const f = CensoData.faixaEtaria(m.idade);
      return `<span class="idade-chip" style="background:${f ? f.cor : '#8a97ab'}" title="${f ? f.label : ''}">${m.idade} anos</span>`;
    }).join('');

    box.innerHTML = `
      <div class="busca-cards">
        <div class="mini-kpi"><div class="v">${reg.lote}</div><div class="l">Lote (Quadra ${CensoData.quadraDoLote(reg.lote)})</div></div>
        <div class="mini-kpi"><div class="v">${reg.moradores.length}</div><div class="l">Moradores</div></div>
        <div class="mini-kpi"><div class="v">${media.toFixed(1)}</div><div class="l">Média de idade</div></div>
      </div>
      <div style="margin-top:14px;">
        <div class="l muted" style="font-size:13px;margin-bottom:2px;">Idades</div>
        <div class="idade-chips">${chips}</div>
      </div>
      <div style="margin-top:12px;">
        <div class="l muted" style="font-size:13px;margin-bottom:2px;">Sexo</div>
        <div class="idade-chips">${sexoResumoHTML(contarSexos(reg.moradores))}</div>
      </div>`;
  }

  /* ==========================================================================
   * Relatório (tabela ordenável)
   * ======================================================================== */
  function contarSexos(moradores) {
    const c = { homem: 0, mulher: 0, nao_informado: 0 };
    moradores.forEach((m) => { c[CensoData.generoPorId(m.sexo).id]++; });
    return c;
  }

  // Resumo textual de sexo (ex.: "2 H, 1 M")
  function sexoResumoTexto(sexos) {
    return CensoData.GENEROS.filter((g) => sexos[g.id] > 0)
      .map((g) => `${sexos[g.id]} ${ABBR_SEXO[g.id]}`).join(', ');
  }

  // Resumo de sexo com chips coloridos (para a tabela/busca)
  function sexoResumoHTML(sexos) {
    return CensoData.GENEROS.filter((g) => sexos[g.id] > 0)
      .map((g) => `<span class="sexo-chip" style="background:${CORES_SEXO[g.id]}" title="${g.label}">${sexos[g.id]} ${ABBR_SEXO[g.id]}</span>`)
      .join(' ');
  }

  function linhasRelatorio(registros) {
    return registros.map((r) => {
      const idades = r.moradores.map((m) => m.idade).sort((a, b) => a - b);
      const media = idades.length ? idades.reduce((a, b) => a + b, 0) / idades.length : 0;
      return {
        quadra: CensoData.quadraDoLote(r.lote),
        lote: r.lote,
        moradores: r.moradores.length,
        idades,
        sexos: contarSexos(r.moradores),
        media
      };
    });
  }

  function ordenar(linhas) {
    const { campo, dir } = state.ordenacao;
    const mult = dir === 'asc' ? 1 : -1;
    return [...linhas].sort((a, b) => {
      let va = a[campo], vb = b[campo];
      if (campo === 'idades') { va = a.moradores; vb = b.moradores; } // ordena pela contagem
      if (typeof va === 'string') return va.localeCompare(vb) * mult;
      return (va - vb) * mult;
    });
  }

  function renderTabela(registros) {
    const linhas = ordenar(linhasRelatorio(registros));
    const body = $('relatorioBody');

    if (linhas.length === 0) {
      body.innerHTML = '<tr><td colspan="7" class="empty-row">Nenhum lote corresponde aos filtros.</td></tr>';
    } else {
      body.innerHTML = linhas.map((l) => `
        <tr>
          <td class="col-compact" data-label="Quadra">Quadra ${l.quadra}</td>
          <td class="lote-cell col-compact" data-label="Lote">${l.lote}</td>
          <td class="col-num" data-label="Moradores">${l.moradores}</td>
          <td class="idades-inline" data-label="Idades">${l.idades.join(', ')}</td>
          <td class="col-compact" data-label="Sexo"><div class="sexo-chips">${sexoResumoHTML(l.sexos)}</div></td>
          <td class="col-num" data-label="Média de idade">${l.media.toFixed(1)}</td>
          <td class="col-acoes" data-label="Ações">
            <div class="row-actions">
              <a class="icon-btn" href="index.html?lote=${l.lote}" title="Editar lote ${l.lote}"><i data-lucide="pencil"></i></a>
              <button class="icon-btn danger" data-excluir="${l.lote}" title="Excluir lote ${l.lote}"><i data-lucide="trash-2"></i></button>
            </div>
          </td>
        </tr>`).join('');
    }

    if (window.lucide) lucide.createIcons();

    // Marca coluna ordenada
    document.querySelectorAll('#tabelaRelatorio th[data-sort]').forEach((th) => {
      const ativo = th.dataset.sort === state.ordenacao.campo;
      th.classList.toggle('sorted', ativo);
      const arrow = th.querySelector('.arrow');
      if (arrow) arrow.textContent = ativo ? (state.ordenacao.dir === 'asc' ? '↑' : '↓') : '↕';
    });
  }

  function renderResumoRelatorio(registros) {
    const total = registros.reduce((s, r) => s + r.moradores.length, 0);
    $('relatorioResumo').textContent =
      `${registros.length} lote(s) · ${total} morador(es)`;
  }

  /* ==========================================================================
   * Exportação (CSV funcional; Excel e PDF preparados)
   * ======================================================================== */
  const Exportar = {
    _linhas() {
      return ordenar(linhasRelatorio(aplicarFiltros(state.registros)));
    },
    _matriz() {
      const cab = ['Quadra', 'Lote', 'Moradores', 'Idades', 'Sexo', 'Média de Idade'];
      const corpo = this._linhas().map((l) => [
        `Quadra ${l.quadra}`, l.lote, l.moradores, l.idades.join(' '), sexoResumoTexto(l.sexos), l.media.toFixed(1)
      ]);
      return [cab, ...corpo];
    },
    _baixar(conteudo, nome, mime) {
      const blob = new Blob([conteudo], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nome;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    },

    // CSV — totalmente funcional
    csv() {
      const matriz = Exportar._matriz();
      const csv = '﻿' + matriz
        .map((linha) => linha.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
        .join('\r\n');
      Exportar._baixar(csv, 'censo_moradores_2026.csv', 'text/csv;charset=utf-8;');
      toast('CSV exportado com sucesso.', 'ok');
    },

    // Excel — gera .xls (SpreadsheetML/HTML) que abre no Excel/LibreOffice.
    // Pronto para trocar por uma biblioteca .xlsx (ex.: SheetJS) no futuro.
    xlsx() {
      const matriz = Exportar._matriz();
      const linhas = matriz.map((linha, i) => {
        const tag = i === 0 ? 'th' : 'td';
        return '<tr>' + linha.map((c) => `<${tag}>${String(c)}</${tag}>`).join('') + '</tr>';
      }).join('');
      const html =
        `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">
         <style>th{background:#1B2B5E;color:#fff}td,th{border:1px solid #ccc;padding:4px}</style></head>
         <body><table>${linhas}</table></body></html>`;
      Exportar._baixar(html, 'censo_moradores_2026.xls', 'application/vnd.ms-excel');
      toast('Planilha Excel exportada.', 'ok');
    },

    // PDF — abre a janela de impressão (Salvar como PDF).
    // Pronto para trocar por jsPDF/pdfmake no futuro.
    pdf() {
      const matriz = Exportar._matriz();
      const s = CensoData.estatisticas(aplicarFiltros(state.registros));
      const linhas = matriz.map((linha, i) => {
        const tag = i === 0 ? 'th' : 'td';
        return '<tr>' + linha.map((c) => `<${tag}>${String(c)}</${tag}>`).join('') + '</tr>';
      }).join('');
      const win = window.open('', '_blank');
      if (!win) { toast('Permita pop-ups para exportar em PDF.', 'erro'); return; }
      win.document.write(`
        <html lang="pt-BR"><head><meta charset="utf-8">
        <title>Censo dos Moradores 2026 — Relatório</title>
        <style>
          body{font-family:system-ui,'Segoe UI',sans-serif;color:#0f1b2d;padding:28px;}
          h1{font-size:20px;color:#1B2B5E;margin:0 0 4px;}
          p.sub{color:#52617a;margin:0 0 18px;font-size:13px;}
          table{width:100%;border-collapse:collapse;font-size:12px;}
          th{background:#1B2B5E;color:#fff;text-align:left;}
          th,td{border:1px solid #d8dee9;padding:7px 9px;}
          tr:nth-child(even) td{background:#f6f8fb;}
        </style></head><body>
        <h1>Censo dos Moradores 2026 — Parque Village Castelo</h1>
        <p class="sub">${s.lotesRespondidos} lotes respondidos · ${s.totalMoradores} moradores · idade média ${s.mediaIdadeGeral.toFixed(1)} anos</p>
        <table>${linhas}</table>
        <script>window.onload=function(){window.print();}<\/script>
        </body></html>`);
      win.document.close();
      toast('Gerando PDF (use "Salvar como PDF").', 'ok');
    }
  };

  /* ==========================================================================
   * Utilidades
   * ======================================================================== */
  function hexSoft(hex) {
    // versão clara (18% opacidade) para o fundo do ícone
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return `rgba(${r},${g},${b},0.14)`;
  }

  let toastTimer = null;
  function toast(msg, tipo = '') {
    const t = $('toast');
    t.textContent = msg;
    t.className = `toast show ${tipo}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 3000);
  }

  /* ==========================================================================
   * Controle de acesso administrativo (gate de senha)
   * ======================================================================== */
  function bootstrap() {
    const gate = $('adminGate');

    if (CensoData.ADMIN.autenticado()) {
      gate.classList.add('hidden');
      init();
    } else {
      // Mantém o painel oculto até autenticar
      gate.classList.remove('hidden');
      $('gateForm').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const senha = $('gateSenha').value;
        if (CensoData.ADMIN.entrar(senha)) {
          $('gateErro').classList.add('hidden');
          gate.classList.add('hidden');
          init();
        } else {
          $('gateErro').classList.remove('hidden');
          $('gateSenha').value = '';
          $('gateSenha').focus();
        }
      });
    }

    // Botão sair (logout)
    const btnSair = $('btnSair');
    if (btnSair) {
      btnSair.addEventListener('click', () => {
        CensoData.ADMIN.sair();
        location.reload();
      });
    }
  }

  // ---- Start ----------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', bootstrap);
})();
