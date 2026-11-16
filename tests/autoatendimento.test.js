// Testes do autoatendimento: o condominio entra sozinho (fase 1) e o teste
// gratis acaba de verdade (fase 2).
//
// Rodar:  node tests/autoatendimento.test.js

const fs = require('fs');
const path = require('path');
const { carregar, lerFonte } = require('./extrair');

let ok = 0, falhas = 0;
function checa(descricao, obtido, esperado) {
  const igual = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (igual) { ok++; console.log('  ✓ ' + descricao); }
  else { falhas++; console.log('  ✗ ' + descricao + '\n      esperado: ' + JSON.stringify(esperado) + '\n      obtido:   ' + JSON.stringify(obtido)); }
}
const pendentes = [];
function bloco(titulo, fn) {
  console.log('\n' + titulo);
  const r = fn();
  if (r && typeof r.then === 'function') pendentes.push(r);
}

const raiz = path.join(__dirname, '..');
const leia = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');
const SQL = leia('supabase/13_autoatendimento.sql');
const FUNC = leia('supabase/functions/criar-conta/index.ts');
const PAGINA = leia('comecar.html');

// ── A trava nunca pode prender quem esta pagando ──────────────────────
bloco('Na duvida, o aplicativo NAO bloqueia', () => {
  /* A regra de verdade mora no banco: com o teste vencido, auth_condominio()
     devolve nulo e a RLS fecha tudo. A tela so explica.

     Por isso ela nunca decide sozinha que esta bloqueado. Se o servidor cair,
     ou se a migracao ainda nao tiver rodado, bloquear por conta propria
     trancaria um cliente pagante do lado de fora por causa de um erro de
     rede -- e ele nao teria como nem reclamar, porque nao entra. */
  const JANELA = {};
  const api = carregar(['carregarAcesso', 'acessoBloqueado'], { window: JANELA, console });

  const comSB = (sb) => { JANELA.SB = sb; };

  return Promise.resolve()
    .then(() => { comSB(null); return api.carregarAcesso(); })
    .then(() => {
      checa('sem conexao com o banco: nao bloqueia', api.acessoBloqueado(), false);

      comSB({ rpc: () => Promise.resolve({ data: null, error: { message: 'function does not exist' } }) });
      return api.carregarAcesso();
    })
    .then(() => {
      checa('migracao ainda nao rodada: nao bloqueia', api.acessoBloqueado(), false);

      comSB({ rpc: () => Promise.reject(new Error('network')) });
      return api.carregarAcesso();
    })
    .then(() => {
      checa('servidor fora do ar: nao bloqueia', api.acessoBloqueado(), false);

      comSB({ rpc: () => Promise.resolve({ data: [{ liberado: true, situacao: 'teste' }], error: null }) });
      return api.carregarAcesso();
    })
    .then(() => {
      checa('teste em dia: nao bloqueia', api.acessoBloqueado(), false);

      comSB({ rpc: () => Promise.resolve({ data: [{ liberado: false, situacao: 'teste' }], error: null }) });
      return api.carregarAcesso();
    })
    .then(() => {
      // O unico caso que bloqueia: o BANCO disse que esta bloqueado.
      checa('o banco disse que acabou: bloqueia', api.acessoBloqueado(), true);
    });
});

// ── A faixa de dias restantes ─────────────────────────────────────────
bloco('Faixa do teste aparece so durante o teste', () => {
  const src = lerFonte();
  // Num cliente pagante a faixa seria barulho, e barulho constante faz as
  // pessoas pararem de ler os avisos.
  checa('so para quem esta em teste',
    /_ACESSO\.situacao !== 'teste'[\s\S]{0,180}display = 'none'/.test(src), true);
  checa('vencido nao mostra faixa (quem fala e a tela de bloqueio)',
    /if\(d < 0\)\{ el\.style\.display = 'none'; return; \}/.test(src), true);
  checa('os dois ultimos dias ficam em vermelho',
    /var urgente = d <= 2;/.test(src), true);
  checa('hoje e amanha sao ditos por extenso',
    /d === 0 \? 'Seu teste termina <b>hoje<\/b>/.test(src)
      && /d === 1 \? 'Seu teste termina <b>amanhã<\/b>/.test(src), true);

  // A tela de bloqueio esconde o portal inteiro.
  checa('bloqueio esconde o app',
    /function mostrarBloqueio[\s\S]{0,2500}\$\('app'\)\.style\.display = 'none';/.test(src), true);
  // E diz que os dados continuam la -- a duvida que trava a contratacao.
  checa('e garante que nada se perde',
    /Seus dados estão guardados/.test(src), true);
  // Acesso conferido ANTES de carregar os dados.
  checa('confere o acesso antes de carregar os dados',
    src.indexOf('await carregarAcesso();') < src.indexOf('await loadAllFromFirestore();'), true);
});

// ── O que o banco faz ─────────────────────────────────────────────────
bloco('A trava mora no banco, nao na tela', () => {
  /* Uma trava que vive so no JavaScript e um pedido educado: basta abrir o
     DevTools para contorna-la. */
  checa('auth_condominio depende do acesso liberado',
    /create or replace function public\.auth_condominio\(\)[\s\S]{0,400}cond_liberado\(c\.condominio_id\)/.test(SQL), true);
  checa('e o nome cru continua disponivel para quem precisa',
    /function public\.auth_condominio_bruto\(\)/.test(SQL), true);

  /* NULO em teste_ate = sem prazo. E o que impede este arquivo de bloquear
     os condominios que ja usavam o sistema antes dele existir. */
  checa('teste sem data nao bloqueia ninguem',
    /and a\.teste_ate is not null\s*\n\s*and a\.teste_ate < current_date/.test(SQL), true);
  checa('e isso esta escrito, nao so implicito',
    /NULO = SEM PRAZO/.test(SQL), true);

  // Inadimplencia NAO corta acesso: isso ja era regra no 09_assinaturas.
  checa('inadimplente continua entrando',
    /Inadimplencia NAO fecha a porta/.test(SQL), true);
  checa('status do condominio continua sendo o interruptor',
    /coalesce\(\(select status from public\.condominios where codigo = cod\), ''\) = 'ativo'/.test(SQL), true);

  // A tela precisa saber POR QUE parou, e a RLS nega ate a propria ficha.
  checa('meu_acesso atravessa a RLS de proposito',
    /create or replace function public\.meu_acesso\(\)[\s\S]{0,700}security definer/.test(SQL), true);

  // Codigo do condominio gerado sem colisao.
  checa('o codigo so sai depois de conferir que esta livre',
    /exit when not exists \(select 1 from public\.condominios where codigo = tentativa\)/.test(SQL), true);
  checa('e ignora as palavras que todo condominio tem',
    /'condominio','residencial','parque'/.test(SQL), true);
});

// ── A funcao que cria a conta ─────────────────────────────────────────
bloco('Criar conta: o que nao pode dar errado', () => {
  checa('o teste nasce com data para acabar',
    /DIAS_DE_TESTE \* 86400000[\s\S]{0,400}teste_ate: ate/.test(FUNC), true);
  checa('e a assinatura nasce em "teste"', /situacao: "teste"/.test(FUNC), true);

  /* Se a criacao falhar no meio, a conta de acesso fica orfa: a pessoa nao
     entra (nao tem condominio) e nao consegue se cadastrar de novo (o e-mail
     ja existe). Fica presa sem saber por que. */
  checa('falha no meio desfaz a conta criada',
    /admin\/users\/\$\{uid\}`, \{ method: "DELETE"/.test(FUNC), true);
  checa('e desfaz o condominio tambem',
    /rest\(`condominios\?codigo=eq\.\$\{codigo\}`, \{ method: "DELETE" \}\)/.test(FUNC), true);

  // Cadastro publico sem limite vira brinquedo de script.
  checa('tem limite por IP', /LIMITE_POR_IP/.test(FUNC) && /cadastros_tentativas\?select=ip/.test(FUNC), true);
  checa('e a tabela do limite existe na migracao',
    /create table if not exists public\.cadastros_tentativas/.test(SQL), true);
  checa('que nao fica aberta pela RLS',
    /alter table public\.cadastros_tentativas enable row level security/.test(SQL), true);

  // Nome vai para a assinatura e para a nota fiscal.
  checa('exige nome e sobrenome', /Informe nome e sobrenome/.test(FUNC), true);
  // E-mail repetido tem de dizer o que fazer, nao devolver erro em ingles.
  checa('e-mail repetido explica o caminho',
    /já tem acesso ao AdminPro[\s\S]{0,80}Esqueci minha senha/.test(FUNC), true);

  // Nem tudo ligado, nem tudo desligado.
  checa('o condominio novo nasce com modulos escolhidos',
    /MODULOS_INICIAIS/.test(FUNC) && /reservas: true/.test(FUNC) && /unidades: true/.test(FUNC), true);
  checa('e a escolha esta explicada', /Ligar TUDO assusta/.test(FUNC), true);
});

// ── A pagina publica ──────────────────────────────────────────────────
bloco('A porta de entrada', () => {
  checa('chama a funcao do servidor, nao o banco direto',
    /functions\/v1\/criar-conta/.test(PAGINA), true);
  // A pergunta que todo mundo faz antes de digitar.
  checa('diz "sem cartao" antes de pedir qualquer dado',
    PAGINA.indexOf('sem cartão') < PAGINA.indexOf('Nome do condomínio'), true);
  checa('tem as duas etapas', /id="e1"/.test(PAGINA) && /id="e2"/.test(PAGINA), true);
  checa('e confere os campos antes de enviar',
    /Informe nome e sobrenome/.test(PAGINA) && /pelo menos 8 caracteres/.test(PAGINA), true);
  checa('o aceite de dados e obrigatorio', /aceitar os termos/.test(PAGINA), true);

  // O login precisa levar ate aqui, senao ninguem acha.
  const src = lerFonte();
  checa('o login oferece criar conta', /href="comecar\.html"/.test(src), true);
  checa('sem confundir com o pedido de acesso do morador',
    /Já é de um condomínio que usa o AdminPro\?/.test(src), true);
});

// ── O caminho do cliente ate voce ─────────────────────────────────────
bloco('A tela de bloqueio leva o cliente ao WhatsApp', () => {
  const src = lerFonte();
  /* Sem pagamento automatico, este botao E o caminho do cliente ate a
     contratacao. Um botao que nao leva a lugar nenhum seria pior do que um
     caminho mais lento, entao sem WhatsApp configurado ele cai no e-mail. */
  checa('o numero esta configurado', /const SUPORTE_WHATS = '55\d{10,11}';/.test(src), true);
  checa('e a mensagem identifica o condominio e o codigo',
    /Sou do condomínio[\s\S]{0,120}código/.test(src), true);
  checa('sem numero, cai no e-mail em vez de nao levar a nada',
    /if\(SUPORTE_WHATS\)\{[\s\S]{0,200}\} else \{[\s\S]{0,200}mailto:/.test(src), true);
});

// ── Primeiros passos ──────────────────────────────────────────────────
bloco('A trilha pergunta aos dados, nao a um registro proprio', () => {
  const api2 = carregar(['onbPassos'], {});
  const passos = (d) => api2.onbPassos(d).map((p) => (p.feito ? '[x]' : '[ ]') + p.id);

  checa('condominio recem-criado: nada feito',
    passos({}), ['[ ]unidades', '[ ]condominos', '[ ]espacos', '[ ]regras', '[ ]convite']);

  checa('uma unidade ja marca o primeiro',
    api2.onbPassos({ unidades: { A01: {} } })[0].feito, true);
  checa('e o resumo diz quantas',
    api2.onbPassos({ unidades: { A01: {}, A02: {} } })[0].resumo, '2 unidade(s)');

  // Horario em QUALQUER espaco conta: configurar um e entender o mecanismo.
  checa('horario de um espaco ja vale',
    api2.onbPassos({ cfg: { disp_salao_slots: '08:00-12:00' } })[3].feito, true);
  checa('mas chave vazia nao conta',
    api2.onbPassos({ cfg: { disp_salao_slots: '  ' } })[3].feito, false);

  /* So a conta do proprio administrador nao e "convidou os moradores" -- ela
     existe desde o cadastro, e marcar o passo por causa dela seria a trilha
     mentindo logo no primeiro minuto. */
  checa('so o admin nao conta como convite',
    api2.onbPassos({ contas: [{ id: 1 }] })[4].feito, false);
  checa('o segundo morador conta',
    api2.onbPassos({ contas: [{ id: 1 }, { id: 2 }] })[4].feito, true);

  /* O estado vem dos dados. Lista com marcacao propria sai do ar no primeiro
     imprevisto: alguem apaga as unidades e o passo continua "feito". */
  const src = lerFonte();
  checa('nada e guardado como "passo cumprido"',
    /onb_feito|passo_concluido|localStorage\.setItem\('apvc_onb_passo/.test(src), false);
  checa('some sozinha quando tudo esta pronto',
    /if\(e\.completo\)\{ alvo\.style\.display = 'none'; return; \}/.test(src), true);
  checa('e morador nao ve a trilha',
    /!\(nivel === 'admin' \|\| nivel === 'gestor'\) \|\| onbOculto\(\)/.test(src), true);

  // O link do convite leva o codigo: sem ele o morador escolhe o condominio
  // errado e o pedido vai parar na administracao de outra pessoa.
  checa('o convite ja vem com o condominio',
    /cadastro\.html\?c=' \+ encodeURIComponent\(_condAtual/.test(src), true);
});

Promise.all(pendentes).then(() => {
  console.log('\n' + '-'.repeat(50));
  if (falhas) { console.error('FALHARAM ' + falhas + ' DE ' + (ok + falhas)); process.exit(1); }
  console.log('TODOS OS TESTES PASSARAM (' + ok + ')');
  console.log('-'.repeat(50));
});
