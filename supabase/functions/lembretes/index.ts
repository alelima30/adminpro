// Edge Function: lembretes
// Roda por CRON (a cada 15 min). Envia lembretes de reserva (24h e/ou 1h antes)
// mesmo com o app fechado. Usa a funcao "notificar" (dynamic-handler) para o envio real.
//
// Secrets usados (ja existem no projeto):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (injetados automaticamente)
//   WA_PROVIDER = evolution   (define o canal de WhatsApp no servidor)
//   + os secrets do Evolution/Resend ja configurados
//
// Requer a tabela public.lembretes_enviados (ver SQL fornecido).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NOTIFICAR = `${URL}/functions/v1/dynamic-handler`; // slug real da funcao notificar

const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };

async function rest(path: string) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`REST ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

function horaIni(h: string) {
  const p = (h || "").split(/[-–]/)[0].trim().split(":");
  return { hh: +p[0] || 0, mm: +p[1] || 0 };
}
// data (YYYY-MM-DD) + horario -> epoch ms considerando fuso do Brasil (-03:00)
function inicioMs(data: string, horario: string) {
  const { hh, mm } = horaIni(horario);
  const iso = `${data}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00-03:00`;
  return new Date(iso).getTime();
}

async function enviar(to: string, subject: string, message: string, whatsapp: boolean) {
  const body = whatsapp
    ? { channel: "whatsapp", to, message }
    : { to, subject, message };
  try {
    await fetch(NOTIFICAR, { method: "POST", headers: H, body: JSON.stringify(body) });
  } catch (_) { /* ignora falha individual */ }
}

serve(async () => {
  try {
    // 1) Config por condominio (modulo_dados: cfg_reservas)
    const cfgs = await rest("modulo_dados?modulo=eq.cfg_reservas&select=condominio_id,valor");
    const cfgMap: Record<string, any> = {};
    for (const c of cfgs) cfgMap[c.condominio_id] = c.valor || {};

    // 2) Reservas futuras (hoje em diante)
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); // data BR
    const reservas = await rest(
      `reservas?status=in.(confirmada,pendente)&data=gte.${hoje}&select=id,condominio_id,espaco,data,horario,tel,criado_por,nome,unidade`,
    );

    // 3) Chaves ja enviadas
    const jaEnv = await rest("lembretes_enviados?select=chave");
    const enviados = new Set<string>((jaEnv || []).map((x: any) => x.chave));

    const agora = Date.now();
    const novas: string[] = [];
    let contador = 0;

    for (const r of reservas) {
      const cfg = cfgMap[r.condominio_id] || {};
      const leads: { m: number; tag: string }[] = [];
      if (cfg.notif_lembrete_24h || cfg.notif_lembrete_ativo) leads.push({ m: 1440, tag: "24h" });
      if (cfg.notif_lembrete_1h) leads.push({ m: 60, tag: "1h" });
      if (!leads.length) continue;

      const email = (r.criado_por || "").trim();
      const tel = (r.tel || "").trim();
      if (!email && !tel) continue;

      const minAte = (inicioMs(r.data, r.horario) - agora) / 60000;
      for (const lead of leads) {
        if (minAte > lead.m || minAte < lead.m - 20) continue;
        const chave = `${r.id}|${r.data}|${lead.tag}`;
        if (enviados.has(chave)) continue;

        const quando = lead.tag === "1h" ? "em 1 hora" : "amanha";
        const dataBR = r.data.split("-").reverse().join("/");
        const msg =
          `⏰ Lembrete de reserva\n\nVoce tem uma reserva ${quando}.\n\n` +
          `Espaco: ${r.espaco}\nData: ${dataBR}\nHorario: ${r.horario}\nUnidade: ${r.unidade || ""}`;

        if (tel) await enviar(tel, "", msg, true);
        if (email) await enviar(email, `Lembrete de reserva — ${r.espaco}`, msg, false);

        enviados.add(chave);
        novas.push(chave);
        contador++;
      }
    }

    // 4) Grava as chaves novas (dedupe)
    if (novas.length) {
      await fetch(`${URL}/rest/v1/lembretes_enviados`, {
        method: "POST",
        headers: { ...H, Prefer: "resolution=ignore-duplicates" },
        body: JSON.stringify(novas.map((chave) => ({ chave }))),
      });
    }

    return new Response(JSON.stringify({ ok: true, enviados: contador }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
