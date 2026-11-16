-- ============================================================================
-- 13 — AUTOATENDIMENTO: o condominio entra sozinho e o teste expira de verdade
--
-- Rode uma vez no SQL Editor do Supabase (projeto do AdminPro).
-- Pode rodar de novo sem estragar nada: tudo e "if not exists" / "or replace".
--
-- O QUE ESTE ARQUIVO FAZ
--   1) Guarda ATE QUANDO vai o teste gratis de cada condominio.
--   2) Faz o acesso acabar junto com o teste -- no BANCO, nao so na tela.
--   3) Da ao aplicativo um jeito de perguntar "quanto tempo me resta?".
--
-- O QUE ELE NAO FAZ
--   Nenhum condominio existente e bloqueado por este arquivo. Veja a nota em
--   "teste_ate" abaixo: quem ja usa o sistema continua sem prazo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Ate quando vai o teste
-- ---------------------------------------------------------------------------

/* Por que uma data, e nao "dias de teste":

   Com um numero de dias, estender o teste de um cliente exigiria mexer na
   data de inicio -- que e um fato do passado e nao se reescreve. Com uma
   data-limite, estender e mudar um campo que existe para isso.

   NULO = SEM PRAZO. E de proposito, e e o que protege quem ja usa o sistema:
   as assinaturas que ja existem continuam com NULL e nunca sao bloqueadas por
   este arquivo. So quem se cadastrar pela tela nova nasce com uma data. */
alter table public.assinaturas
  add column if not exists teste_ate date;

comment on column public.assinaturas.teste_ate is
  'Ultimo dia do teste gratis. NULO = sem prazo (nao bloqueia).';

-- ---------------------------------------------------------------------------
-- 2) A regra de acesso, num lugar so
-- ---------------------------------------------------------------------------

/* Duas coisas diferentes podem fechar a porta, e elas nao se misturam:

   - condominios.status: o interruptor manual. E seu, para ligar e desligar
     um cliente a mao.
   - teste vencido: o prazo acabou e ninguem pagou.

   Inadimplencia NAO fecha a porta. Isso e deliberado e ja estava escrito no
   09_assinaturas.sql: um cliente pode atrasar e continuar usando enquanto
   voce negocia. Cortar o acesso de quem esta conversando com voce e o jeito
   mais rapido de perder o cliente e o dinheiro. Para cortar, use o status. */
create or replace function public.cond_liberado(cod text)
returns boolean language sql stable security definer set search_path = public as $$
  select
    coalesce((select status from public.condominios where codigo = cod), '') = 'ativo'
    and not exists (
      select 1 from public.assinaturas a
       where a.condominio_id = cod
         and a.situacao = 'teste'
         and a.teste_ate is not null
         and a.teste_ate < current_date
    )
$$;

comment on function public.cond_liberado(text) is
  'O condominio pode ser usado hoje? Status ativo e teste dentro do prazo.';

-- ---------------------------------------------------------------------------
-- 3) A trava, aplicada a TODAS as tabelas de uma vez
-- ---------------------------------------------------------------------------

/* Toda politica de RLS deste banco compara  condominio_id = auth_condominio().
   Entao basta esta funcao devolver NULO para o acesso fechar em todas elas ao
   mesmo tempo -- porque  qualquer_coisa = NULL  nao e verdadeiro.

   Escolhi este caminho em vez de acrescentar a checagem em cada politica, uma
   por uma, por um motivo so: a tabela que alguem criar no ano que vem vai
   copiar a politica das outras e ganhar a trava de graca. Na outra forma,
   bastaria esquecer uma linha para abrir um buraco -- e um buraco em cobranca
   nao avisa que existe, so aparece no fim do mes.

   O preco e a surpresa: uma funcao chamada "em que condominio eu estou"
   responder NULO por motivo COMERCIAL. Por isso o nome cru continua
   disponivel, abaixo, e por isso este comentario e longo. */
create or replace function public.auth_condominio_bruto()
returns text language sql stable security definer set search_path = public as $$
  select condominio_id from public.usuarios where id = auth.uid()
$$;

comment on function public.auth_condominio_bruto() is
  'O condominio do usuario logado, SEM olhar o acesso. Use so quando a trava nao se aplica.';

create or replace function public.auth_condominio()
returns text language sql stable security definer set search_path = public as $$
  select c.condominio_id
    from public.usuarios c
   where c.id = auth.uid()
     and public.cond_liberado(c.condominio_id)
$$;

comment on function public.auth_condominio() is
  'O condominio do usuario logado, ou NULO quando o acesso esta fechado (teste vencido ou status). As politicas de RLS dependem disso.';

-- ---------------------------------------------------------------------------
-- 4) O aplicativo precisa saber POR QUE parou
-- ---------------------------------------------------------------------------

/* Com o acesso fechado, ate a leitura da propria ficha do condominio e
   negada -- e uma tela que simplesmente nao carrega parece defeito, nao
   cobranca. Esta funcao atravessa a RLS de proposito, devolvendo o minimo
   para a tela explicar a situacao: nome, se esta liberado, e quantos dias
   faltam. Nada de valores nem de dados de outros condominios. */
create or replace function public.meu_acesso()
returns table (
  condominio   text,
  nome         text,
  liberado     boolean,
  situacao     text,
  teste_ate    date,
  dias_restantes int
) language sql stable security definer set search_path = public as $$
  select
    u.condominio_id,
    coalesce(c.nome, u.condominio_id),
    public.cond_liberado(u.condominio_id),
    coalesce(a.situacao, 'sem assinatura'),
    a.teste_ate,
    case when a.teste_ate is null then null
         else (a.teste_ate - current_date)::int end
    from public.usuarios u
    left join public.condominios c on c.codigo = u.condominio_id
    left join public.assinaturas a on a.condominio_id = u.condominio_id
   where u.id = auth.uid()
$$;

grant execute on function public.meu_acesso() to authenticated;
grant execute on function public.cond_liberado(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Codigo do condominio, gerado sem colisao
-- ---------------------------------------------------------------------------

/* Tirar acento sem depender da extensao unaccent, que nem todo projeto tem
   instalada. Cobre o que aparece em nome de condominio brasileiro. */
create or replace function public.unaccent_imut(t text)
returns text language sql immutable set search_path = public as $$
  select translate(coalesce(t,''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')
$$;

/* O codigo e a chave de tudo (condominio_id em cada tabela). Deixar o cliente
   escolher traz colisao e nomes ruins; sortear sem conferir traz colisao
   silenciosa. Esta funcao tenta a partir das letras do nome e so devolve um
   codigo que ainda nao existe. */
create or replace function public.gerar_codigo_condominio(nome_cond text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  base text;
  tentativa text;
  palavras text[];
  p text;
  i int := 0;
begin
  /* Tira as palavras que todo condominio tem. Sem isto, "Condominio Jardim
     das Acacias" viraria COND -- e o segundo cliente COND1, o terceiro COND2.
     Codigo assim nao diz nada a ninguem e aparece em tudo. */
  -- x.palavra, e nao p: "p" tambem e o nome da variavel do laco abaixo, e o
  -- plpgsql reclama de ambiguidade em vez de escolher um dos dois.
  select array_agg(x.palavra) into palavras
    from (
      select unnest(string_to_array(
               lower(unaccent_imut(coalesce(nome_cond,''))), ' ')) as palavra
    ) x
   where length(x.palavra) > 2
     and x.palavra not in ('condominio','residencial','parque','edificio','predio',
                           'associacao','loteamento','conjunto','das','dos','para');

  if palavras is null or array_length(palavras,1) is null then
    base := 'COND';
  elsif array_length(palavras,1) >= 3 then
    -- Tres palavras ou mais: as iniciais dizem o nome (VNE = Vila Nova Esperanca).
    base := '';
    foreach p in array palavras loop base := base || left(p,1); end loop;
  else
    -- Uma ou duas: as primeiras letras, que leem melhor que duas iniciais.
    base := array_to_string(palavras, '');
  end if;

  base := upper(regexp_replace(base, '[^a-zA-Z0-9]', '', 'g'));
  if length(base) < 2 then base := 'COND'; end if;
  base := left(base, 4);

  loop
    tentativa := case when i = 0 then base else base || i::text end;
    exit when not exists (select 1 from public.condominios where codigo = tentativa);
    i := i + 1;
    if i > 9999 then
      raise exception 'nao consegui gerar um codigo livre para %', nome_cond;
    end if;
  end loop;
  return tentativa;
end $$;

-- ---------------------------------------------------------------------------
-- 6) Limite de cadastros por acesso
-- ---------------------------------------------------------------------------

/* O cadastro e publico, entao alguem pode tentar criar condominios em serie.
   Esta tabela so registra quem criou o que e de onde; a funcao criar-conta
   conta as ultimas 24 horas antes de aceitar mais um.

   Nao tem policy de RLS de proposito: so a funcao (service_role) escreve e
   le. Ninguem pelo aplicativo precisa ver isto. */
create table if not exists public.cadastros_tentativas (
  id            bigserial primary key,
  ip            text,
  email         text,
  condominio_id text,
  criado_em     timestamptz not null default now()
);
alter table public.cadastros_tentativas enable row level security;

create index if not exists cadastros_tentativas_ip_idx
  on public.cadastros_tentativas (ip, criado_em desc);

-- ---------------------------------------------------------------------------
-- CONFERENCIA (so leitura)
-- ---------------------------------------------------------------------------

with conf as (
  select 1 as ord, 'coluna teste_ate' as item,
         case when exists (
           select 1 from information_schema.columns
            where table_schema='public' and table_name='assinaturas' and column_name='teste_ate'
         ) then 'SIM' else 'NAO' end as resultado
  union all
  select 2, 'condominios bloqueados agora',
         coalesce((select string_agg(codigo, ', ')
                     from public.condominios
                    where not public.cond_liberado(codigo)), '(nenhum)')
  union all
  select 3, 'assinaturas com prazo de teste',
         coalesce((select count(*)::text from public.assinaturas where teste_ate is not null), '0')
)
select item, resultado from conf order by ord;
