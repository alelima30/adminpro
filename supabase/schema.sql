-- ═══════════════════════════════════════════════════════════════════════════
--  AdminPro · Esquema Supabase (SaaS multi-condomínio)
--  Cole tudo no Supabase → SQL Editor → New query → Run.
--  Idempotente: pode rodar de novo sem quebrar (usa IF NOT EXISTS / OR REPLACE).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Extensões ──────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ═══════════════════════════════════════════════════════════════════════════
--  1) TABELAS
-- ═══════════════════════════════════════════════════════════════════════════

-- Condomínios = "tenants" da plataforma
create table if not exists public.condominios (
  codigo        text primary key,                 -- ex: 'APVC'
  nome          text not null,
  logo          text,                             -- URL do Storage (ou base64 legado)
  admin_email   text,
  status        text not null default 'ativo',    -- ativo | suspenso
  modulos       jsonb not null default '{}'::jsonb,-- {paineis:true, financeiro:true, ...}
  criado_em     timestamptz not null default now()
);

-- Usuários (vinculados ao Supabase Auth). 1 linha por pessoa com acesso.
create table if not exists public.usuarios (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text unique not null,
  nome          text,
  tel           text,
  condominio_id text references public.condominios(codigo),
  unidade       text,                             -- unidade vinculada (ex: 'K13')
  vinculo       text,                             -- proprietario | morador | inquilino
  nivel         text not null default 'morador',  -- morador | gestor | admin
  super_admin   boolean not null default false,   -- admin da PLATAFORMA (vê todos)
  status        text not null default 'ativo',    -- ativo | bloqueado
  obs           text,
  criado_em     timestamptz not null default now()
);

-- Solicitações de acesso (cadastro público, antes da aprovação). SEM senha:
-- a senha é definida pelo próprio morador via convite/reset do Supabase Auth.
create table if not exists public.solicitacoes (
  id            uuid primary key default gen_random_uuid(),
  condominio_id text,
  nome          text,
  email         text,
  tel           text,
  unidade       text,
  vinculo       text,
  nivel         text default 'morador',
  status        text default 'pendente',          -- pendente | aprovada | rejeitada
  criado_em     timestamptz not null default now()
);

-- Unidades
create table if not exists public.unidades (
  condominio_id text not null references public.condominios(codigo) on delete cascade,
  cod           text not null,                    -- ex: 'K13'
  tipo          text,
  rua           text,
  numero        text,
  bairro        text,
  cidade        text,
  estado        text,
  ocupacao      text,                             -- HABITADO | VAZIO | ...
  situacao      text,
  proprietario  text,                             -- código do condômino
  morador       text,                             -- código do condômino
  no            text,
  codigo_imovel text,
  extra         jsonb not null default '{}'::jsonb,
  primary key (condominio_id, cod)
);

-- Condôminos (dependentes e telefones ficam como JSONB — são listas aninhadas)
create table if not exists public.condominos (
  condominio_id text not null references public.condominios(codigo) on delete cascade,
  cod           text not null,                    -- ex: '0160'
  nome          text,
  tipo_pessoa   text,                             -- fisica | juridica
  cpf           text,
  rg            text,
  cnpj          text,
  ie            text,
  nascimento    date,
  sexo          text,
  nacionalidade text,
  profissao     text,
  email         text,
  telefone      text,
  telefones     jsonb not null default '[]'::jsonb,
  classificacao text,
  foto          text,
  dependentes   jsonb not null default '[]'::jsonb,
  extra         jsonb not null default '{}'::jsonb,
  primary key (condominio_id, cod)
);

-- Localizações (ruas/alamedas)
create table if not exists public.localizacoes (
  condominio_id text not null references public.condominios(codigo) on delete cascade,
  cod           text not null,
  tipo          text,                             -- Alameda | Rua | ...
  nome          text,
  cep           text,
  primary key (condominio_id, cod)
);

-- Classificações de condôminos
create table if not exists public.classificacoes (
  condominio_id text not null references public.condominios(codigo) on delete cascade,
  cod           text not null,
  nome          text,
  extra         jsonb not null default '{}'::jsonb,
  primary key (condominio_id, cod)
);

-- Reservas
create table if not exists public.reservas (
  condominio_id  text not null references public.condominios(codigo) on delete cascade,
  id             bigint not null,                 -- id numérico do app (Date.now())
  nome           text,
  unidade        text,
  tel            text,
  pessoas        text,
  espaco         text,
  status         text,                            -- pendente | confirmada | ...
  data           date,
  horario        text,
  finalidade     text,
  taxa           numeric,
  caucao         numeric,
  pgto           text,
  data_pgto      date,
  forma_pgto     text,
  comprovante    text,
  checklist      jsonb not null default '{}'::jsonb,
  obs            text,
  alerta_whatsapp text,
  alerta_email    text,
  alertas        jsonb not null default '[]'::jsonb,
  criado_por     text,
  criado_em      timestamptz not null default now(),
  primary key (condominio_id, id)
);

-- Módulos ainda não normalizados (censo de lotes, funcionários, financeiro,
-- manutenção, comunicados, preventivas, regulamento, inadimplência, config,
-- condseq…). Guardados como 1 documento JSONB por módulo, isolados por condomínio.
-- Assim nada se perde na migração e dá pra normalizar depois, módulo a módulo.
create table if not exists public.modulo_dados (
  condominio_id text not null references public.condominios(codigo) on delete cascade,
  modulo        text not null,                    -- 'lotes','funcs','fin','manut',...
  valor         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (condominio_id, modulo)
);

-- Índices úteis
create index if not exists idx_unidades_cond   on public.unidades(condominio_id);
create index if not exists idx_condominos_cond on public.condominos(condominio_id);
create index if not exists idx_reservas_cond   on public.reservas(condominio_id, data);
create index if not exists idx_usuarios_email  on public.usuarios(email);

-- ═══════════════════════════════════════════════════════════════════════════
--  2) FUNÇÕES AUXILIARES (usadas pelas policies de RLS)
-- ═══════════════════════════════════════════════════════════════════════════

-- Condomínio do usuário logado
create or replace function public.auth_condominio()
returns text language sql stable security definer set search_path = public as $$
  select condominio_id from public.usuarios where id = auth.uid()
$$;

-- Usuário logado é super-admin da plataforma?
create or replace function public.is_super()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select super_admin from public.usuarios where id = auth.uid()), false)
$$;

-- Usuário logado é admin/gestor do próprio condomínio?
create or replace function public.is_admin_cond()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select nivel in ('admin','gestor') from public.usuarios where id = auth.uid()), false)
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  3) RLS (Row Level Security) — isolamento por condomínio
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.condominios   enable row level security;
alter table public.usuarios      enable row level security;
alter table public.solicitacoes  enable row level security;
alter table public.unidades      enable row level security;
alter table public.condominos    enable row level security;
alter table public.localizacoes  enable row level security;
alter table public.classificacoes enable row level security;
alter table public.reservas      enable row level security;
alter table public.modulo_dados  enable row level security;

-- Helper: recria policy sem erro se já existir
-- (rode este bloco inteiro; ele apaga e recria as policies)

-- ── condominios ──
drop policy if exists cond_sel on public.condominios;
drop policy if exists cond_all on public.condominios;
create policy cond_sel on public.condominios for select
  using ( is_super() or codigo = auth_condominio() );
create policy cond_all on public.condominios for all
  using ( is_super() ) with check ( is_super() );

-- ── usuarios ── (cada um lê a si; super/admin do condomínio gerenciam)
drop policy if exists usr_self on public.usuarios;
drop policy if exists usr_admin on public.usuarios;
create policy usr_self on public.usuarios for select
  using ( id = auth.uid() or is_super() or (is_admin_cond() and condominio_id = auth_condominio()) );
create policy usr_admin on public.usuarios for all
  using ( is_super() or (is_admin_cond() and condominio_id = auth_condominio()) )
  with check ( is_super() or (is_admin_cond() and condominio_id = auth_condominio()) );

-- ── solicitacoes ── (QUALQUER visitante pode CRIAR; só logados leem/mexem)
drop policy if exists sol_insert on public.solicitacoes;
drop policy if exists sol_manage on public.solicitacoes;
create policy sol_insert on public.solicitacoes for insert
  to anon, authenticated with check ( true );
create policy sol_manage on public.solicitacoes for all
  to authenticated
  using ( is_super() or (is_admin_cond() and condominio_id = auth_condominio()) )
  with check ( is_super() or (is_admin_cond() and condominio_id = auth_condominio()) );

-- ── Macro para tabelas por-condomínio (mesma regra) ──
-- unidades
drop policy if exists uni_rw on public.unidades;
create policy uni_rw on public.unidades for all
  using ( is_super() or condominio_id = auth_condominio() )
  with check ( is_super() or (condominio_id = auth_condominio() and is_admin_cond()) );

-- condominos
drop policy if exists con_rw on public.condominos;
create policy con_rw on public.condominos for all
  using ( is_super() or condominio_id = auth_condominio() )
  with check ( is_super() or (condominio_id = auth_condominio() and is_admin_cond()) );

-- localizacoes
drop policy if exists loc_rw on public.localizacoes;
create policy loc_rw on public.localizacoes for all
  using ( is_super() or condominio_id = auth_condominio() )
  with check ( is_super() or (condominio_id = auth_condominio() and is_admin_cond()) );

-- classificacoes
drop policy if exists cla_rw on public.classificacoes;
create policy cla_rw on public.classificacoes for all
  using ( is_super() or condominio_id = auth_condominio() )
  with check ( is_super() or (condominio_id = auth_condominio() and is_admin_cond()) );

-- reservas (morador cria/edita as próprias; admin gerencia todas do condomínio)
drop policy if exists res_sel on public.reservas;
drop policy if exists res_wr on public.reservas;
create policy res_sel on public.reservas for select
  using ( is_super() or condominio_id = auth_condominio() );
create policy res_wr on public.reservas for all
  using ( is_super() or (condominio_id = auth_condominio()
          and (is_admin_cond() or criado_por = (select email from public.usuarios where id = auth.uid()))) )
  with check ( is_super() or condominio_id = auth_condominio() );

-- modulo_dados
drop policy if exists mod_rw on public.modulo_dados;
create policy mod_rw on public.modulo_dados for all
  using ( is_super() or condominio_id = auth_condominio() )
  with check ( is_super() or (condominio_id = auth_condominio() and is_admin_cond()) );

-- ═══════════════════════════════════════════════════════════════════════════
--  4) VISTAS PÚBLICAS (para a tela de cadastro, sem login)
--  Views rodam com privilégio do dono (postgres) e ignoram o RLS das tabelas
--  base — então expomos APENAS colunas seguras ao papel anônimo.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.condominios_publicos as
  select codigo, nome, logo from public.condominios where status = 'ativo';

create or replace view public.unidades_publicas as
  select condominio_id, cod, rua from public.unidades;

grant select on public.condominios_publicos to anon, authenticated;
grant select on public.unidades_publicas   to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
--  5) SEED — condomínio inicial (Village Castelo)
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.condominios (codigo, nome, admin_email, status, modulos)
values ('APVC', 'Associação Parque Village Castelo',
        'alessandro.lima30@outlook.com.br', 'ativo',
        '{"paineis":true,"administrativo":true,"operacoes":true,"sistema":true}'::jsonb)
on conflict (codigo) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
--  6) DEPOIS DE CRIAR SEU LOGIN (Auth → Add user com seu e-mail), rode:
--
--    -- vincula seu usuário ao APVC como super-admin da plataforma:
--    insert into public.usuarios (id, email, nome, condominio_id, nivel, super_admin, status)
--    select id, email, 'Alessandro Lima', 'APVC', 'admin', true, 'ativo'
--    from auth.users where email = 'alessandro.lima30@outlook.com.br'
--    on conflict (id) do update set super_admin = true, nivel = 'admin', condominio_id = 'APVC';
--
--  Storage: crie 2 buckets no painel (Storage → New bucket):
--    • 'publico'  (Public)  → logos dos condomínios
--    • 'privado'  (Private) → fotos de condôminos, comprovantes, PDFs
-- ═══════════════════════════════════════════════════════════════════════════
