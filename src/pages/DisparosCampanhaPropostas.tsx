import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { CaptacaoProtectedRoute } from "@/components/auth/CaptacaoProtectedRoute";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ExternalLink, Megaphone, Users, FileText, Unlink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCampanhaPropostas } from "@/hooks/useCampanhaPropostas";
import { VincularPropostaCampanhaDialog } from "@/components/disparos/VincularPropostaCampanhaDialog";
import { AdicionarListaCampanhaDialog } from "@/components/disparos/AdicionarListaCampanhaDialog";
import { CampanhaPropostaModal } from "@/components/disparos/CampanhaPropostaModal";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { exportCampanhaPropostasPDF } from "@/lib/campanhaPdfExport";
import { FileDown } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  rascunho: "outline",
  agendada: "secondary",
  em_andamento: "default",
  pausada: "secondary",
  concluida: "outline",
  cancelada: "destructive",
  ativa: "default",
  encerrada: "destructive",
};

export default function DisparosCampanhaPropostas() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [vincularOpen, setVincularOpen] = useState(false);
  const [listaOpen, setListaOpen] = useState(false);
  const [cpAberto, setCpAberto] = useState<string | null>(null);
  const [desvincularId, setDesvincularId] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const { isAdmin } = usePermissions();
  const qc = useQueryClient();

  const desvincularMutation = useMutation({
    mutationFn: async (vinculoId: string) => {
      const { error } = await supabase
        .from("campanha_propostas")
        .delete()
        .eq("id", vinculoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Proposta desvinculada da campanha");
      qc.invalidateQueries({ queryKey: ["campanha-propostas", id] });
      setDesvincularId(null);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao desvincular"),
  });

  const { data: campanha } = useQuery({
    queryKey: ["campanha-detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campanhas")
        .select("id, nome, descricao, canal, status, objetivo, data_inicio, data_termino")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: vinculos = [], isLoading } = useCampanhaPropostas(id);

  const totalPropostas = vinculos.length;
  const ativas = vinculos.filter((v: any) => v.status === "ativa").length;
  const encerradas = vinculos.filter((v: any) => v.status === "encerrada").length;

  const handleExportPDF = async () => {
    if (!campanha) return;
    setExportando(true);
    try {
      const cpIds = vinculos.map((v: any) => v.id);
      const listaIds = Array.from(
        new Set(vinculos.map((v: any) => v.lista_id).filter(Boolean))
      );
      let disparos = 0;
      let enviados = 0;
      let falhas = 0;
      if (cpIds.length > 0) {
        const { data: dc } = await supabase
          .from("disparos_campanhas")
          .select("total_contatos, enviados, falhas")
          .in("campanha_proposta_id", cpIds);
        (dc || []).forEach((r: any) => {
          disparos += r.total_contatos || 0;
          enviados += r.enviados || 0;
          falhas += r.falhas || 0;
        });
      }
      const totalLeads = vinculos.reduce(
        (acc: number, v: any) => acc + (v.lista_leads_count || 0),
        0
      );
      exportCampanhaPropostasPDF({
        campanha,
        vinculos,
        totais: {
          propostas: totalPropostas,
          listas: listaIds.length,
          leads: totalLeads,
          disparos,
          enviados,
          falhas,
        },
      });
      toast.success("Relatório gerado");
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar relatório");
    } finally {
      setExportando(false);
    }
  };

  return (
    <CaptacaoProtectedRoute permission="disparos_zap">
      <AppLayout>
        <div className="container max-w-6xl py-6 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/disparos/campanhas")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
          </div>

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Megaphone className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Campanha
                </div>
                <h1 className="text-2xl font-bold truncate">{campanha?.nome || "Carregando..."}</h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {campanha?.status && (
                    <Badge variant={STATUS_VARIANTS[campanha.status] || "outline"}>
                      {campanha.status}
                    </Badge>
                  )}
                  {campanha?.objetivo && (
                    <span className="text-xs text-muted-foreground">🎯 {campanha.objetivo}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={handleExportPDF}
                disabled={exportando || !campanha}
              >
                {exportando ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4 mr-1" />
                )}
                Extrair relatório
              </Button>
              <Button variant="outline" onClick={() => setListaOpen(true)}>
                <Users className="h-4 w-4 mr-1" />
                Vincular lista à proposta
              </Button>
              <Button onClick={() => setVincularOpen(true)}>
                <FileText className="h-4 w-4 mr-1" />
                Vincular proposta
              </Button>
            </div>
          </div>

          {/* Métricas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                <div>
                  <div className="text-2xl font-bold">{totalPropostas}</div>
                  <div className="text-xs text-muted-foreground">Propostas vinculadas</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Users className="h-8 w-8 text-green-600" />
                <div>
                  <div className="text-2xl font-bold">{ativas}</div>
                  <div className="text-xs text-muted-foreground">Ativas</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Users className="h-8 w-8 text-muted-foreground" />
                <div>
                  <div className="text-2xl font-bold">{encerradas}</div>
                  <div className="text-xs text-muted-foreground">Encerradas</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Lista de propostas */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Propostas vinculadas</h2>
            {isLoading ? (
              <Card className="p-8 text-center text-muted-foreground">Carregando...</Card>
            ) : vinculos.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma proposta vinculada. Clique em "Vincular proposta" para começar.
              </Card>
            ) : (
              <div className="grid gap-2">
                {vinculos.map((v: any) => (
                  <Card
                    key={v.id}
                    className="cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => setCpAberto(v.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {v.proposta?.id_proposta || v.proposta?.descricao || "Proposta"}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            Lista: {v.lista?.nome || "—"}
                            {` • ${v.lista_leads_count ?? 0} leads`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={STATUS_VARIANTS[v.status] || "outline"}>
                            {v.status}
                          </Badge>
                          {v.webhook_trafego_enviado_at && (
                            <Badge variant="secondary" className="text-[10px]">
                              tráfego ✓
                            </Badge>
                          )}
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Desvincular proposta da campanha"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDesvincularId(v.id);
                              }}
                            >
                              <Unlink className="h-4 w-4" />
                            </Button>
                          )}
                          <ExternalLink className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

        </div>

        {id && (
          <VincularPropostaCampanhaDialog
            campanhaId={id}
            open={vincularOpen}
            onOpenChange={setVincularOpen}
          />
        )}
        {id && (
          <AdicionarListaCampanhaDialog
            campanhaId={id}
            open={listaOpen}
            onOpenChange={setListaOpen}
          />
        )}
        <CampanhaPropostaModal
          campanhaPropostaId={cpAberto}
          open={!!cpAberto}
          onOpenChange={(o) => !o && setCpAberto(null)}
        />

        <AlertDialog open={!!desvincularId} onOpenChange={(o) => !o && setDesvincularId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Desvincular proposta?</AlertDialogTitle>
              <AlertDialogDescription>
                A proposta será removida desta campanha. Disparos já registrados (<code>disparos_campanhas</code>, <code>disparos_contatos</code>) permanecem no histórico, mas o vínculo da proposta com a campanha será apagado. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={desvincularMutation.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  if (desvincularId) desvincularMutation.mutate(desvincularId);
                }}
                disabled={desvincularMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {desvincularMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Desvinculando...</>
                ) : (
                  <><Unlink className="h-4 w-4 mr-2" />Desvincular</>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AppLayout>
    </CaptacaoProtectedRoute>
  );
}