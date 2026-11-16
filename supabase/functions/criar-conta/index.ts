// Edge Function: criar-conta
//
// A porta de entrada do AdminPro. Recebe o formulario publico de
// comecar.html e monta um condominio inteiro, pronto para usar:
//
//   1) a conta de acesso do responsavel (ja confirmada, para ele entrar
//      na hora -- ver a nota sobre confirmacao de e-mail la embaixo);
//   2) a linha em `condominios`, com um conjunto de modulos que faz sentido
//      no primeiro dia;
//   3) a linha em `usuarios`, nivel admin;
//   4) a assinatura em `teste`, com a data em que o teste acaba.
//
// Por que no servidor, e nao direto do navegador: criar condominio nao pode
// ser liberado para `anon` na RLS -- seria convite para qualquer um encher o
// banco. Aqui a criacao usa a service_role, mas atras de validacao e de um
// limite por IP, e so faz o caminho exato deste formulario.
//
// Segredos (ja existem no projeto):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Dias de teste gratis. Mudando aqui, muda para quem se cadastrar daqui
 *  pra frente -- quem ja entrou mantem a data que recebeu. */
const DIAS_DE_TESTE = 7;

/** Quantas contas um mesmo IP pode criar por dia. Nao impede alguem
 *  determinado, mas impede o acidente e o script bobo. */
const LIMITE_POR_IP = 3;

/* Os modulos que o condominio novo ja encontra ligados.

   Ligar TUDO assusta: o menu vira uma parede de telas vazias, e quem esta
   avaliando o sistema em sete dias nao sabe por onde comecar. Deixar tudo
   desligado e pior ainda -- parece quebrado.

   Entao entra o caminho completo do que o sistema faz melhor hoje: o cadastro
   (unidades, localizacoes, condominos, classificacoes) e as reservas. O resto
   fica escondido, e o dono liga por condominio quando quiser.

   'reservas' ja traz junto as telas de Relatorios e Criar espacos -- elas nao
   sao modulos proprios, sao paineis daquele modulo (ver painelModulo).
   'portaria' e o Painel de Reservas.

   CONFIGURACOES e USUARIOS ficam ligados por serem o painel de controle do
   que esta acima, nao recursos a parte: sem Configuracoes nao ha como definir
   horario, taxa nem Pix das reservas, e sem Usuarios nao ha como aprovar o
   morador que se cadastrou pelo link do convite. Desligados, os modulos da
   lista existiriam sem poder ser operados. */
const MODULOS_INICIAIS: Record<string, boolean> = {
  dashboard: true,
  unidades: true,
  localizacoes: true,
  condominos: true,
  classificacoes: true,
  reservas: true,
  portaria: true,
  configuracoes: true,
  usuarios: true,
};

function J(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function rest(caminho: string, init?: RequestInit) {
  const r = await fetch(`${URL_SB}/rest/v1/${caminho}`, { ...init, headers: { ...H, ...(init?.headers || {}) } });
  const txt = await r.text();
  let corpo: unknown = null;
  try { corpo = txt ? JSON.parse(txt) : null; } catch (_) { corpo = txt; }
  if (!r.ok) throw new Error(`${caminho}: ${r.status} ${txt.slice(0, 300)}`);
  return corpo;
}

const soDigitos = (v: string) => String(v || "").replace(/\D/g, "");

/** E-mail serve para entrar e para cobrar: um endereco invalido vira um
 *  cliente que nunca recebe nada e nao consegue recuperar a senha. */
function emailValido(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || "").trim());
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return J({ error: "Use POST." }, 405);

  let dados: Record<string, string>;
  try { dados = await req.json(); } catch (_) { return J({ error: "Envio invalido." }, 400); }

  const nomeCond = String(dados.condominio || "").trim();
  const nome = String(dados.nome || "").trim();
  const email = String(dados.email || "").trim().toLowerCase();
  const telefone = String(dados.telefone || "").trim();
  const senha = String(dados.senha || "");
  const unidades = parseInt(String(dados.unidades || "0"), 10) || 0;

  // ── Validacao. As mensagens sao as que a pessoa le na tela. ──
  if (nomeCond.length < 3) return J({ error: "Informe o nome do condomínio." }, 400);
  // Nome E sobrenome: vai para a assinatura e para a nota fiscal.
  if (nome.split(/\s+/).filter((p) => p.length > 1).length < 2) {
    return J({ error: "Informe nome e sobrenome." }, 400);
  }
  if (!emailValido(email)) return J({ error: "Informe um e-mail válido." }, 400);
  if (soDigitos(telefone).length < 10) return J({ error: "Informe um WhatsApp com DDD." }, 400);
  if (senha.length < 8) return J({ error: "A senha precisa de pelo menos 8 caracteres." }, 400);
  if (dados.aceite !== "sim") return J({ error: "É preciso aceitar os termos para continuar." }, 400);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconhecido";

  try {
    // ── Limite por IP ──
    const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const recentes = await rest(
      `cadastros_tentativas?select=ip&ip=eq.${encodeURIComponent(ip)}&criado_em=gte.${desde}`,
    ) as unknown[];
    if (Array.isArray(recentes) && recentes.length >= LIMITE_POR_IP) {
      return J({ error: "Muitos cadastros deste mesmo acesso hoje. Tente amanhã ou fale com a gente." }, 429);
    }

    /* E-mail ja usado: o Supabase recusaria depois, com uma mensagem em
       ingles que nao ajuda ninguem. Melhor dizer aqui o que fazer. */
    const jaUsuario = await rest(`usuarios?select=email&email=eq.${encodeURIComponent(email)}&limit=1`) as unknown[];
    if (Array.isArray(jaUsuario) && jaUsuario.length) {
      return J({ error: "Este e-mail já tem acesso ao AdminPro. Use \"Entrar\" ou \"Esqueci minha senha\"." }, 409);
    }

    // ── Codigo do condominio, conferido contra os que ja existem ──
    const codResp = await fetch(`${URL_SB}/rest/v1/rpc/gerar_codigo_condominio`, {
      method: "POST", headers: H, body: JSON.stringify({ nome_cond: nomeCond }),
    });
    if (!codResp.ok) throw new Error(`codigo: ${codResp.status} ${(await codResp.text()).slice(0, 200)}`);
    const codigo = String(await codResp.json()).replace(/"/g, "");
    if (!codigo || codigo.length < 2) throw new Error("codigo vazio");

    /* A conta de acesso vem PRIMEIRO. Se ela falhar (e-mail repetido, senha
       recusada), nada mais foi criado e nao sobra condominio orfao no banco. */
    const authResp = await fetch(`${URL_SB}/auth/v1/admin/users`, {
      method: "POST", headers: H,
      body: JSON.stringify({
        email, password: senha,
        /* Confirmado de saida: o pedido era entrar sem falar com ninguem, e
           parar para abrir o e-mail e onde a maior parte das pessoas desiste.
           A troca e consciente: um e-mail falso consegue criar um teste de 7
           dias. Contra isso ficam o limite por IP e o fato de que, para
           pagar, o e-mail precisa ser real. Se aparecer abuso, trocar para
           false e exigir confirmacao e uma linha. */
        email_confirm: true,
        user_metadata: { nome, condominio: codigo },
      }),
    });
    const authCorpo = await authResp.json().catch(() => ({}));
    if (!authResp.ok) {
      const msg = String(authCorpo?.msg || authCorpo?.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return J({ error: "Este e-mail já tem cadastro. Use \"Entrar\" ou \"Esqueci minha senha\"." }, 409);
      }
      throw new Error(`auth: ${authResp.status} ${JSON.stringify(authCorpo).slice(0, 300)}`);
    }
    const uid = authCorpo?.id;
    if (!uid) throw new Error("auth nao devolveu o id do usuario");

    /* Daqui pra baixo, qualquer falha deixa a conta criada sem condominio --
       e a pessoa nao conseguiria nem entrar nem se cadastrar de novo. Entao o
       catch desfaz a conta. */
    try {
      await rest("condominios", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          codigo, nome: nomeCond, status: "ativo",
          admin_email: email, modulos: MODULOS_INICIAIS,
        }),
      });

      await rest("usuarios", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          id: uid, email, nome, tel: telefone,
          condominio_id: codigo, nivel: "admin", status: "ativo", super_admin: false,
        }),
      });

      const ate = new Date(Date.now() + DIAS_DE_TESTE * 86400000).toISOString().slice(0, 10);
      await rest("assinaturas", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          condominio_id: codigo, situacao: "teste", teste_ate: ate,
          resp_nome: nome, resp_email: email, resp_tel: telefone,
          razao_social: nomeCond,
          obs: unidades ? `Informou ~${unidades} unidades no cadastro.` : null,
        }),
      });

      await rest("cadastros_tentativas", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ ip, email, condominio_id: codigo }),
      }).catch(() => { /* o registro do limite nao pode derrubar o cadastro */ });

      return J({ ok: true, codigo, condominio: nomeCond, teste_ate: ate, dias: DIAS_DE_TESTE });
    } catch (e) {
      // Desfaz a conta de acesso, para o e-mail poder tentar de novo.
      await fetch(`${URL_SB}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: H })
        .catch(() => {});
      await rest(`condominios?codigo=eq.${codigo}`, { method: "DELETE" }).catch(() => {});
      throw e;
    }
  } catch (e) {
    console.error("criar-conta", (e as Error).message);
    return J({ error: "Não consegui criar a conta agora. Tente de novo em instantes." }, 500);
  }
});
