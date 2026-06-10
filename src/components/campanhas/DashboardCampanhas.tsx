import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ComparativoOperadoras } from "./ComparativoOperadoras";
import { DashboardMetasFase1 } from "./DashboardMetasFase1";
import { DashboardFunilFase2 } from "./DashboardFunilFase2";
import { DashboardSaudeFase3 } from "./DashboardSaudeFase3";
import {
  Rocket,
  Users,
  Flame,
  CheckCircle2,
  Send,
  TrendingUp,
  Clock,
  AlertCircle,
  Download,
  Printer,
  FileSpreadsheet,
  Filter,
  X,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  exportarDashboardPDF,
  exportarDashboardExcel,
  type DashboardExportData,
} from "@/lib/exportDashboard";

const UF_LIST = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

interface DashboardRow {
  campanha_id: string;
  nome: string;
  status: string;
  tipo_campanha: string;
  regiao_estado: string | null;
  especialidade_id: string | null;
  dias_no_ar: number | null;
  pool_total: number | null;
  pool_pendentes: number | null;
  contatado: number | null;
  em_conversa: number | null;
  quentes: number | null;
  convertidos: number | null;
  total_disparos: number | null;
  total_falhas: number | null;
  taxa_contato_pct: number | null;
  disparos_hoje: number | null;
  disparos_24h: number | null;
  disparos_7d: number | null;
  quente_mais_antigo_h: number | null;
}

export function DashboardCampanhas() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filtroCampanha = searchParams.get("dash_campanha") || "todas";
  const filtroEstado = searchParams.get("dash_estado") || "todos";
  const filtroEspecialidade = searchParams.get("dash_esp") || "todas";

  const setFiltro = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "todos" || value === "todas") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const limparFiltros = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("dash_campanha");
    next.delete("dash_estado");
    next.delete("dash_esp");
    setSearchParams(next, { replace: true });
  };

  const temFiltro =
    filtroCampanha !== "todas" || filtroEstado !== "todos" || filtroEspecialidade !== "todas";

  // Lista de campanhas pra dropdown filtro (puxa do mesmo lugar do dashboard)
  const { data: rows, isLoading } = useQuery({
    queryKey: ["dashboard-campanhas"],
    queryFn: async (): Promise<DashboardRow[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_campanhas_dashboard")
        .select("*")
        .in("status", ["ativa", "pausada"])
        .order("disparos_24h", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DashboardRow[];
    },
    refetchInterval: 60_000,
  });

  // IA × Manual — tipo_envio por campanha (a view não traz; junta com a tabela campanhas)
  const { data: tiposMap = new Map<string, string>() } = useQuery({
    queryKey: ["dashboard-tipos-envio"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("campanhas")
        .select("id, tipo_envio")
        .in("status", ["ativa", "pausada"]);
      const m = new Map<string, string>();
      (data ?? []).forEach((c: any) => m.set(c.id, c.tipo_envio || "ia"));
      return m;
    },
    staleTime: 60_000,
  });

  // Lista de especialidades das campanhas existentes (pra dropdown)
  const { data: especialidades = [] } = useQuery({
    queryKey: ["dashboard-especialidades"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("especialidades")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      return (data ?? []) as Array<{ id: string; nome: string }>;
    },
    staleTime: 5 * 60_000,
  });

  // Aplica filtros nas linhas (campanha + estado + especialidade)
  const rowsFiltradas = useMemo(() => {
    return (rows ?? []).filter((r) => {
      if (filtroCampanha !== "todas" && r.campanha_id !== filtroCampanha) return false;
      if (filtroEstado !== "todos" && r.regiao_estado !== filtroEstado) return false;
      if (filtroEspecialidade !== "todas" && r.especialidade_id !== filtroEspecialidade)
        return false;
      return true;
    });
  }, [rows, filtroCampanha, filtroEstado, filtroEspecialidade]);

  // Especialidades disponíveis nas campanhas atuais (subset de todas)
  const especialidadesDisponiveis = useMemo(() => {
    const idsEmUso = new Set((rows ?? []).map((r) => r.especialidade_id).filter(Boolean));
    return especialidades.filter((e) => idsEmUso.has(e.id));
  }, [especialidades, rows]);

  // Estados disponíveis nas campanhas atuais
  const estadosDisponiveis = useMemo(() => {
    const ufsEmUso = new Set(
      (rows ?? []).map((r) => r.regiao_estado).filter(Boolean) as string[],
    );
    return UF_LIST.filter((uf) => ufsEmUso.has(uf));
  }, [rows]);

  // Estado real dos chips por campanha — pra status honesto ("sem chip" ≠ "ativa")
  // e pros cartões de decisão. Confiável pós-sync do chip-auto-reconnect (10/06).
  const { data: chipsPorCampanha = new Map<string, { total: number; open: number }>() } = useQuery({
    queryKey: ["dashboard-chips-campanha"],
    queryFn: async () => {
      const [{ data: camps }, { data: chips }] = await Promise.all([
        (supabase as any).from("campanhas").select("id, chip_ids, chip_id").in("status", ["ativa", "pausada"]),
        (supabase as any).from("chips").select("id, connection_state"),
      ]);
      const stateById = new Map<string, string>((chips ?? []).map((c: any) => [c.id, c.connection_state]));
      const m = new Map<string, { total: number; open: number }>();
      for (const c of camps ?? []) {
        const ids: string[] = (c.chip_ids?.length ? c.chip_ids : [c.chip_id]).filter(Boolean);
        m.set(c.id, {
          total: ids.length,
          open: ids.filter((id) => stateById.get(id) === "open").length,
        });
      }
      return m;
    },
    refetchInterval: 60_000,
  });

  // Métrica acionável: quantos leads únicos foram descartados por phone inválido.
  // Mostra qualidade da base de leads (NÃO é "erro do sistema" — é dado da fonte).
  const { data: descartadosPhone = 0 } = useQuery({
    queryKey: ["dashboard-descartados-phone"],
    queryFn: async (): Promise<number> => {
      const { count } = await (supabase as any)
        .from("campanha_leads")
        .select("lead_id", { count: "exact", head: false })
        .eq("status", "descartado")
        .or(
          "erro_envio.ilike.%phone%inexistente%,erro_envio.ilike.%Telefone inv%,erro_envio.ilike.%Sem telefone%,erro_envio.ilike.%exists%false%"
        );
      return count ?? 0;
    },
    refetchInterval: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-muted/40 rounded-md animate-pulse" />
        ))}
      </div>
    );
  }

  // Agregados pra cards de topo — respeita filtros
  // Removido 'falhas' cumulativo — métrica enganosa pra equipe não-técnica
  // (inclui pausas anti-ban como se fossem erro). Substituído por
  // "Médicos sem WhatsApp" (descartadosPhone) que é dado de qualidade da base.
  const agg = rowsFiltradas.reduce(
    (acc, r) => ({
      campanhas: acc.campanhas + 1,
      pool_total: acc.pool_total + (r.pool_total ?? 0),
      contatado: acc.contatado + (r.contatado ?? 0),
      em_conversa: acc.em_conversa + (r.em_conversa ?? 0),
      quentes: acc.quentes + (r.quentes ?? 0),
      convertidos: acc.convertidos + (r.convertidos ?? 0),
      disparos_24h: acc.disparos_24h + (r.disparos_24h ?? 0),
      disparos_7d: acc.disparos_7d + (r.disparos_7d ?? 0),
    }),
    {
      campanhas: 0,
      pool_total: 0,
      contatado: 0,
      em_conversa: 0,
      quentes: 0,
      convertidos: 0,
      disparos_24h: 0,
      disparos_7d: 0,
    }
  );

  const coberturaPct = agg.pool_total > 0 ? (agg.contatado / agg.pool_total) * 100 : 0;
  const conversionPct = agg.contatado > 0 ? (agg.convertidos / agg.contatado) * 100 : 0;
  const responseRatePct = agg.contatado > 0 ? (agg.em_conversa / agg.contatado) * 100 : 0;

  // Alertas: leads quentes muito antigos (respeita filtros)
  const quentesAtrasados = rowsFiltradas.filter((r) => (r.quente_mais_antigo_h ?? 0) > 24);

  // ── Camada de decisão (pedido Ramone 10/06): fato → consequência → ação ──
  // Cada linha ganha diagnóstico operacional + projeção de esgotamento da base.
  const diagnostico = (r: DashboardRow) => {
    const chips = chipsPorCampanha.get(r.campanha_id);
    const semChip = r.status === "ativa" && chips !== undefined && chips.open === 0;
    const pendentes = r.pool_pendentes ?? 0;
    const ritmoDia = (r.disparos_7d ?? 0) / 7;
    // dias até esgotar a fila no ritmo atual (null = sem ritmo pra projetar)
    const esgotaEmDias = pendentes > 0 && ritmoDia > 0.5 ? Math.round(pendentes / ritmoDia) : null;
    const quenteAtrasadoH = (r.quente_mais_antigo_h ?? 0) > 24 ? (r.quente_mais_antigo_h as number) : 0;
    const baseEsgotada = pendentes === 0 && (r.pool_total ?? 0) > 0;
    const contatoBaixo =
      (r.contatado ?? 0) >= 30 && (r.taxa_contato_pct ?? 100) < 40;
    const paradaComFila =
      r.status === "ativa" && !semChip && pendentes > 0 && (r.disparos_hoje ?? 0) === 0;
    // score de atenção: ordena a tabela pelo que precisa de gente, não pelo que a máquina fez
    const score =
      (quenteAtrasadoH > 0 ? 1000 + Math.min(quenteAtrasadoH, 999) : 0) +
      (semChip ? 800 : 0) +
      (paradaComFila ? 300 : 0) +
      (baseEsgotada ? 200 : 0) +
      (contatoBaixo ? 100 : 0);
    return { semChip, pendentes, esgotaEmDias, quenteAtrasadoH, baseEsgotada, contatoBaixo, paradaComFila, score };
  };

  const rowsComDiag = rowsFiltradas.map((r) => ({ r, d: diagnostico(r) }));
  const rowsOrdenadas = [...rowsComDiag].sort(
    (a, b) => b.d.score - a.d.score || (b.r.disparos_24h ?? 0) - (a.r.disparos_24h ?? 0),
  );

  // Cartões "o que precisa de você hoje" — no máx 5, do mais urgente pro menos
  type Decisao = { tone: "red" | "amber" | "blue"; titulo: string; consequencia: string; acao: string };
  const decisoes: Decisao[] = [];
  for (const { r, d } of rowsOrdenadas) {
    if (d.quenteAtrasadoH > 0) {
      const dias = Math.floor(d.quenteAtrasadoH / 24);
      decisoes.push({
        tone: "red",
        titulo: `${r.quentes} quente(s) esperando há ${dias >= 1 ? `${dias} dia(s)` : `${d.quenteAtrasadoH.toFixed(0)}h`} — ${r.nome}`,
        consequencia: "Médico interessado esfria e fecha com outra agência.",
        acao: "Cobrar retorno da operadora hoje (aba Acompanhamento).",
      });
    }
    if (d.semChip) {
      decisoes.push({
        tone: "red",
        titulo: `Campanha parada sem chip conectado — ${r.nome}`,
        consequencia: `${d.pendentes.toLocaleString("pt-BR")} lead(s) na fila sem ninguém disparando.`,
        acao: "Pedir pra equipe reconectar o chip (QR Code em Chips & Instâncias).",
      });
    }
    if (d.baseEsgotada) {
      decisoes.push({
        tone: "blue",
        titulo: `Base 100% percorrida — ${r.nome}`,
        consequencia: "Campanha sem lead novo pra contatar.",
        acao: "Decidir: ampliar região/especialidade ou encerrar a campanha.",
      });
    }
    if (d.esgotaEmDias !== null && d.esgotaEmDias > 365 && d.pendentes > 1000) {
      decisoes.push({
        tone: "amber",
        titulo: `Ritmo insuficiente — ${r.nome}`,
        consequencia: `${d.pendentes.toLocaleString("pt-BR")} na fila e ritmo atual leva ~${Math.round(d.esgotaEmDias / 30)} meses pra esgotar.`,
        acao: "Adicionar chips à campanha ou aceitar o prazo.",
      });
    }
    if (d.contatoBaixo) {
      decisoes.push({
        tone: "amber",
        titulo: `Taxa de contato baixa (${(r.taxa_contato_pct ?? 0).toFixed(0)}%) — ${r.nome}`,
        consequencia: "A maioria dos disparos não vira conversa: mensagem ou lista fraca.",
        acao: "Revisar a mensagem inicial e a origem dos leads dessa campanha.",
      });
    }
  }
  const decisoesTop = decisoes.slice(0, 5);

  // Indicador novo: tempo médio do quente mais antigo (entre campanhas com quentes)
  const tempoMedioQuente = (() => {
    const valores = rowsFiltradas
      .filter((r) => (r.quentes ?? 0) > 0 && (r.quente_mais_antigo_h ?? 0) > 0)
      .map((r) => r.quente_mais_antigo_h as number);
    if (valores.length === 0) return null;
    return valores.reduce((a, b) => a + b, 0) / valores.length;
  })();

  // Indicador novo: taxa de descarte (sem WhatsApp) sobre o total contatado
  const taxaDescartePct =
    agg.contatado > 0 ? (descartadosPhone / Math.max(agg.contatado + descartadosPhone, 1)) * 100 : 0;

  // F3.3 — Export real de PDF e Excel via jspdf + xlsx (client-side)
  // Substitui o window.print + CSV anterior. Os dados respeitam os filtros
  // ativos (campanha/estado/especialidade) — exporta o que está sendo visto.
  const buildExportData = (): DashboardExportData => {
    const filtrosLabels = {
      campanha:
        filtroCampanha !== "todas"
          ? (rows ?? []).find((r) => r.campanha_id === filtroCampanha)?.nome
          : undefined,
      estado: filtroEstado !== "todos" ? filtroEstado : undefined,
      especialidade:
        filtroEspecialidade !== "todas"
          ? especialidades.find((e) => e.id === filtroEspecialidade)?.nome
          : undefined,
    };
    return {
      agg,
      coberturaPct,
      conversionPct,
      responseRatePct,
      tempoMedioQuente,
      descartadosPhone,
      rows: rowsFiltradas,
      filtros: filtrosLabels,
    };
  };
  const exportPDF = () => exportarDashboardPDF(buildExportData());
  const exportExcel = () => exportarDashboardExcel(buildExportData());

  return (
    <div className="space-y-6 dashboard-print">
      {/* Header de ações — só visivel na tela, escondido no print */}
      <div className="flex items-center justify-between flex-wrap gap-2 no-print">
        <p className="text-xs text-muted-foreground">
          Atualizado às {format(new Date(), "HH:mm", { locale: ptBR })} · atualiza sozinho a cada minuto
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="gap-2">
              <Download className="h-3.5 w-3.5" />
              Exportar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={exportPDF}>
              <Printer className="h-3.5 w-3.5 mr-2" />
              Baixar PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportExcel}>
              <FileSpreadsheet className="h-3.5 w-3.5 mr-2" />
              Baixar Excel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Filtros globais do dashboard — campanha, estado, especialidade */}
      <Card className="p-3 no-print">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">
              Campanha
            </label>
            <Select value={filtroCampanha} onValueChange={(v) => setFiltro("dash_campanha", v)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Todas as campanhas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as campanhas</SelectItem>
                {(rows ?? []).map((r) => (
                  <SelectItem key={r.campanha_id} value={r.campanha_id}>
                    {r.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">
              Estado
            </label>
            <Select value={filtroEstado} onValueChange={(v) => setFiltro("dash_estado", v)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Todos os estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os estados</SelectItem>
                {estadosDisponiveis.map((uf) => (
                  <SelectItem key={uf} value={uf}>
                    {uf}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">
              Especialidade
            </label>
            <Select
              value={filtroEspecialidade}
              onValueChange={(v) => setFiltro("dash_esp", v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Todas as especialidades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as especialidades</SelectItem>
                {especialidadesDisponiveis.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {temFiltro && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              <span>
                Mostrando <strong className="text-foreground">{rowsFiltradas.length}</strong> de{" "}
                {(rows ?? []).length} campanha(s) com os filtros aplicados
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={limparFiltros}
              className="h-7 gap-1.5 text-xs"
            >
              <X className="h-3 w-3" />
              Limpar filtros
            </Button>
          </div>
        )}
      </Card>

      {/* Título visivel apenas no print, dá contexto pra quem recebe o PDF */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-bold">Sigma GSS — Dashboard de Prospecção</h1>
        <p className="text-sm text-gray-600">
          Gerado em {format(new Date(), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
        </p>
      </div>

      {/* O que precisa de você hoje — camada de decisão da Ramone (10/06).
          Fato + consequência + ação; sem precisar montar o quebra-cabeça na tabela. */}
      {decisoesTop.length > 0 && (
        <Card className="p-4 border-l-4 border-l-rose-400">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            O que precisa de você hoje
            <span className="text-xs font-normal text-muted-foreground">
              ({decisoesTop.length} {decisoesTop.length === 1 ? "item" : "itens"})
            </span>
          </h3>
          <div className="space-y-2">
            {decisoesTop.map((dec, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-md border p-3 text-sm",
                  dec.tone === "red" && "bg-rose-50 border-rose-200",
                  dec.tone === "amber" && "bg-amber-50 border-amber-200",
                  dec.tone === "blue" && "bg-blue-50 border-blue-200",
                )}
              >
                <p className="font-medium">{dec.titulo}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{dec.consequencia}</p>
                <p className="text-xs mt-1">
                  <span className="font-semibold">➜ Ação:</span> {dec.acao}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
      {decisoesTop.length === 0 && (
        <Card className="p-4 border-l-4 border-l-emerald-400">
          <p className="text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="font-medium">Nada esperando decisão sua agora</span>
            <span className="text-xs text-muted-foreground">— quentes em dia, chips conectados, bases com fila.</span>
          </p>
        </Card>
      )}

      {/* Fase 1 — Metas & Período (gestão): disparos vs 700/dia, capacidade de chips, gráfico */}
      <DashboardMetasFase1 />

      {/* Cards principais (4 KPIs executivos) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Send}
          label="Cobertura da base"
          value={`${coberturaPct.toFixed(1)}%`}
          sub={`${agg.contatado.toLocaleString("pt-BR")} de ${agg.pool_total.toLocaleString("pt-BR")} leads contatados`}
          tone="info"
        />
        <KpiCard
          icon={TrendingUp}
          label="Taxa de resposta"
          value={`${responseRatePct.toFixed(1)}%`}
          sub={`${agg.em_conversa.toLocaleString("pt-BR")} em conversa`}
          tone="info"
        />
        <KpiCard
          icon={Flame}
          label="Leads quentes em aberto"
          value={agg.quentes.toLocaleString("pt-BR")}
          sub={
            quentesAtrasados.length > 0
              ? `${quentesAtrasados.length} campanha(s) com quentes >24h`
              : "Todos dentro do prazo"
          }
          tone={quentesAtrasados.length > 0 ? "warning" : "info"}
        />
        <KpiCard
          icon={CheckCircle2}
          label="Convertidos"
          value={agg.convertidos.toLocaleString("pt-BR")}
          sub={`${conversionPct.toFixed(2)}% de quem foi contatado`}
          tone="success"
        />
      </div>

      {/* Cards secundários (operação) — métricas acionáveis pra equipe não-técnica */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SmallStat icon={Rocket} label="Campanhas ativas" value={agg.campanhas} />
        <SmallStat icon={Send} label="Disparos 24h" value={agg.disparos_24h.toLocaleString("pt-BR")} />
        <SmallStat icon={Send} label="Disparos 7 dias" value={agg.disparos_7d.toLocaleString("pt-BR")} />
        <SmallStat
          icon={Timer}
          label="Tempo médio quente"
          value={tempoMedioQuente !== null ? `${tempoMedioQuente.toFixed(0)}h` : "—"}
          tooltip="Quanto tempo em média os leads ficam quentes esperando atendimento. Quanto menor, mais ágil o time."
        />
        <SmallStat
          icon={AlertCircle}
          label="Médicos sem WhatsApp"
          value={descartadosPhone.toLocaleString("pt-BR")}
          tooltip="Leads descartados automaticamente porque o telefone não tem WhatsApp ativo. Vale revisar a fonte desses contatos."
        />
      </div>

      {/* IA × Manual — split por tipo de envio (Dr. Michael vê lado a lado) */}
      {(() => {
        const split = { ia: { disp: 0, q: 0, c: 0, conv: 0, cont: 0 }, manual: { disp: 0, q: 0, c: 0, conv: 0, cont: 0 } };
        for (const r of rows ?? []) {
          const t = tiposMap.get(r.campanha_id) === "manual" ? "manual" : "ia";
          split[t].disp += r.disparos_24h ?? 0;
          split[t].q += r.quentes ?? 0;
          split[t].c += 1;
          split[t].conv += r.convertidos ?? 0;
          split[t].cont += r.contatado ?? 0;
        }
        const Bloco = ({ titulo, cor, s }: { titulo: string; cor: string; s: { disp: number; q: number; c: number; conv: number; cont: number } }) => {
          const convPct = s.cont > 0 ? ((s.conv / s.cont) * 100).toFixed(1) : "0.0";
          return (
            <div className="border rounded-lg p-4 bg-card">
              <div className={`text-xs font-semibold mb-2 ${cor}`}>{titulo}</div>
              <div className="flex gap-5 text-sm flex-wrap">
                <div><div className="text-2xl font-bold tabular-nums">{s.disp.toLocaleString("pt-BR")}</div><div className="text-xs text-muted-foreground">disparos 24h</div></div>
                <div><div className="text-2xl font-bold tabular-nums">{s.q}</div><div className="text-xs text-muted-foreground">quentes</div></div>
                <div><div className="text-2xl font-bold tabular-nums">{convPct}%</div><div className="text-xs text-muted-foreground">conversão</div></div>
                <div><div className="text-2xl font-bold tabular-nums">{s.c}</div><div className="text-xs text-muted-foreground">campanhas</div></div>
              </div>
            </div>
          );
        };
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Bloco titulo="🤖 IA (automática)" cor="text-indigo-700" s={split.ia} />
            <Bloco titulo="👤 Manual (operadora)" cor="text-emerald-700" s={split.manual} />
          </div>
        );
      })()}

      {/* Fase 2 — Funil de prospecção + comparação semanal */}
      <DashboardFunilFase2 funil={{ pool: agg.pool_total, contatado: agg.contatado, emConversa: agg.em_conversa, quentes: agg.quentes, convertidos: agg.convertidos }} />

      {/* Fase 3 — Saúde operacional (onde agir) */}
      <DashboardSaudeFase3 tempoMedioQuente={tempoMedioQuente} quentesAtrasados={quentesAtrasados} descartadosPhone={descartadosPhone} totalQuentes={agg.quentes} contatado={agg.contatado} />

      {/* Nota contextual: dá tranquilidade sobre o sistema anti-ban funcionar como freio, não como erro */}
      <p className="text-xs text-muted-foreground italic px-1 -mt-2">
        Quando um chip está em pausa anti-ban (esperando o ritmo natural pra não ser bloqueado pelo WhatsApp), as tentativas
        ficam em fila até ele voltar. Isso é proteção, não erro — não aparece nas métricas acima.
      </p>

      {/* Alerta destacado */}
      {quentesAtrasados.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-start gap-3">
          <Clock className="h-5 w-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-900">
              {quentesAtrasados.length} campanha(s) com leads quentes esperando há mais de 24h
            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              {quentesAtrasados
                .map((r) => `${r.nome} (${r.quente_mais_antigo_h?.toFixed(0)}h)`)
                .slice(0, 3)
                .join(" · ")}
              {quentesAtrasados.length > 3 && ` · +${quentesAtrasados.length - 3} outras`}
            </p>
          </div>
        </div>
      )}

      {/* Tabela compacta por campanha */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <h3 className="text-sm font-semibold">Performance por campanha</h3>
          <p className="text-xs text-muted-foreground">
            Ordenado pelo que precisa de atenção primeiro · funil mostra onde cada campanha perde lead
          </p>
        </div>
        <ScrollArea className="max-h-[500px]">
          <table className="w-full text-sm">
            <thead className="bg-muted/20 sticky top-0">
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left px-4 py-2 font-medium">Campanha</th>
                <th className="text-left px-3 py-2 font-medium">Funil (contato → conversa → quente → fechado)</th>
                <th className="text-right px-3 py-2 font-medium">Base</th>
                <th className="text-right px-3 py-2 font-medium">Na fila</th>
                <th className="text-right px-3 py-2 font-medium">Esgota em</th>
                <th className="text-right px-3 py-2 font-medium">Quentes</th>
                <th className="text-right px-3 py-2 font-medium">24h</th>
                <th className="text-center px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rowsOrdenadas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-muted-foreground">
                    {temFiltro
                      ? "Nenhuma campanha bate com os filtros aplicados."
                      : "Nenhuma campanha ativa ou pausada."}
                  </td>
                </tr>
              ) : (
                rowsOrdenadas.map(({ r, d }) => {
                  // status honesto: o que a campanha está FAZENDO, não o flag do banco
                  const statusReal = r.status === "pausada"
                    ? { label: "pausada", cls: "bg-slate-100 text-slate-700 border-slate-200" }
                    : d.semChip
                      ? { label: "sem chip", cls: "bg-rose-100 text-rose-700 border-rose-200" }
                      : d.baseEsgotada
                        ? { label: "base esgotada", cls: "bg-blue-100 text-blue-700 border-blue-200" }
                        : (r.disparos_hoje ?? 0) > 0
                          ? { label: "disparando", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" }
                          : { label: "aguardando", cls: "bg-amber-50 text-amber-700 border-amber-200" };
                  return (
                    <tr key={r.campanha_id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2 truncate max-w-[220px]">
                        <div className="font-medium text-foreground/90">{r.nome}</div>
                        {r.regiao_estado && (
                          <div className="text-[10px] text-muted-foreground">{r.regiao_estado}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 min-w-[190px]">
                        <MiniFunil
                          contatado={r.contatado ?? 0}
                          emConversa={r.em_conversa ?? 0}
                          quentes={r.quentes ?? 0}
                          convertidos={r.convertidos ?? 0}
                          taxaContatoPct={r.taxa_contato_pct}
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{(r.pool_total ?? 0).toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.pendentes.toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">
                        {d.baseEsgotada
                          ? <span className="text-blue-700 font-medium">esgotada</span>
                          : d.esgotaEmDias === null
                            ? "—"
                            : d.esgotaEmDias > 90
                              ? <span className={d.esgotaEmDias > 365 ? "text-amber-700 font-medium" : ""}>~{Math.round(d.esgotaEmDias / 30)} meses</span>
                              : `${d.esgotaEmDias}d`}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className={cn("font-semibold", d.quenteAtrasadoH > 0 && "text-amber-700")}>
                          {r.quentes ?? 0}
                        </span>
                        {d.quenteAtrasadoH > 0 && (
                          <span className="text-[10px] text-amber-700 block">+{Math.floor(d.quenteAtrasadoH / 24)}d esperando</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.disparos_24h ?? 0}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant="outline" className={cn("text-[10px]", statusReal.cls)}>
                          {statusReal.label}
                        </Badge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </ScrollArea>
      </Card>

      {/* F3.5 — Comparativo entre operadoras (atividade geral SigZap por enquanto) */}
      <ComparativoOperadoras />
    </div>
  );
}

// Mini-funil por campanha: 4 estágios com largura proporcional ao estágio anterior.
// O número que importa pra decisão é a QUEDA entre estágios — o pior vira vermelho.
function MiniFunil({
  contatado,
  emConversa,
  quentes,
  convertidos,
  taxaContatoPct,
}: {
  contatado: number;
  emConversa: number;
  quentes: number;
  convertidos: number;
  taxaContatoPct: number | null;
}) {
  if (contatado === 0) {
    return <span className="text-xs text-muted-foreground">sem contato ainda</span>;
  }
  const pctConversa = (emConversa / contatado) * 100;
  const stages = [
    { n: contatado, label: "contatados", cls: "bg-blue-400" },
    { n: emConversa, label: "em conversa", cls: pctConversa < 5 ? "bg-rose-400" : "bg-indigo-400" },
    { n: quentes, label: "quentes", cls: "bg-amber-400" },
    { n: convertidos, label: "fechados", cls: "bg-emerald-500" },
  ];
  const title = [
    `${contatado} contatados (${(taxaContatoPct ?? 0).toFixed(0)}% da base alcançada)`,
    `→ ${emConversa} em conversa (${pctConversa.toFixed(0)}% respondem)`,
    `→ ${quentes} quentes`,
    `→ ${convertidos} fechados`,
    pctConversa < 5 ? "⚠ poucas respostas: revisar mensagem/lista" : "",
  ].filter(Boolean).join("\n");
  return (
    <div className="flex items-center gap-1" title={title}>
      {stages.map((s, i) => {
        // largura em escala log pra estágio pequeno continuar visível
        const w = s.n === 0 ? 3 : Math.max(8, Math.round((Math.log10(s.n + 1) / Math.log10(stages[0].n + 1)) * 56));
        return (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div
              className={cn("h-2.5 rounded-sm", s.n === 0 ? "bg-muted" : s.cls)}
              style={{ width: `${w}px` }}
            />
            <span className="text-[9px] tabular-nums text-muted-foreground leading-none">{s.n}</span>
          </div>
        );
      })}
    </div>
  );
}

interface KpiCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "info" | "warning" | "success" | "default";
}

function KpiCard({ icon: Icon, label, value, sub, tone = "default" }: KpiCardProps) {
  const toneClass = {
    info: "border-blue-200 bg-blue-50/40",
    warning: "border-amber-200 bg-amber-50/40",
    success: "border-emerald-200 bg-emerald-50/40",
    default: "border-border bg-card",
  }[tone];
  const iconClass = {
    info: "text-blue-700",
    warning: "text-amber-700",
    success: "text-emerald-700",
    default: "text-foreground",
  }[tone];

  return (
    <Card className={cn("p-4", toneClass)}>
      <div className="flex items-start justify-between mb-2">
        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</div>
        <Icon className={cn("h-5 w-5", iconClass)} />
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

interface SmallStatProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  /** Texto explicativo no hover — pra contexto a quem não conhece a métrica. */
  tooltip?: string;
}

function SmallStat({ icon: Icon, label, value, tooltip }: SmallStatProps) {
  return (
    <div
      className="bg-muted/20 border border-border rounded-md px-3 py-2 flex items-center gap-2.5"
      title={tooltip}
    >
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
          {label}
          {tooltip && <span className="text-[10px] opacity-50">ⓘ</span>}
        </div>
        <div className="text-sm font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}
