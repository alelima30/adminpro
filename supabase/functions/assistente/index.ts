// Edge Function: assistente
// "Assistente Condominio" — responde perguntas em linguagem natural usando
// APENAS os trechos dos documentos (regulamentos) que o app envia.
//
// Por que os trechos vem do app e nao do banco:
//   o app ja extrai e guarda o texto de cada PDF/Word (campo "texto" em
//   modulo_dados/reg) e ja sabe fazer a busca. Mandar so os trechos que
//   interessam — em vez do regulamento inteiro — deixa a resposta MUITO mais
//   barata (poucos milhares de caracteres por pergunta em vez de centenas de
//   milhares) e mantem esta funcao sem nenhum acesso ao banco.
//
// Secret necessario (Supabase -> Project Settings -> Edge Functions -> Secrets):
//   ANTHROPIC_API_KEY = sk-ant-...
// Opcional:
//   ANTHROPIC_MODEL   = claude-haiku-4-5  (padrao; o mais barato que atende)
//
// A chave NUNCA vai para o adminpro.html — aquele arquivo e publico.
//
// Chamada:
//   POST { pergunta: "posso fazer uma piscina?",
//          trechos: [{ titulo:"Regulamento Interno", texto:"Art. 42 ..." }, ...] }
//   Resposta:
//   { resposta: "..." }  ou  { error: "..." }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Teto de seguranca: mesmo que o app mande demais, cortamos aqui.
// ~60 mil caracteres ≈ 15 mil tokens ≈ centavos por pergunta no Haiku.
const MAX_CHARS = 60000;

const SISTEMA = `Voce e o "Assistente Condominio" do AdminPro. Responde a moradores e a administracao de condominio, em portugues do Brasil.

REGRAS ABSOLUTAS — o descumprimento causa dano real, porque as respostas sao usadas para decidir o que pode ou nao pode ser feito no condominio:

1. Responda EXCLUSIVAMENTE com base nos TRECHOS DOS DOCUMENTOS fornecidos abaixo. Nunca use conhecimento geral seu sobre condominios, leis ou o Codigo Civil.
2. NUNCA invente, deduza ou "complete" uma regra. Se os trechos nao respondem a pergunta, diga exatamente: "Nao encontrei nada nos documentos do condominio sobre isso. Consulte a administracao." e pare.
3. SEMPRE cite de onde tirou a resposta: o nome do documento e o artigo/clausula/item, quando o trecho trouxer essa identificacao. Se o trecho nao indica o numero do artigo, cite so o nome do documento e diga que o trecho nao traz a numeracao.
4. Depois da resposta, transcreva entre aspas o pedaco exato do documento em que se baseou, para a pessoa poder conferir.
5. Se os documentos forem ambiguos ou parecerem se contradizer, diga isso claramente em vez de escolher uma interpretacao.
6. Nao de conselho juridico e nao afirme consequencias legais que nao estejam escritas nos trechos.

FORMATO da resposta:
- Comece com a conclusao direta em uma frase (ex.: "Nao, nao e permitido." / "Sim, e permitido, com condicoes.").
- Depois explique em 1 a 3 frases curtas.
- Depois a linha: Base: <nome do documento>, <artigo/clausula se houver>
- Depois a transcricao entre aspas.
Nada de markdown, tabelas ou titulos. Texto simples e curto.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return J({ error: "Use POST." }, 405);

  const KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!KEY) {
    return J({ error: "ANTHROPIC_API_KEY nao configurada nos Secrets do Supabase. A administracao precisa cadastrar a chave em Project Settings -> Edge Functions -> Secrets." }, 500);
  }
  const MODELO = Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5";

  let body: any = {};
  try { body = await req.json(); } catch { return J({ error: "Corpo invalido." }, 400); }

  const pergunta = String(body?.pergunta ?? "").trim();
  if (!pergunta) return J({ error: "Pergunta vazia." }, 400);
  if (pergunta.length > 1000) return J({ error: "Pergunta muito longa." }, 400);

  const trechos: Array<{ titulo?: string; texto?: string }> =
    Array.isArray(body?.trechos) ? body.trechos : [];

  if (!trechos.length) {
    return J({
      resposta: 'Nao encontrei nada nos documentos do condominio sobre isso. Consulte a administracao.',
      semBase: true,
    });
  }

  // Monta o contexto respeitando o teto de caracteres.
  let usado = 0;
  const partes: string[] = [];
  for (const t of trechos) {
    const titulo = String(t?.titulo ?? "Documento").slice(0, 200);
    let texto = String(t?.texto ?? "").trim();
    if (!texto) continue;
    if (usado + texto.length > MAX_CHARS) texto = texto.slice(0, Math.max(0, MAX_CHARS - usado));
    if (!texto) break;
    partes.push(`--- Documento: ${titulo} ---\n${texto}`);
    usado += texto.length;
    if (usado >= MAX_CHARS) break;
  }
  if (!partes.length) {
    return J({
      resposta: 'Nao encontrei nada nos documentos do condominio sobre isso. Consulte a administracao.',
      semBase: true,
    });
  }

  const conteudo =
    `TRECHOS DOS DOCUMENTOS DO CONDOMINIO:\n\n${partes.join("\n\n")}\n\n` +
    `PERGUNTA DO USUARIO:\n${pergunta}`;

  let resp: Response;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 700,
        temperature: 0,           // sem criatividade: e regulamento, nao redacao
        system: SISTEMA,
        messages: [{ role: "user", content: conteudo }],
      }),
    });
  } catch (e) {
    return J({ error: "Nao consegui falar com o servico de IA: " + ((e as Error)?.message ?? "erro de rede") }, 502);
  }

  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data?.error?.message || data?.message || `Falha no servico de IA (HTTP ${resp.status}).`;
    return J({ error: msg }, 502);
  }

  const resposta = Array.isArray(data?.content)
    ? data.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n").trim()
    : "";

  if (!resposta) return J({ error: "O servico de IA nao devolveu texto." }, 502);

  return J({
    resposta,
    modelo: MODELO,
    // Util para a administracao acompanhar custo.
    uso: { entrada: data?.usage?.input_tokens ?? null, saida: data?.usage?.output_tokens ?? null },
  });
});
