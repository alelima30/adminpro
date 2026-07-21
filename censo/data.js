/* =============================================================================
 * Censo de Idade dos Moradores — Associação Parque Village Castelo
 * data.js — Camada de dados compartilhada (Censo + Dashboard)
 *
 * Responsabilidades:
 *   - Definição das quadras e geração automática dos lotes (A01 … U05)
 *   - Cálculo de idade e classificação por faixa etária
 *   - Camada de persistência (armazenamento) desacoplada, pronta para o Supabase
 *
 * A troca de localStorage por Supabase acontece APENAS neste arquivo:
 * basta preencher SUPABASE.url / SUPABASE.anonKey. Nenhuma outra parte do
 * sistema precisa mudar.
 * ========================================================================== */

const CensoData = (() => {
  'use strict';

  /* --------------------------------------------------------------------------
   * Configuração das quadras (quantidade de lotes por quadra)
   * ------------------------------------------------------------------------ */
  const quadras = {
    A: 2,  B: 23, C: 21, D: 19, E: 17, F: 10, G: 4,
    H: 8,  I: 16, J: 19, K: 24, L: 24, M: 24, N: 23,
    O: 4,  P: 10, Q: 5,  R: 16, S: 24, T: 21, U: 5
  };

  const ANO_ATUAL = new Date().getFullYear();

  /* --------------------------------------------------------------------------
   * Faixas etárias (ordem, rótulos e cores usadas nos gráficos)
   * ------------------------------------------------------------------------ */
  const FAIXAS = [
    { id: 'criancas',     label: 'Crianças',     intervalo: '0–12 anos',  min: 0,  max: 12,       cor: '#2a78d6' },
    { id: 'adolescentes', label: 'Adolescentes', intervalo: '13–17 anos', min: 13, max: 17,       cor: '#008300' },
    { id: 'jovens',       label: 'Jovens',       intervalo: '18–29 anos', min: 18, max: 29,       cor: '#e87ba4' },
    { id: 'adultos',      label: 'Adultos',      intervalo: '30–59 anos', min: 30, max: 59,       cor: '#eda100' },
    { id: 'idosos',       label: 'Idosos',       intervalo: '60+ anos',   min: 60, max: Infinity, cor: '#1baf7a' }
  ];

  /* --------------------------------------------------------------------------
   * Sexo dos moradores (rótulos e cores usadas nos gráficos)
   * ------------------------------------------------------------------------ */
  const GENEROS = [
    { id: 'homem',         label: 'Homem',                cor: '#2a78d6' },
    { id: 'mulher',        label: 'Mulher',               cor: '#e87ba4' },
    { id: 'nao_informado', label: 'Prefiro não responder', cor: '#8a97ab' }
  ];
  function generoPorId(id) {
    return GENEROS.find((g) => g.id === id) || GENEROS[2];
  }

  /* --------------------------------------------------------------------------
   * Configuração do Supabase (integração futura)
   *
   * Preencha url e anonKey para ativar a persistência na nuvem.
   * Enquanto estiverem vazios, o sistema usa localStorage automaticamente.
   *
   * Estrutura da tabela sugerida (SQL):
   *   create table censo_moradores (
   *     lote        text primary key,
   *     moradores   jsonb not null default '[]',
   *     atualizado  timestamptz not null default now()
   *   );
   * ------------------------------------------------------------------------ */
  const SUPABASE = {
    url: 'https://xrwdkzavxbttxqgkeast.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhyd2RremF2eGJ0dHhxZ2tlYXN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MzU5NjksImV4cCI6MjEwMDIxMTk2OX0.eoIShrA_zxzDQsqR3B6Wtb6Oz1QPsOG6sLNBcMtKdr4',
    table: 'censo_moradores',
    ativo() { return Boolean(this.url && this.anonKey); },
    headers() {
      return {
        'apikey': this.anonKey,
        'Authorization': `Bearer ${this.anonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation'
      };
    },
    endpoint() { return `${this.url.replace(/\/$/, '')}/rest/v1/${this.table}`; }
  };

  const STORAGE_KEY = 'censo_pvc_2026';

  /* --------------------------------------------------------------------------
   * Acesso administrativo (Dashboard)
   *
   * O Dashboard é protegido por senha. Troque o valor de `senha` abaixo pela
   * senha desejada da Diretoria.
   *
   * IMPORTANTE (segurança): por ser um sistema 100% no navegador (sem servidor),
   * esta senha fica visível no código-fonte — ela serve para impedir o acesso
   * casual de moradores, não como segurança forte. Para controle de acesso
   * real, use a autenticação do Supabase (Supabase Auth) na integração futura.
   * ------------------------------------------------------------------------ */
  const ADMIN = {
    senha: '@castelo2026',   // << troque pela senha da Diretoria
    chaveSessao: 'censo_admin_ok',
    autenticado() {
      try { return sessionStorage.getItem(this.chaveSessao) === '1'; }
      catch (_) { return false; }
    },
    entrar(tentativa) {
      if (String(tentativa) === String(this.senha)) {
        try { sessionStorage.setItem(this.chaveSessao, '1'); } catch (_) {}
        return true;
      }
      return false;
    },
    sair() {
      try { sessionStorage.removeItem(this.chaveSessao); } catch (_) {}
    }
  };

  /* --------------------------------------------------------------------------
   * Geração automática dos lotes: A01, A02, … U05
   * ------------------------------------------------------------------------ */
  function gerarLotes() {
    const lotes = [];
    Object.keys(quadras).forEach((quadra) => {
      const total = quadras[quadra];
      for (let n = 1; n <= total; n++) {
        lotes.push(`${quadra}${String(n).padStart(2, '0')}`);
      }
    });
    return lotes;
  }

  const LOTES = gerarLotes();
  const TOTAL_LOTES = LOTES.length;

  function quadraDoLote(lote) {
    return String(lote || '').charAt(0).toUpperCase();
  }

  function loteValido(lote) {
    return LOTES.includes(String(lote || '').toUpperCase());
  }

  /* --------------------------------------------------------------------------
   * Cálculo de idade e faixa etária
   * ------------------------------------------------------------------------ */
  function calcularIdade(anoNascimento) {
    const ano = Number(anoNascimento);
    if (!ano) return null;
    return ANO_ATUAL - ano;
  }

  function faixaEtaria(idade) {
    if (idade == null || isNaN(idade)) return null;
    return FAIXAS.find((f) => idade >= f.min && idade <= f.max) || null;
  }

  function faixaPorId(id) {
    return FAIXAS.find((f) => f.id === id) || null;
  }

  /* --------------------------------------------------------------------------
   * Normalização de um registro de lote
   * ------------------------------------------------------------------------ */
  function normalizarRegistro(registro) {
    const lote = String(registro.lote || '').toUpperCase();
    const moradores = (registro.moradores || [])
      .map((m) => {
        const anoNascimento = Number(m.anoNascimento);
        const sexo = generoPorId(m.sexo).id;
        return { anoNascimento, idade: calcularIdade(anoNascimento), sexo };
      })
      .filter((m) => m.anoNascimento > 0);
    return { lote, moradores, atualizado: registro.atualizado || new Date().toISOString() };
  }

  /* --------------------------------------------------------------------------
   * Persistência local (localStorage)
   * ------------------------------------------------------------------------ */
  function _lerLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function _gravarLocal(mapa) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mapa));
  }

  /* --------------------------------------------------------------------------
   * API pública de persistência (assíncrona — pronta para Supabase)
   * ------------------------------------------------------------------------ */

  // Lista todos os registros cadastrados
  async function listar() {
    if (SUPABASE.ativo()) {
      const resp = await fetch(`${SUPABASE.endpoint()}?select=*`, {
        method: 'GET',
        headers: SUPABASE.headers(),
        cache: 'no-store'
      });
      if (!resp.ok) throw new Error(`Supabase: falha ao listar (${resp.status})`);
      const linhas = await resp.json();
      return linhas.map(normalizarRegistro);
    }
    const mapa = _lerLocal();
    return Object.values(mapa).map(normalizarRegistro);
  }

  // Obtém o registro de um lote específico (ou null)
  async function obter(lote) {
    const alvo = String(lote || '').toUpperCase();
    if (SUPABASE.ativo()) {
      const resp = await fetch(
        `${SUPABASE.endpoint()}?lote=eq.${encodeURIComponent(alvo)}&select=*`,
        { method: 'GET', headers: SUPABASE.headers(), cache: 'no-store' }
      );
      if (!resp.ok) throw new Error(`Supabase: falha ao obter (${resp.status})`);
      const linhas = await resp.json();
      return linhas.length ? normalizarRegistro(linhas[0]) : null;
    }
    const mapa = _lerLocal();
    return mapa[alvo] ? normalizarRegistro(mapa[alvo]) : null;
  }

  // Salva (insere ou atualiza) o registro de um lote
  async function salvar(registro) {
    const dado = normalizarRegistro(registro);
    if (!loteValido(dado.lote)) {
      throw new Error(`Lote inválido: ${dado.lote}`);
    }

    if (SUPABASE.ativo()) {
      // upsert via POST com Prefer: resolution=merge-duplicates
      const resp = await fetch(SUPABASE.endpoint(), {
        method: 'POST',
        headers: SUPABASE.headers(),
        body: JSON.stringify({
          lote: dado.lote,
          moradores: dado.moradores,
          atualizado: dado.atualizado
        })
      });
      if (!resp.ok) throw new Error(`Supabase: falha ao salvar (${resp.status})`);
      return dado;
    }

    const mapa = _lerLocal();
    mapa[dado.lote] = dado;
    _gravarLocal(mapa);
    return dado;
  }

  // Remove o registro de um lote
  async function remover(lote) {
    const alvo = String(lote || '').toUpperCase();
    if (SUPABASE.ativo()) {
      const resp = await fetch(
        `${SUPABASE.endpoint()}?lote=eq.${encodeURIComponent(alvo)}`,
        { method: 'DELETE', headers: SUPABASE.headers() }
      );
      if (!resp.ok) throw new Error(`Supabase: falha ao remover (${resp.status})`);
      return true;
    }
    const mapa = _lerLocal();
    delete mapa[alvo];
    _gravarLocal(mapa);
    return true;
  }

  /* --------------------------------------------------------------------------
   * Estatísticas / agregações (usadas pelo Dashboard)
   * ------------------------------------------------------------------------ */
  function estatisticas(registros) {
    const lotesRespondidos = registros.filter((r) => r.moradores.length > 0);
    const totalMoradores = registros.reduce((s, r) => s + r.moradores.length, 0);

    // Contagem por faixa etária
    const porFaixa = {};
    FAIXAS.forEach((f) => (porFaixa[f.id] = 0));

    // Contagem por sexo
    const porSexo = {};
    GENEROS.forEach((g) => (porSexo[g.id] = 0));

    // Moradores por quadra e por lote
    const porQuadra = {};
    Object.keys(quadras).forEach((q) => (porQuadra[q] = 0));
    const porLote = {};

    let somaIdades = 0;
    let totalIdadesValidas = 0;

    registros.forEach((r) => {
      const q = quadraDoLote(r.lote);
      porQuadra[q] = (porQuadra[q] || 0) + r.moradores.length;
      porLote[r.lote] = r.moradores.length;
      r.moradores.forEach((m) => {
        const f = faixaEtaria(m.idade);
        if (f) porFaixa[f.id]++;
        porSexo[generoPorId(m.sexo).id]++;
        if (m.idade != null && !isNaN(m.idade)) {
          somaIdades += m.idade;
          totalIdadesValidas++;
        }
      });
    });

    const nRespondidos = lotesRespondidos.length;

    return {
      totalLotes: TOTAL_LOTES,
      lotesRespondidos: nRespondidos,
      lotesPendentes: TOTAL_LOTES - nRespondidos,
      totalMoradores,
      mediaMoradoresPorLote: nRespondidos ? totalMoradores / nRespondidos : 0,
      mediaIdadeGeral: totalIdadesValidas ? somaIdades / totalIdadesValidas : 0,
      percRespondidos: TOTAL_LOTES ? (nRespondidos / TOTAL_LOTES) * 100 : 0,
      percPendentes: TOTAL_LOTES ? ((TOTAL_LOTES - nRespondidos) / TOTAL_LOTES) * 100 : 0,
      porFaixa,
      porSexo,
      porQuadra,
      porLote
    };
  }

  /* --------------------------------------------------------------------------
   * Exposição pública
   * ------------------------------------------------------------------------ */
  return {
    quadras,
    LOTES,
    TOTAL_LOTES,
    FAIXAS,
    GENEROS,
    generoPorId,
    ANO_ATUAL,
    SUPABASE,
    ADMIN,
    gerarLotes,
    quadraDoLote,
    loteValido,
    calcularIdade,
    faixaEtaria,
    faixaPorId,
    listar,
    obter,
    salvar,
    remover,
    estatisticas
  };
})();

// Suporte a import como módulo (integração futura), sem quebrar o uso via <script>
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CensoData;
}
