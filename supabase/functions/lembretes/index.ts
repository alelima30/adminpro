// Edge Function: lembretes
// Roda por CRON (a cada 15 min). Envia lembretes de reserva (24h e/ou 1h antes)
// mesmo com o app fechado. Usa a funcao "notificar" (dynamic-handler) para o envio real.
//
// Secrets usados (ja existem no projeto):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (injetados automaticamente)
//   WA_PROVIDER = cloud   (define o canal de WhatsApp no servidor)
//
// Requer a tabela public.lembretes_enviados (ver SQL fornecido).
// Requer o modelo aprovado na Meta: lembrete_reserva (5 variaveis).

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
// Fim do horario em minutos. Sem fim definido: assume 1 hora.
// Fim <= inicio (ex.: 22:00-01:00): a reserva vira a madrugada, soma 24h.
function fimMin(h: string) {
  const p = String(h || "").split(/[-–]/);
  const ini = (() => { const q = horaIni(h); return q.hh * 60 + q.mm; })();
  if (p.length < 2 || !p[1].trim()) return ini + 60;
  const q = p[1].trim().split(":");
  let f = (+q[0] || 0) * 60 + (+q[1] || 0);
  if (f <= ini) f += 24 * 60;
  return f;
}
// data (YYYY-MM-DD) + horario -> epoch ms considerando fuso do Brasil (-03:00)
function inicioMs(data: string, horario: string) {
  const { hh, mm } = horaIni(horario);
  const iso = `${data}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00-03:00`;
  return new Date(iso).getTime();
}

/* Devolve se o envio deu certo, e por que nao deu.

   Antes esta funcao engolia tudo: nao olhava a resposta e nao avisava o
   chamador. Um numero recusado pela Meta, um modelo reprovado, um segredo
   faltando no projeto -- tudo isso virava silencio, e o lembrete era marcado
   como enviado do mesmo jeito. Nao chegava, e nao sobrava pista. */
/* A regra de quando avisar, isolada para poder ser testada.

   minAte = minutos que faltam para a reserva comecar. A janela vai de
   "faltam lead minutos" ate o piso do proximo aviso: o de 24h para no limite
   de 1 hora, onde o de 1h assume; o de 1h vai ate a hora de comecar. */
export function janelaLembrete(minAte: number, tag: string, lead: number): boolean {
  const piso = tag === "1h" ? 0 : 60;
  return minAte <= lead && minAte > piso;
}

/* "amanha" so quando for mesmo amanha: dentro de 24 horas a reserva cai hoje
   ou amanha, e o aviso de 24h pode sair no mesmo dia. */
export function quandoTexto(tag: string, dataReserva: string, hojeBR: string): string {
  if (tag === "1h") return "em 1 hora";
  return dataReserva > hojeBR ? "amanha" : "hoje";
}

async function enviar(
  to: string,
  subject: string,
  message: string,
  whatsapp: boolean,
  template?: string,
  params?: unknown[],
): Promise<{ ok: boolean; erro?: string }> {
  const body = whatsapp
    ? { channel: "whatsapp", to, message, template, params }
    : { to, subject, message };
  try {
    const r = await fetch(NOTIFICAR, { method: "POST", headers: H, body: JSON.stringify(body) });
    if (r.ok) return { ok: true };
    let detalhe = "";
    try {
      const j = await r.json();
      detalhe = (j && (j.error || j.message)) || JSON.stringify(j);
    } catch (_) {
      try { detalhe = await r.text(); } catch (_2) { detalhe = ""; }
    }
    return { ok: false, erro: `${r.status} ${String(detalhe).slice(0, 300)}`.trim() };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

serve(async () => {
  try {
    // 1) Config por condominio (modulo_dados: cfg_reservas)
    const cfgs = await rest("modulo_dados?modulo=eq.cfg_reservas&select=condominio_id,valor");
    const cfgMap: Record<string, any> = {};
    for (const c of cfgs) cfgMap[c.condominio_id] = c.valor || {};

    // 2) Reservas futuras (hoje em diante)
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); // data BR
    // Somente CONFIRMADAS: nao faz sentido lembrar de uma reserva que a
    // administracao ainda nao aprovou (evita mal-entendido com o morador).
    const reservas = await rest(
      `reservas?status=eq.confirmada&data=gte.${hoje}&select=id,condominio_id,espaco,data,horario,tel,criado_por,nome,unidade`,
    );

    // 3) Chaves ja enviadas -- so as recentes.
    //    A lista inteira cresce para sempre e, passando do limite de linhas da
    //    API, voltaria CORTADA. Chave que nao volta e lembrete repetido. Tres
    //    dias cobrem com folga a maior distancia entre criar a chave (24h
    //    antes) e a ultima chance de reenviar (1h antes).
    const corte = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
    const jaEnv = await rest(`lembretes_enviados?select=chave&criado_em=gte.${corte}`);
    const enviados = new Set<string>((jaEnv || []).map((x: any) => x.chave));

    const agora = Date.now();
    const novas: string[] = [];
    const problemas: unknown[] = [];
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
        /* A janela vai de "faltam lead.m minutos" ate o piso do proximo aviso.

           Antes era uma faixa de 20 minutos. Com o cron a cada 15 min, UMA
           passada que falhasse ou atrasasse dentro dessa faixa perdia o
           lembrete PARA SEMPRE: na passada seguinte minAte ja estava abaixo
           do piso e a reserva nunca mais era olhada. Era silencioso e nao
           deixava rastro -- o lembrete simplesmente nao chegava.

           Com a janela larga, uma passada perdida atrasa o lembrete em 15
           minutos em vez de cancela-lo. Nao repete, porque quem impede a
           repeticao e a chave em lembretes_enviados, nao o tamanho da faixa. */
        if (!janelaLembrete(minAte, lead.tag, lead.m)) continue;
        const chave = `${r.id}|${r.data}|${lead.tag}`;
        if (enviados.has(chave)) continue;

        /* "amanha" so quando for mesmo amanha. Dentro de 24 horas a reserva
           cai hoje ou amanha, e com a janela larga o aviso de 24h pode sair
           no mesmo dia (reserva marcada em cima da hora, ou passada perdida
           mais cedo). Dizer "amanha" nesse caso mandaria a pessoa no dia
           errado. */
        const quando = quandoTexto(lead.tag, r.data, hoje);
        const dataBR = r.data.split("-").reverse().join("/");
        const msg =
          `\u23F0 Lembrete de reserva\n\nVoce tem uma reserva ${quando}.\n\n` +
          `Espaco: ${r.espaco}\nData: ${dataBR}\nHorario: ${r.horario}\nUnidade: ${r.unidade || ""}`;

        // Modelo ESTRUTURADO (Meta) -> texto organizado em varias linhas.
        // Variaveis: {{1}} quando, {{2}} espaco, {{3}} data, {{4}} horario, {{5}} unidade
        const paramsLembrete = [quando, r.espaco || "", dataBR, r.horario || "", r.unidade || ""];

        /* Marcar como enviado so vale se alguem recebeu. Antes a chave era
           gravada de qualquer jeito: falhando o envio, a reserva ficava com
           o lembrete "ja enviado" e nunca mais era tentada. */
        let algumOk = false;
        const falhas: string[] = [];
        if (tel) {
          const x = await enviar(tel, "", msg, true, "lembrete_reserva", paramsLembrete);
          if (x.ok) algumOk = true; else falhas.push(`whatsapp ${tel}: ${x.erro}`);
        }
        if (email) {
          const x = await enviar(email, `Lembrete de reserva - ${r.espaco}`, msg, false);
          if (x.ok) algumOk = true; else falhas.push(`email ${email}: ${x.erro}`);
        }

        // EQUIPE/ADMIN: controle PROPRIO, separado do aviso de nova reserva.
        //   notif_lembrete_eq_1h / _24h  -> quais lembretes a equipe recebe
        //   lembrete_eq_espacos          -> lista de espacos (vazio = todos)
        const eqLead = lead.tag === "1h" ? cfg.notif_lembrete_eq_1h : cfg.notif_lembrete_eq_24h;
        const filtro = String(cfg.lembrete_eq_espacos || "").trim();
        const eqEspaco = !filtro || filtro.split(",")
          .map((x: string) => x.trim().toLowerCase())
          .filter(Boolean)
          .includes(String(r.espaco || "").trim().toLowerCase());
        if (eqLead && eqEspaco) {
          const destinos = Array.isArray(cfg.alert_destinos) ? cfg.alert_destinos : [];
          for (const d of destinos) {
            const w = (d?.whats || "").trim();
            if (w && w !== tel) {
              await enviar(w, "", msg, true, "lembrete_reserva", paramsLembrete);
            }
            const em = (d?.email || "").trim();
            if (em && em !== email) {
              await enviar(em, `Lembrete de reserva - ${r.espaco}`, msg, false);
            }
          }
        }

        if (!algumOk) {
          /* Nada foi marcado: a proxima passada tenta de novo, enquanto a
             janela durar. Preferimos insistir a perder o aviso -- e os
             motivos saem na resposta, para dar para ver o que o provedor
             esta recusando em vez de adivinhar. */
          problemas.push({ reserva: r.id, aviso: lead.tag, falhas });
          continue;
        }
        if (falhas.length) problemas.push({ reserva: r.id, aviso: lead.tag, falhas, parcial: true });

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

    // "versao" serve para conferir, pelo Test, se o deploy pegou o codigo novo.
    return new Response(JSON.stringify({
      ok: true,
      versao: "v5-janela-larga-e-falhas-visiveis",
      enviados: contador,
      reservas_olhadas: reservas.length,
      condominios_configurados: Object.keys(cfgMap),
      problemas,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
