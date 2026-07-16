import { useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Upload, ShieldCheck, XCircle, FileText } from "lucide-react";
import { toast } from "sonner";

// Ação inline numa mensagem de canal (fluxo financeiro dentro da Comunicação):
//  - aprovar_fechamento  → João (diretoria) aprova no próprio chat; dispara o canal
//    de Comprovantes com o botão de enviar comprovantes pra Thais.
//  - enviar_comprovantes → Thais (financeiro) sobe os PDFs DIRETO no cofre privado
//    (bucket financeiro-anexos), nunca no anexo público do chat; o sistema casa cada
//    um ao médico (edge financeiro-processar-comprovantes).
//
// IMPORTANTE: o estado é derivado da FONTE DE VERDADE (financeiro_fechamentos), NÃO
// do jsonb da mensagem — porque o RLS de comunicacao_mensagens só deixa o autor/criador
// editar a mensagem, e quem aprova (João) não é o autor. Assim não precisamos editá-la.

type Acao = { tipo?: string; referencia_id?: string; status?: string; label?: string };

const sanitize = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9.\-_]/g, "_");
const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function postarNoCanalPorConfig(campoNome: string, mensagem: string, autorId?: string, autorNome?: string, acao?: Acao) {
  const { data: cfg } = await (supabase as any)
    .from("config_lista_items").select("valor").eq("campo_nome", campoNome).maybeSingle();
  const canalId = cfg?.valor as string | undefined;
  if (!canalId) return { posted: false };
  const { data: m, error } = await (supabase as any)
    .from("comunicacao_mensagens")
    .insert({ canal_id: canalId, user_id: autorId, user_nome: autorNome || "Financeiro", mensagem, acao: acao ?? null })
    .select("id").single();
  if (error || !m) return { posted: false };
  const { data: parts } = await (supabase as any)
    .from("comunicacao_participantes").select("user_id").eq("canal_id", canalId);
  const notifs = (parts ?? []).filter((p: any) => p.user_id !== autorId)
    .map((p: any) => ({ user_id: p.user_id, canal_id: canalId, mensagem_id: m.id }));
  if (notifs.length) await (supabase as any).from("comunicacao_notificacoes").insert(notifs);
  return { posted: true };
}

function EstadoBadge({ tone, children }: { tone: "ok" | "no"; children: ReactNode }) {
  const cls = tone === "ok"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-red-50 text-red-700 border-red-200";
  const Icon = tone === "ok" ? CheckCircle2 : XCircle;
  return (
    <div className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold rounded-md border px-2 py-1 ${cls}`}>
      <Icon className="h-3.5 w-3.5" /> {children}
    </div>
  );
}

export function MensagemAcao({ mensagem, currentUserId, currentUserNome }: { mensagem: any; currentUserId?: string; currentUserNome?: string }) {
  const acao = (mensagem?.acao || {}) as Acao;
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: roles = [] } = useQuery({
    queryKey: ["meus-roles", currentUserId],
    queryFn: async () => {
      if (!currentUserId) return [] as string[];
      const { data } = await (supabase as any).from("user_roles").select("role").eq("user_id", currentUserId);
      return ((data ?? []) as any[]).map((r) => r.role as string);
    },
    enabled: !!currentUserId,
    staleTime: 5 * 60 * 1000,
  });
  const isAdmin = roles.includes("admin");
  const podeAprovar = isAdmin || roles.includes("diretoria");
  const podePagar = isAdmin || roles.includes("gestor_financeiro");

  // Estado real do fechamento referenciado (fonte de verdade).
  const fechId = acao?.referencia_id;
  const { data: fech } = useQuery({
    queryKey: ["fechamento-acao", fechId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("financeiro_fechamentos")
        .select("id, mes_referencia, ano_referencia, total, qtd_medicos, status, pdf_path")
        .eq("id", fechId).maybeSingle();
      return data as any;
    },
    enabled: !!fechId && (acao?.tipo === "aprovar_fechamento" || acao?.tipo === "enviar_comprovantes"),
  });
  const status = fech?.status as string | undefined;

  if (!acao?.tipo) return null;

  // ---- Aprovar fechamento (João / diretoria) ----
  if (acao.tipo === "aprovar_fechamento") {
    const verPdf = fech?.pdf_path ? (
      <Button variant="outline" size="sm" className="mt-2 h-9 gap-1.5" onClick={async () => {
        const { data } = await supabase.storage.from("financeiro-anexos").createSignedUrl(fech.pdf_path, 3600);
        if (data?.signedUrl) window.open(data.signedUrl, "_blank");
        else toast.error("Não foi possível abrir o relatório do fechamento.");
      }}><FileText className="h-4 w-4" /> Ver fechamento</Button>
    ) : null;

    if (status === "aprovado" || status === "pago") return <div className="flex flex-wrap gap-2 items-center">{verPdf}<EstadoBadge tone="ok">Aprovado</EstadoBadge></div>;
    if (status === "cancelado") return <EstadoBadge tone="no">Rejeitado</EstadoBadge>;
    if (!podeAprovar) return <div>{verPdf}<div className="mt-1 text-xs text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Aguardando aprovação da diretoria…</div></div>;

    const aprovar = async () => {
      setLoading(true);
      try {
        const { data: upd, error } = await (supabase as any).from("financeiro_fechamentos")
          .update({ status: "aprovado", aprovado_por: currentUserId, aprovado_em: new Date().toISOString() })
          .eq("id", fechId).eq("status", "aguardando_aprovacao").select("id");
        if (error) throw error;
        if (!upd || upd.length === 0) { toast.error("Este fechamento já foi processado."); qc.invalidateQueries({ queryKey: ["fechamento-acao", fechId] }); setLoading(false); return; }
        const comp = fech ? `${String(fech.mes_referencia).padStart(2, "0")}/${fech.ano_referencia}` : "";
        const msg = `✅ *Fechamento ${comp} aprovado* por ${currentUserNome || "Diretoria"} — ${brl(fech?.total)}, ${fech?.qtd_medicos || 0} médico(s).\nThais, envie os comprovantes aqui neste canal. 👇`;
        await postarNoCanalPorConfig("financeiro_canal_comprovantes_id", msg, currentUserId, currentUserNome, { tipo: "enviar_comprovantes", referencia_id: fechId, status: "pendente" });
        qc.invalidateQueries({ queryKey: ["fechamento-acao", fechId] });
        toast.success("Fechamento aprovado! A Thais foi avisada no canal de Comprovantes.");
      } catch (e: any) {
        toast.error("Erro ao aprovar: " + (e?.message || ""));
      }
      setLoading(false);
    };
    return (
      <div className="flex flex-wrap gap-2 items-center">
        {verPdf}
        <Button onClick={aprovar} disabled={loading} size="sm" className="mt-2 h-9 gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Aprovar pagamento
        </Button>
      </div>
    );
  }

  // ---- Enviar comprovantes (Thais / financeiro) ----
  if (acao.tipo === "enviar_comprovantes") {
    if (status === "pago") return <EstadoBadge tone="ok">Pagamentos concluídos</EstadoBadge>;
    if (!podePagar) return <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1"><Upload className="h-3.5 w-3.5" /> Aguardando os comprovantes do financeiro…</div>;

    const onFiles = async (files: FileList | null) => {
      if (!files || !files.length) return;
      setLoading(true);
      try {
        const paths: { path: string; nome: string; mime: string }[] = [];
        for (const file of Array.from(files)) {
          const path = `comprovantes/${Date.now()}_${sanitize(file.name)}`;
          const { error: upErr } = await supabase.storage.from("financeiro-anexos").upload(path, file, { contentType: file.type });
          if (upErr) throw upErr;
          paths.push({ path, nome: file.name, mime: file.type });
        }
        const { data, error } = await supabase.functions.invoke("financeiro-processar-comprovantes", { body: { paths } });
        if (error || (data as any)?.ok === false) throw new Error(error?.message || (data as any)?.error || "Erro ao processar");
        const nC = (data as any)?.casados?.length ?? 0;
        const nP = (data as any)?.pendentes?.length ?? 0;
        const msg = `📎 *${paths.length} comprovante(s) enviado(s)* por ${currentUserNome || "Financeiro"}.\n✅ ${nC} casado(s) e marcados como pagos${nP ? ` · ⚠️ ${nP} para revisão em /financeiro/comprovantes` : ""}.`;
        await postarNoCanalPorConfig("financeiro_canal_comprovantes_id", msg, currentUserId, currentUserNome);
        toast.success(`${nC} comprovante(s) casado(s), ${nP} para revisão.`);
      } catch (e: any) {
        toast.error("Erro ao enviar comprovantes: " + (e?.message || ""));
      }
      setLoading(false);
    };
    return (
      <div className="mt-2">
        <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        <Button onClick={() => fileRef.current?.click()} disabled={loading} size="sm" className="h-9 gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Enviar comprovantes
        </Button>
        <p className="text-[11px] text-muted-foreground mt-1">Sobe direto pro cofre privado do financeiro — pode selecionar vários PDFs de uma vez.</p>
      </div>
    );
  }

  return null;
}
