// Roteiro da ligação de alerta de SLA de laudos (Twilio Voice chama esta função; não há usuário logado).
// Fluxo (cada chamada do Twilio traz ?a=<alerta_id>&t=<token>&p=<passo>):
//   p=inicio  — Twilio já fez a detecção de máquina (MachineDetection=Enable). Máquina/caixa postal: desliga e
//               registra como não atendida. Pessoa: fala o alerta e pede "aperte 1" (Gather).
//   p=tecla   — Digits=1: marca o exame como assumido e agradece. Outra tecla ou nada: repete uma vez.
//   p=status  — StatusCallback no fim da chamada: completed/no-answer/busy/failed vão para o alerta.
// Atender e desligar não conta: só a tecla 1 para os avisos (decisão de 12/11, após teste que caiu na caixa postal).
// Token: HMAC-SHA256 do alerta_id com SLA_COLETOR_KEY; sem token válido, responde 403.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { SLA_VOZ_URL, tokenAlerta } from "../_shared/sla.ts";

const BASE = SLA_VOZ_URL;
const ORIGEM: Record<string, string> = { ps: "Pronto Socorro", internado: "Internado", externo: "Externo" };
const VOZ = 'language="pt-BR" voice="Polly.Camila"';
const xml = (corpo: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${corpo}</Response>`, { headers: { "Content-Type": "text/xml" } });
const esc = (t: string) => t.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const alertaId = u.searchParams.get("a") ?? "", passo = u.searchParams.get("p") ?? "inicio";
  if (!alertaId || u.searchParams.get("t") !== (await tokenAlerta(alertaId))) return new Response("forbidden", { status: 403 });
  const form = req.method === "POST" ? await req.formData().catch(() => null) : null;
  const campo = (n: string) => String(form?.get(n) ?? u.searchParams.get(n) ?? "");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: al } = await admin.from("sla_alertas").select("id, exame_id, destino_nome, tipo, status").eq("id", alertaId).maybeSingle();
  if (!al) return xml(`<Hangup/>`);
  const { data: ex } = await admin.from("sla_exames").select("id, origem, inicio_em, vence_em, assumido_em, unidade, paciente, estudo").eq("id", al.exame_id).maybeSingle();
  const atrasoMin = ex ? Math.max(0, Math.round((Date.now() - new Date(ex.vence_em).getTime()) / 60000)) : 0;
  const texto = ex
    ? `Atenção, plantão da radiologia. Alerta de prazo de laudo da G S S. Exame do ${ORIGEM[ex.origem] ?? ex.origem}, `
      + (ex.paciente ? `paciente ${ex.paciente}, ${ex.estudo ? `${ex.estudo}, ` : ""}` : "") + `das ${hora(ex.inicio_em)}, `
      + (atrasoMin > 0 ? `passou do prazo há ${atrasoMin} minutos. ` : `está perto de vencer. `) + `Confira o PACS.`
    : "Atenção, plantão da radiologia. Alerta de prazo de laudo da G S S. Confira o PACS.";
  const qs = (p: string) => esc(`${BASE}?a=${alertaId}&t=${u.searchParams.get("t")}&p=${p}`);

  if (passo === "status") {
    const st = campo("CallStatus"), quem = campo("AnsweredBy");
    // respondido (tecla 1) não é rebaixado pelo status final da chamada
    if (al.status !== "respondido") {
      // "unknown": o Twilio não soube dizer se foi pessoa ou caixa postal (teste de 13/11 caiu assim). Conta como
      // atendida sem a tecla 1; para a escada não muda nada (só a tecla 1 para), muda só o que a tela mostra.
      const atendeu = st === "completed" && (quem === "human" || quem === "" || quem === "unknown");
      await admin.from("sla_alertas").update({
        status: atendeu ? "entregue" : "falhou",
        erro: atendeu ? "atendeu sem apertar 1" : `ligacao ${st}${quem ? ` (${quem})` : ""}`,
      }).eq("id", alertaId);
    }
    return new Response("ok");
  }

  if (passo === "tecla") {
    if (campo("Digits") === "1") {
      const agora = new Date().toISOString();
      await admin.from("sla_alertas").update({ status: "respondido", respondido_em: agora, erro: null }).eq("id", alertaId).is("respondido_em", null);
      if (ex && !ex.assumido_em) {
        await admin.from("sla_exames").update({ assumido_em: agora, assumido_por: al.destino_nome, assumido_via: "ligacao" })
          .eq("id", ex.id).is("assumido_em", null);
      }
      return xml(`<Say ${VOZ}>Laudo assumido. Os avisos deste exame pararam. Obrigado.</Say><Hangup/>`);
    }
    if (u.searchParams.get("r") !== "1") {
      return xml(`<Gather numDigits="1" timeout="8" action="${qs("tecla")}&amp;r=1"><Say ${VOZ}>${esc(texto)} Aperte 1 para assumir o laudo.</Say></Gather><Say ${VOZ}>Nenhuma tecla recebida. Vamos avisar o próximo da escala.</Say><Hangup/>`);
    }
    return xml(`<Say ${VOZ}>Nenhuma tecla recebida. Vamos avisar o próximo da escala.</Say><Hangup/>`);
  }

  // inicio: a detecção de máquina já rodou antes de o Twilio chamar esta URL
  const quem = campo("AnsweredBy");
  if (quem.startsWith("machine") || quem === "fax") {
    await admin.from("sla_alertas").update({ status: "falhou", erro: `caixa postal (${quem})` }).eq("id", alertaId).neq("status", "respondido");
    return xml(`<Hangup/>`);
  }
  return xml(`<Gather numDigits="1" timeout="8" action="${qs("tecla")}"><Say ${VOZ}>${esc(texto)} Aperte 1 para assumir o laudo.</Say></Gather><Redirect method="POST">${qs("tecla")}</Redirect>`);
});
