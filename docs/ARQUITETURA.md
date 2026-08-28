# AdminPro — Arquitetura

Uma página sobre onde as coisas estão e por quê. Escrita para o Alessandro de
daqui a seis meses, que não vai lembrar, e para qualquer pessoa que precise
mexer nisso sem ter participado.

Última revisão: 13/08/2026. Números conferidos no código naquela data, não
estimados — se você está lendo bem depois, vale remedir antes de citar.

---

## O mapa em três frases

O AdminPro é **um arquivo HTML** servido por um host estático, que fala direto
com o **Supabase** (banco, login e arquivos). Não existe servidor de aplicação
no meio: o navegador é o cliente e o Supabase é o backend. Quem protege os dados
não é o código da página — é a regra de segurança dentro do banco.

Isso é a decisão mais importante do sistema inteiro. Tudo abaixo é consequência
dela.

---

## As peças

| Peça | O que é | Onde vive |
|---|---|---|
| `adminpro.html` | O aplicativo inteiro — 884 KB, HTML/CSS/JS puro, sem build | GitHub Pages → `adminprogestao.com.br` |
| `index.html` | Só redireciona para o app | mesmo lugar |
| `cadastro.html` | Pedido de acesso, sem login | mesmo lugar |
| `sw.js` | Service worker — instalação como app e abertura offline | mesmo lugar |
| `supabase/schema.sql` | Tabelas, funções e regras de segurança | rodado à mão no painel |
| `supabase/functions/` | 3 funções que rodam no servidor | publicadas pelo CI |
| `censo/` | Módulo separado, ainda em `localStorage` | mesmo host, pasta própria |
| `tests/` | 4 suítes + verificador de sintaxe, rodam sem instalar nada | GitHub Actions |

**Não tem `node_modules`. Não tem build. Não tem framework.** Abrir o arquivo no
navegador é rodar o sistema. Essa escolha custa organização e devolve
simplicidade: não existe passo entre escrever e publicar que possa quebrar.

---

## Por que um arquivo só

Herança, não projeto. O sistema nasceu como página única e cresceu ali dentro.

O que isso **dá**: publicar é enviar um arquivo. Não existe versão de biblioteca
para desencontrar, nem build para falhar às 23h.

O que isso **cobra**: 884 KB é grande demais para achar as coisas por leitura.
Duas pessoas mexendo ao mesmo tempo colidem no mesmo arquivo. E o navegador
baixa tudo — o sistema inteiro — para mostrar a primeira tela.

Vale a pena continuar assim enquanto quem programa é uma pessoa só. Deixa de
valer no dia em que for duas.

---

## Como o dado se organiza — e a divisão que mais importa

O banco tem **9 tabelas**. Mas só **4 delas** guardam módulo de verdade:
`unidades`, `condominos`, `reservas` e `localizacoes`.

Todo o resto do sistema — financeiro, manutenção, comunicados, preventivas,
regulamentos, fotos, informativos, procedimentos, configurações e a Central de
Acompanhamento — vive em **uma única tabela chamada `modulo_dados`**, como um
bloco JSON por condomínio e por módulo.

```
modulo_dados
  condominio_id + modulo  →  valor (JSON inteiro)
```

Essa é a divisão real do sistema, e ela não aparece na tela. Reservas tem
colunas, índice, regra de negócio no banco e 1.431 linhas de teste. Financeiro
é um bloco de texto que o navegador lê inteiro, altera na memória e grava
inteiro de volta.

A consequência prática: **em `modulo_dados`, dois administradores salvando ao
mesmo tempo fazem o último apagar o trabalho do primeiro.** Já foi tratado em
parte (o commit "Salvar deixa de apagar; e avisa quando dois admins se cruzam"),
mas o formato continua sendo o de um documento inteiro, não o de registros
independentes.

`modulo_dados` não é erro — foi o jeito de migrar do Firebase sem parar o
sistema. É dívida consciente. A Central de Acompanhamento (28/08/2026) entrou
ali de propósito: a camada de bloco já tem trava contra dois administradores
gravando por cima um do outro, e o módulo funciona sem ninguém precisar rodar
SQL no painel. O gatilho para migrar para tabela própria é volume — algumas
centenas de assuntos, ou várias pessoas escrevendo ao mesmo tempo. O ponto é lembrar que ela existe, porque de fora
tudo parece igualmente pronto.

**Sinal disso no banco:** existe uma tabela `classificacoes`, criada, com regra
de segurança e tudo — que o app **nunca usa**. É o retrato de uma normalização
que começou e parou.

---

## Segurança: onde ela realmente está

Não está no JavaScript. Está no banco.

As **9 tabelas têm RLS** (segurança em nível de linha) e **13 políticas**. Três
funções decidem tudo:

- `auth_condominio()` — de qual condomínio é quem está logado
- `is_super()` — é dono da plataforma (vê todos)
- `is_admin_cond()` — é admin/gestor do próprio condomínio

Com isso, **um condomínio não alcança o dado do outro nem chamando a API
direto**, fora do site. É a parte difícil de um SaaS multi-inquilino, e está
certa.

Por isso a chave pública (`anon key`) pode ficar dentro do HTML sem problema:
ela identifica o projeto, não dá permissão. **A `service_role` nunca pode
aparecer no front-end** — essa passa por cima do RLS.

Arquivos ficam em dois cofres no Storage: `publico` (logos) e `privado` (fotos,
comprovantes, PDFs). O código guarda **o caminho do arquivo, nunca o link** —
link assinado vence e o documento parecia sumir. O link é gerado na hora de
abrir.

---

## O que roda no servidor

Três funções, porque três coisas não podem rodar no navegador:

| Função | Para quê | Slug publicado |
|---|---|---|
| `notificar` | Envia WhatsApp (guarda o token do provedor) | `dynamic-handler` |
| `lembretes` | Lembrete de reserva, disparado por agendamento | `lembrete` |
| `assistente` | Busca nos regulamentos | `assistente` |

Os nomes das pastas e os slugs publicados **não batem** — herança de funções
criadas à mão no painel antes do CI existir. O workflow copia a pasta para o
nome certo na hora de publicar. Está documentado em `.github/DEPLOY.md` e é uma
pegadinha esperando alguém: renomear a pasta quebra o deploy silenciosamente.

---

## Como uma mudança chega no ar

```
git push main
   │
   └─ GitHub Actions
        ├─ 1. testes            → se falhar, PARA AQUI e nada sobe
        ├─ 2. site (Pages)      → só com os testes verdes
        └─ 3. edge functions    → só na main
```

**Tudo passa pelo mesmo portão, inclusive a página.** Nem sempre foi assim: até
13/08/2026 o GitHub Pages publicava direto da `main`, sem esperar o workflow.
Naquele dia dois commits com erro de sintaxe foram ao ar, o CI marcou vermelho
nos dois, e o site ficou sem login mesmo assim — o portão existia e não estava
no caminho da porta.

Hoje a publicação é um job (`publicar-site`, com `needs: testes`). Teste
vermelho, site não sobe: fica no ar a última versão que passou.

Isso depende de um ajuste que mora **fora** do repositório: em Settings → Pages
→ Build and deployment, a origem precisa ser **GitHub Actions**, não "Deploy
from a branch". A troca aconteceu sozinha na primeira execução — o job tem
permissão `pages: write` e o `configure-pages` a aplicou. Mas se alguém mudar de
volta, o portão sai do caminho e o job passa a falhar avisando (era o que se
queria: falhar alto, não publicar calado).

**Não existe job de migrations, e é de propósito.** Existiu um, que nunca
funcionou: exigia um segredo que nunca foi cadastrado, então falhava em toda
execução. Um CI sempre vermelho é pior que CI nenhum — ensina a ignorar o X, e
foi assim que os dois commits quebrados de 13/08 passaram, com o vermelho já
virado paisagem.

O SQL em `supabase/*.sql` é rodado **à mão**, de propósito: mudança de banco
merece revisão antes. Fica uma ponta solta: `supabase/migrations/` descreve as
mesmas mudanças de três desses arquivos, em formato de migration. Hoje ninguém
aplica essa pasta — se um dia a automação voltar, é o primeiro nó a desatar.

---

## O que os testes cobrem — e o que não cobrem

**83 funções testadas de 556 no total: 15%.** Eram 26 de 544 (5%) na manhã de
13/08; o resto do dia foi gasto em correções, e cada uma virou teste.

Onde estão os 15%: regras de reserva (1.431 linhas), lembretes, assistente,
informações gerais, e um verificador de sintaxe das páginas. Concentrado onde
mexe em dinheiro e em acesso, que é onde errar custa caro.

O que não tem teste: praticamente tudo que vive em `modulo_dados`. O financeiro
não tem teste porque não tem forma — não dá para testar bem um bloco JSON que o
navegador reescreve inteiro. É a mesma dívida descrita lá em cima, vista pelo
outro lado.

**Um teste pode passar pelo motivo errado.** Aconteceu aqui: o caso "reserva
apagada não cobra" usava uma lista vazia e passava justamente por causa do bug
que deveria pegar — lista vazia não quer dizer "apagaram", quer dizer "ainda não
carregou". Verde não é prova; é ausência de uma prova em contrário.

Outro número honesto: **95 lugares onde o erro é engolido em silêncio**
(`catch` com corpo vazio, de 168 `catch` no total). Quando algo falha para um
síndico, não sobra rastro para descobrir o quê.

---

## O que o sistema sabe sobre o cliente

Quase nada, e isso é proposital de mencionar aqui: `condominios` guarda **nome,
código, logo, e-mail do admin, status e quais módulos estão ligados**. Não
existe plano, cobrança, vencimento nem contrato.

Cobrança não existe no sistema. Com poucos clientes, isso está certo — Pix na
mão é mais barato que programar assinatura. Mas quem for mexer aqui precisa
saber que **o sistema não sabe quem é o cliente**, só qual é o condomínio.

---

## Os três ambientes (e o que ainda falta)

Hoje existe **um** banco: produção. Não há onde ensaiar uma mudança estrutural.

O app já aceita um segundo, o **banco de ensaio** — abrir o site com `?db=ensaio`
no fim do endereço. Enquanto o projeto de ensaio não estiver preenchido em
`SB_AMBIENTES` (dentro do `adminpro.html`), o pedido é ignorado e o app segue em
produção, avisando no console. Passo a passo em [`BANCO-ENSAIO.md`](BANCO-ENSAIO.md).

Quando o ensaio está ligado, **uma tarja amarela fica fixa no topo**. Sem tarja,
você está em produção.

---

## As três coisas que eu contaria a um novo programador no primeiro dia

1. **A segurança está no banco, não na página.** Antes de mexer em qualquer
   coisa que leia dado, leia as políticas em `schema.sql`.
2. **`modulo_dados` é metade do sistema e não tem forma.** Se for mexer ali,
   assuma que grava o documento inteiro e que outra pessoa pode estar gravando
   junto.
3. **O portão dos testes agora vale para o site também** — mas ele depende de
   uma configuração fora do código (Settings → Pages → Source: GitHub Actions).
   Se o site parar de atualizar, é o primeiro lugar para olhar.
