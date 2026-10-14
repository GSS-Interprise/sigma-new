import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FileSignature, HandCoins, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

/**
 * Resumo das condições combinadas com o médico e "não assinou" com motivo (T12 de
 * docs/arquitetura/licitacoes-contratos-gss.md). Ramone/Bianca, reunião de 07/10: nem todo contrato
 * de médico está no Sigma; o resumo (fixo, variável, regras) precisa estar no cadastro, e a alta
 * gestão quer ver quem converteu × quem não assinou e por quê (ex.: multa).
 * Os dados do lead (modalidade, valor, especificações) e a remuneração por cliente aparecem como
 * referência para quem preenche.
 */
const brl = (v: any) => v == null || v === "" ? null : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function MedicoCondicoesCard({ medicoId }: { medicoId: string }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [fixo, setFixo] = useState("");
  const [variavel, setVariavel] = useState("");
  const [regras, setRegras] = useState("");
  const [salvando, setSalvando] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["medico-condicoes", medicoId],
    queryFn: async () => {
      const { data: m } = await (supabase as any).from("medicos")
        .select("condicoes_fixo, condicoes_variavel, condicoes_regras, condicoes_atualizado_em, lead_id").eq("id", medicoId).maybeSingle();
      const [{ data: lead }, { data: rem }] = await Promise.all([
        m?.lead_id
          ? (supabase as any).from("leads").select("modalidade_contrato, valor_contrato, especificacoes_contrato, local_prestacao_servico, data_inicio_contrato").eq("id", m.lead_id).maybeSingle()
          : Promise.resolve({ data: null }),
        (supabase as any).from("medico_remuneracao").select("exame_servico, valor, observacoes, clientes(nome_fantasia)").eq("medico_id", medicoId).limit(20),
      ]);
      return { m, lead, rem: (rem ?? []) as any[] };
    },
  });
  useEffect(() => {
    if (!data?.m) return;
    setFixo(data.m.condicoes_fixo ?? ""); setVariavel(data.m.condicoes_variavel ?? ""); setRegras(data.m.condicoes_regras ?? "");
  }, [data?.m]);

  const salvar = async () => {
    setSalvando(true);
    const { data: ok, error } = await (supabase as any).from("medicos")
      .update({ condicoes_fixo: fixo.trim() || null, condicoes_variavel: variavel.trim() || null, condicoes_regras: regras.trim() || null }).eq("id", medicoId).select("id");
    setSalvando(false);
    if (error || !ok?.length) return toast.error("Não salvou: " + (error?.message || "sem permissão para alterar este médico"));
    toast.success("Condições salvas");
    setEditando(false);
    qc.invalidateQueries({ queryKey: ["medico-condicoes", medicoId] });
  };

  if (isLoading) return <div className="rounded-xl border p-4 text-center"><Loader2 className="inline h-4 w-4 animate-spin" /></div>;
  const m = data?.m ?? {};
  const lead = data?.lead;
  const vazio = !m.condicoes_fixo && !m.condicoes_variavel && !m.condicoes_regras;
  const refLead = lead && [lead.modalidade_contrato, brl(lead.valor_contrato), lead.local_prestacao_servico, lead.especificacoes_contrato].filter(Boolean).join(" · ");

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <HandCoins className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Resumo das condições</h3>
        {m.condicoes_atualizado_em && <span className="text-xs text-muted-foreground">atualizado em {new Date(m.condicoes_atualizado_em).toLocaleDateString("pt-BR")}</span>}
        {!editando && <Button size="sm" variant="ghost" className="ml-auto h-7 gap-1" onClick={() => setEditando(true)}><Pencil className="h-3.5 w-3.5" /> {vazio ? "Preencher" : "Editar"}</Button>}
      </div>
      {editando ? (
        <div className="space-y-2">
          <Textarea value={fixo} onChange={(e) => setFixo(e.target.value)} rows={2} placeholder="Fixo (ex.: R$ 12.000/mês PJ, 2 plantões/semana)" />
          <Textarea value={variavel} onChange={(e) => setVariavel(e.target.value)} rows={2} placeholder="Variável (ex.: R$ 18 por laudo de TC; produtividade acima de 400 exames)" />
          <Textarea value={regras} onChange={(e) => setRegras(e.target.value)} rows={3} placeholder="Regras (ex.: multa de rescisão, aviso prévio de 30 dias, exclusividade, reajuste anual)" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button>
            <Button size="sm" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
          </div>
        </div>
      ) : vazio ? (
        <p className="text-sm text-muted-foreground">Nada preenchido. Registre o fixo, o variável e as regras combinadas com o médico.</p>
      ) : (
        <dl className="grid gap-2 text-sm sm:grid-cols-[110px_1fr]">
          {m.condicoes_fixo && <><dt className="text-muted-foreground">Fixo</dt><dd className="whitespace-pre-wrap">{m.condicoes_fixo}</dd></>}
          {m.condicoes_variavel && <><dt className="text-muted-foreground">Variável</dt><dd className="whitespace-pre-wrap">{m.condicoes_variavel}</dd></>}
          {m.condicoes_regras && <><dt className="text-muted-foreground">Regras</dt><dd className="whitespace-pre-wrap">{m.condicoes_regras}</dd></>}
        </dl>
      )}
      {(refLead || data?.rem?.length) ? (
        <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
          {refLead && <p><span className="font-medium">Na conversão:</span> {refLead}</p>}
          {data?.rem?.map((r: any, i: number) => (
            <p key={i}><span className="font-medium">Remuneração:</span> {r.clientes?.nome_fantasia ?? "cliente"} · {r.exame_servico} · {brl(r.valor) ?? "—"}{r.observacoes ? ` · ${r.observacoes}` : ""}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const MOTIVOS = ["Multa contratual", "Valor abaixo do esperado", "Desistiu / outro trabalho", "Sem retorno", "Documentação"];

export function MedicoNaoAssinou({ medicoId, assinado }: { medicoId: string; assinado: boolean }) {
  const qc = useQueryClient();
  const [abrir, setAbrir] = useState(false);
  const [motivo, setMotivo] = useState("");
  const { data } = useQuery({
    queryKey: ["medico-nao-assinou", medicoId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("medicos").select("contrato_nao_assinado_motivo, contrato_nao_assinado_em").eq("id", medicoId).maybeSingle();
      return data as any;
    },
  });
  if (assinado) return null;
  const salvar = async (valor: string | null) => {
    const { data: ok, error } = await (supabase as any).from("medicos").update({ contrato_nao_assinado_motivo: valor }).eq("id", medicoId).select("id");
    if (error || !ok?.length) return toast.error("Não salvou: " + (error?.message || "sem permissão"));
    toast.success(valor ? "Registrado que o médico não assinou" : "Motivo removido");
    setAbrir(false); setMotivo("");
    qc.invalidateQueries({ queryKey: ["medico-nao-assinou", medicoId] });
  };
  if (data?.contrato_nao_assinado_motivo) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        <FileSignature className="h-4 w-4" />
        <span className="flex-1">Não assinou: <b>{data.contrato_nao_assinado_motivo}</b>{data.contrato_nao_assinado_em ? ` (${new Date(data.contrato_nao_assinado_em).toLocaleDateString("pt-BR")})` : ""}</span>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => salvar(null)}>Remover</Button>
      </div>
    );
  }
  if (!abrir) {
    return <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setAbrir(true)}><FileSignature className="h-3.5 w-3.5" /> Médico não vai assinar</Button>;
  }
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">Por que o médico não assinou?</p>
      <div className="flex flex-wrap gap-1.5">
        {MOTIVOS.map((m) => <Badge key={m} variant={motivo === m ? "default" : "outline"} className="cursor-pointer font-normal" onClick={() => setMotivo(m)}>{m}</Badge>)}
      </div>
      <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Explique (vai para o indicador da gestão)" />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setAbrir(false)}>Cancelar</Button>
        <Button size="sm" disabled={motivo.trim().length < 3} onClick={() => salvar(motivo.trim())}>Salvar</Button>
      </div>
    </div>
  );
}
