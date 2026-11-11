// Porta da fila de rotinas para o worker da VPS da GSS (vps/sigma-rotinas).
// O worker se identifica com x-rotinas-key (secret ROTINAS_WORKER_KEY); a service role fica só aqui.
//   { action: "pegar", worker, tipos: ["ping"], limite }        → pedidos para executar
//   { action: "concluir", id, ok, resultado, erro }              → grava o resultado
//   { action: "importar_lista", pedido_id, xlsx_b64, nome_lista, especialidade } → importa a planilha como lista
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "metodo" }, 405);
  const chave = Deno.env.get("ROTINAS_WORKER_KEY") || "";
  if (!chave || req.headers.get("x-rotinas-key") !== chave) return json({ ok: false, error: "sem_permissao" }, 401);

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "pegar") {
      const tipos = Array.isArray(body.tipos) ? body.tipos.map(String).slice(0, 20) : [];
      if (tipos.length === 0) return json({ ok: false, error: "tipos_vazios" }, 400);
      const { data, error } = await svc.rpc("rotina_pegar", {
        p_worker: String(body.worker || "vps").slice(0, 60), p_tipos: tipos, p_limite: Number(body.limite) || 1,
      });
      if (error) throw error;
      return json({ ok: true, pedidos: data || [] });
    }
    if (body.action === "concluir") {
      if (!body.id) return json({ ok: false, error: "id" }, 400);
      const { error } = await svc.rpc("rotina_concluir", {
        p_id: body.id, p_ok: !!body.ok, p_resultado: body.resultado ?? null, p_erro: body.erro ? String(body.erro) : null,
      });
      if (error) throw error;
      return json({ ok: true });
    }
    if (body.action === "importar_lista") {
      // Rotina lifeshub_lista: o worker manda a planilha já no formato da importação e o Sigma importa pela
      // mesma edge da importação manual (dedup por telefone, blacklist, lista criada no fim). O dono da lista é
      // quem pediu a rotina, para ela aparecer para essa pessoa no assistente de campanha.
      const xlsxB64 = String(body.xlsx_b64 || "");
      if (!body.pedido_id || !xlsxB64) return json({ ok: false, error: "pedido_id_e_planilha" }, 400);
      const { data: pedido } = await svc.from("rotina_pedidos").select("id, tipo, status, pedido_por")
        .eq("id", body.pedido_id).maybeSingle();
      if (!pedido || pedido.status !== "executando") return json({ ok: false, error: "pedido_invalido" }, 400);

      let donoEmail: string | null = null;
      if (pedido.pedido_por) {
        const { data: u } = await svc.auth.admin.getUserById(pedido.pedido_por);
        donoEmail = u?.user?.email ?? null;
      }
      const nomeLista = String(body.nome_lista || "Life's Hub").slice(0, 120);
      const arquivo = `lifeshub-${String(body.pedido_id).slice(0, 8)}.xlsx`;
      const { data: job, error: jobErr } = await svc.from("lead_import_jobs").insert({
        status: "pendente", arquivo_nome: arquivo, total_linhas: 0,
        created_by: pedido.pedido_por, created_by_nome: donoEmail ?? "Rotina Life's Hub",
      }).select("id").single();
      if (jobErr) throw jobErr;

      // Especialidade do Life's Hub tem o mesmo nome da tabela especialidades (ex.: GINECOLOGIA E OBSTETRÍCIA).
      const { data: esp } = await svc.from("especialidades").select("nome")
        .ilike("nome", String(body.especialidade || "")).maybeSingle();

      const bytes = Uint8Array.from(atob(xlsxB64), (c) => c.charCodeAt(0));
      const fd = new FormData();
      fd.append("file", new File([bytes], arquivo, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }));
      fd.append("job_id", job.id);
      fd.append("arquivo_nome", arquivo);
      fd.append("especialidade", esp?.nome || "");
      fd.append("especialidades", JSON.stringify(esp?.nome ? [esp.nome] : []));
      fd.append("origem", "Life's Hub");
      fd.append("lista_destino_nome", nomeLista);
      fd.append("lista_destino_descricao", String(body.descricao || "Extraída do Life's Hub pela rotina da VPS"));
      const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/import-leads-excel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: fd,
      });
      const txt = await resp.text();
      if (!resp.ok) return json({ ok: false, error: `importacao ${resp.status}: ${txt.slice(0, 300)}` }, 502);
      return json({ ok: true, job_id: job.id });
    }
    return json({ ok: false, error: "action" }, 400);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
