import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, Loader2, CheckCircle2, AlertTriangle, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { gerarFechamentoPdf } from "@/lib/fechamentoPdf";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const mesLabel = (m: number) => MESES[m - 1] ?? String(m);

const STATUS_LABEL: Record<string, string> = {
  aguardando_aprovacao: "Aguardando aprovação da diretoria",
  aprovado: "Aprovado pela diretoria",
  pago: "Pago",
  cancelado: "Cancelado",
};

const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const sanitize = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9.\-_]/g, "_");

type Resumo = { total: number; qtd: number };
type Fechamento = { id: string; status: string; total: number; qtd_medicos: number };

// Posta a mensagem de fechamento no canal de aprovação e devolve o id da mensagem.
// Segue o padrão de postarNoCanalFinanceiro (useFinanceiroData): insere a mensagem e
// cria uma notificação por participante (exceto o autor) — é a notificação que dispara
// o Web Push do João (diretoria). Retorna null se o canal não estiver configurado.
async function postarFechamentoNoCanal(mensagem: string, fechamentoId: string): Promise<string | null> {
  const { data: cfg } = await (supabase as any)
    .from("config_lista_items")
    .select("valor")
    .eq("campo_nome", "financeiro_canal_aprovacao_id")
    .maybeSingle();
  const canalId = cfg?.valor as string | undefined;
  if (!canalId) return null;

  const { data: uRes } = await supabase.auth.getUser();
  const uid = uRes?.user?.id;
  const nome =
    (uRes?.user?.user_metadata as any)?.nome_completo ||
    (uRes?.user?.user_metadata as any)?.nome ||
    "Financeiro";

  const { data: m, error } = await (supabase as any)
    .from("comunicacao_mensagens")
    .insert({ canal_id: canalId, user_id: uid, user_nome: nome, mensagem,
      acao: { tipo: "aprovar_fechamento", referencia_id: fechamentoId, status: "pendente" } })
    .select("id")
    .single();
  if (error || !m) return null;

  const { data: parts } = await (supabase as any)
    .from("comunicacao_participantes")
    .select("user_id")
    .eq("canal_id", canalId);
  const notifs = (parts ?? [])
    .filter((p: any) => p.user_id !== uid)
    .map((p: any) => ({ user_id: p.user_id, canal_id: canalId, mensagem_id: m.id }));
  if (notifs.length) await (supabase as any).from("comunicacao_notificacoes").insert(notifs);

  return m.id as string;
}

export function FinanceiroFecharDialog({ mes, ano }: { mes: number; ano: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [fechando, setFechando] = useState(false);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [fechamento, setFechamento] = useState<Fechamento | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const carregar = async () => {
    setCarregando(true);
    setResumo(null);
    setFechamento(null);
    try {
      // Resumo do mês: soma dos valores e contagem de médicos dos pagamentos da competência.
      const { data: pags, error: errPags } = await (supabase as any)
        .from("financeiro_pagamentos")
        .select("valor_total, medico_id, profissional_crm, profissional_nome")
        .eq("mes_referencia", mes)
        .eq("ano_referencia", ano);
      if (errPags) throw errPags;
      const lista = (pags ?? []) as { valor_total: number | null; medico_id: string | null; profissional_crm: string | null; profissional_nome: string | null }[];
      const total = lista.reduce((s, p) => s + Number(p.valor_total || 0), 0);
      // Conta MÉDICOS distintos — cada médico pode ter várias linhas (unidades/plantões).
      const medicos = new Set(lista.map((p) => p.medico_id || p.profissional_crm || p.profissional_nome || ""));
      setResumo({ total, qtd: medicos.size });

      // Já existe fechamento para o mês?
      const { data: fech } = await (supabase as any)
        .from("financeiro_fechamentos")
        .select("id, status, total, qtd_medicos")
        .eq("mes_referencia", mes)
        .eq("ano_referencia", ano)
        .maybeSingle();
      if (fech) setFechamento(fech as Fechamento);
    } catch (e: any) {
      toast.error("Erro ao carregar o resumo do mês: " + (e?.message || ""));
    }
    setCarregando(false);
  };

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) carregar();
  };

  const fechar = async () => {
    if (!resumo) return;
    if (resumo.qtd === 0) {
      toast.error("Nenhum pagamento nessa competência. Importe a produção antes de fechar.");
      return;
    }
    if (fechamento && (fechamento.status === "aprovado" || fechamento.status === "pago")) {
      toast.error(`Este mês já foi ${fechamento.status === "pago" ? "pago" : "aprovado"} — não pode ser refechado.`);
      return;
    }
    setFechando(true);
    try {
      const { data: uRes } = await supabase.auth.getUser();
      const uid = uRes?.user?.id ?? null;

      // Relatório PDF do fechamento → cofre privado, pra o João abrir e conferir os lançamentos.
      // SEMPRE gera automaticamente com os lançamentos; se a Mavi anexou um PDF próprio, usa o dela.
      let pdfPath: string | undefined;
      try {
        const { data: pags } = await (supabase as any)
          .from("financeiro_pagamentos")
          .select("profissional_nome, profissional_crm, unidade, total_plantoes, valor_total, medico_id")
          .eq("mes_referencia", mes).eq("ano_referencia", ano);
        const arquivo: File = pdfFile
          ?? new File([gerarFechamentoPdf(mes, ano, (pags ?? []) as any[], resumo.total)], `fechamento_${ano}-${String(mes).padStart(2, "0")}.pdf`, { type: "application/pdf" });
        const p = `fechamentos/${ano}-${String(mes).padStart(2, "0")}/${Date.now()}_${sanitize(arquivo.name)}`;
        const { error: upErr } = await supabase.storage.from("financeiro-anexos").upload(p, arquivo, { contentType: "application/pdf" });
        if (upErr) throw upErr;
        pdfPath = p;
      } catch (e) {
        // se o PDF falhar, o fechamento continua (não trava o fluxo).
        console.error("[fechamento] falha ao gerar/subir PDF", e);
      }

      // Upsert do fechamento (UNIQUE mes/ano). Reabre para aguardando_aprovacao caso já exista.
      const { data: fech, error: errFech } = await (supabase as any)
        .from("financeiro_fechamentos")
        .upsert(
          {
            mes_referencia: mes,
            ano_referencia: ano,
            status: "aguardando_aprovacao",
            total: resumo.total,
            qtd_medicos: resumo.qtd,
            criado_por: uid,
            ...(pdfPath ? { pdf_path: pdfPath } : {}),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "mes_referencia,ano_referencia" }
        )
        .select("id")
        .single();
      if (errFech || !fech) throw errFech || new Error("Falha ao gravar o fechamento.");

      // Vincula os pagamentos do mês ao fechamento.
      const { error: errLink } = await (supabase as any)
        .from("financeiro_pagamentos")
        .update({ fechamento_id: fech.id })
        .eq("mes_referencia", mes)
        .eq("ano_referencia", ano);
      if (errLink) throw errLink;

      // Posta no canal de aprovação (dispara push do João).
      const msg =
        `📋 *Fechamento ${String(mes).padStart(2, "0")}/${ano}* — ${brl(resumo.total)}, ${resumo.qtd} médico${resumo.qtd === 1 ? "" : "s"}.\n` +
        `João, aprove aqui mesmo no canal. 👇`;
      const msgId = await postarFechamentoNoCanal(msg, fech.id);

      if (msgId) {
        await (supabase as any)
          .from("financeiro_fechamentos")
          .update({ canal_msg_id: msgId })
          .eq("id", fech.id);
      }

      qc.invalidateQueries({ queryKey: ["financeiro-pagamentos"] });
      qc.invalidateQueries({ queryKey: ["financeiro-fechamentos"] });
      qc.invalidateQueries({ queryKey: ["financeiro-fases"] });
      toast.success(
        msgId
          ? "Mês fechado e enviado para aprovação da diretoria."
          : "Mês fechado. (Canal de aprovação não configurado — configure em config_lista_items.financeiro_canal_aprovacao_id)"
      );
      setFechamento({ id: fech.id, status: "aguardando_aprovacao", total: resumo.total, qtd_medicos: resumo.qtd });
    } catch (e: any) {
      toast.error("Erro ao fechar o mês: " + (e?.message || ""));
    }
    setFechando(false);
  };

  const jaFechado = !!fechamento && fechamento.status !== "cancelado";
  const bloqueado = !!fechamento && (fechamento.status === "aprovado" || fechamento.status === "pago");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Lock className="h-4 w-4" /> Enviar para aprovação
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Fechar {mesLabel(mes)}/{ano}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          Consolida os pagamentos da competência e envia para a diretoria aprovar.
        </p>

        <div className="space-y-4">
          {carregando && (
            <p className="text-sm text-muted-foreground flex items-center gap-2 py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando resumo…
            </p>
          )}

          {!carregando && resumo && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5" /> Total
                </p>
                <p className="text-lg font-bold mt-1 break-words">{brl(resumo.total)}</p>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Médicos
                </p>
                <p className="text-lg font-bold mt-1">{resumo.qtd}</p>
              </div>
            </div>
          )}

          {!carregando && resumo && resumo.qtd > 0 && !bloqueado && (
            <div>
              <label className="text-xs text-muted-foreground">PDF do fechamento — geramos um <b>automático</b> com os lançamentos. Anexe aqui só se quiser usar um relatório próprio.</label>
              <input type="file" accept=".pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm mt-1 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-secondary-foreground" />
              {pdfFile && <p className="text-xs text-muted-foreground mt-1">📄 {pdfFile.name}</p>}
            </div>
          )}

          {!carregando && jaFechado && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
              <p className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium">
                <AlertTriangle className="h-4 w-4" /> Mês já fechado
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Status atual: <b>{STATUS_LABEL[fechamento!.status] ?? fechamento!.status}</b>.
                {fechamento!.status === "aguardando_aprovacao"
                  ? " Fechar de novo reenvia para a diretoria."
                  : ""}
              </p>
            </div>
          )}

          {!carregando && resumo && resumo.qtd === 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" /> Nenhum pagamento nessa competência. Importe a produção primeiro.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={fechar}
            disabled={carregando || fechando || !resumo || resumo.qtd === 0 || bloqueado}
            className="w-full sm:w-auto gap-2"
          >
            {fechando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {bloqueado ? "Já aprovado — não refecha" : jaFechado ? "Reenviar para aprovação" : "Fechar e enviar para aprovação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
