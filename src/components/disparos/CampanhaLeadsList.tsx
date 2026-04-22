import { useState, useMemo, useEffect } from "react";
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
  useEnviarProximaFase,
} from "@/hooks/useLeadCanais";
import { TransferirCanalDialog } from "./TransferirCanalDialog";
import { useLeadStatusProposta, StatusProposta } from "@/hooks/useLeadStatusProposta";
import { LiberarLeadDialog } from "./LiberarLeadDialog";
import { TempoRaia } from "./TempoRaia";

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

function statusToBucket(status: StatusProposta | undefined, temRaiaAberta?: boolean): FiltroStatus {
  if (status === "fechado_proposta") return "fechado";
  if (status === "contactado") return temRaiaAberta ? "aberto" : "contactado";
  return "contactar";
}

const STATUS_LABEL: Record<StatusProposta, string> = {
  a_contactar: "A contactar",
  contactado: "Contactado",
  fechado_proposta: "Fechado",
};

const FILTROS: { value: FiltroStatus; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "contactar", label: "A contactar" },
  { value: "contactado", label: "Contactados" },
  { value: "aberto", label: "Em aberto na raia" },
  { value: "fechado", label: "Fechados" },
];

// Cadeia linear pós Fase 1. Cada canal só lista leads quando o canal anterior
// foi finalizado (status_final ≠ 'aberto') para aquele lead.
const CANAL_ANTERIOR: Partial<Record<CanalCascata, CanalCascata>> = {
  email: "trafego_pago",      // Fase 1 (whatsapp + trafego_pago) → email
  instagram: "email",
  ligacao: "instagram",
  linkedin: "ligacao",
  tiktok: "linkedin",
};

const CANAL_LABEL: Record<CanalCascata, string> = {
  whatsapp: "WhatsApp",
  trafego_pago: "Tráfego Pago",
  email: "Email",
  instagram: "Instagram",
  ligacao: "Ligação",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
};

const PAGE_SIZE = 300;
const PAGE_SIZE_UI = 300;

async function carregarTodosItensLista(listaId: string) {
  let from = 0;
  const acc: any[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("disparo_lista_itens")
      .select(
        "id, lead_id, leads:lead_id (id, nome, phone_e164, email, especialidade, uf, cidade, status)",
      )
      .eq("lista_id", listaId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    acc.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return acc.map((i: any) => i.leads).filter(Boolean);
}

export function CampanhaLeadsList({ listaId, listaNome, campanhaPropostaId, canal }: Props) {
  const [filtro, setFiltro] = useState<FiltroStatus>("todos");
  const [busca, setBusca] = useState("");
  const [leadAberto, setLeadAberto] = useState<string | null>(null);
  const [fechandoId, setFechandoId] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [dialogModo, setDialogModo] = useState<"transferir" | "fechar" | null>(null);
  const [pagina, setPagina] = useState(1);
  const qc = useQueryClient();
  const cascataAtiva = !!campanhaPropostaId && !!canal;
  const { data: canaisRows = [] } = useLeadCanais(cascataAtiva ? campanhaPropostaId : undefined);
  const { data: statusMap } = useLeadStatusProposta(campanhaPropostaId);
  const [liberarLead, setLiberarLead] = useState<{ id: string; nome?: string } | null>(null);
  const proximaFase = useEnviarProximaFase();

  // Para canais pós Fase 1: leads liberados são aqueles cujo canal anterior
  // já tem ao menos uma raia finalizada (status_final ≠ 'aberto').
  const canalAnterior = canal ? CANAL_ANTERIOR[canal] : undefined;
  const leadsLiberadosPorCascata = useMemo(() => {
    if (!cascataAtiva || !canalAnterior) return null; // null = sem restrição
    const set = new Set<string>();
    for (const r of canaisRows) {
      if (r.canal === canalAnterior && r.status_final !== "aberto") {
        set.add(r.lead_id);
      }
    }
    return set;
  }, [canaisRows, cascataAtiva, canalAnterior]);

  // Tempo na raia atual por lead (somente do canal ativo desta aba)
  const tempoPorLead = useMemo(() => {
    const map = new Map<string, { id: string; entrouEm: string }>();
    if (!cascataAtiva) return map;
    for (const r of canaisRows) {
      if (r.canal !== canal || r.status_final !== "aberto") continue;
      map.set(r.lead_id, {
        id: r.id,
        entrouEm: r.entrou_em,
      });
    }
    return map;
  }, [canaisRows, canal, cascataAtiva]);

  const { data: itens = [], isLoading } = useQuery({
    queryKey: ["campanha-lista-leads", listaId],
    enabled: !!listaId,
    queryFn: async () => carregarTodosItensLista(listaId!),
  });

  // Aplica o gate da cascata: só leads cujo canal anterior foi finalizado.
  const itensVisiveis = useMemo(() => {
    if (!leadsLiberadosPorCascata) return itens;
    return itens.filter((l: any) => leadsLiberadosPorCascata.has(l.id));
  }, [itens, leadsLiberadosPorCascata]);

  const counts = useMemo(() => {
    const c: Record<FiltroStatus, number> = {
      todos: itensVisiveis.length,
      contactar: 0,
      contactado: 0,
      aberto: 0,
      fechado: 0,
    };
    for (const l of itensVisiveis) {
      const sRow = statusMap?.get(l.id);
      c[statusToBucket(sRow?.status_proposta, sRow?.tem_raia_aberta)]++;
    }
    return c;
  }, [itensVisiveis, statusMap]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itensVisiveis.filter((l: any) => {
      if (filtro !== "todos") {
        const sRow = statusMap?.get(l.id);
        if (statusToBucket(sRow?.status_proposta, sRow?.tem_raia_aberta) !== filtro) return false;
      }
      if (q) {
        const hay = `${l.nome ?? ""} ${l.phone_e164 ?? ""} ${l.especialidade ?? ""} ${l.cidade ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [itensVisiveis, filtro, busca, statusMap]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE_UI));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const filtradosPagina = useMemo(() => {
    const inicio = (paginaAtual - 1) * PAGE_SIZE_UI;
    return filtrados.slice(inicio, inicio + PAGE_SIZE_UI);
  }, [filtrados, paginaAtual]);

  // Reset de página ao mudar filtro/busca/lista
  useEffect(() => {
    setPagina(1);
  }, [filtro, busca, listaId]);

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
    const idsPagina = filtradosPagina.map((l: any) => l.id);
    const todosNaPagina = idsPagina.every((id) => selecionados.has(id));
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (todosNaPagina) {
        for (const id of idsPagina) next.delete(id);
      } else {
        for (const id of idsPagina) next.add(id);
      }
      return next;
    });
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
          {leadsLiberadosPorCascata && itens.length > 0 && itensVisiveis.length === 0 ? (
            <>
              Nenhum lead disponível neste canal ainda.
              <br />
              Aguardando finalização do canal anterior
              {canalAnterior ? <> (<strong>{CANAL_LABEL[canalAnterior]}</strong>)</> : null}
              {" "}— os leads aparecem aqui automaticamente quando forem encerrados ou transferidos.
            </>
          ) : (
            "Nenhum lead encontrado neste filtro."
          )}
        </div>
      ) : (
        <div className="h-[440px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/50 backdrop-blur z-10">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                {cascataAtiva && (
                  <th className="px-2 py-1.5 w-8">
                    <Checkbox
                      checked={
                        filtradosPagina.length > 0 &&
                        filtradosPagina.every((l: any) => selecionados.has(l.id))
                      }
                      onCheckedChange={toggleTodos}
                    />
                  </th>
                )}
                <th className="px-2 py-1.5 font-semibold w-10">#</th>
                <th className="px-3 py-1.5 font-semibold">Nome</th>
                <th className="px-3 py-1.5 font-semibold">Telefone</th>
                <th className="px-3 py-1.5 font-semibold">Email</th>
                <th className="px-3 py-1.5 font-semibold whitespace-nowrap">Status</th>
                {cascataAtiva && (
                  <th className="px-3 py-1.5 font-semibold whitespace-nowrap">Tempo</th>
                )}
                <th className="px-3 py-1.5 font-semibold text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtradosPagina.map((l: any, idxNaPagina: number) => {
                const idx = (paginaAtual - 1) * PAGE_SIZE_UI + idxNaPagina;
                const sRow = statusMap?.get(l.id);
                const status = sRow?.status_proposta ?? "a_contactar";
                const fechadoProp = status === "fechado_proposta";
                const temRaia = !!sRow?.tem_raia_aberta;
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
                    className={`border-t hover:bg-accent/40 transition-colors text-[13px] ${hardBlock ? "opacity-60" : ""}`}
                  >
                    {cascataAtiva && (
                      <td className="px-2 py-1.5">
                        <Checkbox
                          checked={checked}
                          disabled={hardBlock || precisaLiberar}
                          onCheckedChange={() => toggleLead(l.id)}
                        />
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-muted-foreground text-xs">{idx + 1}</td>
                    <td
                      className="px-3 py-1.5 font-medium cursor-pointer hover:text-primary"
                      onClick={() => setLeadAberto(l.id)}
                    >
                      {l.nome || "Sem nome"}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground text-xs whitespace-nowrap">
                      {l.phone_e164 || "—"}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground text-xs truncate max-w-[180px]">
                      {l.email || "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      <TooltipProvider delayDuration={150}>
                        <div className="flex items-center gap-1">
                          <Badge
                            variant={
                              fechadoProp
                                ? "secondary"
                                : status === "contactado"
                                ? "default"
                                : "outline"
                            }
                            className="text-[10px] whitespace-nowrap px-1.5 py-0 h-5"
                          >
                            {STATUS_LABEL[status]}
                          </Badge>
                          {temRaia && !fechadoProp && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                              </TooltipTrigger>
                              <TooltipContent>Aberto na raia — ação pendente</TooltipContent>
                            </Tooltip>
                          )}
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
                                <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>Bloqueio temporário ativo</TooltipContent>
                            </Tooltip>
                          )}
                          {blkJanela && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
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
                      <td className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                        <TempoRaia entrouEm={tempo?.entrouEm} />
                      </td>
                    )}
                    <td className="px-3 py-1.5 text-right">
                      {hardBlock ? (
                        <span className="text-xs text-muted-foreground">Bloqueado</span>
                      ) : precisaLiberar ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          onClick={() => setLiberarLead({ id: l.id, nome: l.nome })}
                        >
                          <Unlock className="h-3 w-3 mr-1" />
                          Liberar
                        </Button>
                      ) : cascataAtiva ? (
                        <div className="flex items-center justify-end gap-1">
                          {tempo && canal !== "tiktok" && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-7 px-2"
                                  disabled={proximaFase.isPending}
                                  onClick={() =>
                                    proximaFase.mutate({
                                      campanhaPropostaId: campanhaPropostaId!,
                                      leadId: l.id,
                                      canalAtual: canal!,
                                    })
                                  }
                                >
                                  {proximaFase.isPending ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <>
                                      <ArrowRightCircle className="h-3 w-3 mr-1" />
                                      Próxima fase
                                    </>
                                  )}
                                </Button>
                          )}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={fechandoId === l.id}
                                onClick={() => encerrarNaProposta(l.id)}
                                className="h-7 px-2"
                              >
                                {fechandoId === l.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Encerrar
                                  </>
                                )}
                              </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filtrados.length > 0 && (
        <div className="flex items-center justify-between gap-2 p-2 border-t bg-muted/20 text-xs text-muted-foreground flex-wrap">
          <span>
            Mostrando{" "}
            <strong className="text-foreground">
              {(paginaAtual - 1) * PAGE_SIZE_UI + 1}
              {"–"}
              {Math.min(paginaAtual * PAGE_SIZE_UI, filtrados.length)}
            </strong>{" "}
            de <strong className="text-foreground">{filtrados.length}</strong> leads
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              disabled={paginaAtual <= 1}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <span className="px-2">
              Página <strong className="text-foreground">{paginaAtual}</strong> de{" "}
              <strong className="text-foreground">{totalPaginas}</strong>
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              disabled={paginaAtual >= totalPaginas}
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            >
              Próxima
            </Button>
          </div>
        </div>
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

      {cascataAtiva && liberarLead && (
        <LiberarLeadDialog
          open={!!liberarLead}
          onOpenChange={(o) => !o && setLiberarLead(null)}
          leadId={liberarLead.id}
          leadNome={liberarLead.nome}
          campanhaPropostaId={campanhaPropostaId!}
          motivoAnterior={statusMap?.get(liberarLead.id)?.ultimo_motivo}
          ultimaDecisaoEm={statusMap?.get(liberarLead.id)?.ultima_decisao_em}
          ultimoDisparo={statusMap?.get(liberarLead.id)?.ultimo_disparo}
          bloqueioJanela7d={!!statusMap?.get(liberarLead.id)?.bloqueado_janela_7d}
          fechadoProposta={statusMap?.get(liberarLead.id)?.status_proposta === "fechado_proposta"}
        />
      )}
    </Card>
  );
}
