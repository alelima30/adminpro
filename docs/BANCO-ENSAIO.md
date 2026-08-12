# Banco de ensaio — segundo projeto Supabase

Um segundo banco, gratuito, idêntico ao de produção, onde você quebra coisas
sem medo. É o que tira a mudança estrutural de cima do banco onde moram os
dados de gente de verdade.

Leva uns 20 minutos, uma vez só.

---

## Por que

Hoje só existe um banco. Toda alteração de estrutura — coluna nova, política
nova, migration — é ensaiada direto na produção. Funciona até o dia em que não
funciona, e aí não tem volta: o dado do síndico já era.

Com o ensaio, o roteiro passa a ser: **testa no ensaio, confere, só então roda
na produção.**

---

## Passo 1 — Criar o projeto

1. Entre em **supabase.com** com a mesma conta.
2. **New project**.
   - Nome: `adminpro-ensaio` (o nome importa: você vai olhar isso com pressa)
   - Senha do banco: **outra**, diferente da produção. Guarde.
   - Região: **South America (São Paulo)**
   - Plano: **Free**
3. Espere ~2 min.

> O plano gratuito pausa o projeto depois de uns dias sem uso. Não tem problema
> — é só clicar em *Restore* quando voltar. Não perde nada.

---

## Passo 2 — Montar o esquema

No projeto novo, **SQL Editor → New query**, e rode **nesta ordem**, um de cada
vez, conferindo o "Success" antes de ir para o próximo:

| Ordem | Arquivo |
|---|---|
| 1 | `supabase/schema.sql` |
| 2 | `supabase/02_auth_id.sql` |
| 3 | `supabase/03_admin_master.sql` |
| 4 | `supabase/04_cron_lembretes.sql` |
| 5 | `supabase/05_reservas_seguranca.sql` |
| 6 | `supabase/06_corrige_cron_lembrete.sql` |
| 7 | `supabase/07_reserva_sem_edicao_morador.sql` |
| 8 | `supabase/08_storage_privado.sql` |

A ordem é a numeração dos arquivos — cada um assume que o anterior já rodou.

---

## Passo 3 — Os dois cofres de arquivo

**Storage → New bucket**:

- `publico` — marque **Public**
- `privado` — deixe privado

Sem esses dois, upload de foto e PDF quebra no ensaio.

---

## Passo 4 — Seu login de ensaio

**Authentication → Users → Add user → Create new user**:

- E-mail: pode ser o mesmo de sempre
- Senha: **outra**, diferente da produção
- Marque **Auto Confirm User**

Depois, no **SQL Editor**, rode o bloco do passo 6 do `schema.sql` (o
`insert into public.usuarios ... super_admin = true`) para se marcar como
super-admin.

---

## Passo 5 — Ligar o app no ensaio

**Project Settings → API**. Copie a **Project URL** e a **anon public key**.

Abra o `adminpro.html`, procure por `SB_AMBIENTES` (perto da linha 5.170) e
preencha o bloco `ensaio`:

```js
ensaio: {
  url: 'https://SEU-PROJETO-ENSAIO.supabase.co',
  key: 'sb_publishable_...'
}
```

Pode ficar no repositório sem problema. A `anon key` não dá permissão nenhuma
sozinha — quem protege é o RLS. **A `service_role` nunca entra aqui.**

---

## Como usar no dia a dia

Abra o site com `?db=ensaio` no fim do endereço:

```
https://adminprogestao.com.br/adminpro.html?db=ensaio
```

**Uma tarja amarela aparece fixa no topo.** Enquanto ela estiver lá, tudo que
você fizer acontece no ensaio.

Para voltar à produção: **feche a aba**. A escolha vale só para aquela aba — ela
morre junto. Isso é de propósito, para que ninguém fique preso no ensaio sem
perceber, e para que um link mandado por engano não arraste outra pessoa junto.

**Sem tarja = produção.** Essa é a única regra que você precisa decorar.

---

## Dados no ensaio

Suba dados **inventados**. Não copie a base real para o ensaio: um segundo banco
com os mesmos dados pessoais é uma segunda superfície de vazamento, com metade
do cuidado. O ensaio é para testar estrutura, não para testar com gente de
verdade.

Meia dúzia de unidades e três condôminos fictícios bastam para ver se uma
migration funciona.

---

## O roteiro de uma mudança de banco, daqui pra frente

1. Escreve o SQL.
2. Roda no **ensaio**.
3. Abre o app com `?db=ensaio` e usa a tela que depende daquilo.
4. Deu certo → roda na produção.
5. Deu errado → só o ensaio quebrou. Conserta e volta ao 2.

O passo 3 é o que quase ninguém faz e é o que pega os erros de verdade: SQL que
roda limpo e mesmo assim quebra a tela.
