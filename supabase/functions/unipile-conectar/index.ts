// Conectar LinkedIn/Instagram de uma pessoa da GSS pela Unipile (Hosted Auth). Fase 9.2.
// Ações: listar | link | confirmar | desconectar. Só usuário logado; gerar link para outra pessoa e ver todas: admin.
// A pessoa entra com o próprio login na página da Unipile; o Sigma nunca vê senha nem cookie.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { criarState, lerState, salvarConta, unipile } from "../_shared/unipile.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Para onde a Unipile devolve a pessoa. Só origens conhecidas (senão viraria redirecionador aberto).
const ORIGENS = ["https://sigma-gss.lovable.app", "http://localhost:8090", "http://localhost:8080",
  ...(Deno.env.get("UNIPILE_REDIRECT_ORIGENS") || "").split(",").map((s) => s.trim()).filter(Boolean)];

// Link copiado para a pessoa abrir no computador dela: vale 6 h (a Unipile derruba todos os links no reinício diário).
const VALIDADE_MIN = 360;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(token);
  const eu = u?.user?.id;
  if (!eu) return json({ ok: false, error: "sem_login" }, 401);
  const { data: ehAdmin } = await admin.rpc("is_admin", { _user_id: eu });
  const body = await req.json().catch(() => ({}));

  try {
    if (body.acao === "listar") {
      let q = admin.from("linkedin_contas").select("*").order("atualizado_em", { ascending: false });
      if (!ehAdmin) q = q.eq("usuario_id", eu);
      const { data: contas } = await q;
      const ids = [...new Set((contas || []).map((c: any) => c.usuario_id))];
      const { data: pessoas } = ids.length ? await admin.from("profiles").select("id,nome_completo").in("id", ids) : { data: [] };
      const nome = Object.fromEntries((pessoas || []).map((p: any) => [p.id, p.nome_completo]));
      return json({ ok: true, admin: !!ehAdmin, contas: (contas || []).map((c: any) => ({ ...c, pessoa: nome[c.usuario_id] ?? null })) });
    }

    if (body.acao === "link") {
      const provedor = body.provedor === "instagram" ? "instagram" : "linkedin";
      const dono = body.usuario_id && body.usuario_id !== eu ? String(body.usuario_id) : eu;
      if (dono !== eu && !ehAdmin) return json({ ok: false, error: "so_admin_conecta_para_outra_pessoa" }, 403);
      const origem = String(body.origem || "");
      if (!ORIGENS.includes(origem)) return json({ ok: false, error: "origem_nao_permitida" }, 400);

      // Proxy automático da Unipile travado no Brasil: se não houver IP BR, falha em vez de cair para outro país
      // (login de IP estrangeiro é o que mais chama atenção do LinkedIn). IP próprio do Bright Data entra em custom_proxy.
      const proxyBr = { auto_proxy_config: { country: "BR", allow_country_fallback: false } };
      const config = provedor === "linkedin"
        // Recruiter fora: ele derruba a sessão do navegador da pessoa a cada login (aviso da Unipile).
        ? { linkedin: { ...proxyBr, allow_methods: ["credentials", "cookies"], products: ["classic", "sales_navigator"] } }
        : { instagram: { ...proxyBr } };

      const reconectar = body.reconectar_id ? String(body.reconectar_id) : null;
      if (reconectar) {
        const { data: c } = await admin.from("linkedin_contas").select("usuario_id").eq("gateway_account_id", reconectar).maybeSingle();
        if (!c || (c.usuario_id !== eu && !ehAdmin)) return json({ ok: false, error: "conta_nao_encontrada" }, 404);
      }
      const r = await unipile("/auth/link", {
        method: "POST",
        body: JSON.stringify({
          ...(reconectar ? { account_id: reconectar } : { providers: [provedor], config }),
          expires_on: new Date(Date.now() + VALIDADE_MIN * 60_000).toISOString(),
          redirect_uri: `${origem}/configuracoes?tab=linkedin`,
          state: await criarState(dono, provedor, VALIDADE_MIN),
        }),
      });
      return json({ ok: true, link: r?.link ?? r?.url ?? null, expira_em_min: VALIDADE_MIN });
    }

    if (body.acao === "confirmar") {
      // Volta do redirect: confere o state assinado e lê a conta na Unipile (o webhook account.add faz o mesmo).
      const st = await lerState(body.state);
      if (!st || !body.account_id) return json({ ok: false, error: "state_invalido" }, 400);
      if (st.usuarioId !== eu && !ehAdmin) return json({ ok: false, error: "conta_de_outra_pessoa" }, 403);
      const conta = await unipile(`/accounts/${encodeURIComponent(String(body.account_id))}`);
      const salva = await salvarConta(admin, conta, st.usuarioId, eu, st.provedor);
      return json({ ok: true, conta: salva });
    }

    if (body.acao === "desconectar") {
      const { data: c } = await admin.from("linkedin_contas").select("*").eq("id", String(body.id || "")).maybeSingle();
      if (!c || (c.usuario_id !== eu && !ehAdmin)) return json({ ok: false, error: "conta_nao_encontrada" }, 404);
      // Remover na Unipile encerra a sessão lá e para a cobrança da conta.
      if (c.gateway_account_id) {
        try { await unipile(`/accounts/${encodeURIComponent(c.gateway_account_id)}`, { method: "DELETE" }); }
        catch (e: any) { if (e.status !== 404) throw e; }
      }
      await admin.from("linkedin_contas").update({ situacao: "desconectada", motivo: "desconectada no Sigma", atualizado_em: new Date().toISOString() }).eq("id", c.id);
      return json({ ok: true });
    }

    return json({ ok: false, error: "acao_desconhecida" }, 400);
  } catch (e: any) {
    console.error("[unipile-conectar]", e.message, JSON.stringify(e.dados ?? {}).slice(0, 500));
    return json({ ok: false, error: e.message }, 500);
  }
});
