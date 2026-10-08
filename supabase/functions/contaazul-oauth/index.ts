// Conexão do Sigma com o Conta Azul da GSS. Pública (--no-verify-jwt): parte das ações é
// chamada pela página de conexão (/conta-azul/conectar/<convite>), aberta por quem administra
// o Conta Azul e não necessariamente está logado no Sigma. Cada ação confere a própria permissão.
//
// Autenticadas (financeiro, diretoria, admin ou service role):
//   { acao: "link" }         gera o CONVITE (24h) e devolve o endereço da página de conexão
//   { acao: "status" }       conectado? desde quando? última leitura?
//   { acao: "sincronizar" }  LEITURA: categorias, centros de custo, contas e pessoas para o
//                            de-para com o Sigma. Não grava nada no Conta Azul.
// Com convite (página de conexão):
//   { acao: "preparar", convite }           devolve o endereço de login do Conta Azul
//   { acao: "concluir", convite, colado }   troca o código (3 min) pelos tokens
// Retorno direto (app de produção):
//   { acao: "retorno", code, state }
//
// App de DESENVOLVIMENTO do Conta Azul tem retorno fixo em https://contaazul.com: o código
// aparece no endereço do navegador e a pessoa cola na página. App de PRODUÇÃO volta para
// /conta-azul/retorno. Quem decide é o segredo CONTAAZUL_REDIRECT_URI (vazio = produção).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CA_AUTORIZAR, CA_ESCOPO, conectar, credencial, lerTokens, listarTudo } from "../_shared/contaazul.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PAPEIS = ["admin", "gestor_financeiro", "diretoria"];
const CONVITE = "contaazul_convite";
const ESTADO = "contaazul_oauth_state";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const lerSegredo = async (nome: string) => {
    const { data } = await svc.from("integracao_segredos").select("valor").eq("nome", nome).maybeSingle();
    try { return JSON.parse(data?.valor || "{}"); } catch { return {}; }
  };
  const guardar = (nome: string, valor: unknown) =>
    svc.from("integracao_segredos").upsert({ nome, valor: JSON.stringify(valor), atualizado_em: new Date().toISOString() });

  try {
    const { data: cfg } = await svc.from("config_lista_items").select("valor").eq("campo_nome", "financeiro_nf_link_base").maybeSingle();
    const appUrl = String(cfg?.valor || "https://sigma-gss.lovable.app").replace(/\/+$/, "");
    const retornoApp = `${appUrl}/conta-azul/retorno`;
    const redirectUri = (Deno.env.get("CONTAAZUL_REDIRECT_URI") || "").trim() || retornoApp;
    const retornoDireto = redirectUri === retornoApp;

    const input = await req.json().catch(() => ({}));
    const acao = String(input.acao || "");

    const conviteValido = async (token: string) => {
      const salvo = await lerSegredo(CONVITE);
      return salvo.token && salvo.token === token && new Date(salvo.expira_em).getTime() > Date.now() ? salvo : null;
    };

    // ── página de conexão (quem tem o convite) ─────────────────────────────
    if (acao === "preparar") {
      const convite = await conviteValido(String(input.convite || ""));
      if (!convite) return json({ ok: false, error: "convite_invalido" }, 404);
      const state = crypto.randomUUID().replace(/-/g, "");
      await guardar(ESTADO, { state, criado_em: new Date().toISOString(), por: convite.por ?? null });
      const { clientId } = credencial();
      // escopo com "+" literal, como a documentação pede (URLSearchParams trocaria por %2B)
      const urlLogin = `${CA_AUTORIZAR}?response_type=code&client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${CA_ESCOPO}`;
      return json({ ok: true, url_login: urlLogin, retorno_direto: retornoDireto });
    }

    if (acao === "concluir") {
      const convite = await conviteValido(String(input.convite || ""));
      if (!convite) return json({ ok: false, error: "convite_invalido" }, 404);
      const colado = String(input.colado || "").trim();
      let code = colado, state = "";
      try { const u = new URL(colado); code = u.searchParams.get("code") || ""; state = u.searchParams.get("state") || ""; } catch { /* colou só o código */ }
      if (!code) return json({ ok: false, error: "sem_codigo" }, 400);
      const estado = await lerSegredo(ESTADO);
      if (state && estado.state && state !== estado.state) return json({ ok: false, error: "state_invalido" }, 400);
      await conectar(svc, code, redirectUri, convite.por ?? null);
      await svc.from("integracao_segredos").delete().in("nome", [ESTADO, CONVITE]);
      return json({ ok: true, conectado: true });
    }

    if (acao === "retorno") {
      const estado = await lerSegredo(ESTADO);
      // o state amarra a volta a um pedido nosso: sem ele, qualquer um conectaria outra conta
      if (!estado.state || estado.state !== String(input.state || "") || Date.now() - new Date(estado.criado_em).getTime() > 20 * 60_000) {
        return json({ ok: false, error: "state_invalido" }, 400);
      }
      await conectar(svc, String(input.code || ""), redirectUri, estado.por ?? null);
      await svc.from("integracao_segredos").delete().in("nome", [ESTADO, CONVITE]);
      return json({ ok: true, conectado: true });
    }

    // ── ações autenticadas ─────────────────────────────────────────────────
    const auth = req.headers.get("Authorization") || "";
    // A função é pública (verify_jwt desligado), então o JWT não chega validado: ler só o
    // campo "role" aceitaria um token forjado. Quem valida a assinatura é o próprio banco:
    // a chave só é service role se conseguir ler uma tabela que só o service role lê.
    const chave = auth.replace(/^Bearer\s+/i, "").trim();
    const pareceServiceRole = (() => {
      try { return JSON.parse(atob((chave.split(".")[1] || "").replace(/-/g, "+").replace(/_/g, "/")))?.role === "service_role"; } catch { return false; }
    })();
    let ehServiceRole = !!chave && chave === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
    // pg_cron chama com x-internal-sync-key (mesma chave dos outros crons do financeiro)
    const chaveInterna = (Deno.env.get("TWILIO_INTERNAL_SYNC_KEY") || "").trim();
    if (!ehServiceRole && chaveInterna && req.headers.get("x-internal-sync-key") === chaveInterna) ehServiceRole = true;
    if (!ehServiceRole && pareceServiceRole) {
      const prova = createClient(supabaseUrl, chave, { auth: { persistSession: false } });
      const { error } = await prova.from("integracao_segredos").select("nome").limit(1);
      ehServiceRole = !error;
    }
    let usuario: string | null = null;
    if (!ehServiceRole) {
      const u = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await u.auth.getUser();
      if (!user) return json({ ok: false, error: "unauthorized" }, 401);
      const { data: papeis } = await svc.from("user_roles").select("role").eq("user_id", user.id);
      if (!(papeis ?? []).some((p: any) => PAPEIS.includes(p.role))) return json({ ok: false, error: "sem_permissao" }, 403);
      usuario = user.id;
    }

    if (acao === "link") {
      credencial(); // falha cedo se o segredo do aplicativo não estiver configurado
      const token = crypto.randomUUID().replace(/-/g, "");
      const expira = new Date(Date.now() + 24 * 3600_000).toISOString();
      await guardar(CONVITE, { token, expira_em: expira, por: usuario });
      return json({ ok: true, link: `${appUrl}/conta-azul/conectar/${token}`, expira_em: expira, redirect_uri: redirectUri, retorno_direto: retornoDireto });
    }

    if (acao === "status") {
      const t = await lerTokens(svc);
      const { data: ultimo } = await svc.from("contaazul_cache").select("atualizado_em").order("atualizado_em", { ascending: false }).limit(1).maybeSingle();
      return json({
        ok: true, conectado: !!t, conectado_em: t?.tokens.conectado_em ?? null,
        token_expira_em: t?.tokens.expira_em ?? null, ultima_leitura: ultimo?.atualizado_em ?? null,
        redirect_uri: redirectUri, retorno_direto: retornoDireto,
      });
    }

    // Consulta livre, só leitura (GET), para explorar a conta real sem escrever nada.
    // Restrita ao service role: devolve dado financeiro cru.
    if (acao === "consultar") {
      if (!ehServiceRole) return json({ ok: false, error: "sem_permissao" }, 403);
      const caminho = String(input.caminho || "");
      if (!caminho.startsWith("/v1/")) return json({ ok: false, error: "caminho_invalido" }, 400);
      const { ca } = await import("../_shared/contaazul.ts");
      return json({ ok: true, dados: await ca(svc, caminho) });
    }

    // Espelha contas a pagar e a receber de um intervalo de vencimento. Sem intervalo, pega a
    // janela móvel que o cron diário usa: do mês anterior até dois meses à frente.
    if (acao === "sincronizar_lancamentos") {
      const hoje = new Date();
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const de = String(input.de || iso(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1))));
      const ate = String(input.ate || iso(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 3, 0))));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) return json({ ok: false, error: "data_invalida" }, 400);
      const inicio = new Date().toISOString();
      const fontes: Array<["DESPESA" | "RECEITA", string, string]> = [
        ["DESPESA", "/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar", "fornecedor"],
        ["RECEITA", "/v1/financeiro/eventos-financeiros/contas-a-receber/buscar", "cliente"],
      ];
      const resumo: Record<string, unknown> = {};
      for (const [tipo, caminho, campoPessoa] of fontes) {
        try {
          const itens = await listarTudo(svc, caminho, { data_vencimento_de: de, data_vencimento_ate: ate }, 60, 500);
          const linhas = itens.filter((i: any) => i?.id).map((i: any) => ({
            ca_id: String(i.id), tipo,
            descricao: i.descricao ?? null, status: i.status ?? null, status_traduzido: i.status_traduzido ?? null,
            total: Number(i.total ?? 0), pago: Number(i.pago ?? 0), nao_pago: Number(i.nao_pago ?? 0),
            data_vencimento: i.data_vencimento ?? null, data_competencia: i.data_competencia ?? null,
            data_criacao: i.data_criacao ?? null, data_alteracao: i.data_alteracao ?? null,
            categoria_id: i.categorias?.[0]?.id ?? null, categoria_nome: i.categorias?.[0]?.nome?.trim() ?? null,
            centro_custo_id: i.centros_de_custo?.[0]?.id ?? null, centro_custo_nome: i.centros_de_custo?.[0]?.nome?.trim() ?? null,
            pessoa_id: i[campoPessoa]?.id ?? null, pessoa_nome: i[campoPessoa]?.nome?.trim() ?? null,
            dados: i, sincronizado_em: inicio,
          }));
          for (let i = 0; i < linhas.length; i += 500) {
            const { error } = await svc.from("contaazul_lancamentos").upsert(linhas.slice(i, i + 500), { onConflict: "ca_id" });
            if (error) throw error;
          }
          // o que estava nesta janela e não veio mais foi excluído (ou saiu da janela) no Conta Azul
          const { count: removidos, error: eDel } = await svc.from("contaazul_lancamentos")
            .delete({ count: "exact" }).eq("tipo", tipo)
            .gte("data_vencimento", de).lte("data_vencimento", ate).lt("sincronizado_em", inicio);
          if (eDel) throw eDel;
          resumo[tipo] = { lidos: itens.length, gravados: linhas.length, removidos: removidos ?? 0 };
        } catch (e: any) {
          resumo[tipo] = { erro: String(e?.message || e).slice(0, 200) };
        }
      }
      return json({ ok: true, de, ate, resumo });
    }

    if (acao === "sincronizar") {
      const recursos: Array<[string, string]> = [
        // caminhos conferidos na documentação e na conta real em 08/10 (os de /financeiro/ dão 404)
        ["categoria", "/v1/categorias"],
        ["centro_custo", "/v1/centro-de-custo"],
        ["conta_financeira", "/v1/conta-financeira"],
        ["pessoa", "/v1/pessoas"],
      ];
      const resumo: Record<string, unknown> = {};
      for (const [tipo, caminho] of recursos) {
        try {
          const itens = await listarTudo(svc, caminho);
          const linhas = itens
            .map((i: any) => ({
              tipo, ca_id: String(i.id ?? i.uuid ?? i.codigo ?? ""),
              nome: String(i.nome ?? i.descricao ?? i.razao_social ?? i.name ?? "").slice(0, 300),
              dados: i, atualizado_em: new Date().toISOString(),
            }))
            .filter((l) => l.ca_id)
            // o mesmo id repetido num lote derruba o upsert inteiro ("cannot affect row a second time")
            .filter((l, idx, arr) => arr.findIndex((x) => x.ca_id === l.ca_id) === idx);
          for (let i = 0; i < linhas.length; i += 500) {
            const { error } = await svc.from("contaazul_cache").upsert(linhas.slice(i, i + 500), { onConflict: "tipo,ca_id" });
            if (error) throw error;
          }
          // nomes dos campos do primeiro item: confere o formato real da API sem expor dados
          resumo[tipo] = { lidos: itens.length, gravados: linhas.length, campos: itens[0] ? Object.keys(itens[0]).slice(0, 25) : [] };
        } catch (e: any) {
          resumo[tipo] = { erro: String(e?.message || e).slice(0, 200) };
        }
      }
      return json({ ok: true, resumo });
    }

    return json({ ok: false, error: "acao_desconhecida" }, 400);
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
