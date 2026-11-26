import { useMemo, useState } from "react";
import {
  ArrowRightToLine,
  CheckSquare,
  ChevronsLeft,
  CircleDot,
  Clock,
  Handshake,
  Loader2,
  MessageCircleReply,
  PhoneOutgoing,
  UserCheck,
  UserRoundPlus,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { AcompanhamentoCard } from "./AcompanhamentoCard";
import { CanaisProvider } from "./canaisDoLead";
import {
  useAcompanhamentoColunaMais,
  useAprovarLead,
  useMarcarPerdido,
  useMoverEtapa,
  type AcompanhamentoLead,
  type EtapaCrm,
  type FiltroAcompanhamento,
} from "@/hooks/useAcompanhamentoLeads";
import { useLeadsCrossCampanha } from "@/hooks/useLeadsCrossCampanha";

interface Props {
  filtro: FiltroAcompanhamento;
  busca: string;
  /** Saída do useAcompanhamentoQuadro, que mora na AcompanhamentoView (uma consulta só para a aba inteira). */
  porEtapaCrm: Record<EtapaCrm, AcompanhamentoLead[]>;
  colunas: Partial<Record<EtapaCrm, number>>;
  isLoading: boolean;
  onLeadClick: (lead: AcompanhamentoLead) => void;
}

type ColunaDef = {
  etapa: Exclude<EtapaCrm, "perdido">;
  label: string;
  descricao: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  /** Coluna que pede ação da equipe: cabeçalho em destaque. */
  destaque?: boolean;
  /** Coluna de volume (milhares de cards, nada a fazer): começa recolhida numa faixa estreita. */
  volume?: boolean;
};

const COLUNAS: ColunaDef[] = [
  { etapa: "novo", label: "Novo", descricao: "Ainda não contatado", icon: UserRoundPlus, color: "text-slate-600", bg: "bg-slate-50", volume: true },
  { etapa: "contatado", label: "Contatado", descricao: "Aguardando resposta", icon: PhoneOutgoing, color: "text-violet-600", bg: "bg-violet-50", volume: true },
  { etapa: "respondeu", label: "Respondeu", descricao: "Aguardando responsável", icon: MessageCircleReply, color: "text-orange-600", bg: "bg-orange-50", destaque: true },
  { etapa: "em_atendimento", label: "Em atendimento", descricao: "Conversa assumida", icon: UserCheck, color: "text-cyan-700", bg: "bg-cyan-50" },
  { etapa: "qualificado", label: "Qualificado", descricao: "Quentes: interesse e requisitos", icon: CircleDot, color: "text-amber-700", bg: "bg-amber-50", destaque: true },
  { etapa: "encaminhado", label: "Encaminhado", descricao: "Avançou na oportunidade", icon: ArrowRightToLine, color: "text-blue-700", bg: "bg-blue-50" },
  { etapa: "convertido", label: "Convertido", descricao: "Enviado para Contratos", icon: Handshake, color: "text-emerald-700", bg: "bg-emerald-50" },
];

// Colunas que a pessoa trocou do padrão (Novo/Contatado começam recolhidas; as outras, abertas).
const ALTERNADAS_STORAGE_KEY = "acompanhamento-colunas-alternadas";

function carregarAlternadas(): Set<EtapaCrm> {
  try {
    const salvo = JSON.parse(localStorage.getItem(ALTERNADAS_STORAGE_KEY) || "[]");
    if (Array.isArray(salvo)) return new Set(salvo as EtapaCrm[]);
  } catch {
    // localStorage bloqueado ou lixo: começa com as colunas de volume recolhidas
  }
  return new Set();
}

const ETAPAS_AUTOMATICAS = new Set<EtapaCrm>([
  "novo",
  "contatado",
  "respondeu",
  "em_atendimento",
]);

export function AcompanhamentoKanban({ filtro, busca, porEtapaCrm, colunas, isLoading, onLeadClick }: Props) {
  const [perdidoExpanded, setPerdidoExpanded] = useState(false);
  const [dragging, setDragging] = useState<AcompanhamentoLead | null>(null);
  const [dragOverEtapa, setDragOverEtapa] = useState<EtapaCrm | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [alternadas, setAlternadas] = useState<Set<EtapaCrm>>(() => carregarAlternadas());
  const moverEtapa = useMoverEtapa();
  const aprovarLead = useAprovarLead();
  const marcarPerdido = useMarcarPerdido();
  const buscando = busca.trim().length > 0;

  const leadsCarregados = useMemo(() => Object.values(porEtapaCrm).flat(), [porEtapaCrm]);
  const leadIds = useMemo(() => leadsCarregados.map((lead) => lead.lead_id), [leadsCarregados]);
  const { data: crossCampanhasMap } = useLeadsCrossCampanha(leadIds);

  const perdidos = useAcompanhamentoColunaMais("perdido", filtro, busca, perdidoExpanded, 0);
  const listaPerdidos = useMemo(() => perdidos.data?.pages.flat() ?? [], [perdidos.data]);
  const totalPerdidos = colunas.perdido ?? 0;

  const alternarColuna = (etapa: EtapaCrm) => {
    setAlternadas((atual) => {
      const next = new Set(atual);
      if (next.has(etapa)) next.delete(etapa);
      else next.add(etapa);
      try {
        localStorage.setItem(ALTERNADAS_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // sem localStorage a preferência vale só nesta visita
      }
      return next;
    });
  };

  const toggleSelect = (campanhaLeadId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(campanhaLeadId)) next.delete(campanhaLeadId);
      else next.add(campanhaLeadId);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const moverParaEtapaComercial = async (campanhaLeadId: string, etapa: EtapaCrm) => {
    if (ETAPAS_AUTOMATICAS.has(etapa)) {
      throw new Error("Essa etapa muda automaticamente conforme contato, resposta e assunção.");
    }
    if (etapa === "qualificado") {
      return moverEtapa.mutateAsync({ campanha_lead_id: campanhaLeadId, etapa: "quente" });
    }
    if (etapa === "encaminhado") return aprovarLead.mutateAsync(campanhaLeadId);
    if (etapa === "convertido") {
      return moverEtapa.mutateAsync({ campanha_lead_id: campanhaLeadId, etapa: "na_escala" });
    }
    return marcarPerdido.mutateAsync({
      campanha_lead_id: campanhaLeadId,
      motivo: "Marcado em massa pelo funil comercial",
    });
  };

  const bulkMover = async (etapa: EtapaCrm) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    let sucessos = 0;
    let falhas = 0;
    const erros: string[] = [];
    for (const id of selectedIds) {
      try {
        await moverParaEtapaComercial(id, etapa);
        sucessos += 1;
      } catch (error) {
        falhas += 1;
        if (erros.length < 2) erros.push(error instanceof Error ? error.message : "Erro inesperado");
      }
    }
    setBulkBusy(false);
    if (falhas === 0) {
      toast.success(`${sucessos} lead(s) atualizados`);
      clearSelection();
    } else {
      toast.warning(`${sucessos} atualizados, ${falhas} falharam. ${erros.join(" ")}`);
    }
  };

  const handleDrop = async (etapa: EtapaCrm) => {
    const lead = dragging;
    setDragging(null);
    setDragOverEtapa(null);
    if (!lead || lead.etapa_crm === etapa) return;
    try {
      await moverParaEtapaComercial(lead.campanha_lead_id, etapa);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível mover o lead");
    }
  };

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-hidden" aria-busy="true" aria-label="Carregando o quadro">
        {COLUNAS.map((coluna) => (
          <div
            key={coluna.etapa}
            className={`${coluna.volume ? "w-14" : "w-[min(82vw,19rem)]"} min-h-72 shrink-0 animate-pulse rounded-md border bg-muted/20`}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        <span>Contato, resposta e assunção movem o card automaticamente.</span>
      </div>

      <CanaisProvider leads={leadsCarregados}>
        <div className="overflow-x-auto pb-3">
          <div className="flex min-w-max gap-3">
            {COLUNAS.map((coluna) => {
              const total = colunas[coluna.etapa] ?? 0;
              // Na busca, coluna com resultado abre sozinha e coluna vazia recolhe: o lead procurado fica à vista.
              const recolhida = buscando
                ? total === 0
                : coluna.volume
                  ? !alternadas.has(coluna.etapa)
                  : alternadas.has(coluna.etapa);
              if (recolhida) {
                return (
                  <ColunaRecolhida
                    key={coluna.etapa}
                    {...coluna}
                    total={total}
                    podeAbrir={!buscando}
                    onAbrir={() => alternarColuna(coluna.etapa)}
                  />
                );
              }
              return (
                <Coluna
                  key={coluna.etapa}
                  {...coluna}
                  total={total}
                  leads={porEtapaCrm[coluna.etapa] || []}
                  filtro={filtro}
                  busca={busca}
                  crossCampanhasMap={crossCampanhasMap}
                  onLeadClick={onLeadClick}
                  onDragStart={setDragging}
                  onDragEnd={() => {
                    setDragging(null);
                    setDragOverEtapa(null);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverEtapa(coluna.etapa);
                  }}
                  onDrop={() => void handleDrop(coluna.etapa)}
                  isOver={dragOverEtapa === coluna.etapa}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onRecolher={buscando ? undefined : () => alternarColuna(coluna.etapa)}
                />
              );
            })}
          </div>
        </div>
      </CanaisProvider>

      {selectedIds.size > 0 && (
        <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2 rounded-lg border bg-background p-3 shadow-lg sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2">
          <div className="flex min-h-11 items-center gap-1.5 px-2">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{selectedIds.size} selecionado(s)</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="min-h-11" disabled={bulkBusy}>
                Avançar para...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              <DropdownMenuItem onClick={() => void bulkMover("qualificado")}>Qualificado</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void bulkMover("encaminhado")}>Encaminhado</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void bulkMover("convertido")}>Convertido</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 text-destructive hover:text-destructive"
            disabled={bulkBusy}
            onClick={() => void bulkMover("perdido")}
          >
            <XCircle className="mr-1.5 h-4 w-4" /> Perdido
          </Button>
          <Button size="sm" variant="ghost" className="min-h-11" onClick={clearSelection} disabled={bulkBusy}>
            <X className="mr-1 h-4 w-4" /> Limpar
          </Button>
        </div>
      )}

      <div className="mt-1 rounded-md border bg-muted/20">
        <button
          type="button"
          onClick={() => setPerdidoExpanded((open) => !open)}
          className="flex min-h-11 w-full items-center justify-between p-3 transition-colors hover:bg-muted/30"
        >
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-medium">Perdidos</span>
            <Badge variant="outline" className="text-xs tabular-nums">{formatarNumero(totalPerdidos)}</Badge>
          </div>
          <span className="text-xs text-muted-foreground">{perdidoExpanded ? "Ocultar" : "Mostrar"}</span>
        </button>
        {perdidoExpanded && (
          <div className="border-t p-2">
            {perdidos.isLoading ? (
              <p className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando perdidos...
              </p>
            ) : listaPerdidos.length === 0 ? (
              <p className="py-4 text-center text-xs italic text-muted-foreground">Nenhum lead perdido.</p>
            ) : (
              <CanaisProvider leads={listaPerdidos}>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {listaPerdidos.map((lead) => (
                    <AcompanhamentoCard
                      key={lead.campanha_lead_id}
                      lead={lead}
                      onClick={() => onLeadClick(lead)}
                      onDragStart={() => setDragging(lead)}
                      onDragEnd={() => setDragging(null)}
                    />
                  ))}
                </div>
                <BotaoCarregarMais
                  restantes={totalPerdidos - listaPerdidos.length}
                  carregando={perdidos.isFetchingNextPage}
                  disponivel={!!perdidos.hasNextPage}
                  onClick={() => void perdidos.fetchNextPage()}
                />
              </CanaisProvider>
            )}
          </div>
        )}
      </div>
    </>
  );
}

const fmt = new Intl.NumberFormat("pt-BR");
function formatarNumero(n: number) {
  return fmt.format(n);
}

function BotaoCarregarMais({
  restantes,
  carregando,
  disponivel,
  onClick,
}: {
  restantes: number;
  carregando: boolean;
  disponivel: boolean;
  onClick: () => void;
}) {
  if (restantes <= 0 || !disponivel) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="mt-2 min-h-9 w-full text-xs"
      disabled={carregando}
      onClick={onClick}
    >
      {carregando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
      Carregar mais ({formatarNumero(restantes)} restantes)
    </Button>
  );
}

function ColunaRecolhida({
  label,
  icon: Icon,
  color,
  bg,
  total,
  podeAbrir,
  onAbrir,
}: ColunaDef & { total: number; podeAbrir: boolean; onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      disabled={!podeAbrir}
      title={podeAbrir ? `Abrir a coluna ${label}` : `${label}: nenhum resultado na busca`}
      aria-label={podeAbrir ? `Abrir a coluna ${label} (${total} leads)` : `${label}: nenhum resultado`}
      className={`flex w-14 shrink-0 flex-col items-center gap-2 rounded-md border ${bg} py-3 transition-colors enabled:hover:border-primary/50 disabled:opacity-60`}
    >
      <Icon className={`h-4 w-4 ${color}`} />
      <span className="text-xs font-semibold tabular-nums">{formatarNumero(total)}</span>
      <span className="rotate-180 text-sm font-medium [writing-mode:vertical-rl]">{label}</span>
    </button>
  );
}

interface ColunaProps extends ColunaDef {
  total: number;
  leads: AcompanhamentoLead[];
  filtro: FiltroAcompanhamento;
  busca: string;
  crossCampanhasMap?: Map<string, Array<{ id: string; nome: string }>>;
  onLeadClick: (lead: AcompanhamentoLead) => void;
  onDragStart: (lead: AcompanhamentoLead) => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: () => void;
  isOver: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onRecolher?: () => void;
}

function Coluna({
  etapa,
  label,
  descricao,
  icon: Icon,
  color,
  bg,
  destaque,
  total,
  leads,
  filtro,
  busca,
  crossCampanhasMap,
  onLeadClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  isOver,
  selectedIds,
  onToggleSelect,
  onRecolher,
}: ColunaProps) {
  const automatica = ETAPAS_AUTOMATICAS.has(etapa);
  const [querMais, setQuerMais] = useState(false);
  // Páginas além das primeiras CARDS_POR_COLUNA: só quando a pessoa pede.
  const mais = useAcompanhamentoColunaMais(etapa, filtro, busca, querMais, leads.length);
  const extras = useMemo(() => mais.data?.pages.flat() ?? [], [mais.data]);
  const extrasIds = useMemo(() => extras.map((l) => l.lead_id), [extras]);
  const { data: crossExtras } = useLeadsCrossCampanha(extrasIds);
  const restantes = total - leads.length - extras.length;

  const renderCard = (lead: AcompanhamentoLead, cross?: Map<string, Array<{ id: string; nome: string }>>) => (
    <AcompanhamentoCard
      key={lead.campanha_lead_id}
      lead={lead}
      crossCampanhas={cross?.get(lead.lead_id)}
      onClick={() => onLeadClick(lead)}
      onDragStart={() => onDragStart(lead)}
      onDragEnd={onDragEnd}
      selected={selectedIds.has(lead.campanha_lead_id)}
      onToggleSelect={() => onToggleSelect(lead.campanha_lead_id)}
    />
  );

  return (
    <section
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`w-[min(82vw,19rem)] shrink-0 rounded-md border ${bg} ${destaque ? DESTAQUE_BORDA[etapa] ?? "" : ""} ${isOver ? "ring-2 ring-primary" : ""}`}
      aria-label={`Etapa ${label}`}
    >
      <header className="border-b bg-card/60 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Icon className={`h-4 w-4 shrink-0 ${color}`} />
            <span className={`truncate text-sm ${destaque ? "font-semibold" : "font-medium"}`}>{label}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Badge
              variant="outline"
              className={`h-5 text-xs tabular-nums ${destaque && total > 0 ? DESTAQUE_BADGE[etapa] ?? "" : ""}`}
            >
              {formatarNumero(total)}
            </Badge>
            {onRecolher && (
              <button
                type="button"
                onClick={onRecolher}
                title={`Recolher a coluna ${label}`}
                aria-label={`Recolher a coluna ${label}`}
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted"
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {descricao}{automatica ? " · automático" : ""}
        </p>
      </header>
      <div className="max-h-[65dvh] min-h-72 space-y-2 overflow-y-auto p-2">
        {leads.length === 0 ? (
          <p className="py-6 text-center text-xs italic text-muted-foreground">Vazio</p>
        ) : (
          <>
            {leads.map((lead) => renderCard(lead, crossCampanhasMap))}
            {extras.length > 0 && (
              <CanaisProvider leads={extras}>{extras.map((lead) => renderCard(lead, crossExtras))}</CanaisProvider>
            )}
            <BotaoCarregarMais
              restantes={restantes}
              carregando={mais.isFetching}
              disponivel={!querMais || !!mais.hasNextPage}
              onClick={() => (querMais ? void mais.fetchNextPage() : setQuerMais(true))}
            />
          </>
        )}
      </div>
    </section>
  );
}

// Classes literais (o Tailwind só gera o que aparece escrito no código).
const DESTAQUE_BORDA: Partial<Record<EtapaCrm, string>> = {
  respondeu: "border-t-4 border-t-orange-500",
  qualificado: "border-t-4 border-t-amber-500",
};
const DESTAQUE_BADGE: Partial<Record<EtapaCrm, string>> = {
  respondeu: "border-orange-300 bg-orange-100 text-orange-900",
  qualificado: "border-amber-300 bg-amber-100 text-amber-900",
};
