// Motor automático do LinkedIn (Fase 9.4): envia convite com nota pela conta da GSS conectada na Unipile.
// pg_cron chama { action: "rodar" } a cada 10 min em dia útil, 8h-18h de Brasília. Cada rodada envia no máximo UM convite
// por conta, e só se a conta estiver com o motor ligado (linkedin_contas.automatico, liga em Configurações), dentro do
// limite do dia e da semana e depois do intervalo aleatório. Desenho e ritmo: docs/arquitetura/linkedin-instagram-campanha.md.
// Endpoints da Unipile v2 (doc "LinkedIn manage invitations" e "fetch users profiles"):
//   GET  /{account_id}/users/{public_identifier}?variant=linkedin_classic   → id do membro (ACo...)
//   POST /{account_id}/users/me/relation-requests  { user_id, message }    → convite com nota
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { unipile } from "../_shared/unipile.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const BASE_DIA = 5, SOBE_POR_SEMANA = 3;
// Só envia para perfil cadastrado à mão (sem nota) ou achado com confiança alta: convite para a pessoa errada queima a conta.
const CONFIANCA_MIN = 85;

async function ehServiceRole(token: string) {
  if (token && token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (p?.role !== "service_role") return false;
  } catch { return false; }
  const { error } = await createClient(Deno.env.get("SUPABASE_URL")!, token, { auth: { persistSession: false } })
    .from("integracao_segredos").select("nome").limit(1);
  return !error;
}

const inicioDoDiaSP = () => {
  const sp = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const dif = Date.now() - sp.getTime();
  sp.setHours(0, 0, 0, 0);
  return new Date(sp.getTime() + dif);
};

const primeiroNome = (n: string) => String(n || "").trim().split(/\s+/)[0]?.toLowerCase().replace(/^./, (c) => c.toUpperCase()) || "";
const especialidadeCurta = (e: string | null) => String(e || "").replace(/^&/, "").split(/ - RQE|\(/)[0].trim().toLowerCase();

// MESMO texto da fila assistida (src/components/campanhas/redes/FilaRedes.tsx, textoConvite): mudar um, mudar o outro.
function textoConvite(i: any) {
  const esp = especialidadeCurta(i.especialidade);
  const onde = String(i.cidade_vaga || "").trim() || "Santa Catarina";
  const t = `Olá, Dr(a). ${primeiroNome(i.nome)}! Sou o Dr. Maikon Madeira, cirurgião cardiovascular e sócio da GSS Saúde. `
    + `Temos plantões ${esp ? `de ${esp} ` : ""}em ${onde} e gostaria de me conectar para te passar os detalhes. Faz sentido para você?`;
  return t.length > 300 ? t.slice(0, 297) + "..." : t;
}

const identificador = (url: string) => String(url || "").match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1] || null;

async function rodarConta(admin: any, conta: any) {
  const agora = new Date();
  if (conta.proximo_envio_em && new Date(conta.proximo_envio_em) > agora) return { conta: conta.id, pulou: "intervalo" };

  const semanas = conta.rampa_inicio ? Math.floor((agora.getTime() - new Date(conta.rampa_inicio).getTime()) / (7 * 86_400_000)) : 0;
  const limiteDia = Math.min(BASE_DIA + SOBE_POR_SEMANA * semanas, conta.convites_dia_teto ?? 20);
  const { count: hoje } = await admin.from("campanha_toques").select("id", { count: "exact", head: true })
    .eq("linkedin_conta_id", conta.id).eq("canal", "linkedin").gte("executado_em", inicioDoDiaSP().toISOString());
  if ((hoje ?? 0) >= limiteDia) return { conta: conta.id, pulou: `limite do dia (${limiteDia})` };
  const { count: semana } = await admin.from("campanha_toques").select("id", { count: "exact", head: true })
    .eq("linkedin_conta_id", conta.id).eq("canal", "linkedin").gte("executado_em", new Date(agora.getTime() - 7 * 86_400_000).toISOString());
  if ((semana ?? 0) >= (conta.convites_semana_max ?? 80)) return { conta: conta.id, pulou: "limite da semana" };

  const { data: fila, error } = await admin.rpc("fila_redes_do_dia", { p_canal: "linkedin", p_limite: 20 });
  if (error) throw error;
  const item = (fila?.itens || []).find((i: any) => (i.confianca == null || i.confianca >= CONFIANCA_MIN) && identificador(i.url_perfil));
  if (!item) return { conta: conta.id, pulou: "fila vazia" };

  const acc = encodeURIComponent(conta.gateway_account_id);
  const registrar = async (status: "feito" | "pulado" | "falhou", extra: Record<string, unknown> = {}) => {
    await admin.from("campanha_toques").insert({
      campanha_lead_id: item.campanha_lead_id, canal: "linkedin", tipo: "conexao", status, modo: "automatico",
      url_perfil: item.url_perfil, linkedin_conta_id: conta.id, executado_em: new Date().toISOString(), ...extra,
    });
  };
  // Próximo envio desta conta: 12 a 35 min (intervalo humano, nunca dois convites seguidos).
  const proximo = new Date(agora.getTime() + (12 + Math.random() * 23) * 60_000).toISOString();

  let membro: string | null = null;
  try {
    const p = await unipile(`/${acc}/users/${encodeURIComponent(identificador(item.url_perfil)!)}?variant=linkedin_classic`);
    membro = p?.id || p?.provider_id || p?.member_id || null;
    // Já conectado ou convite pendente: não manda de novo (o toque fica "pulado" com o motivo).
    if (p?.is_relationship || p?.network_distance === "FIRST_DEGREE" || p?.invitation?.status === "PENDING") {
      await registrar("pulado", { destino_id: membro, observacao: "já conectado ou com convite pendente" });
      return { conta: conta.id, pulou: "já conectado" };
    }
  } catch (e: any) {
    if (e.status === 404) { await registrar("pulado", { observacao: "perfil não existe mais" }); return { conta: conta.id, pulou: "perfil não existe" }; }
    throw e;
  }
  if (!membro) { await registrar("pulado", { observacao: "perfil sem id de membro" }); return { conta: conta.id, pulou: "sem id" }; }

  const texto = textoConvite(item);
  try {
    await unipile(`/${acc}/users/me/relation-requests`, { method: "POST", body: JSON.stringify({ user_id: membro, message: texto }) });
  } catch (e: any) {
    const bruto = JSON.stringify(e.dados || {}).toLowerCase();
    // Limite do LinkedIn ou conta restrita: para o motor desta conta. Volta só quando um administrador ligar de novo.
    if (e.status === 429 || /limit|restrict|captcha|checkpoint|blocked/.test(bruto)) {
      await admin.from("linkedin_contas").update({ automatico: false, motor_motivo: `pausado sozinho: ${e.message}`.slice(0, 300), atualizado_em: new Date().toISOString() }).eq("id", conta.id);
      return { conta: conta.id, pausou: e.message };
    }
    await registrar("falhou", { destino_id: membro, texto_sugerido: texto, observacao: String(e.message).slice(0, 300) });
    await admin.from("linkedin_contas").update({ proximo_envio_em: proximo }).eq("id", conta.id);
    return { conta: conta.id, falhou: e.message };
  }

  await registrar("feito", { destino_id: membro, texto_sugerido: texto });
  await admin.from("lead_historico").insert({
    lead_id: item.lead_id, tipo_evento: "outro", descricao_resumida: "Convite enviado no LinkedIn (automático)",
    metadados: { tipo: "toque_rede", canal: "linkedin", modo: "automatico", campanha_lead_id: item.campanha_lead_id, linkedin_conta_id: conta.id },
  });
  await admin.from("linkedin_contas").update({ proximo_envio_em: proximo, ultimo_evento_em: new Date().toISOString() }).eq("id", conta.id);
  return { conta: conta.id, enviou: item.campanha_lead_id };
}

Deno.serve(async (req) => {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!(await ehServiceRole(token))) return json({ ok: false, error: "sem_permissao" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: contas } = await admin.from("linkedin_contas").select("*")
    .eq("provedor", "linkedin").eq("automatico", true).eq("situacao", "conectada");
  const resultados = [];
  for (const conta of contas || []) {
    try { resultados.push(await rodarConta(admin, conta)); }
    catch (e: any) {
      console.error(`[unipile-motor] conta ${conta.id}: ${e.message}`);
      resultados.push({ conta: conta.id, erro: e.message });
    }
  }
  return json({ ok: true, contas: resultados.length, resultados });
});
