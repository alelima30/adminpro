// Testes do painel analitico de Reservas (periodo e rankings).
// Rodar:  node tests/dashboard.test.js

const { carregar, lerFonte } = require('./extrair');

let ok = 0, falhas = 0;
function checa(descricao, obtido, esperado) {
  const igual = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (igual) { ok++; console.log('  ✓ ' + descricao); }
  else { falhas++; console.log('  ✗ ' + descricao + '\n      esperado: ' + JSON.stringify(esperado) + '\n      obtido:   ' + JSON.stringify(obtido)); }
}
function bloco(titulo, fn) { console.log('\n' + titulo); fn(); }

const api = carregar([
  'dashPeriodo', 'dashNoPeriodo', 'dashRanking', 'dashPorDiaSemana', 'dashPorFaixa',
  '_horasReserva', 'hrIni', '_minHora',
], { DASH_DIAS: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] });

// ── O periodo ─────────────────────────────────────────────────────────
bloco('O periodo recorta o mes certo', () => {
  // 15 de março de 2026, uma quinta-feira.
  const hoje = new Date(2026, 2, 15);
  const p = (k) => { const r = api.dashPeriodo(k, hoje); return r.ini + '..' + r.fim; };

  checa('este mes', p('mes'), '2026-03-01..2026-03-31');
  checa('mes passado', p('anterior'), '2026-02-01..2026-02-28');
  checa('ultimos 3 meses', p('tri'), '2026-01-01..2026-03-31');
  checa('este ano', p('ano'), '2026-01-01..2026-12-31');
  checa('tudo nao tem limite', p('tudo'), '..');
  checa('e cada um se identifica', api.dashPeriodo('anterior', hoje).rotulo, 'mês passado');

  /* Virada de ano: em janeiro, "mes passado" e dezembro do ano anterior.
     Subtrair 1 do mes sem cuidado daria 2026-00, que nao existe. */
  const jan = new Date(2026, 0, 10);
  checa('em janeiro, o mes passado e dezembro',
    api.dashPeriodo('anterior', jan).ini + '..' + api.dashPeriodo('anterior', jan).fim,
    '2025-12-01..2025-12-31');
  // Fevereiro de ano bissexto: 29 dias, nao 28.
  checa('fevereiro bissexto termina no dia 29',
    api.dashPeriodo('mes', new Date(2028, 1, 10)).fim, '2028-02-29');
});

bloco('Cancelada nao entra em ranking nenhum', () => {
  const RES = [
    { data: '2026-03-10', espaco: 'Salão', status: 'confirmada' },
    { data: '2026-03-11', espaco: 'Salão', status: 'cancelada' },
    { data: '2026-02-20', espaco: 'Salão', status: 'confirmada' },
    { data: '', espaco: 'Salão', status: 'confirmada' },
  ];
  const per = api.dashPeriodo('mes', new Date(2026, 2, 15));
  /* Quem desmarca nao usou o espaco. Contar a cancelada premiaria justamente
     quem mais atrapalha a agenda. */
  checa('a cancelada fica de fora', api.dashNoPeriodo(RES, per).length, 1);
  checa('e a de outro mes tambem', api.dashNoPeriodo(RES, per)[0].data, '2026-03-10');
  checa('reserva sem data nao quebra nem entra',
    api.dashNoPeriodo(RES, { ini: '', fim: '' }).length, 2);
});

// ── Os rankings ───────────────────────────────────────────────────────
bloco('Ranking: a mesma pergunta sobre campos diferentes', () => {
  const RES = [
    { data: '2026-03-01', espaco: 'Salão', nome: 'Ana', lote: 'A01', horario: '08:00–12:00', taxa: '100', pgto: 'pago', status: 'confirmada' },
    { data: '2026-03-02', espaco: 'Salão', nome: 'Ana', lote: 'A01', horario: '08:00–10:00', taxa: '100', pgto: 'pendente', status: 'confirmada' },
    { data: '2026-03-03', espaco: 'Quadra', nome: 'Bia', lote: 'B02', horario: '18:00–19:00', taxa: '50', pgto: 'pago', status: 'confirmada' },
  ];
  const porEsp = api.dashRanking(RES, (r) => r.espaco);
  checa('espaco mais usado na frente', porEsp.map((x) => x.chave + ':' + x.n), ['Salão:2', 'Quadra:1']);
  checa('e soma as horas de uso', porEsp[0].horas, 6);
  // Receita so conta o que foi PAGO: somar o pendente seria contar dinheiro
  // que ainda nao entrou.
  checa('receita conta so o pago', porEsp[0].receita, 100);

  checa('quem mais reserva', api.dashRanking(RES, (r) => r.nome).map((x) => x.chave), ['Ana', 'Bia']);
  checa('e a unidade que mais reserva',
    api.dashRanking(RES, (r) => r.lote).map((x) => x.chave + ':' + x.n), ['A01:2', 'B02:1']);

  // Empate: desempata pela receita e, persistindo, pelo nome -- ordem
  // instavel faria o mesmo relatorio sair diferente a cada abertura.
  const EMP = [
    { data: '2026-03-01', espaco: 'Zeta', status: 'confirmada', taxa: '10', pgto: 'pago' },
    { data: '2026-03-01', espaco: 'Alfa', status: 'confirmada' },
  ];
  checa('empate resolve pela receita', api.dashRanking(EMP, (r) => r.espaco)[0].chave, 'Zeta');
  const EMP2 = [
    { data: '2026-03-01', espaco: 'Zeta', status: 'confirmada' },
    { data: '2026-03-01', espaco: 'Alfa', status: 'confirmada' },
  ];
  checa('sem receita, ordem alfabetica estavel',
    api.dashRanking(EMP2, (r) => r.espaco).map((x) => x.chave), ['Alfa', 'Zeta']);

  checa('campo vazio nao vira linha "—"',
    api.dashRanking([{ data: '2026-03-01', espaco: '', status: 'confirmada' }], (r) => r.espaco).length, 0);
});

// ── Quando o espaco enche ─────────────────────────────────────────────
bloco('Dia da semana e faixa de horario', () => {
  /* 'AAAA-MM-DD' montado como data LOCAL. Passando a string direta ao
     construtor, o navegador le como UTC e a reserva cai no dia anterior --
     o sabado viraria sexta no relatorio. */
  const sab = api.dashPorDiaSemana([{ data: '2026-03-14' }]);   // 14/03/2026 = sábado
  checa('sabado e contado como sabado', sab.filter((d) => d.n).map((d) => d.dia), ['Sábado']);
  checa('e a semana vem inteira, para o grafico nao ter buraco', sab.length, 7);

  const f = api.dashPorFaixa([
    { horario: '08:00–12:00' }, { horario: '14:00–16:00' },
    { horario: '19:00–23:00' }, { horario: '20:00–22:00' }, { horario: '' },
  ]);
  checa('manha, tarde e noite', f.map((x) => x.n), [1, 1, 2, 0]);
  checa('horario vazio nao entra em faixa nenhuma',
    f.reduce((s, x) => s + x.n, 0), 4);
});

// ── O painel nao pode apontar um vencedor que nao existe ──────────────
bloco('Empate nao ganha medalha', () => {
  const src = lerFonte();
  /* Cinco dias com uma reserva cada: destacar o primeiro da lista afirmaria
     que domingo e o dia mais procurado, quando a resposta honesta e "nenhum
     se destaca". O painel existe para informar decisao. */
  checa('so destaca quem ganha do segundo',
    /var lidera = itens\.length > 0 && itens\[0\]\.n > 0[\s\S]{0,120}itens\[0\]\.n > itens\[1\]\.n/.test(src), true);
  checa('e zero nunca e destaque', /itens\[0\]\.n > 0/.test(src), true);
});

// ── A planilha ────────────────────────────────────────────────────────
bloco('A planilha abre certo no Excel brasileiro', () => {
  const src = lerFonte();
  /* Com ponto, o Excel em portugues le "450.00" como texto (ou como quarenta
     e cinco mil) e a coluna de receita para de somar -- numa planilha feita
     para montar relatorio, isso inutiliza a coluna que interessa. */
  checa('decimal com virgula', /toFixed\(2\)\.replace\('\.', ','\)/.test(src), true);
  checa('e nenhuma receita escapa com ponto',
    /receita\.toFixed\(2\)/.test(src), false);
  // BOM na frente, senao o Excel estraga os acentos.
  checa('acento sobrevive', /'\\ufeff' \+ L\.join/.test(src), true);
  // O periodo vai escrito no arquivo: numero sem contexto nao vira relatorio.
  checa('o arquivo diz de que periodo e',
    /Período: ' \+ d\.per\.rotulo/.test(src), true);
  checa('e o nome do arquivo tambem', /relatorio-reservas-' \+ \(d\.per\.ini/.test(src), true);
  // Exportar usa o que esta NA TELA, nao recalcula.
  checa('exporta o que a tela mostra', /if\(!_dashUltimo\)\{/.test(src), true);
});

// ── A tela ────────────────────────────────────────────────────────────
bloco('O numero nunca aparece sem o periodo', () => {
  const src = lerFonte();
  /* Ranking sem periodo escrito e numero sem contexto: quem le o relatorio
     nao sabe se "12 reservas" e do mes ou de dois anos. */
  checa('o periodo escolhido fica guardado',
    /apvc_res_dash_periodo/.test(src), true);
  checa('e a tendencia de 12 meses NAO e recortada',
    /tendencia recortada por mes deixa de ser tendencia/.test(src), true);
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.error('FALHARAM ' + falhas + ' DE ' + (ok + falhas)); process.exit(1); }
console.log('TODOS OS TESTES PASSARAM (' + ok + ')');
console.log('-'.repeat(50));
