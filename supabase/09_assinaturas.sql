-- ============================================================================
-- 09 — ASSINATURAS E COBRANCAS (controle de clientes da plataforma)
--
-- Rodar UMA VEZ no SQL Editor do Supabase. Como os demais arquivos numerados,
-- e aplicado a mao de proposito: mudanca de banco merece revisao antes.
--
-- POR QUE TABELAS NOVAS, E NAO COLUNAS EM `condominios`
-- A politica de leitura de `condominios` e:
--     using ( is_super() or codigo = auth_condominio() )
-- ou seja, o administrador de cada condominio le a PROPRIA linha. Valor,
-- desconto negociado e anotacao interna ("atrasou dois meses, cobrar antes de
-- renovar") nao podem morar la: o cliente leria tudo sobre si mesmo, inclusive
-- o que e para uso da plataforma.
--
-- Estas duas tabelas sao visiveis SOMENTE para o super-admin. Nao ha politica
-- alguma para os demais: sem policy que libere, o RLS nega.
--
-- POR QUE DUAS TABELAS
--   assinaturas  o combinado, que muda pouco: quem e o cliente e quanto custa
--   cobrancas    o que aconteceu mes a mes, que so cresce
-- Misturar as duas obrigaria a reescrever o combinado para registrar um
-- pagamento, e perderia o historico na primeira renegociacao.
-- ============================================================================

-- ── 1) O combinado ──────────────────────────────────────────────────────────
create table if not exists public.assinaturas (
  condominio_id   text primary key references public.condominios(codigo) on delete cascade,

  -- Para emitir a nota. O condominio e o CLIENTE, e nem sempre quem assina e
  -- quem usa o sistema: sindico troca, a administradora paga.
  razao_social    text,
  cnpj            text,
  endereco        text,

  -- Quem fala sobre DINHEIRO. Separado do admin_email do sistema de proposito:
  -- cobrar o sindico que saiu ha seis meses e o jeito mais rapido de nao
  -- receber.
  resp_nome       text,
  resp_email      text,
  resp_tel        text,

  -- Preco por unidade. A conta e valor_unidade x (unidades do condominio),
  -- respeitando um piso opcional -- condominio pequeno costuma ter um minimo,
  -- senao a mensalidade nao paga o trabalho.
  valor_unidade   numeric(10,2) not null default 0,
  valor_minimo    numeric(10,2),

  dia_vencimento  int not null default 10 check (dia_vencimento between 1 and 28),
  inicio          date not null default current_date,
  fim             date,                      -- nulo = vigente

  -- teste | ativo | inadimplente | cancelado
  -- Separado do `status` de `condominios`, que e o interruptor de ACESSO.
  -- Um cliente pode estar inadimplente e ainda com acesso ligado enquanto voce
  -- negocia; sao decisoes diferentes e nao devem compartilhar um campo so.
  situacao        text not null default 'teste',
  obs             text,
  atualizado_em   timestamptz not null default now()
);

-- ── 2) O que aconteceu, mes a mes ───────────────────────────────────────────
create table if not exists public.cobrancas (
  id              uuid primary key default gen_random_uuid(),
  condominio_id   text not null references public.condominios(codigo) on delete cascade,

  competencia     text not null,             -- 'AAAA-MM', o mes cobrado

  -- Quantidade e preco ficam CONGELADOS aqui. Sem isso, um condominio que
  -- cresce de 300 para 320 unidades faria a cobranca de marco mudar de valor
  -- sozinha, meses depois -- e a conta antiga deixaria de bater com a nota
  -- que ja foi emitida.
  qtd_unidades    int,
  valor_unidade   numeric(10,2),
  valor           numeric(10,2) not null,

  vencimento      date not null,
  pago_em         date,                      -- nulo = em aberto
  forma           text,                      -- pix | boleto | transferencia | dinheiro
  obs             text,
  criado_em       timestamptz not null default now(),

  -- Uma cobranca por mes por cliente: impede a duplicata de um clique repetido.
  unique (condominio_id, competencia)
);

create index if not exists idx_cobrancas_cond  on public.cobrancas(condominio_id, competencia desc);
create index if not exists idx_cobrancas_aberto on public.cobrancas(vencimento) where pago_em is null;

-- ── 3) Segurança: so o dono da plataforma ───────────────────────────────────
alter table public.assinaturas enable row level security;
alter table public.cobrancas   enable row level security;

-- Uma unica policy por tabela, e ela exige is_super(). Nao existe policy de
-- leitura para o administrador do condominio -- e essa ausencia E a protecao:
-- com RLS ligado, o que nao esta liberado esta negado.
create policy assin_super on public.assinaturas for all
  using ( is_super() ) with check ( is_super() );

create policy cobr_super on public.cobrancas for all
  using ( is_super() ) with check ( is_super() );

-- ── 4) Quem esta em dia? ────────────────────────────────────────────────────
-- A pergunta que o sistema nao sabia responder. Uma linha por condominio, com
-- o combinado, a conta do mes e a situacao da cobranca mais recente.
create or replace view public.painel_assinaturas as
select
  c.codigo,
  c.nome,
  c.status                                        as acesso,
  a.situacao,
  a.valor_unidade,
  a.valor_minimo,
  a.dia_vencimento,
  a.resp_nome,
  a.resp_email,
  a.resp_tel,
  (select count(*) from public.unidades u where u.condominio_id = c.codigo) as unidades,
  greatest(
    coalesce(a.valor_minimo, 0),
    coalesce(a.valor_unidade, 0) * (select count(*) from public.unidades u where u.condominio_id = c.codigo)
  )                                               as valor_mes,
  ult.competencia                                 as ultima_competencia,
  ult.vencimento                                  as ultimo_vencimento,
  ult.pago_em                                     as ultimo_pago_em,
  (select count(*) from public.cobrancas x
     where x.condominio_id = c.codigo and x.pago_em is null
       and x.vencimento < current_date)           as vencidas
from public.condominios c
left join public.assinaturas a on a.condominio_id = c.codigo
left join lateral (
  select competencia, vencimento, pago_em
    from public.cobrancas y
   where y.condominio_id = c.codigo
   order by competencia desc
   limit 1
) ult on true
-- ESTA LINHA E A PROTECAO, e ela precisa estar aqui dentro.
--
-- Sem ela, um administrador comum consultaria a view e receberia UMA LINHA POR
-- CONDOMINIO da plataforma inteira -- porque o LEFT JOIN parte de
-- `condominios`, e o join com as tabelas protegidas apenas devolve nulo em vez
-- de sumir com a linha. Ele nao veria os valores, mas veria quantos clientes
-- voce tem e como se chamam.
where is_super();

-- DUAS PROPRIEDADES, e as duas sao obrigatorias:
--
-- security_invoker: no Postgres, uma view roda com os poderes de QUEM A CRIOU,
-- nao de quem consulta. Criada aqui pelo dono do banco, ela passaria por cima
-- do RLS das tabelas de baixo e entregaria assinaturas e cobrancas de todo
-- mundo a qualquer usuario logado. Com invoker ligado, o RLS de quem pergunta
-- e que vale.
--
-- security_barrier: impede que o Postgres empurre uma condicao esperta de fora
-- para dentro da view antes do filtro acima, o que poderia revelar linha por
-- linha o que o filtro deveria esconder.
alter view public.painel_assinaturas set (security_invoker = true);
alter view public.painel_assinaturas set (security_barrier = true);

-- ============================================================================
-- Depois de rodar: o painel SaaS do app passa a mostrar a aba "Assinaturas".
-- Nada e cobrado automaticamente -- a geracao da cobranca do mes e a baixa do
-- pagamento sao feitas por voce, na tela. Foi a escolha: saber primeiro,
-- automatizar quando doer.
-- ============================================================================
