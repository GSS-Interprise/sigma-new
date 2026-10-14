import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Building2, DollarSign, MapPin, ArrowRight, Eye, Ban, History } from "lucide-react";
import { toast } from "sonner";
import { useContratosRascunho } from "@/hooks/useContratoRascunho";
import { ContratoRascunhoDialog } from "./ContratoRascunhoDialog";

/**
 * Licitações arrematadas (T8 de docs/arquitetura/licitacoes-contratos-gss.md), no lugar da antiga
 * aba de rascunhos ("o enviar para contrato vira rascunho, que nunca funcionou", Bianca, 07/10).
 * A arrematada passa por adjudicação, homologação, aguardando assinatura e assinado; daí vira
 * contrato (só então ganha número) ou encerra sem contrato, com motivo (revogação, desistência).
 */
const ETAPAS = [
  { value: "adjudicacao", label: "Adjudicação" },
  { value: "homologacao", label: "Homologação" },
  { value: "aguardando_assinatura", label: "Aguardando assinatura" },
  { value: "assinado", label: "Assinado" },
];
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface ContratosRascunhoTabProps {
  onConsolidado?: (contratoId: string) => void;
  readOnly?: boolean;
}

export function ContratosRascunhoTab({ onConsolidado, readOnly = false }: ContratosRascunhoTabProps) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { rascunhos, isLoading, cancelar } = useContratosRascunho();
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [encerrando, setEncerrando] = useState<any | null>(null);
  const [verEncerradas, setVerEncerradas] = useState(false);

  const { data: encerradas = [] } = useQuery({
    queryKey: ["arrematadas-encerradas"],
    enabled: verEncerradas,
    queryFn: async () => {
      const { data } = await (supabase as any).from("contrato_rascunho")
        .select("id, overlay_json, encerrado_motivo, encerrado_em, licitacoes(titulo, numero_edital, orgao)")
        .eq("status", "cancelado").not("encerrado_motivo", "is", null).order("encerrado_em", { ascending: false }).limit(30);
      return (data ?? []) as any[];
    },
  });

  const mudarEtapa = async (r: any, etapa: string) => {
    const { error } = await (supabase as any).from("contrato_rascunho").update({ etapa, updated_at: new Date().toISOString() }).eq("id", r.id);
    if (error) return toast.error("Não mudou a etapa: " + error.message);
    if (r.licitacao_id) {
      await supabase.from("licitacoes_atividades").insert({
        licitacao_id: r.licitacao_id, user_id: user?.id, tipo: "comentario",
        descricao: `Arrematada: etapa ${ETAPAS.find((e) => e.value === etapa)?.label ?? etapa}.`,
      } as any);
    }
    qc.invalidateQueries({ queryKey: ["contratos-rascunho"] });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>;
  }

  const lista = (rascunhos ?? []) as any[];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold">Licitações arrematadas</h2>
          <p className="text-sm text-muted-foreground">Da adjudicação à assinatura. O número do contrato só nasce quando ela vira contrato.</p>
        </div>
        <Button variant="ghost" size="sm" className="ml-auto gap-1.5" onClick={() => setVerEncerradas((v) => !v)}>
          <History className="h-4 w-4" /> {verEncerradas ? "Esconder" : "Ver"} encerradas sem contrato
        </Button>
      </div>

      {lista.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-medium">Nenhuma licitação arrematada em andamento</h3>
          <p className="mt-2 text-sm text-muted-foreground">Quando um card vai para Arrematados no quadro de licitações, ele aparece aqui com tudo o que foi anexado.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {ETAPAS.map((etapa) => {
            const daEtapa = lista.filter((r) => (r.etapa || "adjudicacao") === etapa.value);
            return (
              <div key={etapa.value} className="space-y-2 rounded-lg bg-muted/30 p-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-sm font-semibold">{etapa.label}</span>
                  <Badge variant="outline">{daEtapa.length}</Badge>
                </div>
                {daEtapa.map((r) => {
                  const o = r.overlay_json || {};
                  const l = r.licitacoes || {};
                  return (
                    <Card key={r.id}>
                      <CardContent className="space-y-2 p-3 text-sm">
                        <p className="line-clamp-2 font-medium">{l.titulo || o.titulo || o.numero_edital || "Sem título"}</p>
                        {(l.orgao || o.orgao) && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Building2 className="h-3.5 w-3.5" /><span className="line-clamp-1">{l.orgao || o.orgao}</span></p>}
                        {(l.municipio_uf || o.municipio_uf || o.uf) && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{l.municipio_uf || o.municipio_uf || o.uf}</p>}
                        {(l.valor_estimado || o.valor_estimado) ? <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><DollarSign className="h-3.5 w-3.5" />{brl(l.valor_estimado || o.valor_estimado)}</p> : null}
                        {!readOnly && (
                          <Select value={r.etapa || "adjudicacao"} onValueChange={(v) => mudarEtapa(r, v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{ETAPAS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
                          </Select>
                        )}
                        <div className="flex gap-1.5 pt-1">
                          <Button variant="outline" size="sm" className="h-8 flex-1 gap-1" onClick={() => setSelecionado(r.id)}><Eye className="h-3.5 w-3.5" /> Ver</Button>
                          {!readOnly && (
                            <>
                              <Button size="sm" className="h-8 flex-1 gap-1" onClick={() => setSelecionado(r.id)} title="Abre o formulário do contrato com tudo da licitação">
                                <ArrowRight className="h-3.5 w-3.5" /> Virar contrato
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Encerrar sem contrato" onClick={() => setEncerrando(r)}><Ban className="h-4 w-4" /></Button>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {verEncerradas && (
        <Card className="mt-4"><CardContent className="divide-y p-0">
          {!encerradas.length ? <p className="p-4 text-sm text-muted-foreground">Nenhuma arrematada encerrada sem contrato.</p> : encerradas.map((r) => (
            <div key={r.id} className="p-3 text-sm">
              <p className="font-medium">{r.licitacoes?.titulo || r.overlay_json?.numero_edital || "Sem título"}</p>
              <p className="text-xs text-muted-foreground">Encerrada em {r.encerrado_em ? new Date(r.encerrado_em).toLocaleDateString("pt-BR") : "—"}: {r.encerrado_motivo}</p>
            </div>
          ))}
        </CardContent></Card>
      )}

      {selecionado && (
        <ContratoRascunhoDialog open={!!selecionado} onOpenChange={(o) => !o && setSelecionado(null)} rascunhoId={selecionado} onConsolidado={onConsolidado} />
      )}
      {encerrando && (
        <EncerrarDialog r={encerrando} onFechar={() => setEncerrando(null)} onEncerrar={async (motivo) => {
          const { error } = await (supabase as any).from("contrato_rascunho")
            .update({ encerrado_motivo: motivo, encerrado_em: new Date().toISOString(), encerrado_por: user?.id }).eq("id", encerrando.id);
          if (error) return toast.error("Não encerrou: " + error.message);
          if (encerrando.licitacao_id) {
            await supabase.from("licitacoes_atividades").insert({
              licitacao_id: encerrando.licitacao_id, user_id: user?.id, tipo: "comentario", descricao: `Arrematada encerrada sem contrato. Motivo: ${motivo}`,
            } as any);
          }
          cancelar(encerrando.id);
          qc.invalidateQueries({ queryKey: ["arrematadas-encerradas"] });
          setEncerrando(null);
        }} />
      )}
    </>
  );
}

function EncerrarDialog({ r, onFechar, onEncerrar }: { r: any; onFechar: () => void; onEncerrar: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState("");
  const atalhos = ["Revogação pelo órgão", "Desistência após reanálise do edital", "Anulação", "Outra empresa convocada"];
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Encerrar sem virar contrato</DialogTitle>
          <DialogDescription>{r.licitacoes?.titulo || r.overlay_json?.numero_edital}. O motivo fica no histórico da licitação e nos relatórios.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {atalhos.map((a) => <Badge key={a} variant={motivo === a ? "default" : "outline"} className="cursor-pointer font-normal" onClick={() => setMotivo(a)}>{a}</Badge>)}
        </div>
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Explique o motivo" />
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>Voltar</Button>
          <Button variant="destructive" disabled={motivo.trim().length < 4} onClick={() => onEncerrar(motivo.trim())}>Encerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
