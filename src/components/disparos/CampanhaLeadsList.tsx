import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Loader2, ListChecks, CheckCircle2, ArrowRightCircle, XCircle, Unlock, Ban, ShieldAlert, Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LeadProntuarioDialog } from "@/components/medicos/LeadProntuarioDialog";
import { toast } from "sonner";
import {
  CanalCascata,
  useLeadCanais,
  formatDuracao,
  tempoNaRaia,
} from "@/hooks/useLeadCanais";
import { TransferirCanalDialog } from "./TransferirCanalDialog";
import { useLeadStatusProposta, StatusProposta } from "@/hooks/useLeadStatusProposta";
import { LiberarLeadDialog } from "./LiberarLeadDialog";

type FiltroStatus = "todos" | "contactar" | "contactado" | "aberto" | "fechado";

interface Props {
  listaId: string | null | undefined;
  listaNome?: string | null;
  /** Cor do canal (para acento visual) */
  accentClass?: string;
  /** Quando informado, ativa seleção múltipla e ações de cascata para o canal */
  campanhaPropostaId?: string;
  canal?: CanalCascata;
}

function statusToBucket(status: StatusProposta | undefined): FiltroStatus {
  switch (status) {
    case "em_aberto": return "aberto";
    case "contactado": return "contactado";
    case "fechado_proposta": return "fechado";
    case "a_contactar":
    default: return "contactar";
  }
}

const STATUS_LABEL: Record<StatusProposta, string> = {
  a_contactar: "A contactar",
  em_aberto: "Em aberto",
  contactado: "Contactado",
  fechado_proposta: "Fechado",
};

const FILTROS: { value: FiltroStatus; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "contactar", label: "A contactar" },
  { value: "contactado", label: "Contactados" },
  { value: "aberto", label: "Em aberto" },
  { value: "fechado", label: "Fechados" },
];

export function CampanhaLeadsList({ listaId, listaNome, campanhaPropostaId, canal }: Props) {
  const [filtro, setFiltro] = useState<FiltroStatus>("todos");
  const [busca, setBusca] = useState("");
  const [leadAberto, setLeadAberto] = useState<string | null>(null);
  const [fechandoId, setFechandoId] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [dialogModo, setDialogModo] = useState<"transferir" | "fechar" | null>(null);
  const qc = useQueryClient();
  const cascataAtiva = !!campanhaPropostaId && !!canal;
  const { data: canaisRows = [] } = useLeadCanais(cascataAtiva ? campanhaPropostaId : undefined);
  const { data: statusMap } = useLeadStatusProposta(campanhaPropostaId);
  const [liberarLead, setLiberarLead] = useState<{ id: string; nome?: string } | null>(null);

  // Tempo na raia atual por lead (somente do canal ativo desta aba)
  const tempoPorLead = useMemo(() => {
    const map = new Map<string, { id: string; segundos: number }>();
    if (!cascataAtiva) return map;
    for (const r of canaisRows) {
      if (r.canal !== canal || r.status_final !== "aberto") continue;
      map.set(r.lead_id, {
        id: r.id,
        segundos: tempoNaRaia(r.entrou_em, null),
      });
    }
    return map;
  }, [canaisRows, canal, cascataAtiva]);

  const { data: itens = [], isLoading } = useQuery({
    queryKey: ["campanha-lista-leads", listaId],
    enabled: !!listaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("disparo_lista_itens")
        .select(
          "id, lead_id, leads:lead_id (id, nome, phone_e164, email, especialidade, uf, cidade, status)"
        )
        .eq("lista_id", listaId!);
      if (error) throw error;
      return (data || [])
        .map((i: any) => i.leads)
        .filter(Boolean);
    },
  });

  const counts = useMemo(() => {
    const c: Record<FiltroStatus, number> = {
      todos: itens.length,
      contactar: 0,
      contactado: 0,
      aberto: 0,
      fechado: 0,
    };
    for (const l of itens) {
      const st = statusMap?.get(l.id)?.status_proposta;
      c[statusToBucket(st)]++;
    }
    return c;
  }, [itens, statusMap]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((l: any) => {
      if (filtro !== "todos") {
        const st = statusMap?.get(l.id)?.status_proposta;
        if (statusToBucket(st) !== filtro) return false;
      }
      if (q) {
        const hay = `${l.nome ?? ""} ${l.phone_e164 ?? ""} ${l.especialidade ?? ""} ${l.cidade ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [itens, filtro, busca, statusMap]);

  if (!listaId) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Esta proposta ainda não tem uma lista vinculada.
      </Card>
    );
  }

  const toggleLead = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleTodos = () => {
    if (selecionados.size === filtrados.length) setSelecionados(new Set());
    else setSelecionados(new Set(filtrados.map((l: any) => l.id)));
  };
  const limparSelecao = () => setSelecionados(new Set());

  const encerrarNaProposta = async (leadId: string) => {
    if (!cascataAtiva) return;
    setFechandoId(leadId);
    const { error } = await (supabase as any).rpc("fechar_lead_canal", {
      p_campanha_proposta_id: campanhaPropostaId,
      p_lead_id: leadId,
      p_canal: canal,
      p_status_final: "fechado",
      p_motivo: "Encerrado manualmente nesta proposta",
    });
    setFechandoId(null);
    if (error) {
      toast.error("Erro ao encerrar: " + error.message);
      return;
    }
    toast.success("Lead encerrado nesta proposta");
    qc.invalidateQueries({ queryKey: ["lead-status-proposta", campanhaPropostaId] });
    qc.invalidateQueries({ queryKey: ["lead-canais", campanhaPropostaId] });
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center gap-3 p-3 border-b bg-muted/30 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <ListChecks className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">
              Lista de leads {listaNome ? `– ${listaNome}` : ""}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono truncate">
              id: {listaId}
            </div>
          </div>
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone, email ou especialidade..."
            className="pl-9 h-9"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap p-2 border-b">
        <div className="flex gap-1 flex-wrap">
          {FILTROS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filtro === f.value ? "default" : "outline"}
              onClick={() => setFiltro(f.value)}
              className="h-8"
            >
              {f.label}
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                {counts[f.value]}
              </Badge>
            </Button>
          ))}
        </div>
      </div>

      {cascataAtiva && selecionados.size > 0 && (
        <div className="flex items-center gap-2 p-2 border-b bg-primary/5">
          <span className="text-xs font-medium">
            {selecionados.size} selecionado(s)
          </span>
          <Button size="sm" variant="outline" className="h-7" onClick={limparSelecao}>
            Limpar
          </Button>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => setDialogModo("fechar")}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" />
              Encerrar
            </Button>
            <Button
              size="sm"
              className="h-7"
              onClick={() => setDialogModo("transferir")}
            >
              <ArrowRightCircle className="h-3.5 w-3.5 mr-1" />
              Transferir canal
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          Nenhum lead encontrado neste filtro.
        </div>
      ) : (
        <ScrollArea className="h-[440px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/50 backdrop-blur z-10">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                {cascataAtiva && (
                  <th className="px-3 py-2 w-8">
                    <Checkbox
                      checked={
                        filtrados.length > 0 &&
                        selecionados.size === filtrados.length
                      }
                      onCheckedChange={toggleTodos}
                    />
                  </th>
                )}
                <th className="px-4 py-2 font-semibold">#</th>
                <th className="px-4 py-2 font-semibold">Nome</th>
                <th className="px-4 py-2 font-semibold">Telefone</th>
                <th className="px-4 py-2 font-semibold">Email</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                {cascataAtiva && (
                  <th className="px-4 py-2 font-semibold">Tempo na raia</th>
                )}
                <th className="px-4 py-2 font-semibold text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((l: any, idx: number) => {
                const sRow = statusMap?.get(l.id);
                const status = sRow?.status_proposta ?? "a_contactar";
                const fechadoProp = status === "fechado_proposta";
                const blkBlacklist = !!sRow?.bloqueado_blacklist;
                const blkTemp = !!sRow?.bloqueado_temp;
                const blkJanela = !!sRow?.bloqueado_janela_7d;
                const hardBlock = blkBlacklist || blkTemp;
                const precisaLiberar = !hardBlock && (fechadoProp || blkJanela);
                const checked = selecionados.has(l.id);
                const tempo = tempoPorLead.get(l.id);
                return (
                  <tr
                    key={l.id}
                    className={`border-t hover:bg-accent/40 transition-colors ${hardBlock ? "opacity-60" : ""}`}
                  >
                    {cascataAtiva && (
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={checked}
                          disabled={hardBlock || precisaLiberar}
                          onCheckedChange={() => toggleLead(l.id)}
                        />
                      </td>
                    )}
                    <td className="px-4 py-2 text-muted-foreground">{idx + 1}</td>
                    <td
                      className="px-4 py-2 font-medium cursor-pointer"
                      onClick={() => setLeadAberto(l.id)}
                    >
                      {l.nome || "Sem nome"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {l.phone_e164 || "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground truncate max-w-[200px]">
                      {l.email || "—"}
                    </td>
                    <td className="px-4 py-2">
                      <TooltipProvider delayDuration={150}>
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge
                            variant={fechadoProp ? "secondary" : status === "em_aberto" ? "default" : "outline"}
                            className="text-[10px]"
                          >
                            {STATUS_LABEL[status]}
                          </Badge>
                          {blkBlacklist && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Ban className="h-3.5 w-3.5 text-destructive" />
                              </TooltipTrigger>
                              <TooltipContent>Telefone na blacklist</TooltipContent>
                            </Tooltip>
                          )}
                          {blkTemp && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                              </TooltipTrigger>
                              <TooltipContent>Bloqueio temporário ativo</TooltipContent>
                            </Tooltip>
                          )}
                          {blkJanela && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Clock className="h-3.5 w-3.5 text-amber-600" />
                              </TooltipTrigger>
                              <TooltipContent>
                                Disparo recente — aguardando janela de 7 dias
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {fechadoProp && sRow?.ultimo_motivo && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                Motivo: {sRow.ultimo_motivo}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TooltipProvider>
                    </td>
                    {cascataAtiva && (
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {tempo ? formatDuracao(tempo.segundos) : "—"}
                      </td>
                    )}
                    <td className="px-4 py-2 text-right">
                      {hardBlock ? (
                        <span className="text-xs text-muted-foreground">Bloqueado</span>
                      ) : precisaLiberar ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          onClick={() => setLiberarLead({ id: l.id, nome: l.nome })}
                        >
                          <Unlock className="h-3 w-3 mr-1" /> Liberar lead
                        </Button>
                      ) : cascataAtiva ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={fechandoId === l.id}
                          onClick={() => encerrarNaProposta(l.id)}
                          className="h-7"
                        >
                          {fechandoId === l.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Encerrar nesta proposta"
                          )}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      )}

      <LeadProntuarioDialog
        leadId={leadAberto}
        open={!!leadAberto}
        onOpenChange={(o) => !o && setLeadAberto(null)}
      />

      {cascataAtiva && dialogModo && (
        <TransferirCanalDialog
          open={!!dialogModo}
          onOpenChange={(o) => !o && setDialogModo(null)}
          modo={dialogModo}
          campanhaPropostaId={campanhaPropostaId!}
          canalAtual={canal!}
          leadIds={Array.from(selecionados)}
          onDone={limparSelecao}
        />
      )}
    </Card>
  );
}
