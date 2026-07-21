/* =============================================================================
 * Censo de Idade dos Moradores — Associação Parque Village Castelo
 * script.js — Lógica da tela de coleta (index.html)
 * ========================================================================== */

(() => {
  'use strict';

  // ---- Referências de DOM ---------------------------------------------------
  const el = {
    loteInput:   document.getElementById('loteInput'),
    loteList:    document.getElementById('loteList'),
    loteStatus:  document.getElementById('loteStatus'),
    qtdSection:  document.getElementById('qtdSection'),
    qtdInput:    document.getElementById('qtdInput'),
    moradoresSection: document.getElementById('moradoresSection'),
    moradoresGrid:    document.getElementById('moradoresGrid'),
    acoesSection: document.getElementById('acoesSection'),
    btnSalvar:   document.getElementById('btnSalvar'),
    btnLimpar:   document.getElementById('btnLimpar'),
    anoAtualTxt: document.getElementById('anoAtualTxt'),
    progressoInfo: document.getElementById('progressoInfo'),
    toast:       document.getElementById('toast')
  };

  // ---- Estado ---------------------------------------------------------------
  const state = {
    loteSelecionado: null,
    lotesRespondidos: new Set(), // preenchido de forma assíncrona
    comboIndex: -1,
    comboVisiveis: []
  };

  el.anoAtualTxt.textContent = CensoData.ANO_ATUAL;

  /* ==========================================================================
   * Combobox pesquisável de lote (autocomplete — só aceita lote existente)
   * ======================================================================== */
  function abrirLista(filtro = '') {
    const termo = filtro.trim().toUpperCase();
    const lista = CensoData.LOTES.filter((l) => l.includes(termo)).slice(0, 60);
    state.comboVisiveis = lista;
    state.comboIndex = -1;

    if (lista.length === 0) {
      el.loteList.innerHTML = '<div class="combo-empty">Nenhum lote encontrado</div>';
    } else {
      el.loteList.innerHTML = lista.map((lote) => {
        const respondido = state.lotesRespondidos.has(lote);
        const quadra = CensoData.quadraDoLote(lote);
        return `
          <div class="combo-item ${respondido ? 'answered' : ''}" role="option" data-lote="${lote}">
            <span>${lote}</span>
            <span class="q">Quadra ${quadra}</span>
            ${respondido ? '<span class="dot" title="Já respondido"></span>' : ''}
          </div>`;
      }).join('');
    }
    el.loteList.classList.remove('hidden');
    el.loteInput.setAttribute('aria-expanded', 'true');
  }

  function fecharLista() {
    el.loteList.classList.add('hidden');
    el.loteInput.setAttribute('aria-expanded', 'false');
    state.comboIndex = -1;
  }

  function destacarItem() {
    const itens = el.loteList.querySelectorAll('.combo-item');
    itens.forEach((it, i) => it.classList.toggle('active', i === state.comboIndex));
    if (state.comboIndex >= 0 && itens[state.comboIndex]) {
      itens[state.comboIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  async function selecionarLote(lote) {
    if (!CensoData.loteValido(lote)) return;
    state.loteSelecionado = lote;
    el.loteInput.value = lote;
    fecharLista();

    // Carrega dados existentes do lote (se houver)
    let registro = null;
    try {
      registro = await CensoData.obter(lote);
    } catch (e) {
      console.warn('Falha ao carregar lote:', e);
    }

    const jaRespondido = registro && registro.moradores.length > 0;
    el.loteStatus.innerHTML = jaRespondido
      ? `<span class="lote-status edicao">✎ Lote selecionado</span>`
      : '';

    el.qtdSection.hidden = false;

    if (jaRespondido) {
      el.qtdInput.value = registro.moradores.length;
      gerarCartoes(registro.moradores.length, registro.moradores);
    } else {
      el.qtdInput.value = '';
      el.moradoresSection.hidden = true;
      el.acoesSection.hidden = true;
    }
    el.qtdInput.focus();
  }

  // Eventos do combobox
  el.loteInput.addEventListener('focus', () => abrirLista(el.loteInput.value));
  el.loteInput.addEventListener('input', () => {
    state.loteSelecionado = null;
    el.loteStatus.innerHTML = '';
    abrirLista(el.loteInput.value);
  });

  el.loteInput.addEventListener('keydown', (ev) => {
    const itens = state.comboVisiveis;
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      state.comboIndex = Math.min(state.comboIndex + 1, itens.length - 1);
      destacarItem();
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      state.comboIndex = Math.max(state.comboIndex - 1, 0);
      destacarItem();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (state.comboIndex >= 0) {
        selecionarLote(itens[state.comboIndex]);
      } else if (itens.length === 1) {
        selecionarLote(itens[0]);
      }
    } else if (ev.key === 'Escape') {
      fecharLista();
    }
  });

  el.loteList.addEventListener('click', (ev) => {
    const item = ev.target.closest('.combo-item');
    if (item) selecionarLote(item.dataset.lote);
  });

  // Fecha ao clicar fora
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('.combo')) fecharLista();
  });

  // Impede lote inexistente ao sair do campo
  el.loteInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (!state.loteSelecionado) {
        const digitado = el.loteInput.value.trim().toUpperCase();
        if (digitado && CensoData.loteValido(digitado)) {
          selecionarLote(digitado);
        } else if (digitado) {
          el.loteInput.value = '';
          el.loteStatus.innerHTML = '';
          el.qtdSection.hidden = true;
          el.moradoresSection.hidden = true;
          el.acoesSection.hidden = true;
        }
      }
    }, 180);
  });

  /* ==========================================================================
   * Quantidade de moradores → geração automática de cartões
   * ======================================================================== */
  el.qtdInput.addEventListener('input', () => {
    let qtd = parseInt(el.qtdInput.value, 10);
    if (isNaN(qtd) || qtd < 0) qtd = 0;
    if (qtd > 30) { qtd = 30; el.qtdInput.value = 30; }
    gerarCartoes(qtd);
  });

  function gerarCartoes(qtd, dados = []) {
    if (!qtd || qtd < 1) {
      el.moradoresSection.hidden = true;
      el.acoesSection.hidden = true;
      el.moradoresGrid.innerHTML = '';
      return;
    }

    // Preserva valores já digitados ao aumentar/diminuir a quantidade
    const atuais = coletarAnos();

    let html = '';
    for (let i = 0; i < qtd; i++) {
      const valor = dados[i] ? dados[i].anoNascimento : (atuais[i] || '');
      html += `
        <div class="morador-card" style="animation-delay:${i * 0.03}s">
          <h4><span class="n">${i + 1}</span> Morador ${i + 1}</h4>
          <label for="ano_${i}">Ano de nascimento</label>
          <input
            type="number" id="ano_${i}" class="field ano-input"
            min="1900" max="${CensoData.ANO_ATUAL}" step="1" inputmode="numeric"
            placeholder="Ex.: 1998" value="${valor}">
          <div class="idade-out" id="idade_${i}"></div>
        </div>`;
    }
    el.moradoresGrid.innerHTML = html;
    el.moradoresSection.hidden = false;
    el.acoesSection.hidden = false;

    // Vincula cálculo de idade em tempo real
    el.moradoresGrid.querySelectorAll('.ano-input').forEach((inp, i) => {
      const atualizar = () => atualizarIdade(i);
      inp.addEventListener('input', atualizar);
      atualizar(); // calcula valor inicial (edição)
    });
  }

  function atualizarIdade(i) {
    const inp = document.getElementById(`ano_${i}`);
    const out = document.getElementById(`idade_${i}`);
    const ano = parseInt(inp.value, 10);
    if (!ano || ano < 1900 || ano > CensoData.ANO_ATUAL) {
      out.innerHTML = '';
      return;
    }
    const idade = CensoData.calcularIdade(ano);
    const faixa = CensoData.faixaEtaria(idade);
    out.innerHTML = `Idade: <b>${idade} anos</b>` +
      (faixa ? ` <span class="faixa-tag" style="background:${faixa.cor}">${faixa.label}</span>` : '');
  }

  function coletarAnos() {
    return Array.from(el.moradoresGrid.querySelectorAll('.ano-input'))
      .map((inp) => (inp.value ? parseInt(inp.value, 10) : ''));
  }

  /* ==========================================================================
   * Salvar / limpar / remover
   * ======================================================================== */
  el.btnSalvar.addEventListener('click', async () => {
    if (!state.loteSelecionado) {
      return toast('Selecione um lote válido antes de salvar.', 'erro');
    }
    const anos = coletarAnos();
    const moradores = [];
    for (let i = 0; i < anos.length; i++) {
      const ano = anos[i];
      if (!ano || ano < 1900 || ano > CensoData.ANO_ATUAL) {
        return toast(`Informe um ano de nascimento válido para o Morador ${i + 1}.`, 'erro');
      }
      moradores.push({ anoNascimento: ano, idade: CensoData.calcularIdade(ano) });
    }

    // Estrutura de dados conforme especificação
    const registro = { lote: state.loteSelecionado, moradores };

    el.btnSalvar.disabled = true;
    try {
      await CensoData.salvar(registro);
      state.lotesRespondidos.add(state.loteSelecionado);
      toast(`Obrigado por responder o censo! Lote ${state.loteSelecionado} registrado. 💚`, 'ok');
      atualizarProgresso();
      resetForm();
    } catch (e) {
      console.error(e);
      toast('Não foi possível salvar. Tente novamente.', 'erro');
    } finally {
      el.btnSalvar.disabled = false;
    }
  });

  el.btnLimpar.addEventListener('click', resetForm);

  function resetForm() {
    state.loteSelecionado = null;
    el.loteInput.value = '';
    el.loteStatus.innerHTML = '';
    el.qtdInput.value = '';
    el.moradoresGrid.innerHTML = '';
    el.qtdSection.hidden = true;
    el.moradoresSection.hidden = true;
    el.acoesSection.hidden = true;
    el.loteInput.focus();
  }

  /* ==========================================================================
   * Progresso geral + Toast
   * ======================================================================== */
  async function atualizarProgresso() {
    try {
      const registros = await CensoData.listar();
      state.lotesRespondidos = new Set(
        registros.filter((r) => r.moradores.length > 0).map((r) => r.lote)
      );
      const n = state.lotesRespondidos.size;
      const total = CensoData.TOTAL_LOTES;
      const perc = ((n / total) * 100).toFixed(1);
      el.progressoInfo.innerHTML = `<b>${perc}%</b> respondido`;
    } catch (e) {
      console.warn('Progresso indisponível:', e);
    }
  }

  let toastTimer = null;
  function toast(msg, tipo = '') {
    el.toast.textContent = msg;
    el.toast.className = `toast show ${tipo}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.className = 'toast'; }, 3200);
  }

  // ---- Inicialização --------------------------------------------------------
  atualizarProgresso();

  // Abre um lote automaticamente via ?lote=XXX (usado pelo botão "editar" do
  // Dashboard administrativo) e rola até o formulário.
  (function abrirLotePelaURL() {
    const params = new URLSearchParams(window.location.search);
    const lote = (params.get('lote') || '').toUpperCase();
    if (lote && CensoData.loteValido(lote)) {
      selecionarLote(lote);
      setTimeout(() => el.qtdSection.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
    }
  })();
})();
