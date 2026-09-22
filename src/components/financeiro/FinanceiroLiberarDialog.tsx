import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle, Send } from "lucide-react";
import { toast } from "sonner";

/**
 * Fase 1 → 2 (reunião com a Mavi, 22/09). A conferência dela É este ato: ela revisa o
 * fechamento inteiro e libera — não clica médico a médico. E o que sai daqui NÃO vai
 * para a diretoria: vai para quem solicita as notas fiscais. A diretoria só entra no
 * fim, para aprovar o pagamento, depois que as notas voltarem (FinanceiroFecharDialog).
 */
const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function avisarCanalFinanceiro(mensagem: string) {
  const { data: cfg } = await (supabase as any)
    .from("config_lista_items").select("valor")
    .eq("campo_nome", "financeiro_canal_id").maybeSingle();
  const canalId = cfg?.valor as string | undefined;
  if (!canalId) return false;

  const { data: uRes } = await supabase.auth.getUser();
  const uid = uRes?.user?.id;
  const nome = (uRes?.user?.user_metadata as any)?.nome_completo
    || (uRes?.user?.user_metadata as any)?.nome || "Financeiro";

  const { data: m } = await (supabase as any)
    .from("comunicacao_mensagens")
    .insert({ canal_id: canalId, user_id: uid, user_nome: nome, mensagem })
    .select("id").single();
  if (!m) return false;

  const { data: parts } = await (supabase as any)
    .from("comunicacao_participantes").select("user_id").eq("canal_id", canalId);
  const notifs = (parts ?? []).filter((p: any) => p.user_id !== uid)
    .map((p: any) => ({ user_id: p.user_id, canal_id: canalId, mensagem_id: m.id }));
  if (notifs.length) await (supabase as any).from("comunicacao_notificacoes").insert(notifs);
  return true;
}

export function FinanceiroLiberarDialog({
  mes, ano, total, qtdMedicos, porConferir,
}: { mes: number; ano: number; total: number; qtdMedicos: number; porConferir: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const liberar = async () => {
    if (qtdMedicos === 0) return;
    setSalvando(true);
    try {
      const { data: uRes } = await supabase.auth.getUser();
      const uid = uRes?.user?.id ?? null;
      const agora = new Date().toISOString();

      // conferir é o ato de liberar: marca a competência inteira de uma vez
      const { error: errConf } = await (supabase as any)
        .from("financeiro_pagamentos")
        .update({ conferido_por: uid, conferido_em: agora })
        .eq("mes_referencia", mes).eq("ano_referencia", ano)
        .is("conferido_em", null);
      if (errConf) throw errConf;

      const { data: fech, error: errFech } = await (supabase as any)
        .from("financeiro_fechamentos")
        .upsert({
          mes_referencia: mes, ano_referencia: ano,
          status: "em_nf", total, qtd_medicos: qtdMedicos,
          criado_por: uid, updated_at: agora,
        }, { onConflict: "mes_referencia,ano_referencia" })
        .select("id").single();
      if (errFech || !fech) throw errFech || new Error("Falha ao gravar o fechamento.");

      const { error: errLink } = await (supabase as any)
        .from("financeiro_pagamentos")
        .update({ fechamento_id: fech.id })
        .eq("mes_referencia", mes).eq("ano_referencia", ano);
      if (errLink) throw errLink;

      const avisou = await avisarCanalFinanceiro(
        `✅ *Fechamento ${String(mes).padStart(2, "0")}/${ano} conferido e liberado* — ${brl(total)}, ` +
        `${qtdMedicos} médico${qtdMedicos === 1 ? "" : "s"}. Pode solicitar as notas fiscais.`
      );

      qc.invalidateQueries({ queryKey: ["financeiro-pagamentos"] });
      qc.invalidateQueries({ queryKey: ["financeiro-fechamentos"] });
      qc.invalidateQueries({ queryKey: ["financeiro-fases"] });
      toast.success(avisou
        ? "Fechamento conferido e liberado para as notas fiscais."
        : "Fechamento conferido e liberado. (Canal Financeiro não configurado — config_lista_items.financeiro_canal_id)");
      setOpen(false);
    } catch (e: any) {
      toast.error("Erro ao liberar o fechamento: " + (e?.message || ""));
    }
    setSalvando(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2" disabled={qtdMedicos === 0}>
          <CheckCircle2 className="h-4 w-4" /> Conferir e liberar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Conferir e liberar {String(mes).padStart(2, "0")}/{ano}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          Marca a competência inteira como conferida e libera para a solicitação das notas fiscais.
          A diretoria só recebe depois, para aprovar o pagamento.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">A pagar</p>
            <p className="text-lg font-semibold tabular-nums mt-0.5">{brl(total)}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Médicos</p>
            <p className="text-lg font-semibold tabular-nums mt-0.5">{qtdMedicos}</p>
          </div>
        </div>

        {porConferir > 0 && (
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
            {porConferir} lançamento(s) ainda sem conferência individual — liberar marca todos.
          </p>
        )}

        <DialogFooter>
          <Button onClick={liberar} disabled={salvando || qtdMedicos === 0} className="w-full sm:w-auto gap-2">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Liberar para as notas fiscais
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
