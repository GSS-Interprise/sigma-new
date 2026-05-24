import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

/**
 * F1.2 — Envio de emails via Resend com template HTML responsivo.
 *
 * Substitui o envio anterior por Gmail SMTP. Resend tem melhor entregabilidade,
 * webhook de status (open/click/bounce) e suporte a domínio próprio.
 *
 * Pré-requisitos (secrets do projeto Supabase):
 * - RESEND_API_KEY (re_...)
 * - RESEND_FROM_EMAIL (precisa de domínio verificado em resend.com/domains
 *   pra enviar pra qualquer destinatário — caso contrário só envia pro email
 *   da conta Resend)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmailRecipient {
  nome: string;
  telefone: string;
  email?: string;
}

interface SendBulkEmailsRequest {
  assunto: string;
  corpo: string;
  destinatarios: EmailRecipient[];
  tamanhoLote?: number;
  maxRetries?: number;
  /** Override do remetente (precisa domínio verificado). Default: RESEND_FROM_EMAIL. */
  from?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Template HTML responsivo com identidade GSS (verde + branco).
 * Funciona bem em Gmail, Outlook, Apple Mail. Inline styles obrigatórios
 * pra clients que strippam <style>.
 */
function buildHtmlEmail({
  nomeDestinatario,
  corpo,
  disparoId,
}: {
  nomeDestinatario: string;
  corpo: string;
  disparoId: string;
}): string {
  const corpoEscapado = corpo
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  const primeiroNome = (nomeDestinatario || "").split(" ")[0] || "Doutor(a)";
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GSS — Gestão Serviços Saúde</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1a3623;line-height:1.5;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f1f5f4;padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">

        <!-- Header verde GSS -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a5a2a 0%,#2d7d3f 100%);padding:24px 32px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td>
                  <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">GSS</div>
                  <div style="font-size:12px;color:#c1e5cc;margin-top:2px;letter-spacing:0.5px;">Gestão Serviços Saúde</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Saudação -->
        <tr>
          <td style="padding:32px 32px 8px 32px;">
            <p style="margin:0;font-size:16px;color:#1a3623;font-weight:600;">
              Olá, Dr(a). ${primeiroNome}
            </p>
          </td>
        </tr>

        <!-- Corpo -->
        <tr>
          <td style="padding:8px 32px 24px 32px;">
            <div style="font-size:15px;color:#3a4d40;line-height:1.65;">
              ${corpoEscapado}
            </div>
          </td>
        </tr>

        <!-- Separador -->
        <tr>
          <td style="padding:0 32px;">
            <div style="height:1px;background-color:#e6edea;"></div>
          </td>
        </tr>

        <!-- Assinatura -->
        <tr>
          <td style="padding:24px 32px;">
            <div style="font-size:13px;color:#5a6e60;line-height:1.5;">
              Atenciosamente,<br>
              <strong style="color:#1a5a2a;">Equipe GSS</strong>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#f8faf9;padding:16px 32px;border-top:1px solid #e6edea;">
            <div style="font-size:11px;color:#8a9d92;line-height:1.5;">
              Você está recebendo este email porque seus dados constam no nosso cadastro de profissionais da saúde.
              Se preferir não receber mais comunicações, é só responder com "sair".
            </div>
            <div style="font-size:10px;color:#b5c4bb;margin-top:8px;">
              Ref: ${disparoId}
            </div>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

async function sendResendEmail({
  apiKey,
  from,
  to,
  subject,
  html,
  maxRetries,
}: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  maxRetries: number;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  let lastError = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to: [to], subject, html }),
      });
      const data = await res.json();
      if (res.ok && data?.id) {
        if (attempt > 0) {
          console.log(`✓ ${to} ok após ${attempt} retries`);
        }
        return { ok: true, id: data.id };
      }
      lastError = data?.message || `HTTP ${res.status}`;
      // Erros 4xx (validação) não vale retry
      if (res.status >= 400 && res.status < 500) {
        return { ok: false, error: lastError };
      }
    } catch (err: any) {
      lastError = err?.message || "network error";
    }
    if (attempt < maxRetries) {
      const backoffMs = Math.pow(2, attempt) * 1000;
      await sleep(backoffMs);
    }
  }
  return { ok: false, error: lastError };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Permissão (igual lógica anterior)
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const isAdmin = roleData?.some((r: any) => r.role === "admin");
    const isGestor = roleData?.some((r: any) => r.role === "gestor_captacao");
    const isLider = roleData?.some((r: any) => r.role === "lideres");

    let allowed = isAdmin || isGestor;

    if (!allowed && isLider) {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("setor_id")
        .eq("id", userId)
        .maybeSingle();
      if (profile?.setor_id) {
        const { data: setor } = await adminClient
          .from("setores")
          .select("nome")
          .eq("id", profile.setor_id)
          .maybeSingle();
        if (setor?.nome && setor.nome.toLowerCase().includes("capta")) {
          allowed = true;
        }
      }
    }

    if (!allowed) {
      const { data: permData } = await adminClient
        .from("captacao_permissoes_usuario")
        .select("pode_disparos_email")
        .eq("user_id", userId)
        .maybeSingle();
      if (permData?.pode_disparos_email) allowed = true;
    }

    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Forbidden: sem permissão para envio de emails" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Resend config ──
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const resendFrom = Deno.env.get("RESEND_FROM_EMAIL");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY não configurada");
    }
    if (!resendFrom) {
      throw new Error("RESEND_FROM_EMAIL não configurada");
    }

    const body: SendBulkEmailsRequest = await req.json();
    const {
      assunto,
      corpo,
      destinatarios,
      tamanhoLote = 50,
      maxRetries = 2,
      from,
    } = body;
    const fromAddress = from || resendFrom;

    if (!assunto?.trim() || !corpo?.trim()) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Assunto e corpo são obrigatórios",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const validos = (destinatarios || []).filter(
      (d) => d.email && d.email.includes("@"),
    );
    if (validos.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Nenhum destinatário com e-mail válido",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`Iniciando envio Resend para ${validos.length} destinatários`);

    let enviados = 0;
    let falhas = 0;
    const detalhes_falhas: Array<{ email?: string; nome?: string; erro: string }> = [];
    const message_ids: string[] = [];

    for (let i = 0; i < validos.length; i += tamanhoLote) {
      const lote = validos.slice(i, i + tamanhoLote);
      const disparoId = `SIGMA-${Date.now().toString(36).toUpperCase()}`;
      console.log(`Lote ${Math.floor(i / tamanhoLote) + 1}: ${lote.length} emails (${disparoId})`);

      const results = await Promise.all(
        lote.map(async (dest) => {
          const assuntoComId = `${assunto} [${disparoId}]`;
          const html = buildHtmlEmail({
            nomeDestinatario: dest.nome,
            corpo,
            disparoId,
          });
          return sendResendEmail({
            apiKey: resendApiKey,
            from: fromAddress,
            to: dest.email!,
            subject: assuntoComId,
            html,
            maxRetries,
          });
        }),
      );

      results.forEach((r, idx) => {
        if (r.ok) {
          enviados++;
          message_ids.push(r.id);
        } else {
          falhas++;
          detalhes_falhas.push({
            email: lote[idx].email,
            nome: lote[idx].nome,
            erro: r.error,
          });
        }
      });

      if (i + tamanhoLote < validos.length) await sleep(500);
    }

    console.log(`Concluído: ${enviados} ok, ${falhas} falhas`);

    return new Response(
      JSON.stringify({
        success: true,
        enviados,
        falhas,
        message_ids,
        detalhes_falhas: falhas > 0 ? detalhes_falhas : null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Erro send-bulk-emails:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "Erro desconhecido",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
