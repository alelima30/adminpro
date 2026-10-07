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

const { carregar, lerFonte } = require('./extrair');

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

// ── Campo opcional não pode derrubar o cadastro ───────────────────────
// Aconteceu de verdade: a coluna cpf ainda não existia no banco (o cache de
// schema do Supabase não tinha recarregado), e o cadastro público inteiro
// parava com "Could not find the 'cpf' column of 'solicitacoes' in the schema
// cache". A pessoa não conseguia entrar no sistema por causa de um campo que
// ela nem era obrigada a preencher.
bloco('O cadastro público sobrevive sem a coluna cpf', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'cadastro.html'), 'utf8');

  checa('o envio tenta primeiro COM o cpf',
    src.includes("insert(Object.assign({ cpf: cpf || null }, base))"), true);
  checa('e repete sem ele quando o erro é do cpf',
    /if\(sol\.error && \/cpf\/i\.test\(sol\.error\.message\|\|''\)\)/.test(src), true);
  checa('a segunda tentativa não leva o cpf',
    /sol = await SB\.from\('solicitacoes'\)\.insert\(base\);/.test(src), true);
  // Outros erros continuam parando o cadastro: engolir tudo seria pior.
  checa('erro que não é do cpf continua subindo',
    /if\(sol\.error\) throw sol\.error;/.test(src), true);
  // Quem precisa saber do problema é quem cuida do sistema.
  checa('o aviso vai para o console, não para a tela',
    /console\.warn\('Coluna cpf indispon/.test(src), true);
});

bloco('A migração do cpf recarrega o cache do schema', () => {
  const fs = require('fs');
  const path = require('path');
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', '12_cpf_solicitacoes.sql'), 'utf8');
  checa('cria a coluna', /add column if not exists cpf text/.test(sql), true);
  // Sem isto, criar a coluna não basta: o Supabase continua respondendo pelo
  // cache antigo e o cadastro segue quebrado.
  checa('e manda recarregar o cache', /notify pgrst, 'reload schema'/.test(sql), true);
});

// ── Unidade no cadastro público: digitar em vez de rolar ──────────────
// Era um <select> com a lista inteira. No celular isso vira a roleta do
// sistema com centenas de lotes, e achar o J11 ali é rolar no escuro.
bloco('A unidade do cadastro público é digitada e filtrada', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'cadastro.html'), 'utf8');

  checa('o campo que aparece é de digitar',
    /id="c-unidade-busca"[\s\S]{0,400}oninput="uniFiltrar/.test(src), true);
  // O resto do formulário (validação e envio) lê c-unidade: ele continua
  // existindo, agora escondido. Trocar o id teria quebrado tudo em silêncio.
  checa('o valor continua no mesmo campo de sempre',
    src.includes('<input type="hidden" id="c-unidade">'), true);
  checa('e o envio continua lendo dele',
    src.includes("const unidade=$('c-unidade').value;"), true);

  // Lista grande não pode ser desenhada inteira a cada tecla.
  checa('a lista desenhada é limitada', /\.slice\(0,\s*40\)/.test(src), true);
  // Quem digita "J1" procura o J11, não o "AJ1".
  checa('quem começa com o texto vem primeiro',
    /comeca\.concat\(contem\)/.test(src), true);

  // Clicar na lista não pode ser morto pelo onblur do campo.
  checa('o clique na lista sobrevive ao blur',
    /id="c-unidade-lista" onmousedown="event\.preventDefault\(\)"/.test(src), true);

  // form.reset() não desfaz o destaque pintado por uniEscolher.
  checa('o reset do formulário limpa a unidade',
    src.includes("$('form').reset(); uniLimpar();"), true);
});

bloco('Tab e Enter na unidade só confirmam sem duvida', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'cadastro.html'), 'utf8');
  const i = src.indexOf('function uniEscolhaTeclado');
  const corpo = src.slice(i, src.indexOf('\n}', i) + 2);
  const uniNorm = (v) => String(v || '').toUpperCase().replace(/\s+/g, '');
  let uniEscolhaTeclado;
  eval(corpo.replace('function uniEscolhaTeclado', 'uniEscolhaTeclado = function'));

  const L = [{ c: 'J10' }, { c: 'J11' }, { c: 'J12' }];
  checa('unidade digitada por inteiro confirma', uniEscolhaTeclado('j11', L, -1), 'J11');
  checa('minúscula vale', uniEscolhaTeclado('J11', L, -1), 'J11');
  checa('espaço no meio não atrapalha', uniEscolhaTeclado(' j 11 ', L, -1), 'J11');
  checa('sobrou uma só na lista', uniEscolhaTeclado('J1', [{ c: 'J11' }], -1), 'J11');
  checa('escolhido com as setas', uniEscolhaTeclado('J1', L, 2), 'J12');
  // Mandar a pessoa para a unidade errada é pior do que pedir que termine.
  checa('prefixo ambíguo não escolhe', uniEscolhaTeclado('J1', L, -1), '');
  checa('vazio não escolhe', uniEscolhaTeclado('', L, -1), '');
  checa('unidade inexistente não escolhe', uniEscolhaTeclado('ZZ9', L, -1), '');
  checa('lista ausente não quebra', uniEscolhaTeclado('J11', null, -1), '');
});

// ── Telefone digitado na reserva volta para o cadastro ────────────────
// O telefone da reserva ficava só nela. A pessoa corrigia o número na hora de
// marcar e, na reserva seguinte, o campo voltava errado — a correção se
// perdia toda vez.
bloco('Quando vale oferecer "salvar tambem no cadastro"', () => {
  const api2 = carregar(['resTelOfereceCadastro', '_soDigitos'], {});
  const of = api2.resTelOfereceCadastro;
  const camila = { nome: 'Camila', origem: 'cadastro', cod: '0001', dep: -1, tel: '1133334444' };

  const r = of(camila, '11988887777');
  checa('número diferente oferece', !!r, true);
  checa('e diz de quem é', r && r.nome, 'Camila');
  checa('mostrando o que sai e o que entra', r && [r.atual, r.novo], ['1133334444', '11988887777']);

  // Ficha sem telefone é o caso mais útil: cadastro antigo que nunca teve contato.
  checa('ficha sem telefone também oferece',
        !!of({ ...camila, tel: '' }, '11988887777'), true);

  // "(11) 3333-4444" e "1133334444" são o mesmo número: perguntar por causa
  // de parênteses seria ruído.
  checa('mesmo número com máscara diferente NÃO oferece',
        of(camila, '(11) 3333-4444'), null);
  // Apagar o telefone da reserva não é pedido para apagar o da ficha.
  checa('campo vazio NÃO oferece', of(camila, ''), null);
  checa('número incompleto NÃO oferece', of(camila, '119'), null);
  // Quem não está no cadastro não tem ficha onde gravar.
  checa('pessoa só com conta no app NÃO oferece',
        of({ nome: 'X', origem: 'app', tel: '' }, '11988887777'), null);
  checa('pessoa sem código NÃO oferece',
        of({ nome: 'X', origem: 'cadastro', tel: '' }, '11988887777'), null);
  checa('sem pessoa escolhida NÃO oferece', of(null, '11988887777'), null);
});

bloco('Achar a pessoa nao depende do seletor', () => {
  const src = lerFonte();
  /* O seletor "Morador / Dependente" e um ATALHO: quem digita o nome direto
     no campo nunca o toca, e ele tambem se esvazia quando a lista e
     repovoada. Dependendo so dele, a caixinha nao aparecia justamente para
     quem preenche do jeito mais natural -- foi assim que o recurso ficou
     "sem aparecer" na primeira versao. */
  checa('existe quem ache a pessoa', src.includes('function mresPessoaEscolhida()'), true);
  checa('o seletor manda quando foi usado',
    /if\(sel && sel\.value !== '' && lista\[\+sel\.value\]\) return lista\[\+sel\.value\];/.test(src), true);
  checa('senao, procura pelo nome digitado',
    /_musrNorm\(p\.nome\) === nome/.test(src), true);
  // Digitar o nome tem de reavaliar a oferta, senao ela so apareceria
  // depois de mexer no telefone de novo.
  checa('digitar o nome reavalia a caixinha',
    /id="mres-nome"[^>]*oninput="try\{mresTelMudou\(\)\}/.test(src), true);
  // E os dois caminhos usam a MESMA busca: a caixinha nao pode aparecer por
  // um criterio e gravar por outro.
  checa('mostrar usa a busca', /function mresTelMudou\(\)[\s\S]{0,220}mresPessoaEscolhida\(\)/.test(src), true);
  checa('e gravar usa a mesma', /function mresPedidoTelCadastro\(\)[\s\S]{0,220}mresPessoaEscolhida\(\)/.test(src), true);
});

bloco('A intencao e lida antes, nao depois', () => {
  const src = lerFonte();
  /* O seletor de pessoa e repovoado durante o salvamento e perde a escolha.
     Lendo a tela depois, a intencao ja tinha evaporado: a caixinha ficava
     marcada e nada era gravado, em silencio. Achado testando o fluxo inteiro
     no navegador -- a regra pura passava, e mesmo assim nao gravava. */
  checa('o pedido e capturado no comeco do salvamento',
    /_telCadPedido = mresPedidoTelCadastro\(\);/.test(src), true);
  checa('e a gravacao usa o que foi capturado',
    src.includes('mresSalvarTelNoCadastro(_telCadPedido)'), true);
  // Gravar so depois de a reserva estar salva: se o servidor recusar a
  // reserva, nao faz sentido ter mexido na ficha por causa dela.
  checa('grava depois da reserva, nao antes',
    src.indexOf('mresSalvarTelNoCadastro(_telCadPedido)') > src.indexOf('await _reservaUpsertSB(obj)'), true);
});

console.log('\n' + '-'.repeat(50));
if (falhas) { console.error('FALHARAM ' + falhas + ' DE ' + (ok + falhas)); process.exit(1); }
console.log('TODOS OS TESTES PASSARAM (' + ok + ')');
console.log('-'.repeat(50));
