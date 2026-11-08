// Porta da fila de rotinas para o worker da VPS da GSS (vps/sigma-rotinas).
// O worker se identifica com x-rotinas-key (secret ROTINAS_WORKER_KEY); a service role fica só aqui.
//   { action: "pegar", worker, tipos: ["ping"], limite }        → pedidos para executar
//   { action: "concluir", id, ok, resultado, erro }              → grava o resultado
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
    return json({ ok: false, error: "action" }, 400);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
