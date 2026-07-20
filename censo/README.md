# Censo de Idade dos Moradores — Associação Parque Village Castelo

Sistema leve para levantar **apenas a quantidade e a idade** dos moradores de cada
lote e gerar estatísticas e um dashboard administrativo. Feito em **HTML5, CSS3 e
JavaScript puro** — sem frameworks, sem build. Pronto para integração com o **Supabase**.

## 📁 Arquivos

| Arquivo | Descrição |
|---|---|
| `index.html` | Tela do Censo — coleta de dados por lote |
| `style.css` | Estilos compartilhados (tema claro, responsivo) |
| `script.js` | Lógica da tela do Censo (combobox de lote, cartões, salvamento) |
| `dashboard.html` | Painel administrativo |
| `dashboard.js` | Indicadores, gráficos, filtros, pesquisa, relatório e exportação |
| `data.js` | **Camada de dados compartilhada** — lotes, faixas etárias e persistência |

## ▶️ Como usar

Abra `index.html` em qualquer navegador (ou hospede em qualquer servidor estático).
Não requer instalação. Para o Dashboard, o `Chart.js` e os ícones `Lucide` são
carregados via CDN (é necessário conexão com a internet na primeira visita).

- **Censo:** selecione o lote (busca automática, só aceita lote existente), informe
  a quantidade de moradores e o **ano de nascimento** de cada um — a idade é
  calculada automaticamente com base no ano atual.
- **Dashboard:** indicadores, gráficos por faixa etária / quadra / lote, filtros,
  pesquisa de lote e relatório com ordenação e exportação (CSV, Excel, PDF).

## 🗺️ Lotes

Gerados automaticamente a partir do objeto `quadras` em `data.js`
(`A01 … U05`, **319 lotes** no total).

## 🎂 Faixas etárias

| Faixa | Idade |
|---|---|
| Crianças | 0–12 anos |
| Adolescentes | 13–17 anos |
| Jovens | 18–29 anos |
| Adultos | 30–59 anos |
| Idosos | 60+ anos |

## 💾 Armazenamento

Por padrão os dados ficam no **`localStorage`** do navegador. Toda a persistência
está isolada em `data.js`, com API assíncrona (`listar`, `obter`, `salvar`,
`remover`) — a mesma interface usada pela integração com o Supabase.

### 🔌 Ativar o Supabase

1. Crie a tabela:

   ```sql
   create table censo_moradores (
     lote        text primary key,
     moradores   jsonb not null default '[]',
     atualizado  timestamptz not null default now()
   );
   ```

2. Em `data.js`, preencha o objeto `SUPABASE`:

   ```js
   const SUPABASE = {
     url: 'https://SEU-PROJETO.supabase.co',
     anonKey: 'SUA_ANON_KEY',
     table: 'censo_moradores',
     ...
   };
   ```

Assim que `url` e `anonKey` forem preenchidos, o sistema passa a usar o Supabase
via `fetch()` automaticamente (upsert por `lote`). Nenhuma outra alteração é
necessária.

## 🧱 Estrutura dos dados

```js
{
  lote: "B15",
  moradores: [
    { anoNascimento: 1998, idade: 28 },
    { anoNascimento: 1975, idade: 51 }
  ]
}
```
