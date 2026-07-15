// Edge Function: notificar
// Envia e-mail de notificacao usando o Resend (https://resend.com).
// A chave fica em SECRET no Supabase, nunca no site.
//
// Secrets necessarios (Supabase -> Project Settings -> Edge Functions -> Secrets):
//   RESEND_API_KEY = re_xxxxxxxxxxxx        (sua API key do Resend)
//   EMAIL_FROM     = AdminPro <no-reply@seu-dominio.com>  (remetente verificado no Resend)
//
// Deploy (uma vez):
//   - Pelo painel: Supabase -> Edge Functions -> Create function "notificar" -> cole este codigo -> Deploy
//   - Ou CLI: supabase functions deploy notificar

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { to, subject, message, html } = await req.json();

    if (!to || !subject) {
      return new Response(
        JSON.stringify({ error: "Campos 'to' e 'subject' sao obrigatorios." }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const EMAIL_FROM =
      Deno.env.get("EMAIL_FROM") ?? "AdminPro <onboarding@resend.dev>";

    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY nao configurado nos Secrets." }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // aceita 1 destinatario ("a@x.com") ou varios ("a@x.com, b@y.com")
    const destinatarios = String(to)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const corpoHtml =
      html ??
      `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#1a2233;line-height:1.6">
         <div style="border-top:4px solid #E87722;padding-top:14px">
           ${esc(message ?? "").replace(/\n/g, "<br>")}
         </div>
         <p style="margin-top:22px;font-size:12px;color:#999">Enviado pelo AdminPro — Gestao de Condominio</p>
       </div>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: destinatarios,
        subject,
        text: message ?? "",
        html: corpoHtml,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: data?.message || "Falha no envio.", detalhe: data }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: true, id: data?.id }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error)?.message || "Erro inesperado." }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
