// Conecta o Gmail de uma pessoa da equipe ao Sigma, para a campanha de e-mail sair pela caixa dela.
//
//   POST { acao: "iniciar", volta }   (usuário logado) → { url } da tela de permissão do Google
//   POST { acao: "desconectar", id }  (usuário logado, só a própria conta) → revoga e marca desconectada
//   GET  ?code&state                  (volta do Google) → guarda o refresh token e volta para o Sigma
//
// verify_jwt=false no config.toml: a volta do Google é um GET sem o token do Sigma. Os POSTs
// conferem o usuário aqui dentro.
// App OAuth "Interno" do Google Cloud da GSS: só contas @gestaoservicosaude.com.br conseguem autorizar.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ESCOPOS = "openid email profile https://www.googleapis.com/auth/gmail.send";
const DOMINIO = "gestaoservicosaude.com.br";

function redirectUri() {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/gmail-oauth`;
}

// Só volta para o próprio Sigma (evita usar esta rota para mandar alguém a outro site).
function voltaSegura(volta: string | null | undefined, appUrl: string) {
  try {
    const u = new URL(String(volta || ""));
    const host = u.hostname;
    const permitido = host === new URL(appUrl).hostname || host.endsWith(".lovable.app") ||
      host.endsWith(".lovableproject.com") || host === "localhost" || host === "127.0.0.1";
    if (permitido) return u.toString();
  } catch { /* volta inválida */ }
  return appUrl;
}

function comParametro(url: string, chave: string, valor: string) {
  const u = new URL(url);
  u.searchParams.set(chave, valor);
  return u.toString();
}

function decodificarJwt(token: string) {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0)));
    return JSON.parse(json);
  } catch {
    return {};
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const clientId = Deno.env.get("GOOGLE_GMAIL_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("GOOGLE_GMAIL_CLIENT_SECRET") || "";
  const { data: cfg } = await svc.from("config_lista_items").select("valor").eq("campo_nome", "financeiro_nf_link_base").maybeSingle();
  const appUrl = String(cfg?.valor || Deno.env.get("APP_URL") || "https://sigma-gss.lovable.app").replace(/\/+$/, "");

  // ---------- volta do Google ----------
  if (req.method === "GET") {
    const url = new URL(req.url);
    const state = url.searchParams.get("state") || "";
    const { data: st } = await svc.from("gmail_oauth_states").select("user_id, volta, created_at").eq("state", state).maybeSingle();
    if (state) await svc.from("gmail_oauth_states").delete().eq("state", state);
    // estados com mais de 1 hora não servem (e limpa os abandonados)
    await svc.from("gmail_oauth_states").delete().lt("created_at", new Date(Date.now() - 3600_000).toISOString());
    const volta = voltaSegura(st?.volta, appUrl);
    const voltar = (resultado: string) => Response.redirect(comParametro(volta, "gmail", resultado), 302);

    if (!st || Date.now() - new Date(st.created_at).getTime() > 3600_000) return voltar("expirou");
    if (url.searchParams.get("error")) return voltar("cancelado");
    const code = url.searchParams.get("code");
    if (!code) return voltar("erro");

    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
    });
    const tok = await r.json().catch(() => ({}));
    if (!r.ok || !tok.refresh_token) {
      console.warn("[gmail-oauth] troca do código falhou:", r.status, JSON.stringify(tok).slice(0, 300));
      return voltar("erro");
    }
    const perfil = decodificarJwt(String(tok.id_token || ""));
    const email = String(perfil.email || "").toLowerCase();
    if (!email.endsWith(`@${DOMINIO}`)) return voltar("dominio");
    if (!String(tok.scope || "").includes("gmail.send")) return voltar("sem_permissao");

    const { error } = await svc.from("email_contas_gmail").upsert({
      user_id: st.user_id, email, nome: String(perfil.name || "").slice(0, 120) || null,
      refresh_token: tok.refresh_token, status: "conectada", erro: null, pausada_ate: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "email" });
    if (error) {
      console.warn("[gmail-oauth] falha ao gravar conta:", error.message);
      return voltar("erro");
    }
    return voltar("conectado");
  }

  // ---------- ações da tela ----------
  const auth = req.headers.get("Authorization") || "";
  const u = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await u.auth.getUser();
  if (!user) return json({ ok: false, error: "unauthorized" }, 401);
  const input = await req.json().catch(() => ({}));
  const acao = String(input.acao || "");

  if (acao === "iniciar") {
    if (!clientId || !clientSecret) return json({ ok: false, error: "app_google_nao_configurado" }, 500);
    const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const { error } = await svc.from("gmail_oauth_states").insert({ state, user_id: user.id, volta: String(input.volta || "").slice(0, 500) });
    if (error) return json({ ok: false, error: error.message }, 500);
    const params = new URLSearchParams({
      client_id: clientId, redirect_uri: redirectUri(), response_type: "code", scope: ESCOPOS, state,
      access_type: "offline", prompt: "consent", include_granted_scopes: "true", hd: DOMINIO,
      ...(user.email?.endsWith(`@${DOMINIO}`) ? { login_hint: user.email } : {}),
    });
    return json({ ok: true, url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  }

  if (acao === "desconectar") {
    const { data: conta } = await svc.from("email_contas_gmail").select("id, user_id, refresh_token")
      .eq("id", String(input.id || "")).maybeSingle();
    if (!conta) return json({ ok: false, error: "conta_nao_encontrada" }, 404);
    if (conta.user_id !== user.id) return json({ ok: false, error: "so_a_propria_conta" }, 403);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(conta.refresh_token)}`, { method: "POST" })
      .catch(() => null);
    await svc.from("email_contas_gmail").update({ status: "desconectada", updated_at: new Date().toISOString() }).eq("id", conta.id);
    return json({ ok: true });
  }

  return json({ ok: false, error: "acao_desconhecida" }, 400);
});
