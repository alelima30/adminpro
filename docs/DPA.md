# Anexo I — Acordo de Tratamento de Dados Pessoais (DPA)

**MINUTA. Não assine sem advogado.** Vale aqui a mesma ressalva do
[CONTRATO.md](CONTRATO.md): isto é um rascunho técnico bem informado, não
parecer jurídico.

> ## ⚠️ Leia isto antes de usar este documento
>
> Este DPA contém, na Cláusula 5, compromissos de segurança que **o AdminPro
> não cumpre integralmente hoje**. Assinar como está é declarar por escrito uma
> coisa que não é verdade — e um DPA falso é pior que DPA nenhum, porque vira
> prova contra você.
>
> O que precisa ser resolvido antes está listado no fim, em
> **"Pendências antes de assinar"**. São poucos itens e nenhum é difícil.

---

Anexo ao Contrato de Licença de Uso de Software e Prestação de Serviços firmado
entre **`[nome do condomínio]`** (**CONTROLADOR**) e **`[razão social]`**
(**OPERADORA**), em conformidade com a Lei nº 13.709/2018 (LGPD).

---

### Cláusula 1 — Papéis

**1.1.** O **CONTROLADOR** decide sobre as finalidades e os meios do tratamento
dos dados pessoais de condôminos, moradores, dependentes, funcionários e
visitantes.

**1.2.** A **OPERADORA** trata esses dados **exclusivamente** conforme as
instruções documentadas do CONTROLADOR, sendo a utilização da plataforma
AdminPro, na forma contratada, a instrução geral e permanente.

**1.3.** A OPERADORA **não utiliza os dados para finalidade própria**, não os
comercializa, não os cede a terceiros e não os usa para treinar modelos de
inteligência artificial.

### Cláusula 2 — O que é tratado

| Categoria | Dados | Titulares |
|---|---|---|
| Identificação | nome, CPF, RG, data de nascimento, foto | condôminos, dependentes |
| Contato | e-mail, telefone, WhatsApp | condôminos, usuários |
| Domiciliar | unidade, endereço, vínculo (proprietário/morador), situação de ocupação | condôminos |
| Familiar | nome, foto, CPF, RG e parentesco de dependentes | dependentes, **inclusive menores** |
| Acesso | e-mail de login, nível de permissão, registro de acesso | usuários do sistema |
| Uso | reservas de espaços, solicitações, comunicações | condôminos |
| Documental | comprovantes, PDFs anexados pelo CONTROLADOR | variável |

**2.1.** A OPERADORA **não solicita nem trata intencionalmente dados sensíveis**
(art. 5º, II, LGPD). Se o CONTROLADOR inserir tais dados em campos livres, o faz
sob sua exclusiva responsabilidade.

> **Atenção ao dado de menor de idade.** O módulo de dependentes trata nome,
> foto e documento de criança e adolescente, que a LGPD protege com rigor maior
> (art. 14). Isso deve ser dito ao síndico e ao advogado em voz alta, não
> escondido numa tabela.

### Cláusula 3 — Finalidade e duração

**3.1.** Os dados são tratados para viabilizar a gestão condominial contratada,
e por nenhuma outra razão.

**3.2.** O tratamento dura enquanto vigorar o contrato, observada a Cláusula 8
do contrato principal quanto à devolução e eliminação.

### Cláusula 4 — Suboperadores

**4.1.** O CONTROLADOR autoriza os seguintes suboperadores:

| Suboperador | Função | Localização dos dados |
|---|---|---|
| Supabase | banco de dados, autenticação e armazenamento de arquivos | `[região do projeto — confirme no painel]` |
| GitHub Pages | hospedagem dos arquivos da aplicação | rede global de distribuição |
| `[provedor de WhatsApp]` | envio de notificações e lembretes | `[confirmar]` |

**4.2.** A OPERADORA comunicará o CONTROLADOR com `[30]` dias de antecedência
sobre inclusão ou substituição de suboperador.

**4.3.** Havendo transferência internacional de dados, a OPERADORA observará os
arts. 33 a 36 da LGPD.

> **Preencha a tabela olhando o painel, não a memória.** Se o projeto Supabase
> está em São Paulo, diga São Paulo. A hospedagem dos arquivos é global por
> natureza — mas ela serve a *aplicação*, não os dados pessoais, e essa
> distinção é justamente o que precisa estar escrita certo.

### Cláusula 5 — Segurança

A OPERADORA adota, no mínimo:

**5.1.** **Isolamento entre condomínios no próprio banco de dados**, por meio de
segurança em nível de linha (RLS), de modo que os dados de um condomínio não
sejam acessíveis a usuário de outro, ainda que por acesso direto à API.

**5.2.** **Controle de acesso por perfil** (morador, admin, gestor,
super-administrador), com permissões distintas por nível.

**5.3.** **Criptografia em trânsito** (HTTPS/TLS) em todo acesso.

**5.4.** **Armazenamento privado de arquivos** contendo dados pessoais, com
acesso somente por link temporário assinado, gerado no momento da abertura.

**5.5.** **Autenticação individual** por usuário, vedado o acesso compartilhado.

**5.6.** **Cópias de segurança** periódicas, com retenção de `[__]` dias.

**5.7.** **Segregação entre ambiente de produção e ambiente de testes**, sendo
vedado o uso de dados pessoais reais em ambiente de teste.

**5.8.** **Registro de acessos administrativos**, mantido por `[__]` dias.

> As cláusulas 5.1 a 5.5 são **verdade hoje** — estão implementadas e podem ser
> demonstradas. As cláusulas **5.6, 5.7 e 5.8 ainda não**. Veja as pendências no
> fim.

### Cláusula 6 — Incidentes

**6.1.** Ciente de incidente de segurança que possa acarretar risco ou dano
relevante, a OPERADORA comunicará o CONTROLADOR em até **`[24]` horas**,
informando: o que ocorreu, quais dados e titulares foram atingidos, quais
medidas foram tomadas e quais riscos permanecem.

**6.2.** A comunicação à ANPD e aos titulares (art. 48 da LGPD) cabe ao
CONTROLADOR, com apoio técnico da OPERADORA.

**6.3.** A OPERADORA prestará as informações técnicas necessárias em prazo
compatível com o exigido pela autoridade.

### Cláusula 7 — Direitos dos titulares

**7.1.** Pedidos de titulares (acesso, correção, eliminação, portabilidade,
informação sobre compartilhamento — art. 18 da LGPD) são recebidos e respondidos
pelo **CONTROLADOR**.

**7.2.** A OPERADORA auxiliará o CONTROLADOR a atender esses pedidos, em até
`[10]` dias do acionamento, fornecendo extração, correção ou eliminação do dado
solicitado.

**7.3.** Recebendo pedido diretamente de um titular, a OPERADORA **não o
responderá por conta própria** — encaminhará ao CONTROLADOR em até `[5]` dias.

### Cláusula 8 — Pessoal

A OPERADORA garante que quem tem acesso aos dados está sob obrigação de
confidencialidade e acessa apenas o necessário para prestar o serviço.

### Cláusula 9 — Comprovação

Mediante aviso prévio de `[15]` dias, no máximo uma vez por ano, o CONTROLADOR
pode solicitar informações que demonstrem o cumprimento deste anexo.

### Cláusula 10 — Término

Encerrado o contrato, aplica-se a Cláusula 8 do contrato principal: exportação
completa e, depois, eliminação com confirmação escrita.

<br>

`_______________________________`  `_______________________________`
OPERADORA                         CONTROLADOR

---

## Pendências antes de assinar

Cada item é uma coisa que este documento afirma e que ainda não é verdade.

### 🔴 1. Dado pessoal de 1.609 pessoas está público, agora, no histórico do Git

**Este é o item que bloqueia tudo. Resolva antes de conversar com síndico.**

O repositório `alelima30/adminpro` é **público**. Em agosto, o bloco
`DADOS_INICIAIS` foi removido do `adminpro.html` porque expunha, sem login, a
carga inicial do Village Castelo: **329 nomes de condôminos, 1.280 nomes de
dependentes, 120 telefones e 329 endereços com situação de ocupação** —
incluindo **53 lotes marcados como VAZIO**, o que é um mapa de casas
desabitadas em condomínio fechado.

Aquele commit parou de *servir* o dado pela página. **Ele não tirou o dado do
histórico.** Qualquer pessoa com o endereço do repositório recupera tudo com um
comando, hoje, sem senha.

Enquanto isso for verdade, a Cláusula 5 deste DPA é falsa e a Cláusula 6 já
nasceu acionada — **é um incidente em curso, não um risco futuro**.

Como resolver, em ordem de esforço:

- **Tornar o repositório privado** (Settings → General → Change visibility).
  Resolve em dois minutos e é reversível. O site no `adminprogestao.com.br`
  continua funcionando — mas confirme, porque GitHub Pages em repositório
  privado exige plano pago em conta pessoal.
- **Ou limpar o histórico** com `git filter-repo`, reescrevendo os commits
  afetados e forçando o envio. Mais trabalhoso, e cópias já feitas por terceiros
  não voltam atrás.

Independentemente do caminho, **avalie com advogado se este caso exige
comunicação à ANPD e aos titulares** (art. 48 da LGPD). A resposta pode ser não
— mas essa decisão é dele, com o fato na frente, não sua por omissão.

### 🟡 2. Backup — cláusula 5.6

Confirme no painel do Supabase qual é a retenção real de backup do plano atual e
escreva esse número. No plano gratuito ela é curta ou inexistente. Se for
inexistente, ou você muda de plano, ou tira a cláusula.

### 🟡 3. Ambiente de teste separado — cláusula 5.7

O sistema já aceita um segundo banco (veja [BANCO-ENSAIO.md](BANCO-ENSAIO.md)),
mas ele ainda não foi criado. Enquanto não existir, toda mudança estrutural é
ensaiada na produção — exatamente o que a 5.7 diz que não acontece.

Quando criar: **não copie a base real para lá.** A segunda metade da 5.7 proíbe
justamente isso.

### 🟡 4. Registro de acessos — cláusula 5.8

Não existe hoje. Ou você implementa um registro de acessos administrativos, ou
remove a cláusula. Não deixe escrito o que não é medido.

Vale lembrar o número relacionado: há **88 pontos no código onde um erro é
descartado em silêncio**. Se algo der errado com o dado de um condômino, hoje não
sobra rastro para explicar o quê — e a Cláusula 6.1 exige que você saiba dizer.

### 🟢 5. Encarregado (DPO)

A LGPD pede que o controlador indique um encarregado. Como operadora, você
precisa de **um canal claro de contato para assuntos de dados** — um e-mail
publicado, tipo `privacidade@[seu domínio]`. É barato e faz diferença na
impressão.

---

**O item 1 é o único que não pode esperar.** Os outros são compromissos a ajustar
na redação. Aquele é dado de gente de verdade, acessível agora, e a pessoa que
responde por ele é você.
