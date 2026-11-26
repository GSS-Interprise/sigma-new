import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AlertTriangle, ClipboardList, Clock, Loader2, Search, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AcompanhamentoKanban } from "./AcompanhamentoKanban";
import { AcompanhamentoLeadPainel } from "./AcompanhamentoLeadPainel";
import { AcompanhamentoAgingBanner } from "./AcompanhamentoAgingBanner";
import { AiSupervisionQueue } from "./AiSupervisionQueue";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useAcompanhamentoLeadPorId,
  useAcompanhamentoQuadro,
  type AcompanhamentoLead,
  type FiltroAcompanhamento,
} from "@/hooks/useAcompanhamentoLeads";

const FILTRO_STORAGE_KEY = "acompanhamento-filtro";
const AGING_THRESHOLD_STORAGE_KEY = "acompanhamento-aging-threshold";

const THRESHOLD_OPCOES = [
  { value: 6, label: "6 horas" },
  { value: 12, label: "12 horas" },
  { value: 24, label: "24 horas" },
  { value: 48, label: "48 horas" },
];

const FILTROS: Array<{ id: FiltroAcompanhamento; label: string; dica: string }> = [
  { id: "todos", label: "Todos", dica: "Todos os leads em acompanhamento" },
  { id: "minha_fila", label: "Minha fila", dica: "Leads que você assumiu" },
  { id: "sem_dono", label: "Sem dono", dica: "Leads que ninguém assumiu" },
  { id: "aguarda_maikon", label: "Aguarda Maikon", dica: "Qualificados sem a validação clínica do Maikon" },
  { id: "aguarda_equipe", label: "Aguarda equipe", dica: "Qualificados sem a validação de processos da equipe" },
];

const fmt = new Intl.NumberFormat("pt-BR");

function lerStorage(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarStorage(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // sem localStorage a preferência vale só nesta visita
  }
}

function carregarAgingThresholdInicial(): number {
  const saved = parseInt(lerStorage(AGING_THRESHOLD_STORAGE_KEY) || "", 10);
  if (!Number.isNaN(saved) && THRESHOLD_OPCOES.some((o) => o.value === saved)) return saved;
  return 12;
}

function carregarFiltroInicial(isAdmin: boolean): FiltroAcompanhamento {
  // Persistido no localStorage tem prioridade (preferência explícita do user)
  const saved = lerStorage(FILTRO_STORAGE_KEY);
  if (saved && FILTROS.some((f) => f.id === saved)) return saved as FiltroAcompanhamento;
  // Default por role (F2.10): admin vê tudo, operadora vê só dela
  return isAdmin ? "todos" : "minha_fila";
}

/** Espera a pessoa parar de digitar antes de consultar: cada consulta custa ~1 s no servidor. */
function useDebounce<T>(valor: T, ms: number): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return atrasado;
}

/**
 * Aba "Quentes (IA)" da tela Campanhas. Pergunta da tela: "qual médico precisa de mim agora?".
 * No topo: busca (achar um lead específico) e os filtros com contagem do servidor. No quadro, Respondeu e
 * Qualificado (os quentes) em destaque; Novo e Contatado, que somam milhares de cards sem ação, começam recolhidos.
 */
export function AcompanhamentoView() {
  const { isAdmin } = usePermissions();
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<FiltroAcompanhamento>(() => carregarFiltroInicial(isAdmin));
  const [agingThreshold, setAgingThreshold] = useState<number>(() => carregarAgingThresholdInicial());
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const busca = useDebounce(buscaDigitada, 350);
  const [leadAbertoId, setLeadAbertoId] = useState<string | null>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  const quadro = useAcompanhamentoQuadro(filtro, busca);
  const { data: leadAberto } = useAcompanhamentoLeadPorId(leadAbertoId);

  useEffect(() => gravarStorage(FILTRO_STORAGE_KEY, filtro), [filtro]);
  useEffect(() => gravarStorage(AGING_THRESHOLD_STORAGE_KEY, String(agingThreshold)), [agingThreshold]);

  // O painel lê o lead por id (fora do quadro paginado). Quando o quadro recarrega depois de uma mutação ou de um
  // evento realtime, o lead aberto recarrega junto, como antes, quando ele saía da lista completa.
  const quadroAtualizadoEm = quadro.atualizadoEm;
  useEffect(() => {
    if (leadAbertoId) qc.invalidateQueries({ queryKey: ["acompanhamento-lead-by-campanha-lead", leadAbertoId] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quadroAtualizadoEm]);

  // Atalho "/" foca a busca (padrão de Gmail, GitHub, Slack).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (e.key !== "/" || alvo?.closest("input, textarea, [contenteditable=true]")) return;
      e.preventDefault();
      buscaRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const abrirLead = (lead: AcompanhamentoLead) => setLeadAbertoId(lead.campanha_lead_id);
  const termo = busca.trim();
  const buscandoAgora = buscaDigitada.trim() !== termo || (quadro.isFetching && !!termo);
  const totalNaBusca = quadro.filtros ? quadro.filtros[filtro] : 0;
  const semNada = !quadro.isLoading && !quadro.error && quadro.filtros?.todos === 0;

  return (
    <div className="space-y-3">
      <AiSupervisionQueue onOpenLead={setLeadAbertoId} />

      {/* F3.4 — Banner de aging de leads quentes (threshold configurável) */}
      <AcompanhamentoAgingBanner
        leads={quadro.quentesSemDono}
        thresholdHoras={agingThreshold}
        onLeadClick={setLeadAbertoId}
      />

      {/* Busca + filtros: achar um médico específico é a primeira coisa que a pessoa faz aqui. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={buscaRef}
            value={buscaDigitada}
            onChange={(e) => setBuscaDigitada(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setBuscaDigitada("");
            }}
            placeholder="Buscar médico por nome, telefone ou campanha"
            aria-label="Buscar médico por nome, telefone ou campanha"
            className="h-11 pl-9 pr-10"
          />
          {buscandoAgora ? (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : buscaDigitada ? (
            <button
              type="button"
              onClick={() => {
                setBuscaDigitada("");
                buscaRef.current?.focus();
              }}
              aria-label="Limpar busca"
              title="Limpar busca (Esc)"
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar leads">
          {FILTROS.map((f) => (
            <FiltroChip key={f.id} ativo={filtro === f.id} onClick={() => setFiltro(f.id)} title={f.dica}>
              {f.label}
              <span className="ml-1 tabular-nums opacity-60">
                {quadro.filtros ? fmt.format(quadro.filtros[f.id]) : "–"}
              </span>
            </FiltroChip>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 text-xs">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Alertar quentes parados há</span>
          <Select value={String(agingThreshold)} onValueChange={(v) => setAgingThreshold(Number(v))}>
            <SelectTrigger className="min-h-11 w-28 text-xs" aria-label="Alertar quentes parados há">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THRESHOLD_OPCOES.map((o) => (
                <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {termo && !buscandoAgora && !quadro.error && (
        <p className="text-sm text-muted-foreground" role="status">
          {totalNaBusca === 0 ? (
            <>
              Nenhum lead com <strong className="text-foreground">“{termo}”</strong>
              {filtro !== "todos" ? " neste filtro. Tente em Todos" : ". Confira o nome ou digite só o fim do telefone"}.
            </>
          ) : (
            <>
              {fmt.format(totalNaBusca)} lead{totalNaBusca === 1 ? "" : "s"} com{" "}
              <strong className="text-foreground">“{termo}”</strong>
            </>
          )}
        </p>
      )}

      {quadro.error ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-3 py-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-medium">Não foi possível carregar o quadro.</p>
              <p className="mt-1 text-xs text-muted-foreground">{quadro.error.message}. Recarregue a página.</p>
            </div>
          </CardContent>
        </Card>
      ) : semNada ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhum lead em acompanhamento ainda.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Os leads aparecem aqui conforme avançam nas campanhas e no atendimento.
            </p>
          </CardContent>
        </Card>
      ) : (
        <AcompanhamentoKanban
          filtro={filtro}
          busca={termo}
          porEtapaCrm={quadro.porEtapaCrm}
          colunas={quadro.colunas}
          isLoading={quadro.isLoading}
          onLeadClick={abrirLead}
        />
      )}

      <AcompanhamentoLeadPainel lead={leadAbertoId ? leadAberto ?? null : null} onClose={() => setLeadAbertoId(null)} />
    </div>
  );
}

function FiltroChip({
  ativo,
  onClick,
  title,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={ativo}
      className={`min-h-11 rounded-full border px-3 py-1.5 text-xs transition-colors ${
        ativo
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
