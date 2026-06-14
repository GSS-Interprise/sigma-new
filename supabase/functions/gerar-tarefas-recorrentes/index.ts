import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const HORIZONTE_DIAS = 30;

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function dateISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseISODate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function deveGerarNoDia(
  rec: {
    frequencia: string;
    dias_semana: number[] | null;
    dia_mes: number | null;
  },
  d: Date,
) {
  if (rec.frequencia === "diaria") return true;
  if (rec.frequencia === "semanal") {
    const dow = d.getUTCDay(); // 0 dom .. 6 sab
    return (rec.dias_semana || []).includes(dow);
  }
  if (rec.frequencia === "mensal") {
    return rec.dia_mes != null && d.getUTCDate() === rec.dia_mes;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const authHeader = req.headers.get("Authorization") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const recorrenciasClient = authHeader && anonKey
      ? createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        })
      : serviceClient;

    // Filtra por recorrência específica e/ou janela mensal se fornecido no body
    let recorrenciaId: string | null = null;
    let dataInicio: Date | null = null;
    let dataFim: Date | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.recorrencia_id === "string") {
        recorrenciaId = body.recorrencia_id;
      }
      dataInicio = parseISODate(body?.data_inicio);
      dataFim = parseISODate(body?.data_fim);
    } catch {
      /* sem body */
    }

    let q = recorrenciasClient
      .from("worklist_tarefa_recorrencias")
      .select("*")
      .eq("ativo", true);
    if (recorrenciaId) q = q.eq("id", recorrenciaId);
    const { data: recorrencias, error: recErr } = await q;
    if (recErr) throw recErr;

    const hoje = new Date();
    hoje.setUTCHours(0, 0, 0, 0);
    const janelaCustomizada = !!(dataInicio && dataFim);
    const inicioJanela = dataInicio ?? hoje;
    const fimJanela = dataFim ?? addDays(hoje, HORIZONTE_DIAS - 1);
    const limiteExclusivo = addDays(fimJanela, 1);

    let criadas = 0;
    for (const rec of recorrencias ?? []) {
      const inicio = rec.proxima_geracao
        ? new Date(rec.proxima_geracao + "T00:00:00Z")
        : inicioJanela;
      const start = janelaCustomizada ? inicioJanela : inicio > hoje ? inicio : hoje;

      for (let d = new Date(start); d < limiteExclusivo; d = addDays(d, 1)) {
        if (!deveGerarNoDia(rec, d)) continue;
        const dataISO = dateISO(d);

        // upsert idempotente por (recorrencia_id, data_limite)
        const { data: existente } = await serviceClient
          .from("worklist_tarefas")
          .select("id")
          .eq("recorrencia_id", rec.id)
          .eq("data_limite", dataISO)
          .maybeSingle();
        if (existente) continue;

        const { data: nova, error: insErr } = await serviceClient
          .from("worklist_tarefas")
          .insert({
            modulo: "demandas",
            titulo: rec.titulo,
            descricao: rec.descricao,
            tipo: rec.tipo,
            urgencia: rec.urgencia,
            escopo: rec.escopo,
            setor_destino_id: rec.setor_destino_id,
            created_by: rec.created_by,
            responsavel_id: rec.participantes?.[0] ?? rec.created_by,
            data_limite: dataISO,
            data_limite_hora: rec.hora,
            duracao_min: rec.duracao_min,
            recorrencia_id: rec.id,
            checklist: rec.checklist_template ?? [],
            status: "aberta",
          })
          .select("id")
          .single();

        if (insErr) {
          console.error("insert tarefa recorrente:", insErr.message);
          continue;
        }

        // Mencionar participantes
        if (nova && rec.participantes?.length) {
          const mencionados = (rec.participantes as string[]).map((uid) => ({
            tarefa_id: nova.id,
            user_id: uid,
          }));
          await serviceClient
            .from("worklist_tarefa_mencionados")
            .insert(mencionados);
        }
        criadas++;
      }

      if (!janelaCustomizada) {
        await serviceClient
          .from("worklist_tarefa_recorrencias")
          .update({ proxima_geracao: dateISO(limiteExclusivo) })
          .eq("id", rec.id);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, criadas, recorrencias: recorrencias?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});