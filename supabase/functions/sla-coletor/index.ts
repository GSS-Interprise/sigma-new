// Porta do coletor de SLA de laudos: a estação da GSS lê a fila "Não lido" do Vue PACS por OCR e manda aqui
// data, hora, origem, nome do paciente e estudo de cada linha (nome incluído por decisão do Raul em 12/11; o banco
// apaga o nome quando o exame sai da fila).
// A estação se identifica com x-sla-key (secret SLA_COLETOR_KEY); a service role fica só aqui.
//   { unidade, lida_em, status: "ok"|"sem_grade"|"erro", cheia, linhas: [{ data, hora, origem }], detalhe }
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const UNIDADES = new Set(["marieta"]);
const ORIGENS = new Set(["ps", "internado", "externo"]);

serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "metodo" }, 405);
  const chave = Deno.env.get("SLA_COLETOR_KEY") || "";
  if (!chave || req.headers.get("x-sla-key") !== chave) return json({ ok: false, error: "sem_permissao" }, 401);

  const body = await req.json().catch(() => null);
  if (!body) return json({ ok: false, error: "json" }, 400);
  const unidade = String(body.unidade || "").toLowerCase();
  if (!UNIDADES.has(unidade)) return json({ ok: false, error: "unidade" }, 400);
  const status = ["ok", "sem_grade", "erro"].includes(body.status) ? body.status : "erro";
  const lidaEm = new Date(body.lida_em || Date.now());
  if (isNaN(lidaEm.getTime()) || Math.abs(Date.now() - lidaEm.getTime()) > 30 * 60_000) {
    return json({ ok: false, error: "lida_em" }, 400); // relógio da estação errado distorce o SLA
  }

  // Só estes campos passam, mesmo que a estação mande mais.
  // Data lida pelo OCR só vale se existir e estiver entre 10 dias atrás e amanhã; senão o banco deduz pelo relógio.
  const dataValida = (v: unknown): string | null => {
    if (typeof v !== "string" || !/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return null;
    const iso = `${v.slice(6, 10)}-${v.slice(3, 5)}-${v.slice(0, 2)}`;
    const t = new Date(`${iso}T12:00:00Z`);
    if (isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso) return null;
    const dias = (t.getTime() - lidaEm.getTime()) / 86_400_000;
    return dias > 1.5 || dias < -10 ? null : iso;
  };
  const linhas = (Array.isArray(body.linhas) ? body.linhas : []).slice(0, 300).map((l: Record<string, unknown>) => {
    return {
      data: dataValida(l?.data), hora: String(l?.hora || ""), origem: String(l?.origem || "").toLowerCase(),
      paciente: String(l?.paciente || "").slice(0, 120) || null, estudo: String(l?.estudo || "").slice(0, 120) || null,
    };
  }).filter((l: { hora: string; origem: string }) => /^\d{2}:\d{2}(:\d{2})?$/.test(l.hora) && ORIGENS.has(l.origem));

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await svc.rpc("sla_registrar_leitura", {
    p_unidade: unidade, p_lida_em: lidaEm.toISOString(), p_status: status, p_cheia: !!body.cheia,
    p_linhas: linhas, p_detalhe: body.detalhe && typeof body.detalhe === "object" ? body.detalhe : null,
  });
  if (error) {
    console.error("[sla-coletor]", error.message);
    return json({ ok: false, error: "rpc" }, 500);
  }
  return json({ ok: true, ...data });
});
