# Deploy do AdminPro

## Como funciona hoje

Enviou para a branch `main` → o GitHub faz o resto:

1. **Testes** rodam (sintaxe + regras de reserva)
2. Se passarem, as **Edge Functions do Supabase** são publicadas
3. Se algum teste falhar, **nada é publicado**

O site (`adminprogestao.com.br`) é publicado pelo **GitHub Pages** direto da `main` —
não passa pelo workflow.

## O que é publicado automaticamente

| Código no repositório | Vira, no Supabase |
|---|---|
| `supabase/functions/notificar/index.ts` | função `dynamic-handler` |
| `supabase/functions/lembretes/index.ts` | função `lembrete` |

Os nomes diferem por histórico: as funções foram criadas no painel com esses
slugs, e o workflow faz a correspondência na hora de publicar.

## Configuração (uma vez só)

Em **Settings → Secrets and variables → Actions → New repository secret**:

| Segredo | Onde pegar |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens → Generate new token |
| `SUPABASE_PROJECT_REF` | `lusibpbafbkyygxrxvzr` (está na URL do projeto) |

Sem esses segredos o deploy é **pulado com um aviso** — os testes continuam rodando
normalmente, nada quebra.

## O que NÃO é publicado automaticamente

- **Secrets do Supabase** (`WHATSAPP_TOKEN`, `WA_PROVIDER`...) — ficam no painel
- **Scripts SQL** (`supabase/*.sql`) — rodados à mão no SQL Editor, de propósito:
  mudança de banco merece revisão antes

## Como acompanhar

Aba **Actions** do repositório. Verde = publicado; vermelho = algo falhou e nada foi ao ar.
