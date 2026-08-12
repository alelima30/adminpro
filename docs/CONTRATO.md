# Contrato de Prestação de Serviço — AdminPro

**MINUTA. Não assine sem advogado.**

Isto é um rascunho estruturado, escrito por quem conhece o sistema, para você
levar a um advogado em vez de chegar de mãos vazias. Um advogado cobra menos e
entrega melhor revisando um texto pronto do que redigindo do zero — e as partes
que só quem fez o sistema sabe já estão aqui. **Eu não sou advogado e isto não é
parecer jurídico.**

Campos entre `[colchetes]` são para preencher.

---

## CONTRATO DE LICENÇA DE USO DE SOFTWARE E PRESTAÇÃO DE SERVIÇOS

**CONTRATADA:** `[razão social]`, inscrita no CNPJ sob nº `[CNPJ]`, com sede em
`[endereço]`, doravante **ADMINPRO**.

**CONTRATANTE:** `[nome do condomínio/associação]`, inscrito no CNPJ sob nº
`[CNPJ]`, com sede em `[endereço]`, neste ato representado por seu síndico(a)
`[nome]`, doravante **CONTRATANTE**.

---

### Cláusula 1 — Objeto

A ADMINPRO licencia ao CONTRATANTE, de forma não exclusiva e intransferível, o
uso do sistema **AdminPro**, plataforma web de gestão condominial acessível em
`adminprogestao.com.br`, na modalidade software como serviço (SaaS).

**1.1.** O sistema é entregue como serviço hospedado. Não há entrega de código,
instalação em servidor do CONTRATANTE nem cessão de propriedade intelectual.

**1.2.** Os módulos contratados são: `[listar — ex.: cadastro de unidades e
condôminos, reservas de espaços, comunicados, manutenção, financeiro,
regulamentos]`.

### Cláusula 2 — Prazo

Vigência de `[12]` meses a contar da assinatura, renovada automaticamente por
períodos iguais, salvo manifestação escrita de qualquer parte com `[30]` dias de
antecedência.

### Cláusula 3 — Preço e pagamento

**3.1.** O CONTRATANTE pagará `[R$ ___]` por `[mês]`, vencendo todo dia `[__]`,
via `[Pix / boleto / transferência]`.

**3.2.** Reajuste anual pelo `[IPCA]`, ou índice que o substitua.

**3.3.** Atraso superior a `[15]` dias autoriza a suspensão do acesso, mediante
aviso prévio de `[5]` dias. **A suspensão não apaga dado nenhum** — os dados
permanecem íntegros e voltam a ficar acessíveis com a quitação.

### Cláusula 4 — O que a ADMINPRO se compromete a fazer

**4.1. Disponibilidade.** Envidar melhores esforços para manter o sistema no ar,
ressalvadas manutenções programadas (avisadas com `[24]` horas) e falhas de
terceiros dos quais o serviço depende.

> **Fale com seu advogado sobre esta cláusula.** É comum prometer um percentual
> de disponibilidade (99,x%) com multa por descumprimento. **Não prometa isso
> hoje.** O sistema depende de GitHub Pages e Supabase, e nenhum dos dois te dá
> garantia contratual no plano atual. Prometer um número que você não controla
> é criar uma dívida que não depende de você para vencer.

**4.2. Suporte.** Atendimento por `[WhatsApp/e-mail]` em dias úteis, das `[__]`
às `[__]`, com primeira resposta em até `[1 dia útil]`.

**4.3. Correções.** Corrigir, sem custo, defeitos que impeçam o uso normal de
funcionalidade contratada.

**4.4. Cópias de segurança.** Manter rotina de backup dos dados do CONTRATANTE,
com retenção de `[__]` dias.

> **Confira antes de assinar** qual é a retenção real de backup do seu plano no
> Supabase, e escreva esse número aqui. No plano gratuito a retenção é curta ou
> inexistente. Não escreva um prazo que a infraestrutura não cumpre.

**4.5. Evolução.** Melhorias e novos recursos podem ser disponibilizados a
critério da ADMINPRO, sem custo adicional, salvo módulos comercializados à parte.

### Cláusula 5 — O que o CONTRATANTE se compromete a fazer

**5.1.** Fornecer dados corretos e manter atualizadas as informações do
condomínio e dos usuários.

**5.2.** Zelar pelas credenciais de acesso, **que são pessoais e
intransferíveis**, e comunicar imediatamente qualquer uso indevido.

**5.3.** Definir quem tem qual nível de acesso, e revogar o acesso de quem sair
da função — em especial na **troca de síndico ou de administradora**.

**5.4.** Usar o sistema conforme a legislação, em especial a LGPD, e **não
inserir dado pessoal sem base legal**, nem dado sensível não previsto nos
módulos contratados.

**5.5.** Não copiar, decompor, revender ou sublicenciar o sistema.

### Cláusula 6 — Dados pessoais

**6.1.** O tratamento de dados pessoais é regido pelo **Anexo I — Acordo de
Tratamento de Dados (DPA)**, parte integrante deste contrato.

**6.2.** Para os fins da Lei nº 13.709/2018 (LGPD), o **CONTRATANTE é o
CONTROLADOR** e a **ADMINPRO é a OPERADORA**.

### Cláusula 7 — Propriedade

**7.1.** O sistema, seu código, sua marca e sua identidade visual são de
propriedade exclusiva da ADMINPRO.

**7.2.** **Os dados inseridos são e permanecem do CONTRATANTE.** A ADMINPRO não
adquire direito sobre eles, não os utiliza para finalidade própria e não os
comercializa.

### Cláusula 8 — Encerramento e devolução dos dados

**8.1.** Qualquer parte pode encerrar mediante aviso escrito de `[30]` dias.

**8.2.** Encerrado o contrato, a ADMINPRO disponibilizará ao CONTRATANTE, em até
`[15]` dias, **exportação completa dos seus dados** em formato legível por
máquina (CSV/JSON).

**8.3.** Após `[30]` dias da exportação, os dados serão **eliminados** dos
sistemas da ADMINPRO, ressalvada retenção exigida por lei. A eliminação será
confirmada por escrito.

> A cláusula 8.2 é a que mais tranquiliza síndico. O medo real dele não é preço
> — é ficar refém. Deixar a saída escrita e fácil vende mais que desconto.

### Cláusula 9 — Responsabilidade

**9.1.** A responsabilidade da ADMINPRO por perdas e danos comprovados fica
limitada ao **valor pago pelo CONTRATANTE nos 12 meses anteriores** ao evento.

**9.2.** A ADMINPRO não responde por danos decorrentes de: uso indevido do
sistema, compartilhamento de senha, dado incorreto inserido pelo CONTRATANTE, ou
indisponibilidade de infraestrutura de terceiros.

**9.3.** O limite da cláusula 9.1 não se aplica a dolo, e sua extensão a
incidentes de dados deve ser verificada com advogado.

### Cláusula 10 — Confidencialidade

Cada parte manterá sigilo sobre informações da outra a que tiver acesso,
obrigação que sobrevive ao término do contrato por `[5]` anos.

### Cláusula 11 — Disposições finais

**11.1.** Alterações somente por termo aditivo escrito.

**11.2.** A tolerância quanto a descumprimento não implica novação nem renúncia.

**11.3.** Fica eleito o foro da comarca de `[cidade/UF]`.

E por estarem justas e contratadas, as partes assinam em `[2]` vias.

`[cidade]`, `[data]`

<br>

`_______________________________`  `_______________________________`
ADMINPRO                          CONTRATANTE

---

## Antes de levar ao advogado, decida você

O advogado não pode responder estas — são de negócio, não de direito:

1. **Você tem CNPJ?** Contrato de SaaS assinado por pessoa física com condomínio
   é possível, mas complica nota fiscal e passa impressão de amadorismo justo no
   momento em que o contrato existe para passar o contrário.
2. **Preço por condomínio ou por unidade?** Por unidade escala com o cliente e é
   o padrão do mercado. Por condomínio é mais simples de explicar.
3. **Qual disponibilidade você consegue mesmo sustentar?** Veja a nota da 4.1.
4. **Qual a retenção de backup do seu plano hoje?** Veja a nota da 4.4. Confira
   no painel do Supabase antes de escrever qualquer número.
