# AdminPro no Supabase — Guia de Migração

Migração do Firebase → Supabase, em fases seguras. Você não perde nada: cada
fase é testada antes da próxima.

## Visão geral das fases

1. **Criar o projeto + esquema** ← você está aqui
2. **Migrar os dados atuais** (unidades, condôminos, reservas…)
3. **Trocar a camada de dados do app** (login, leitura, gravação, upload)
4. **Multi-condomínio real** (cada condomínio isolado por RLS)

---

## Fase 1 — Criar o projeto e o esquema

### 1. Criar a conta e o projeto
1. Acesse **supabase.com** → *Start your project* (login com GitHub/Google).
2. *New project* → dê um nome (ex: `adminpro`), defina uma **senha do banco**
   (guarde-a) e escolha a região **South America (São Paulo)**.
3. Espere ~2 min o projeto subir.

### 2. Rodar o esquema
1. No projeto, menu lateral → **SQL Editor** → *New query*.
2. Cole **todo** o conteúdo de `schema.sql` e clique **Run**.
3. Deve aparecer *Success. No rows returned*. Pronto — tabelas, segurança
   (RLS) e as listas públicas do cadastro estão criadas.

### 3. Criar seu login de super-admin
1. Menu → **Authentication** → *Users* → **Add user** → *Create new user*.
   - E-mail: `alessandro.lima30@outlook.com.br`
   - Senha: a que você quiser usar pra entrar no painel
   - Marque **Auto Confirm User**.
2. Volte ao **SQL Editor** e rode o bloco do passo 6 do `schema.sql`
   (o `insert into public.usuarios ... super_admin = true`). Isso te marca
   como administrador da plataforma.

### 4. Criar os buckets de arquivos
Menu → **Storage** → *New bucket*:
- `publico`  → marque **Public** (logos dos condomínios)
- `privado`  → deixe privado (fotos de condôminos, comprovantes, PDFs)

### 5. Pegar as chaves de conexão
Menu → **Project Settings** → **API**. Anote:
- **Project URL**  (ex: `https://xxxx.supabase.co`)
- **anon public key**  (chave longa começando com `eyJ...`)

> A `anon key` é segura para ficar no front-end — quem protege os dados é o
> RLS, não a chave. **Nunca** use a `service_role` no site.

**Me mande esses dois valores** (URL + anon key) que eu ligo o app ao Supabase
na Fase 3.

---

## Modelo de dados (resumo)

| Tabela | O que guarda |
|---|---|
| `condominios` | Os condomínios da plataforma (nome, logo, módulos, status) |
| `usuarios` | Quem tem acesso (vinculado ao Auth) + nível + condomínio |
| `solicitacoes` | Pedidos de acesso do cadastro público (antes de aprovar) |
| `unidades` | Unidades de cada condomínio |
| `condominos` | Condôminos (+ dependentes e telefones em JSONB) |
| `localizacoes` | Ruas / alamedas |
| `classificacoes` | Classificação de condôminos |
| `reservas` | Reservas de espaços |
| `modulo_dados` | Módulos ainda não normalizados (censo, financeiro, etc.), 1 JSON por módulo — normalizamos depois, um a um |

Tudo é **isolado por condomínio** (`condominio_id`) via RLS: cada usuário só
enxerga o próprio condomínio; **super-admin** (você) enxerga todos.

O cadastro público (`cadastro.html`) lê as listas pelas *views*
`condominios_publicos` e `unidades_publicas` (só colunas seguras) e grava em
`solicitacoes` — sem precisar de login.
