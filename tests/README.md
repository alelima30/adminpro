# Testes do AdminPro

Rodam em Node, sem instalar nada.

```bash
node tests/sintaxe.js        # o JavaScript das páginas compila?
node tests/reservas.test.js  # as regras de reserva estão corretas?
```

## Como funcionam

O app é um arquivo único (`adminpro.html`). Em vez de copiar o código para os
testes — o que criaria justamente a duplicação que queremos evitar —
`tests/extrair.js` **lê as funções direto do HTML**. Assim o teste valida
exatamente o código que vai para o ar.

## O que está coberto

**`sintaxe.js`** — compila todo o JavaScript de `adminpro.html` e `cadastro.html`.
Pega erro de digitação que deixaria a tela em branco no navegador.

**`reservas.test.js`** — 22 verificações:

- Leitura de horário: `07:00–08:00`, hífen simples, sem hora de fim,
  virada de madrugada (`22:00–01:00`), campo vazio
- Conflito: sobreposição, um dentro do outro, horários encostados, separados
- Antecedência mínima (ex.: salão exige 15 dias) — e que o admin não é barrado
- Antecedência máxima
- Horário que já passou hoje
- Dias da semana permitidos

## Quando adicionar teste

Toda vez que corrigir um bug de regra de reserva, escreva antes o teste que
falha por causa dele. Assim o mesmo problema não volta.

## No GitHub

`.github/workflows/ci.yml` roda os dois a cada envio para `main`.
**Se um teste falhar, o deploy das funções não acontece.**
