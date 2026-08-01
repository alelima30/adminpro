// Edge Function: notificar
// Envia NOTIFICACOES por e-mail (Resend) e WhatsApp (Cloud API oficial da Meta).
// As chaves ficam em SECRET no Supabase, nunca no site.
//
// Secrets (Supabase -> Project Settings -> Edge Functions -> Secrets):
//   E-MAIL (Resend):
//     RESEND_API_KEY   = re_xxxxxxxxxxxx
//     EMAIL_FROM       = AdminPro <no-reply@seu-dominio.com>
//   WHATSAPP (Cloud API / Meta):
//     WHATSAPP_TOKEN     = EAAG... (Access Token permanente do app da Meta)
//     WHATSAPP_PHONE_ID  = 1234567890   (Phone Number ID)
//     WHATSAPP_TEMPLATE  = aviso_condominio   (nome do modelo aprovado)
//     WHATSAPP_LANG      = pt_BR   (idioma do modelo)
//
// Chamada:
//   E-mail:    { to, subject, message }
//   WhatsApp:  { channel: "whatsapp", to: "5511999999999", message: "..." }
//
// Deploy (uma vez): cole este codigo na funcao e clique Deploy.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Evolution API (self-hosted) ──
async function enviarEvolution(to: string, message: string) {
  const URL = (Deno.env.get("EVOLUTION_URL") ?? "").replace(/\/+$/, "");
  const KEY = Deno.env.get("EVOLUTION_KEY");
  const INSTANCE = Deno.env.get("EVOLUTION_INSTANCE");
  if (!URL || !KEY || !INSTANCE) {
    return J({ error: "EVOLUTION_URL/EVOLUTION_KEY/EVOLUTION_INSTANCE nao configurados nos Secrets." }, 500);
  }
  // "+" na frente = numero internacional ja completo (ex: +1 EUA) -> usa como esta.
  // Sem "+", assume Brasil e coloca o 55.
  const intl = String(to).trim().startsWith("+");
  let num = String(to).replace(/\D/g, "");
  if (!num) return J({ error: "Numero invalido." }, 400);
  if (!intl && !num.startsWith("55")) num = "55" + num;

  const resp = await fetch(`${URL}/message/sendText/${INSTANCE}`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ number: num, text: message ?? "" }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return J({ error: (data as any)?.message || (data as any)?.error || "Falha no Evolution.", detalhe: data }, 502);
  return J({ ok: true, id: (data as any)?.key?.id });
}

// ── WhatsApp Cloud API (template message) ──
function limpaVar(s: unknown): string {
  return String(s ?? "").replace(/\r/g, "").replace(/[\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
}
async function enviarWhatsapp(to: string, message: string, tplName?: string, params?: unknown[]) {
  const TOKEN = Deno.env.get("WHATSAPP_TOKEN");
  const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID");
  const TEMPLATE = tplName || Deno.env.get("WHATSAPP_TEMPLATE") || "aviso_condominio";
  const LANG = Deno.env.get("WHATSAPP_LANG") ?? "pt_BR";
  if (!TOKEN || !PHONE_ID) return J({ error: "WHATSAPP_TOKEN/WHATSAPP_PHONE_ID nao configurados nos Secrets." }, 500);

  const intl = String(to).trim().startsWith("+");
  let num = String(to).replace(/\D/g, "");
  if (!num) return J({ error: "Numero invalido." }, 400);
  if (!intl && !num.startsWith("55")) num = "55" + num;

  // A Cloud API da Meta NAO aceita quebra de linha dentro da variavel {{1}}.
  // Entao juntamos tudo em UMA linha legivel: paragrafo -> bullet, linha -> ", ".
  // Usamos • (bullet) como escape: renderiza certo mesmo apos copiar/colar.
  const paramTexto = String(message ?? "")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/\n{2,}/g, " \u2022 ")
    .replace(/\n/g, ", ")
    .replace(/ {2,}/g, " ")
    .trim();

  let template: Record<string, unknown>;
  if (TEMPLATE === "hello_world") {
    template = { name: "hello_world", language: { code: "en_US" } };
  } else if (Array.isArray(params) && params.length) {
    // Modelo ESTRUTURADO: cada campo vira uma variavel {{1}}..{{n}}.
    const parameters = params.map((p) => ({ type: "text", text: limpaVar(p) }));
    template = { name: TEMPLATE, language: { code: LANG }, components: [{ type: "body", parameters }] };
  } else {
    template = { name: TEMPLATE, language: { code: LANG }, components: [{ type: "body", parameters: [{ type: "text", text: paramTexto }] }] };
  }

  const resp = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: num, type: "template", template }),
  });
  const data = await resp.json();
  if (!resp.ok) return J({ error: data?.error?.message || "Falha no WhatsApp.", detalhe: data }, 502);
  return J({ ok: true, id: data?.messages?.[0]?.id });
}

// ── E-mail (Resend) ──
async function enviarEmail(to: string, subject: string, message: string, html?: string) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "AdminPro <onboarding@resend.dev>";
  if (!RESEND_API_KEY) return J({ error: "RESEND_API_KEY nao configurado nos Secrets." }, 500);

  const destinatarios = String(to).split(",").map((s) => s.trim()).filter(Boolean);
  const corpoHtml = html ??
    `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#1a2233;line-height:1.6">
       <div style="border-top:4px solid #E87722;padding-top:14px">${esc(message ?? "").replace(/\n/g, "<br>")}</div>
       <p style="margin-top:22px;font-size:12px;color:#999">Enviado pelo AdminPro - Gestao de Condominio</p>
     </div>`;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: destinatarios, subject, text: message ?? "", html: corpoHtml }),
  });
  const data = await resp.json();
  if (!resp.ok) return J({ error: data?.message || "Falha no envio.", detalhe: data }, 502);
  return J({ ok: true, id: data?.id });
}

// Busca (com service role) os numeros da equipe de um condominio (alert_destinos em cfg_reservas).
async function destinosEquipe(condominio: string): Promise<any[]> {
  const URL = Deno.env.get("SUPABASE_URL");
  const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!URL || !SVC) return [];
  try {
    const r = await fetch(
      `${URL}/rest/v1/modulo_dados?condominio_id=eq.${encodeURIComponent(condominio)}&modulo=eq.cfg_reservas&select=valor`,
      { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } },
    );
    if (!r.ok) return [];
    const rows = await r.json();
    return (rows?.[0]?.valor?.alert_destinos) || [];
  } catch (_) { return []; }
}


// ── Foto do perfil do WhatsApp (via API — funciona mesmo com o painel bloqueado) ──
// Fluxo da Meta: 1) abre sessao de upload no APP  2) envia os bytes e recebe um "handle"
// 3) grava o handle no perfil do numero.
// Secrets necessarios: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_APP_ID
async function definirFotoPerfil(imagemUrl: string) {
  const TOKEN = Deno.env.get("WHATSAPP_TOKEN");
  const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID");
  const APP_ID = Deno.env.get("WHATSAPP_APP_ID");
  if (!TOKEN || !PHONE_ID || !APP_ID) {
    return J({ error: "Configure WHATSAPP_TOKEN, WHATSAPP_PHONE_ID e WHATSAPP_APP_ID nos Secrets." }, 500);
  }

  // 1) baixa a imagem
  const img = await fetch(imagemUrl);
  if (!img.ok) return J({ error: "Nao consegui baixar a imagem: " + imagemUrl }, 400);
  const bytes = new Uint8Array(await img.arrayBuffer());
  const tipo = img.headers.get("content-type") || "image/png";

  // 2) abre a sessao de upload
  const sess = await fetch(
    `https://graph.facebook.com/v21.0/${APP_ID}/uploads?file_length=${bytes.length}` +
    `&file_type=${encodeURIComponent(tipo)}&access_token=${encodeURIComponent(TOKEN)}`,
    { method: "POST" },
  );
  const sessData = await sess.json();
  if (!sess.ok || !sessData?.id) {
    return J({ error: sessData?.error?.message || "Falha ao abrir upload.", etapa: "sessao", detalhe: sessData }, 502);
  }

  // 3) envia os bytes e recebe o handle
  const up = await fetch(`https://graph.facebook.com/v21.0/${sessData.id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${TOKEN}`, file_offset: "0", "Content-Type": tipo },
    body: bytes,
  });
  const upData = await up.json();
  if (!up.ok || !upData?.h) {
    return J({ error: upData?.error?.message || "Falha no upload.", etapa: "upload", detalhe: upData }, 502);
  }

  // 4) grava no perfil do numero
  const perfil = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/whatsapp_business_profile`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", profile_picture_handle: upData.h }),
  });
  const perfilData = await perfil.json();
  if (!perfil.ok) {
    return J({ error: perfilData?.error?.message || "Falha ao salvar a foto.", etapa: "perfil", detalhe: perfilData }, 502);
  }
  return J({ ok: true, foto: imagemUrl });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();
    const { channel, provider, to, subject, message, html, template: tplName, params } = body ?? {};

    // Novo cadastro: avisa a EQUIPE (numeros do condominio) que ha alguem para aprovar.
    // A mensagem vem pronta do cadastro.html (arquivo, sem corromper emoji/acento).
    // Define a foto do perfil do WhatsApp pela API (contorna o painel bloqueado).
    if (body?.action === "set_foto") {
      return await definirFotoPerfil(body.url || "https://adminprogestao.com.br/icon512.png");
    }

    if (body?.action === "novo_cadastro") {
      const destinos = await destinosEquipe(body.condominio || "");
      const msg = body.message ||
        ("Novo cadastro aguardando aprovacao. Nome: " + (body.nome || "") + " Unidade: " + (body.unidade || ""));
      let n = 0;
      for (const d of destinos) {
        if (d?.whats) {
          try { await enviarWhatsapp(d.whats, msg, body.template, body.params); n++; } catch (_) {}
        }
      }
      return J({ ok: true, enviados: n });
    }

    if (!to) return J({ error: "Campo 'to' e obrigatorio." }, 400);

    if (channel === "whatsapp") {
      // provider vem do app; se ausente (ex: cron), usa o secret WA_PROVIDER
      const prov = provider || Deno.env.get("WA_PROVIDER") || "cloud";
      if (prov === "evolution") return await enviarEvolution(to, message ?? "");
      return await enviarWhatsapp(to, message ?? "", tplName, params);
    }
    if (!subject) return J({ error: "Campo 'subject' e obrigatorio para e-mail." }, 400);
    return await enviarEmail(to, subject, message ?? "", html);
  } catch (e) {
    return J({ error: (e as Error)?.message || "Erro inesperado." }, 500);
  }
});
