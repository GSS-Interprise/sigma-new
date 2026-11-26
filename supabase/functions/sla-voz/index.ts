// Roteiro da ligação de alerta de SLA de laudos (Twilio Voice chama esta função; não há usuário logado).
// Fluxo (cada chamada do Twilio traz ?a=<alerta_id>&t=<token>&p=<passo>):
//   p=inicio  — atendeu: fala o alerta na hora e pede "aperte 1" (Gather). A detecção de máquina roda em paralelo
//               (AsyncAmd, desde 13/11: com a detecção antes da fala, quem atendia ouvia segundos de silêncio).
//   p=amd     — resultado da detecção: só anota "possivel caixa postal" (desde 24/11 não derruba: errava com pessoa calada).
//   p=tecla   — Digits=1: marca o exame como assumido e agradece. Outra tecla ou nada: repete uma vez.
//   p=status  — StatusCallback no fim da chamada: completed/no-answer/busy/failed vão para o alerta.
// Atender e desligar não conta: só a tecla 1 para os avisos (decisão de 12/11, após teste que caiu na caixa postal).
// Token: HMAC-SHA256 do alerta_id com SLA_COLETOR_KEY; sem token válido, responde 403.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { SLA_VOZ_URL, tokenAlerta } from "../_shared/sla.ts";

const BASE = SLA_VOZ_URL;
const ORIGEM: Record<string, string> = { ps: "Pronto Socorro", internado: "Internado", externo: "Externo" };
// Unidade dita na ligação (Ramone, 25/11: "teria que dizer qual é a instituição"). Mesmo nome dos avisos de WhatsApp.
const UNIDADE: Record<string, string> = { marieta: "Hospital Marieta", cepon: "CEPON", tijucas: "Tijucas", mobilemed: "Mobilemed", teste: "unidade de teste" };
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

  const { data: al } = await admin.from("sla_alertas").select("id, exame_id, destino_nome, tipo, status, grupo").eq("id", alertaId).maybeSingle();
  if (!al) return xml(`<Hangup/>`);
  // Ligação agrupada (26/11): um alerta por exame com o mesmo grupo; a ligação fala quantos são, o mais atrasado
  // primeiro, e a tecla 1 assume todos. Status e respostas valem para todas as linhas do grupo.
  const { data: doGrupo } = al.grupo
    ? await admin.from("sla_alertas").select("exame_id").eq("grupo", al.grupo)
    : { data: [{ exame_id: al.exame_id }] };
  const { data: exs } = await admin.from("sla_exames").select("id, origem, inicio_em, vence_em, assumido_em, unidade, paciente, estudo")
    .in("id", (doGrupo ?? []).map((x: any) => x.exame_id)).order("vence_em").order("id");
  const ex = (exs ?? [])[0] ?? null;
  const n = (exs ?? []).length;
  const alvoAlertas = al.grupo ? { col: "grupo", val: al.grupo } : { col: "id", val: alertaId };
  const atrasoMin = ex ? Math.max(0, Math.round((Date.now() - new Date(ex.vence_em).getTime()) / 60000)) : 0;
  const texto = ex && n > 1
    ? `Atenção, plantão da radiologia. Alerta de prazo de laudo da G S S, ${UNIDADE[ex.unidade] ?? ex.unidade}. São ${n} exames sem laudo. `
      + `O mais atrasado é do ${ORIGEM[ex.origem] ?? ex.origem}, ${ex.estudo ? `${ex.estudo}, ` : ""}das ${hora(ex.inicio_em)}, `
      + (atrasoMin > 0 ? `passou do prazo há ${atrasoMin} minutos. ` : `está perto de vencer. `) + `Confira o PACS.`
    : ex
    ? `Atenção, plantão da radiologia. Alerta de prazo de laudo da G S S, ${UNIDADE[ex.unidade] ?? ex.unidade}. Exame do ${ORIGEM[ex.origem] ?? ex.origem}, `
      // Sem nome do paciente (24/11): a ligação pode cair na caixa postal e o recado fica gravado. Estudo e hora bastam.
      + (ex.estudo ? `${ex.estudo}, ` : "") + `das ${hora(ex.inicio_em)}, `
      + (atrasoMin > 0 ? `passou do prazo há ${atrasoMin} minutos. ` : `está perto de vencer. `) + `Confira o PACS.`
    : "Atenção, plantão da radiologia. Alerta de prazo de laudo da G S S. Confira o PACS.";
  const qs = (p: string) => esc(`${BASE}?a=${alertaId}&t=${u.searchParams.get("t")}&p=${p}`);

  if (passo === "amd") {
    // 24/11 (Raul): a detecção do Twilio dá "caixa postal" para quem atende calado (machine_start e até
    // machine_end_beep, testes com Raul e Ramone). NÃO derruba mais a ligação: a mensagem toca até o fim e só a tecla
    // 1 assume o exame. Aqui só anota a suspeita. Por isso a fala não diz mais o nome do paciente (ver "texto"): se
    // for mesmo caixa postal, o recado gravado não tem dado de paciente.
    const quem = campo("AnsweredBy");
    if (quem.startsWith("machine") || quem === "fax") {
      await admin.from("sla_alertas").update({ erro: `possivel caixa postal (${quem})` }).eq(alvoAlertas.col, alvoAlertas.val).neq("status", "respondido");
    }
    return new Response("ok");
  }

  if (passo === "status") {
    const st = campo("CallStatus"), quem = campo("AnsweredBy");
    // respondido (tecla 1) não é rebaixado pelo status final; caixa postal já registrada pelo p=amd também não.
    const { data: atual } = await admin.from("sla_alertas").select("erro").eq("id", alertaId).maybeSingle();
    const suspeita = String(atual?.erro || "").startsWith("possivel caixa postal");
    if (al.status !== "respondido" && suspeita) {
      await admin.from("sla_alertas").update({ status: "falhou" }).eq(alvoAlertas.col, alvoAlertas.val).neq("status", "respondido");
    } else if (al.status !== "respondido" && !String(atual?.erro || "").startsWith("caixa postal")) {
      // "unknown": o Twilio não soube dizer se foi pessoa ou caixa postal (teste de 13/11 caiu assim). Conta como
      // atendida sem a tecla 1; para a escada não muda nada (só a tecla 1 para), muda só o que a tela mostra.
      const atendeu = st === "completed" && (quem === "human" || quem === "" || quem === "unknown");
      await admin.from("sla_alertas").update({
        status: atendeu ? "entregue" : "falhou",
        erro: atendeu ? "atendeu sem apertar 1" : `ligacao ${st}${quem ? ` (${quem})` : ""}`,
      }).eq(alvoAlertas.col, alvoAlertas.val).neq("status", "respondido");
    }
    return new Response("ok");
  }

  if (passo === "tecla") {
    if (campo("Digits") === "1") {
      const agora = new Date().toISOString();
      await admin.from("sla_alertas").update({ status: "respondido", respondido_em: agora, erro: null }).eq(alvoAlertas.col, alvoAlertas.val).is("respondido_em", null);
      const abertos = (exs ?? []).filter((x: any) => !x.assumido_em).map((x: any) => x.id);
      if (abertos.length) {
        await admin.from("sla_exames").update({ assumido_em: agora, assumido_por: al.destino_nome, assumido_via: "ligacao" })
          .in("id", abertos).is("assumido_em", null);
      }
      return xml(`<Say ${VOZ}>${n > 1 ? `${n} laudos assumidos. Os avisos destes exames pararam.` : "Laudo assumido. Os avisos deste exame pararam."} Obrigado.</Say><Hangup/>`);
    }
    if (u.searchParams.get("r") !== "1") {
      return xml(`<Gather numDigits="1" timeout="8" action="${qs("tecla")}&amp;r=1"><Say ${VOZ}>${esc(texto)} ${n > 1 ? "Aperte 1 para assumir todos." : "Aperte 1 para assumir o laudo."}</Say></Gather><Say ${VOZ}>Nenhuma tecla recebida. Vamos avisar o próximo da escala.</Say><Hangup/>`);
    }
    return xml(`<Say ${VOZ}>Nenhuma tecla recebida. Vamos avisar o próximo da escala.</Say><Hangup/>`);
  }

  // inicio: fala na hora (a detecção de caixa postal chega depois, em p=amd)
  return xml(`<Gather numDigits="1" timeout="8" action="${qs("tecla")}"><Say ${VOZ}>${esc(texto)} ${n > 1 ? "Aperte 1 para assumir todos." : "Aperte 1 para assumir o laudo."}</Say></Gather><Redirect method="POST">${qs("tecla")}</Redirect>`);
});
