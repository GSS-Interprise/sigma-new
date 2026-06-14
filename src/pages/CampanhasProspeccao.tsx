import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { CaptacaoProtectedRoute } from "@/components/auth/CaptacaoProtectedRoute";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Rocket,
  Plus,
  Search,
  Users,
  Flame,
  CheckCircle,
  Send,
  ArrowLeft,
  UserPlus,
  Download,
  Pause,
  Play,
  Stethoscope,
  MapPin,
  ClipboardList,
  Settings,
  BarChart3,
  MoreVertical,
  Copy,
  Smartphone,
  Ban,
  Trash2,
  Bot,
  User,
  Sparkles,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { NovaCampanhaProspeccaoDialog } from "@/components/campanhas/NovaCampanhaProspeccaoDialog";
import { DuplicarCampanhaManualDialog } from "@/components/campanhas/DuplicarCampanhaManualDialog";
import { CampanhaResumoIaDialog } from "@/components/campanhas/CampanhaResumoIaDialog";
import { ConfigurarCampanhaDialog } from "@/components/campanhas/ConfigurarCampanhaDialog";
import { CampanhaProspeccaoKanban } from "@/components/campanhas/CampanhaProspeccaoKanban";
import { AcompanhamentoView } from "@/components/campanhas/acompanhamento/AcompanhamentoView";
import { DashboardCampanhas } from "@/components/campanhas/DashboardCampanhas";
import { StatusOperacionalPanel } from "@/components/campanhas/StatusOperacionalPanel";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { useAdicionarLeadsCampanha } from "@/hooks/useCampanhaLeads";
import { toast } from "sonner";

interface CampanhaRow {
  id: string;
  nome: string;
  status: string;
  tipo_campanha: string | null;
  tipo_envio: string | null;
  especialidade_id: string | null;
  especialidade_ids: string[] | null;
  regiao_estado: string | null;
  limite_diario_campanha: number | null;
  total_frio: number;
  total_contatado: number;
  total_em_conversa: number;
  total_aquecido: number;
  total_quente: number;
  total_convertido: number;
  created_at: string;
  chip_id: string | null;
  chip_ids: string[] | null;
  briefing_ia: Record<string, unknown> | null;
  criado_por: string | null;
  criador_nome?: string | null;
  especialidade?: { nome: string } | null;
  especialidades_nomes?: string[];
  total_real?: number | null; // contagem real (todos os status, inclui descartado/sem_resposta)
}

type StatusFiltro = "ativa" | "rascunho" | "pausada" | "todas";
type ResponsavelFiltro = "todos" | "minhas";

// v2: visibilidade liberada — todos veem TODAS as campanhas por padrão.
// O bump da chave (-v2) descarta a preferência "minhas" antiga que escondia
// campanhas da equipe (ex: Bruna não via as campanhas de IA rodando).
const RESPONSAVEL_STORAGE_KEY = "campanhas-prospeccao-responsavel-v2";

function lerResponsavelSalvo(): ResponsavelFiltro | null {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(RESPONSAVEL_STORAGE_KEY);
    if (saved === "todos" || saved === "minhas") return saved;
  }
  return null;
}

export default function CampanhasProspeccao() {
  const { user } = useAuth();
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("ativa");
  // Default "todos" pra todo mundo — a equipe enxerga todas as campanhas rodando.
  // "Minhas" continua disponível como filtro opcional (a escolha do usuário é salva).
  const [responsavelFiltro, setResponsavelFiltro] = useState<ResponsavelFiltro>(
    () => lerResponsavelSalvo() ?? "todos",
  );

  // Persiste só a escolha do usuário (ignora o primeiro render/placeholder).
  const montadoRef = useRef(false);
  useEffect(() => {
    if (!montadoRef.current) {
      montadoRef.current = true;
      return;
    }
    if (typeof window !== "undefined") {
      localStorage.setItem(RESPONSAVEL_STORAGE_KEY, responsavelFiltro);
    }
  }, [responsavelFiltro]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [configurarId, setConfigurarId] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const view = (searchParams.get("view") || "campanhas") as
    | "campanhas"
    | "acompanhamento"
    | "dashboard"
    | "status";
  const setView = (next: "campanhas" | "acompanhamento" | "dashboard" | "status") => {
    const sp = new URLSearchParams(searchParams);
    if (next === "campanhas") sp.delete("view");
    else sp.set("view", next);
    setSearchParams(sp);
  };
  const adicionarLeads = useAdicionarLeadsCampanha();

  // Contador de leads quentes sem dono (só pra badge no toggle)
  const { data: quentesSemDono = 0 } = useQuery({
    queryKey: ["quentes-sem-dono-count"],
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("vw_acompanhamento_kanban")
        .select("campanha_lead_id", { count: "exact", head: true })
        .eq("etapa_acompanhamento", "quente")
        .is("assumido_por", null);
      return count || 0;
    },
    refetchInterval: 60_000,
  });

  const { data: campanhas = [], isLoading } = useQuery({
    queryKey: ["campanhas-prospeccao", busca],
    queryFn: async () => {
      let q = (supabase as any)
        .from("campanhas")
        .select(
          "id, nome, status, tipo_campanha, tipo_envio, especialidade_id, especialidade_ids, regiao_estado, limite_diario_campanha, total_frio, total_contatado, total_em_conversa, total_aquecido, total_quente, total_convertido, created_at, chip_id, chip_ids, briefing_ia, criado_por, especialidade:especialidade_id(nome)"
        )
        .eq("tipo_campanha", "prospeccao")
        .order("created_at", { ascending: false });
      if (busca.trim()) q = q.ilike("nome", `%${busca.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data || []) as CampanhaRow[];

      // Hidrata nomes das especialidades quando há array (mais de 1)
      const todosIds = Array.from(
        new Set(
          rows.flatMap((r) => r.especialidade_ids || []).filter(Boolean),
        ),
      );
      if (todosIds.length > 0) {
        const { data: espNomes } = await supabase
          .from("especialidades")
          .select("id, nome")
          .in("id", todosIds);
        const mapa = new Map((espNomes || []).map((e: any) => [e.id, e.nome]));
        for (const r of rows) {
          if (r.especialidade_ids && r.especialidade_ids.length > 0) {
            r.especialidades_nomes = r.especialidade_ids
              .map((id) => mapa.get(id))
              .filter(Boolean) as string[];
          }
        }
      }

      // Total REAL de leads por campanha (inclui descartado/sem_resposta, que os
      // contadores denormalizados não somam). Card mostra o número verdadeiro.
      const ids = rows.map((r) => r.id);
      if (ids.length > 0) {
        const { data: counts } = await (supabase as any)
          .from("vw_campanha_lead_counts")
          .select("campanha_id, total_leads")
          .in("campanha_id", ids);
        const cmap = new Map((counts || []).map((c: any) => [c.campanha_id, c.total_leads]));
        for (const r of rows) r.total_real = (cmap.get(r.id) as number) ?? null;
      }
      return rows;
    },
  });

  const campanhaSelecionada = campanhas.find((c) => c.id === selecionada);

  // Contagens por status (sempre sobre o universo total, não respeitam filtro)
  const countAtivas = campanhas.filter((c) => c.status === "ativa").length;
  const countRascunhos = campanhas.filter((c) => c.status === "rascunho").length;
  const countPausadas = campanhas.filter((c) => c.status === "pausada").length;
  const countTotal = campanhas.length;

  // Campanhas "ativa fantasma" = status ativa mas sem chip e/ou sem briefing
  const isCampanhaFantasma = (c: CampanhaRow) =>
    c.status === "ativa" &&
    (!c.chip_id && (!c.chip_ids || c.chip_ids.length === 0) ||
      !c.briefing_ia ||
      Object.keys(c.briefing_ia || {}).length === 0);
  const countFantasmas = campanhas.filter(isCampanhaFantasma).length;

  // WS-C (Gap 1): campanha sem nenhum lead não dispara nada. Sinaliza pra operadora não esquecer o 2º passo (adicionar leads).
  const totalLeadsDe = (c: CampanhaRow) =>
    c.total_frio + c.total_contatado + c.total_em_conversa + c.total_aquecido + c.total_quente + c.total_convertido;
  const countSemLeads = campanhas.filter((c) => c.status !== "rascunho" && totalLeadsDe(c) === 0).length;

  // Aplica filtro de status + responsável
  const campanhasFiltradas = campanhas
    .filter((c) => statusFiltro === "todas" || c.status === statusFiltro)
    .filter((c) => {
      if (responsavelFiltro === "todos") return true;
      // "minhas" = criadas por mim
      return c.criado_por === user?.id;
    });

  const countMinhas = campanhas.filter((c) => c.criado_por === user?.id).length;

  const totalLeads = campanhasFiltradas.reduce(
    (sum, c) =>
      sum +
      c.total_frio +
      c.total_contatado +
      c.total_em_conversa +
      c.total_aquecido +
      c.total_quente +
      c.total_convertido,
    0
  );
  const totalQuentes = campanhasFiltradas.reduce((sum, c) => sum + c.total_quente, 0);
  const totalConvertidos = campanhasFiltradas.reduce(
    (sum, c) => sum + c.total_convertido,
    0
  );

  if (selecionada && campanhaSelecionada) {
    return (
      <CaptacaoProtectedRoute permission="disparos_zap">
        <AppLayout
          headerActions={
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelecionada(null)}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Voltar
              </Button>
              <div>
                <h1 className="text-xl font-bold">{campanhaSelecionada.nome}</h1>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {campanhaSelecionada.especialidades_nomes && campanhaSelecionada.especialidades_nomes.length > 0 ? (
                    <span
                      className="flex items-center gap-1"
                      title={campanhaSelecionada.especialidades_nomes.join(", ")}
                    >
                      <Stethoscope className="h-3 w-3" />
                      {campanhaSelecionada.especialidades_nomes.length === 1
                        ? campanhaSelecionada.especialidades_nomes[0]
                        : `${campanhaSelecionada.especialidades_nomes[0]} +${campanhaSelecionada.especialidades_nomes.length - 1}`}
                    </span>
                  ) : (
                    campanhaSelecionada.especialidade && (
                      <span className="flex items-center gap-1">
                        <Stethoscope className="h-3 w-3" />
                        {(campanhaSelecionada.especialidade as any)?.nome}
                      </span>
                    )
                  )}
                  {campanhaSelecionada.regiao_estado && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {campanhaSelecionada.regiao_estado}
                    </span>
                  )}
                  <Badge
                    variant={
                      campanhaSelecionada.status === "ativa"
                        ? "default"
                        : "secondary"
                    }
                  >
                    {campanhaSelecionada.status}
                  </Badge>
                </div>
              </div>
            </div>
          }
        >
          <div className="p-4 md:p-6 space-y-4">
            {/* Manual: a equipe conduz — sem "IA Conversando"; em_conversa = "Aquecido" (respondeu) */}
            <div className={`grid grid-cols-2 gap-3 ${campanhaSelecionada.tipo_envio === "manual" ? "md:grid-cols-5" : "md:grid-cols-6"}`}>
              <MetricCard
                label="Pendentes"
                value={campanhaSelecionada.total_frio}
                color="text-slate-600"
              />
              <MetricCard
                label="Aguardando"
                value={campanhaSelecionada.total_contatado}
                color="text-blue-600"
              />
              {campanhaSelecionada.tipo_envio === "manual" ? (
                <MetricCard
                  label="Aquecido"
                  value={campanhaSelecionada.total_em_conversa}
                  color="text-amber-600"
                />
              ) : (
                <>
                  <MetricCard
                    label="IA Conversando"
                    value={campanhaSelecionada.total_em_conversa}
                    color="text-cyan-600"
                  />
                  <MetricCard
                    label="Aquecidos"
                    value={campanhaSelecionada.total_aquecido}
                    color="text-amber-600"
                  />
                </>
              )}
              <MetricCard
                label="Quentes"
                value={campanhaSelecionada.total_quente}
                color="text-red-600"
              />
              <MetricCard
                label="Convertidos"
                value={campanhaSelecionada.total_convertido}
                color="text-green-600"
              />
            </div>

            {totalLeadsDe(campanhaSelecionada) === 0 && (
              <div className="flex items-start gap-2 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                <UserPlus className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Esta campanha ainda <strong>não tem leads</strong> e não vai disparar. Clique em
                  <strong> "Adicionar Leads à Base"</strong> abaixo pra puxar os leads do filtro (especialidade + UF).
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                className={totalLeadsDe(campanhaSelecionada) === 0 ? "ring-2 ring-sky-400 ring-offset-1" : ""}
                onClick={() =>
                  adicionarLeads.mutate({
                    campanha_id: selecionada,
                    limite: campanhaSelecionada.limite_diario_campanha || 50,
                  })
                }
                disabled={adicionarLeads.isPending}
              >
                <UserPlus className="h-4 w-4 mr-1" />
                {adicionarLeads.isPending
                  ? "Adicionando..."
                  : "Adicionar Leads à Base"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const { data, error } = await supabase.rpc(
                    "exportar_leads_trafego_pago",
                    { p_campanha_id: selecionada }
                  );
                  if (error) {
                    toast.error("Erro ao exportar: " + error.message);
                    return;
                  }
                  if (!data || data.length === 0) {
                    toast.info("Nenhum lead para exportar");
                    return;
                  }
                  const csv = [
                    "nome,email,telefone,especialidade,uf,cidade",
                    ...data.map(
                      (r: any) =>
                        `"${r.nome}","${r.email || ""}","${r.phone || ""}","${r.especialidade || ""}","${r.uf || ""}","${r.cidade || ""}"`
                    ),
                  ].join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `trafego-pago-${campanhaSelecionada.nome.replace(/\s+/g, "-")}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success(`${data.length} leads exportados para CSV`);
                }}
              >
                <Download className="h-4 w-4 mr-1" />
                Exportar p/ Tráfego Pago
              </Button>
            </div>

            <CampanhaProspeccaoKanban campanhaId={selecionada} />
          </div>
        </AppLayout>
      </CaptacaoProtectedRoute>
    );
  }

  const headerActions = (
    <div>
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Rocket className="h-6 w-6" />
        Máquina de Prospecção
      </h1>
      <p className="text-sm text-muted-foreground">
        Campanhas automáticas com IA — operador só recebe lead quente
      </p>
    </div>
  );

  return (
    <CaptacaoProtectedRoute permission="disparos_zap">
      <AppLayout headerActions={headerActions}>
        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
          <div className="flex items-center gap-1 border-b">
            <ToggleTab active={view === "campanhas"} onClick={() => setView("campanhas")}>
              <Rocket className="h-3.5 w-3.5" />
              Campanhas
            </ToggleTab>
            <ToggleTab active={view === "acompanhamento"} onClick={() => setView("acompanhamento")}>
              <Flame className="h-3.5 w-3.5" />
              Quentes (IA)
              {quentesSemDono > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                  {quentesSemDono}
                </Badge>
              )}
            </ToggleTab>
            <ToggleTab active={view === "dashboard"} onClick={() => setView("dashboard")}>
              <BarChart3 className="h-3.5 w-3.5" />
              Dashboard
            </ToggleTab>
            <ToggleTab active={view === "status"} onClick={() => setView("status")}>
              <Smartphone className="h-3.5 w-3.5" />
              Status
            </ToggleTab>
          </div>

          {view === "campanhas" ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <DashboardCard
                  icon={Rocket}
                  label="Campanhas Ativas"
                  value={countAtivas}
                  color="text-primary"
                />
                <DashboardCard
                  icon={Users}
                  label="Leads no Pipeline"
                  value={totalLeads}
                  color="text-blue-600"
                />
                <DashboardCard
                  icon={Flame}
                  label="Leads Quentes"
                  value={totalQuentes}
                  color="text-red-600"
                />
                <DashboardCard
                  icon={CheckCircle}
                  label="Convertidos"
                  value={totalConvertidos}
                  color="text-green-600"
                />
              </div>

              {countFantasmas > 0 && statusFiltro === "ativa" && (
                <Card className="border-amber-300 bg-amber-50">
                  <CardContent className="p-3 flex items-center gap-2 text-sm text-amber-900">
                    <span className="font-medium">
                      ⚠️ {countFantasmas} campanhas marcadas como ativas mas sem chip ou briefing IA configurado
                    </span>
                    <span className="text-amber-700">— elas não disparam. Configure ou mova pra rascunho.</span>
                  </CardContent>
                </Card>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <StatusChip
                  label="Ativas"
                  count={countAtivas}
                  active={statusFiltro === "ativa"}
                  onClick={() => setStatusFiltro("ativa")}
                />
                <StatusChip
                  label="Rascunhos"
                  count={countRascunhos}
                  active={statusFiltro === "rascunho"}
                  onClick={() => setStatusFiltro("rascunho")}
                />
                <StatusChip
                  label="Pausadas"
                  count={countPausadas}
                  active={statusFiltro === "pausada"}
                  onClick={() => setStatusFiltro("pausada")}
                />
                <StatusChip
                  label="Todas"
                  count={countTotal}
                  active={statusFiltro === "todas"}
                  onClick={() => setStatusFiltro("todas")}
                />

                {/* F2.10 — filtro responsável */}
                <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Responsável:</span>
                  <StatusChip
                    label="Todas"
                    count={countTotal}
                    active={responsavelFiltro === "todos"}
                    onClick={() => setResponsavelFiltro("todos")}
                  />
                  <StatusChip
                    label="Minhas"
                    count={countMinhas}
                    active={responsavelFiltro === "minhas"}
                    onClick={() => setResponsavelFiltro("minhas")}
                  />
                </div>
              </div>

              <Card>
                <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="relative flex-1 min-w-[240px] max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar campanha..."
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Button onClick={() => setDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nova Campanha
                  </Button>
                </CardContent>
              </Card>

              {isLoading ? (
                <Card className="p-8 text-center text-muted-foreground">
                  Carregando campanhas...
                </Card>
              ) : campanhas.length === 0 ? (
                <Card className="p-12 text-center">
                  <Rocket className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    Nenhuma campanha de prospecção criada.
                  </p>
                  <Button className="mt-4" onClick={() => setDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Criar primeira campanha
                  </Button>
                </Card>
              ) : campanhasFiltradas.length === 0 ? (
                <Card className="p-12 text-center">
                  <Rocket className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    Nenhuma campanha {statusFiltro === "todas" ? "" : `em ${statusFiltro}`}.
                  </p>
                </Card>
              ) : (
                <>
                  {countSemLeads > 0 && (
                    <div className="mb-3 flex items-start gap-2 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                      <UserPlus className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>
                        <strong>{countSemLeads}</strong>{" "}
                        {countSemLeads === 1 ? "campanha está sem leads" : "campanhas estão sem leads"} e
                        não {countSemLeads === 1 ? "vai" : "vão"} disparar. Abra a campanha e clique em
                        <strong> "Adicionar Leads à Base"</strong> pra ela começar a rodar.
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {campanhasFiltradas.map((c) => (
                      <CampanhaCard
                        key={c.id}
                        campanha={c}
                        fantasma={isCampanhaFantasma(c)}
                        semLeads={c.status !== "rascunho" && totalLeadsDe(c) === 0}
                        onClick={() => setSelecionada(c.id)}
                        onConfigurar={() => setConfigurarId(c.id)}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : view === "acompanhamento" ? (
            <ErrorBoundary label="AcompanhamentoView">
              <AcompanhamentoView />
            </ErrorBoundary>
          ) : view === "dashboard" ? (
            <ErrorBoundary label="DashboardCampanhas">
              <DashboardCampanhas />
            </ErrorBoundary>
          ) : (
            <ErrorBoundary label="StatusOperacional">
              <StatusOperacionalPanel />
            </ErrorBoundary>
          )}

        </div>

        <NovaCampanhaProspeccaoDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onCreated={(id) => setSelecionada(id)}
        />

        <ConfigurarCampanhaDialog
          open={!!configurarId}
          onOpenChange={(open) => !open && setConfigurarId(null)}
          campanhaId={configurarId}
        />
      </AppLayout>
    </CaptacaoProtectedRoute>
  );
}

function StatusChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground border-border hover:text-foreground hover:border-muted-foreground/40"
      }`}
    >
      {label}
      <Badge
        variant={active ? "secondary" : "outline"}
        className="h-5 px-1.5 text-[11px]"
      >
        {count}
      </Badge>
    </button>
  );
}

function ToggleTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
        active
          ? "text-primary border-primary"
          : "text-muted-foreground border-transparent hover:text-foreground hover:border-muted"
      }`}
    >
      {children}
    </button>
  );
}

function DashboardCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={`h-8 w-8 ${color}`} />
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <p className={`text-xl font-bold ${color}`}>{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function CampanhaCard({
  campanha,
  fantasma,
  semLeads,
  onClick,
  onConfigurar,
}: {
  campanha: CampanhaRow;
  fantasma?: boolean;
  semLeads?: boolean;
  onClick: () => void;
  onConfigurar: () => void;
}) {
  const total =
    campanha.total_frio +
    campanha.total_contatado +
    campanha.total_em_conversa +
    campanha.total_aquecido +
    campanha.total_quente +
    campanha.total_convertido;
  // Total exibido no card = contagem real (inclui descartado/sem_resposta); fallback pro ativo
  const totalExibido = campanha.total_real ?? total;

  const progressPercent =
    total > 0
      ? Math.round(
          ((campanha.total_quente + campanha.total_convertido) / total) * 100
        )
      : 0;

  const isRascunho = campanha.status === "rascunho";
  const [dupOpen, setDupOpen] = useState(false);
  const [resumoOpen, setResumoOpen] = useState(false);
  const qcStatus = useQueryClient();
  // Pausar/reativar/finalizar campanha (a equipe pediu poder cancelar campanha ativa)
  const mudarStatus = useMutation({
    mutationFn: async (novo: "ativa" | "pausada" | "finalizada") => {
      const { error } = await (supabase as any).from("campanhas").update({ status: novo }).eq("id", campanha.id);
      if (error) throw error;
      return novo;
    },
    onSuccess: (novo) => {
      qcStatus.invalidateQueries();
      toast.success(novo === "pausada" ? "Campanha pausada" : novo === "ativa" ? "Campanha reativada" : "Campanha finalizada");
    },
    onError: (e: any) => toast.error("Erro ao mudar status: " + (e?.message || e)),
  });
  // Excluir campanha (delete CASCADE: apaga vínculos da campanha; os médicos seguem na base)
  const excluir = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("campanhas").delete().eq("id", campanha.id);
      if (error) throw error;
    },
    onSuccess: () => { qcStatus.invalidateQueries(); toast.success("Campanha excluída"); },
    onError: (e: any) => toast.error("Erro ao excluir: " + (e?.message || e)),
  });

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${
        fantasma ? "border-amber-300 bg-amber-50/30" : semLeads ? "border-sky-300 bg-sky-50/30" : ""
      } ${isRascunho ? "opacity-70" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold truncate">{campanha.nome}</h3>
            {fantasma && (
              <Badge
                variant="outline"
                className="mt-1 text-xs border-amber-400 text-amber-800 bg-amber-100"
              >
                ⚠️ Falta configurar (chip ou briefing IA)
              </Badge>
            )}
            {semLeads && !fantasma && (
              <Badge
                variant="outline"
                className="mt-1 text-xs border-sky-400 text-sky-800 bg-sky-100"
              >
                <UserPlus className="h-3 w-3 mr-1" />
                Sem leads — clique pra adicionar
              </Badge>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {/* Flag IA (automática) vs Manual (operadora) — pedido equipe 11/06 */}
              {campanha.tipo_envio === "manual" ? (
                <Badge variant="outline" className="text-xs border-emerald-300 bg-emerald-50 text-emerald-800">
                  <User className="h-3 w-3 mr-1" />
                  Manual
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs border-indigo-300 bg-indigo-50 text-indigo-800">
                  <Bot className="h-3 w-3 mr-1" />
                  IA
                </Badge>
              )}
              {campanha.especialidades_nomes && campanha.especialidades_nomes.length > 0 ? (
                campanha.especialidades_nomes.length === 1 ? (
                  <Badge variant="outline" className="text-xs">
                    <Stethoscope className="h-3 w-3 mr-1" />
                    {campanha.especialidades_nomes[0]}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-xs"
                    title={campanha.especialidades_nomes.join(", ")}
                  >
                    <Stethoscope className="h-3 w-3 mr-1" />
                    {campanha.especialidades_nomes[0]} +
                    {campanha.especialidades_nomes.length - 1}
                  </Badge>
                )
              ) : (
                campanha.especialidade && (
                  <Badge variant="outline" className="text-xs">
                    <Stethoscope className="h-3 w-3 mr-1" />
                    {(campanha.especialidade as any)?.nome}
                  </Badge>
                )
              )}
              {campanha.regiao_estado && (
                <Badge variant="outline" className="text-xs">
                  <MapPin className="h-3 w-3 mr-1" />
                  {campanha.regiao_estado}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge
              variant={campanha.status === "ativa" ? "default" : "secondary"}
            >
              {campanha.status === "ativa" ? (
                <Play className="h-3 w-3 mr-1" />
              ) : (
                <Pause className="h-3 w-3 mr-1" />
              )}
              {campanha.status}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onConfigurar();
              }}
              title="Configurar campanha"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={(e) => e.stopPropagation()}
                  title="Mais ações"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setResumoOpen(true);
                  }}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Resumo executivo (IA)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setDupOpen(true);
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicar pra manual
                </DropdownMenuItem>
                {campanha.status === "ativa" && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); mudarStatus.mutate("pausada"); }}>
                    <Pause className="h-4 w-4 mr-2" />
                    Pausar campanha
                  </DropdownMenuItem>
                )}
                {campanha.status === "pausada" && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); mudarStatus.mutate("ativa"); }}>
                    <Play className="h-4 w-4 mr-2" />
                    Reativar campanha
                  </DropdownMenuItem>
                )}
                {(campanha.status === "ativa" || campanha.status === "pausada") && (
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Finalizar a campanha "${campanha.nome.trim()}"?\n\nEla para de disparar e sai das ativas. Você pode reativá-la depois pela aba "Todas".`)) {
                        mudarStatus.mutate("finalizada");
                      }
                    }}
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    Finalizar campanha
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Confirmação forte (digitar EXCLUIR) — evita delete acidental (incidente Bruna 09/06).
                    const resp = window.prompt(
                      `⚠️ EXCLUIR a campanha "${campanha.nome.trim()}" é PERMANENTE` +
                        (total > 0 ? ` — remove o vínculo de ${total} lead(s) + o histórico (os médicos continuam na base)` : "") +
                        `.\n\nSe é só pra parar de disparar, CANCELE e use "Finalizar" (reversível).\n\nPra confirmar, digite EXCLUIR:`
                    );
                    if (resp === null) return; // cancelou
                    if (resp.trim().toUpperCase() === "EXCLUIR") excluir.mutate();
                    else toast.error('Exclusão cancelada — é preciso digitar "EXCLUIR" pra confirmar.');
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir campanha
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {totalExibido} leads
          </span>
          <span className="flex items-center gap-1 text-red-600 font-medium">
            <Flame className="h-3 w-3" />
            {campanha.total_quente} quentes
          </span>
          <span className="flex items-center gap-1 text-green-600 font-medium">
            <CheckCircle className="h-3 w-3" />
            {campanha.total_convertido} convertidos
          </span>
        </div>

        {total > 0 && (
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="bg-green-500 h-1.5 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </CardContent>
      <DuplicarCampanhaManualDialog
        open={dupOpen}
        onOpenChange={setDupOpen}
        campanha={{ id: campanha.id, nome: campanha.nome, total_frio: campanha.total_frio }}
      />
      <CampanhaResumoIaDialog
        campanhaId={campanha.id}
        nome={campanha.nome.trim()}
        open={resumoOpen}
        onOpenChange={setResumoOpen}
      />
    </Card>
  );
}
