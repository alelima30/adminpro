// Testes da importacao em massa de unidades e pessoas.
// Rodar:  node tests/importacao.test.js

const { carregar, lerFonte } = require('./extrair');

let ok = 0, falhas = 0;
function checa(descricao, obtido, esperado) {
  const igual = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (igual) { ok++; console.log('  ✓ ' + descricao); }
  else { falhas++; console.log('  ✗ ' + descricao + '\n      esperado: ' + JSON.stringify(esperado) + '\n      obtido:   ' + JSON.stringify(obtido)); }
}
function bloco(titulo, fn) { console.log('\n' + titulo); fn(); }

const api = carregar([
  'impLinhas', 'impCampos', 'impUnidadeCod', 'impUnidadesLer', 'impUnidadesGerar',
  'impUnidadesPlano', 'impUnidadesAplicar', 'impPapel', 'impPessoasLer',
  'impPessoasPlano', '_musrNorm', '_soDigitos',
]);

// ── Ler o que a pessoa colou ──────────────────────────────────────────
bloco('A lista vem de uma planilha, nao de um formulario', () => {
  /* Quem cola de Excel traz ponto e virgula, virgula ou tabulacao, e muitas
     vezes o cabecalho junto. Exigir um formato so seria exigir que a pessoa
     soubesse qual -- e ela nao sabe, ela so colou. */
  checa('ponto e virgula', api.impCampos('J11;Rua das Flores'), ['J11', 'Rua das Flores']);
  checa('virgula', api.impCampos('J11,Rua das Flores'), ['J11', 'Rua das Flores']);
  checa('tabulacao', api.impCampos('J11\tRua das Flores'), ['J11', 'Rua das Flores']);

  checa('linhas vazias somem', api.impLinhas('A01\n\n  \nA02\n'), ['A01', 'A02']);
  checa('cabecalho de planilha some',
    api.impLinhas('cod;rua\nA01;Flores\nA02;Palmas'), ['A01;Flores', 'A02;Palmas']);
  // Mas so na primeira linha: "codigo" no meio da lista e um dado.
  checa('e so a primeira linha', api.impLinhas('A01;x\ncodigo;y').length, 2);

  // "J 11" e o que a pessoa quis dizer; "Casa do Ze" nao e codigo.
  checa('espaco no meio do codigo some', api.impUnidadeCod('J 11'), 'J11');
  checa('minuscula vira maiuscula', api.impUnidadeCod('j11'), 'J11');
  checa('texto que nao e codigo vira vazio', api.impUnidadeCod('  '), '');
});

// ── Unidades ──────────────────────────────────────────────────────────
bloco('Importar unidades', () => {
  const r = api.impUnidadesLer('A01;Rua das Flores\nA02;Rua das Flores\n;sem codigo\nA03');
  checa('le as validas', r.itens.map((i) => i.cod), ['A01', 'A02', 'A03']);
  checa('guarda a rua', r.itens[0].rua, 'Rua das Flores');
  checa('e aponta a linha do erro', r.erros.map((e) => e.linha + ':' + e.motivo),
    ['3:sem código de unidade']);

  // Gerador: a forma como a maioria dos condominios e de verdade.
  checa('gera A01..A05', api.impUnidadesGerar('A', 1, 5, 2).cods, ['A01', 'A02', 'A03', 'A04', 'A05']);
  checa('respeita os digitos', api.impUnidadesGerar('B', 8, 10, 3).cods, ['B008', 'B009', 'B010']);
  checa('aceita sufixo', api.impUnidadesGerar('BL', 1, 2, 1, '-A').cods, ['BL1-A', 'BL2-A']);
  checa('intervalo invertido nao gera', api.impUnidadesGerar('A', 10, 1, 2).cods, []);
  checa('e explica por que', /intervalo válido/i.test(api.impUnidadesGerar('A', 10, 1, 2).erro), true);
  // Um engano de digitacao nao pode criar 100 mil unidades.
  checa('intervalo absurdo e barrado', api.impUnidadesGerar('A', 1, 99999, 2).cods.length, 0);

  // ── O plano, antes de gravar ──
  const atuais = { A01: { rua: 'Flores' } };
  const plano = api.impUnidadesPlano(
    api.impUnidadesLer('A01;Flores\nA02;Palmas\nA02;Palmas\nA03;Acacias').itens, atuais);
  /* A01 ja existe e NAO e tocada: atualizar em massa um cadastro que alguem
     conferiu a mao e o jeito mais rapido de perder trabalho de verdade. */
  checa('o que ja existe fica de fora', plano.jaExistem, ['A01']);
  checa('e nao e alterado',
    api.impUnidadesAplicar(plano.novas, atuais).A01.rua, 'Flores');
  checa('entram so as novas', plano.novas.map((n) => n.cod), ['A02', 'A03']);
  checa('repetida na propria lista entra uma vez', plano.repetidas, ['A02']);
  checa('a unidade nova nasce com a rua', api.impUnidadesAplicar(plano.novas, atuais).A02.rua, 'Palmas');
  checa('e com os campos de vinculo vazios',
    api.impUnidadesAplicar(plano.novas, atuais).A02.proprietario, '');
  checa('o original nao e alterado', Object.keys(atuais), ['A01']);
});

// ── Pessoas ───────────────────────────────────────────────────────────
bloco('Papel escrito como a pessoa escreve', () => {
  checa('proprietario', api.impPapel('Proprietário'), 'proprietario');
  checa('dono vale', api.impPapel('dono'), 'proprietario');
  // No cadastro, `morador` e quem MORA -- dono ou nao. Inquilino cai ali.
  checa('inquilino e morador', api.impPapel('Inquilino'), 'morador');
  checa('locatario tambem', api.impPapel('locatária'), 'morador');
  checa('dependente', api.impPapel('Dependente'), 'dependente');
  checa('filho tambem', api.impPapel('filho'), 'dependente');
  checa('o que nao da para saber fica vazio', api.impPapel('vizinho'), '');
});

bloco('Importar pessoas: o duvidoso nao entra', () => {
  const UNIS = {
    A01: { proprietario: '', morador: '' },
    A02: { proprietario: '0001', morador: '' },
  };
  const CONDS = { '0001': { nome: 'Carlos Dono', cpf: '11122233344' } };

  const ler = (t) => api.impPessoasLer(t);
  const plano = (t) => api.impPessoasPlano(ler(t).itens, CONDS, UNIS);

  checa('linha sem papel nao passa da leitura',
    ler('Ana Souza;A01;vizinho').erros[0].motivo.slice(0, 18), 'papel não reconhec');
  checa('nem linha sem unidade', ler('Ana Souza;;proprietario').erros[0].motivo, 'sem unidade');

  // ── O que entra ──
  const p1 = plano('Ana Souza;A01;proprietário;52998224725;11988887777;ana@x.com');
  checa('proprietario de lote vazio entra', p1.novas.map((n) => n.it.nome), ['Ana Souza']);
  checa('sem conflito', p1.conflitos.length, 0);

  // ── O que NAO entra ──
  checa('unidade inexistente',
    plano('Ana Souza;Z99;proprietário').conflitos[0].motivo, 'a unidade Z99 não existe no cadastro');
  /* Lote que ja tem dono nao troca por importacao. Trocar e uma decisao, e
     tem tela propria -- descobrir pelo CSV que o dono mudou seria terrivel. */
  checa('lote que ja tem dono nao e trocado',
    plano('Ana Souza;A02;proprietário').conflitos[0].motivo,
    'o A02 já tem Carlos Dono como proprietario');
  checa('CPF invalido fica de fora',
    plano('Ana Souza;A01;proprietário;123').conflitos[0].motivo, 'CPF inválido');
  checa('CPF que ja e de outra pessoa',
    plano('Ana Souza;A01;proprietário;11122233344').conflitos[0].motivo,
    'o CPF já está em Carlos Dono');
  checa('duas pessoas no mesmo papel do mesmo lote',
    plano('Ana Souza;A01;proprietário\nBia Lima;A01;proprietário').conflitos[0].motivo,
    'a lista põe duas pessoas como proprietario do A01');
  // A mesma pessoa que ja esta no lote nao e conflito: a lista so confirma.
  checa('repetir quem ja esta la nao e conflito',
    plano('Carlos Dono;A02;proprietário').conflitos.length, 0);

  // ── Dependentes ──
  checa('dependente sem titular nao entra',
    plano('Lara Souza;A01;dependente').conflitos[0].motivo,
    'o A01 não tem morador nem proprietário para pendurar o dependente');
  checa('dependente acha o titular que ja existe',
    plano('Lara Dono;A02;filha').dependentes[0].titularCod, '0001');
  /* O titular pode estar na MESMA lista, inclusive depois do dependente --
     quem monta a planilha nao pensa em ordem de processamento. */
  const p2 = plano('Lara Souza;A01;dependente\nAna Souza;A01;proprietário');
  checa('ou na propria lista, mesmo vindo depois', p2.dependentes[0].titularNome, 'Ana Souza');
  checa('e sem virar conflito', p2.conflitos.length, 0);
});

// ── A tela ────────────────────────────────────────────────────────────
bloco('A tela mostra o que vai acontecer antes de acontecer', () => {
  const src = lerFonte();
  checa('a leitura e separada da gravacao',
    /function impUnidadesPlano/.test(src) && /function impUnidadesAplicar/.test(src), true);
  checa('e aplicar trabalha numa copia',
    /function impUnidadesAplicar[\s\S]{0,200}JSON\.parse\(JSON\.stringify\(atuais/.test(src), true);

  // Quem cola uma lista nao sabe o que ja existe no sistema.
  checa('a previa e refeita a cada tecla', /oninput="impConferir\(\)"/.test(src), true);
  checa('e o botao so libera quando ha o que importar',
    /botao\.disabled = !podeGravar;/.test(src), true);

  // Mesmo erro da caixinha de telefone: nao oferecer o que o banco recusa.
  checa('supervisor nao importa',
    /function impAbrir[\s\S]{0,200}mresPodeGerirPessoas\(\)[\s\S]{0,160}return;/.test(src), true);

  // Importacao que mente e pior que formulario: sao centenas de uma vez.
  checa('unidades: espera o servidor e desfaz',
    /_impGravarUnidades[\s\S]{0,600}r\.ok === false[\s\S]{0,260}DB_CACHE\['unidades'\] = antes/.test(src), true);
  checa('pessoas: espera o servidor e desfaz',
    /_impGravarPessoas[\s\S]{0,3000}r1\.ok === false[\s\S]{0,260}DB_CACHE\['condominos'\] = condsAntes/.test(src), true);

  /* Condominos antes de unidades: unidade apontando para uma ficha que nao
     existe mostra o codigo no lugar do nome. Ficha sem vinculo e so uma
     pessoa cadastrada. */
  checa('as fichas vao antes dos vinculos',
    src.indexOf("var r1 = await S('condominos', conds);")
      < src.indexOf("var r2 = await S('unidades', unis);"), true);
  checa('e a falha no segundo passo e dita por extenso',
    /vínculo com as unidades foi recusado/.test(src), true);

  // Gerar duas vezes (bloco A, bloco B) nao pode apagar o primeiro.
  checa('gerar acrescenta, nao substitui',
    /var atual = \(\$\('imp-texto'\)\.value \|\| ''\)\.trim\(\);/.test(src), true);

  // A ordem importa e precisa estar dita na tela.
  checa('a tela avisa para importar unidades primeiro',
    /As unidades precisam existir antes/.test(src), true);
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.error('FALHARAM ' + falhas + ' DE ' + (ok + falhas)); process.exit(1); }
console.log('TODOS OS TESTES PASSARAM (' + ok + ')');
console.log('-'.repeat(50));
