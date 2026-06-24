import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const resendFromEmail = "Sistema SIGMA <bi@gestaoservicosaude.com.br>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EventType = "aguardando_confirmacao" | "concluido";

interface Body {
  ticketId: string;
  event: EventType;
}

const TITLES: Record<EventType, string> = {
  aguardando_confirmacao: "Seu ticket aguarda sua confirmação",
  concluido: "Seu ticket foi encerrado",
};

const COLORS: Record<EventType, string> = {
  aguardando_confirmacao: "#f59e0b",
  concluido: "#16a34a",
};

function buildHtml(opts: {
  event: EventType;
  numero: string;
  destinatarioNome: string;
  descricao: string;
  responsavelNome: string | null;
}) {
  const { event, numero, destinatarioNome, descricao, responsavelNome } = opts;
  const titulo = TITLES[event];
  const color = COLORS[event];
  const cta =
    event === "aguardando_confirmacao"
      ? `<p style="color:#374151;">Por favor, entre no sistema e confirme se o problema foi resolvido ou informe o que ainda persiste.</p>`
      : `<p style="color:#374151;">Este ticket foi marcado como <strong>encerrado</strong>. Se algo ainda não funciona, abra um novo ticket.</p>`;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color:${color};">${titulo} – Ticket ${numero}</h2>
      <p style="color:#374151; font-size:16px;">Olá, <strong>${destinatarioNome}</strong>!</p>
      ${cta}
      <div style="background:#f3f4f6;padding:16px 20px;border-radius:8px;margin:20px 0;">
        <p style="margin:0 0 8px 0;color:#6b7280;font-weight:bold;">Nº do Ticket:</p>
        <p style="margin:0;">${numero}</p>
        ${
          responsavelNome
            ? `<p style="margin:12px 0 4px 0;color:#6b7280;font-weight:bold;">Responsável TI:</p><p style="margin:0;">${responsavelNome}</p>`
            : ""
        }
      </div>
      <div style="margin:20px 0;">
        <h3 style="color:#374151;">Descrição</h3>
        <div style="background:#f9fafb;padding:15px;border-radius:8px;border-left:4px solid ${color};">
          <p style="margin:0;white-space:pre-wrap;">${descricao}</p>
        </div>
      </div>
      <div style="margin-top:30px;padding-top:20px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;">
        <p>Esta é uma mensagem automática do Sistema SIGMA de Gestão de Suporte.</p>
      </div>
    </div>
  `;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticketId, event }: Body = await req.json();
    if (!ticketId || !event) throw new Error("ticketId e event são obrigatórios");
    if (event !== "aguardando_confirmacao" && event !== "concluido") {
      throw new Error("event inválido");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: ticket, error: ticketErr } = await supabase
      .from("suporte_tickets")
      .select(
        "id, numero, descricao, solicitante_id, solicitante_nome, responsavel_ti_nome",
      )
      .eq("id", ticketId)
      .single();
    if (ticketErr || !ticket) throw new Error("Ticket não encontrado");

    // Solicitantes (multi)
    const { data: solicitantes } = await supabase
      .from("suporte_ticket_solicitantes")
      .select("user_id, nome, email")
      .eq("ticket_id", ticketId);

    const userIds = new Set<string>();
    if (ticket.solicitante_id) userIds.add(ticket.solicitante_id);
    (solicitantes || []).forEach((s: any) => s.user_id && userIds.add(s.user_id));

    // Buscar emails atualizados nos profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nome_completo, email")
      .in("id", Array.from(userIds));

    const destinatarios = (profiles || [])
      .filter((p: any) => !!p.email)
      .map((p: any) => ({
        id: p.id,
        nome: p.nome_completo || ticket.solicitante_nome || "",
        email: p.email,
      }));

    if (!destinatarios.length) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum destinatário com email" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const descricaoTruncada = (ticket.descricao || "").length > 1500
      ? (ticket.descricao || "").substring(0, 1500) + "..."
      : (ticket.descricao || "");

    const subject =
      event === "aguardando_confirmacao"
        ? `[#${ticket.numero}] Aguardando sua confirmação`
        : `[#${ticket.numero}] Ticket encerrado`;

    let sent = 0;
    for (const dest of destinatarios) {
      try {
        const html = buildHtml({
          event,
          numero: ticket.numero,
          destinatarioNome: dest.nome,
          descricao: descricaoTruncada,
          responsavelNome: ticket.responsavel_ti_nome || null,
        });
        await resend.emails.send({
          from: resendFromEmail,
          to: dest.email,
          subject,
          html,
        });
        sent++;
        await supabase.from("sigma_email_log").insert({
          modulo: "suporte",
          referencia_id: ticket.id,
          destinatario_nome: dest.nome,
          destinatario_email: dest.email,
          assunto: subject,
          status: "enviado",
          metadata: { ticket_numero: ticket.numero, event },
        });
      } catch (e: any) {
        console.error("Falha ao enviar para", dest.email, e);
        await supabase.from("sigma_email_log").insert({
          modulo: "suporte",
          referencia_id: ticket.id,
          destinatario_nome: dest.nome,
          destinatario_email: dest.email,
          assunto: subject,
          status: "falha",
          erro: e?.message || String(e),
          metadata: { ticket_numero: ticket.numero, event },
        });
      }
    }

    await supabase
      .from("suporte_tickets")
      .update({
        email_enviado_em: new Date().toISOString(),
        email_status: sent > 0 ? "enviado" : "falha",
      })
      .eq("id", ticket.id);

    return new Response(
      JSON.stringify({ success: true, sent, total: destinatarios.length }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: any) {
    console.error("send-ticket-status-email error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
};

serve(handler);