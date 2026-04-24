import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NovaCampanhaProspeccaoDialog } from "@/components/campanhas/NovaCampanhaProspeccaoDialog";
import { CampanhaProspeccaoKanban } from "@/components/campanhas/CampanhaProspeccaoKanban";
import { QuentesEsperandoBanner } from "@/components/campanhas/QuentesEsperandoBanner";
import { ChipPerformancePanel } from "@/components/campanhas/ChipPerformancePanel";
import { useAdicionarLeadsCampanha } from "@/hooks/useCampanhaLeads";
import { toast } from "sonner";

interface CampanhaRow {
  id: string;
  nome: string;
  status: string;
  tipo_campanha: string | null;
  especialidade_id: string | null;
  regiao_estado: string | null;
  limite_diario_campanha: number | null;
  total_frio: number;
  total_contatado: number;
  total_em_conversa: number;
  total_aquecido: number;
  total_quente: number;
  total_convertido: number;
  created_at: string;
  especialidade?: { nome: string } | null;
}

export default function CampanhasProspeccao() {
  const [busca, setBusca] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const adicionarLeads = useAdicionarLeadsCampanha();

  const { data: campanhas = [], isLoading } = useQuery({
    queryKey: ["campanhas-prospeccao", busca],
    queryFn: async () => {
      let q = supabase
        .from("campanhas")
        .select(
          "id, nome, status, tipo_campanha, especialidade_id, regiao_estado, limite_diario_campanha, total_frio, total_contatado, total_em_conversa, total_aquecido, total_quente, total_convertido, created_at, especialidade:especialidade_id(nome)"
        )
        .eq("tipo_campanha", "prospeccao")
        .order("created_at", { ascending: false });
      if (busca.trim()) q = q.ilike("nome", `%${busca.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as CampanhaRow[];
    },
  });

  const campanhaSelecionada = campanhas.find((c) => c.id === selecionada);

  const totalLeads = campanhas.reduce(
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
  const totalQuentes = campanhas.reduce((sum, c) => sum + c.total_quente, 0);
  const totalConvertidos = campanhas.reduce(
    (sum, c) => sum + c.total_convertido,
    0
  );
  const campanhasAtivas = campanhas.filter((c) => c.status === "ativa").length;

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
                  {campanhaSelecionada.especialidade && (
                    <span className="flex items-center gap-1">
                      <Stethoscope className="h-3 w-3" />
                      {(campanhaSelecionada.especialidade as any)?.nome}
                    </span>
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
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
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

            <div className="flex gap-2">
              <Button
                size="sm"
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
                  : "Adicionar Leads ao Pool"}
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
          <QuentesEsperandoBanner />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <DashboardCard
              icon={Rocket}
              label="Campanhas Ativas"
              value={campanhasAtivas}
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
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {campanhas.map((c) => (
                <CampanhaCard
                  key={c.id}
                  campanha={c}
                  onClick={() => setSelecionada(c.id)}
                />
              ))}
            </div>
          )}

          <ChipPerformancePanel />
        </div>

        <NovaCampanhaProspeccaoDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      </AppLayout>
    </CaptacaoProtectedRoute>
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
  onClick,
}: {
  campanha: CampanhaRow;
  onClick: () => void;
}) {
  const total =
    campanha.total_frio +
    campanha.total_contatado +
    campanha.total_em_conversa +
    campanha.total_aquecido +
    campanha.total_quente +
    campanha.total_convertido;

  const progressPercent =
    total > 0
      ? Math.round(
          ((campanha.total_quente + campanha.total_convertido) / total) * 100
        )
      : 0;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold truncate">{campanha.nome}</h3>
            <div className="flex items-center gap-2 mt-1">
              {campanha.especialidade && (
                <Badge variant="outline" className="text-xs">
                  <Stethoscope className="h-3 w-3 mr-1" />
                  {(campanha.especialidade as any)?.nome}
                </Badge>
              )}
              {campanha.regiao_estado && (
                <Badge variant="outline" className="text-xs">
                  <MapPin className="h-3 w-3 mr-1" />
                  {campanha.regiao_estado}
                </Badge>
              )}
            </div>
          </div>
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
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {total} leads
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
    </Card>
  );
}
