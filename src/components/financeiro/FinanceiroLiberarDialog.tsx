import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle2, AlertTriangle, Send } from "lucide-react";
import { toast } from "sonner";

/**
 * Fase 1 → 2 (reunião com a Mavi, 22/09). A conferência dela É este ato: ela revisa o
 * fechamento inteiro e libera — não clica médico a médico. E o que sai daqui NÃO vai
 * para a diretoria: vai para quem solicita as notas fiscais. A diretoria só entra no
 * fim, para aprovar o pagamento, depois que as notas voltarem (FinanceiroFecharDialog).
 */
const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// A liberação vai para o grupo interno da Mavi com quem pede as notas (Amni), "Fechamentos — Aprovações",
// e não para o de pagamentos (pedido da Mavi, 15/10). Sem a chave própria, cai no canal do financeiro.
async function avisarCanalFinanceiro(mensagem: string) {
  const { data: cfgs } = await (supabase as any)
    .from("config_lista_items").select("campo_nome, valor")
    .in("campo_nome", ["financeiro_canal_liberacao_id", "financeiro_canal_id"]);
  const val = (n: string) => (cfgs ?? []).find((c: any) => c.campo_nome === n)?.valor as string | undefined;
  const canalId = val("financeiro_canal_liberacao_id") || val("financeiro_canal_id");
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

/**
 * Aviso de liberação com o nome de cada fechamento (o arquivo do setor, "Ibirama Clínicos"): a Mavi
 * reclamou em 15/10 que o aviso dizia só "Fechamento 08/2026" e quem pede as notas não sabia qual era.
 */
export async function avisarLiberacao(mes: number, ano: number, ids?: string[]) {
  let q = (supabase as any).from("financeiro_pagamentos").select("arquivo_origem, valor_total")
    .eq("mes_referencia", mes).eq("ano_referencia", ano);
  if (ids?.length) q = q.in("id", ids);
  const [{ data: pags }, { data: cfgs }] = await Promise.all([
    q, (supabase as any).from("financeiro_import_config").select("id, nome"),
  ]);
  const nome = (origem: string | null) => {
    const m = String(origem || "").match(/^\[cfg:([0-9a-f-]+)\]\s*(.*)$/i);
    if (!m) return origem ? String(origem) : "Lançamentos manuais";
    const arquivo = (m[2] || "").replace(/\.(xlsx|xls|csv)$/i, "").trim();
    return arquivo || (cfgs ?? []).find((c: any) => c.id === m[1])?.nome || "Fechamento";
  };
  const grupos = new Map<string, { n: number; v: number }>();
  for (const p of (pags ?? []) as any[]) {
    const g = grupos.get(nome(p.arquivo_origem)) ?? { n: 0, v: 0 };
    g.n += 1; g.v += Number(p.valor_total || 0);
    grupos.set(nome(p.arquivo_origem), g);
  }
  const lista = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const total = lista.reduce((s, [, g]) => s + g.v, 0), medicos = lista.reduce((s, [, g]) => s + g.n, 0);
  const linhas = lista.slice(0, 15).map(([k, g]) => `• ${k}: ${g.n} médico${g.n === 1 ? "" : "s"}, ${brl(g.v)}`);
  if (lista.length > 15) linhas.push(`• e mais ${lista.length - 15} fechamento(s)`);
  const comp = `${String(mes).padStart(2, "0")}/${ano}`;
  const titulo = lista.length === 1
    ? `✅ *Fechamento ${lista[0][0]} (${comp}) liberado*`
    : `✅ *${lista.length} fechamentos de ${comp} liberados*`;
  return avisarCanalFinanceiro(
    `${titulo} — ${brl(total)}, ${medicos} médico${medicos === 1 ? "" : "s"}.\n${linhas.join("\n")}\nPode solicitar as notas fiscais.`,
  );
}

/**
 * Pedido de nota junto com a liberação (13/10): liberar o fechamento já dispara o pedido para
 * todos os médicos com valor a pagar, pelo WhatsApp oficial; quem não tem telefone recebe por
 * e-mail. Vai em lotes pequenos porque a função envia um por vez, com pausa, e um lote grande
 * estouraria o tempo da chamada. Quem ficar sem contato aparece no filtro "Sem contato" da
 * aba Notas fiscais. Devolve a contagem para o aviso final.
 */
const LOTE = 15;
export async function pedirNotasDoMes(mes: number, ano: number, progresso: (feitos: number, total: number) => void, soIds?: string[]) {
  let q = (supabase as any).from("financeiro_pagamentos")
    .select("id, valor_total, nf_status")
    .eq("mes_referencia", mes).eq("ano_referencia", ano);
  if (soIds?.length) q = q.in("id", soIds);
  const { data: pags } = await q;
  // só quem tem o que receber e ainda não foi pedido (pago à vista fica com zero)
  const ids = ((pags ?? []) as any[])
    .filter((p) => Number(p.valor_total) > 0 && (!p.nf_status || p.nf_status === "nao_solicitada"))
    .map((p) => p.id as string);
  const r = { total: ids.length, enviados: 0, semContato: 0, erros: 0 };
  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = ids.slice(i, i + LOTE);
    progresso(i, ids.length);
    const { data, error } = await supabase.functions.invoke("financeiro-nf-enviar", {
      body: { pagamento_ids: lote, canal: "whatsapp", tipo: "solicitacao" },
    });
    const d = data as any;
    if (error || d?.ok === false) { r.erros += lote.length; continue; }
    r.enviados += d.enviados || 0; r.erros += d.erros || 0;
    // sem telefone: tenta o e-mail antes de dar como sem contato
    const semFone = ((d.resultados || []) as any[]).filter((x) => x.status === "sem_contato").map((x) => x.pagamento_id);
    if (semFone.length) {
      const { data: e2 } = await supabase.functions.invoke("financeiro-nf-enviar", {
        body: { pagamento_ids: semFone, canal: "email", tipo: "solicitacao" },
      });
      const d2 = e2 as any;
      r.enviados += d2?.enviados || 0; r.erros += d2?.erros || 0;
      r.semContato += d2?.ok === false || !d2 ? semFone.length : (d2.sem_contato || 0);
    }
  }
  progresso(ids.length, ids.length);
  return r;
}

export function FinanceiroLiberarDialog({
  mes, ano, total, qtdMedicos, porConferir,
}: { mes: number; ano: number; total: number; qtdMedicos: number; porConferir: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [pedirNotas, setPedirNotas] = useState(true);
  const [andamento, setAndamento] = useState<string | null>(null);

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

      const avisou = await avisarLiberacao(mes, ano);

      qc.invalidateQueries({ queryKey: ["financeiro-pagamentos"] });
      qc.invalidateQueries({ queryKey: ["financeiro-fechamentos"] });
      qc.invalidateQueries({ queryKey: ["financeiro-fases"] });
      toast.success(avisou
        ? "Fechamento conferido e liberado para as notas fiscais."
        : "Fechamento conferido e liberado. (Canal Financeiro não configurado — config_lista_items.financeiro_canal_id)");

      if (pedirNotas) {
        const r = await pedirNotasDoMes(mes, ano, (feitos, tot) => setAndamento(tot ? `Pedindo as notas: ${feitos} de ${tot}…` : null));
        setAndamento(null);
        qc.invalidateQueries({ queryKey: ["financeiro-nf"] });
        qc.invalidateQueries({ queryKey: ["financeiro-pagamentos"] });
        const partes = [`${r.enviados} pedido(s) de nota enviado(s)`];
        if (r.semContato) partes.push(`${r.semContato} sem contato`);
        if (r.erros) partes.push(`${r.erros} com erro`);
        if (r.total === 0) toast.info("Nenhum pedido de nota a enviar neste fechamento.");
        else if (r.semContato || r.erros) toast.warning(partes.join(" · ") + ". Veja na aba Notas fiscais.");
        else toast.success(partes.join(" · ") + ".");
      }
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

        <label className="flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer">
          <Checkbox checked={pedirNotas} onCheckedChange={(v) => setPedirNotas(v === true)} className="mt-0.5" disabled={salvando} />
          <span>
            <b>Pedir as notas fiscais agora</b>
            <span className="block text-xs text-muted-foreground">
              Cada médico com valor a pagar recebe o pedido pelo WhatsApp (ou por e-mail, se não tiver telefone). Quem ficar sem contato aparece na aba Notas fiscais.
            </span>
          </span>
        </label>

        <DialogFooter>
          <Button onClick={liberar} disabled={salvando || qtdMedicos === 0} className="w-full sm:w-auto gap-2">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {andamento ?? (pedirNotas ? "Liberar e pedir as notas" : "Liberar sem pedir as notas")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
