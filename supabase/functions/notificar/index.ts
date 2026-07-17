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

// ── WhatsApp Cloud API (template message) ──
async function enviarWhatsapp(to: string, message: string) {
  const TOKEN = Deno.env.get("WHATSAPP_TOKEN");
  const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID");
  const TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE") ?? "aviso_condominio";
  const LANG = Deno.env.get("WHATSAPP_LANG") ?? "pt_BR";
  if (!TOKEN || !PHONE_ID) return J({ error: "WHATSAPP_TOKEN/WHATSAPP_PHONE_ID nao configurados nos Secrets." }, 500);

  let num = String(to).replace(/\D/g, "");
  if (!num) return J({ error: "Numero invalido." }, 400);
  if (!num.startsWith("55")) num = "55" + num;

  // hello_world (modelo pronto da Meta) nao aceita variaveis -> envia sem componentes.
  const template: Record<string, unknown> =
    TEMPLATE === "hello_world"
      ? { name: "hello_world", language: { code: "en_US" } }
      : {
          name: TEMPLATE,
          language: { code: LANG },
          components: [{ type: "body", parameters: [{ type: "text", text: message ?? "" }] }],
        };

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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();
    const { channel, to, subject, message, html } = body ?? {};
    if (!to) return J({ error: "Campo 'to' e obrigatorio." }, 400);

    if (channel === "whatsapp") {
      return await enviarWhatsapp(to, message ?? "");
    }
    if (!subject) return J({ error: "Campo 'subject' e obrigatorio para e-mail." }, 400);
    return await enviarEmail(to, subject, message ?? "", html);
  } catch (e) {
    return J({ error: (e as Error)?.message || "Erro inesperado." }, 500);
  }
});
