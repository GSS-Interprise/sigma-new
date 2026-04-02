import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { LicitacoesKanban } from "@/components/licitacoes/LicitacoesKanban";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, Webhook, Search } from "lucide-react";
import { LicitacaoWebhookDialog, fetchWebhookByIdUrl } from "@/components/licitacoes/LicitacaoWebhookDialog";
import { LicitacaoDetailDialog } from "@/components/licitacoes/LicitacaoDetailDialog";
import { LicitacaoQuickEditDialog } from "@/components/licitacoes/LicitacaoQuickEditDialog";
import { FiltroLicitacoes } from "@/components/licitacoes/FiltroLicitacoes";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useKanbanColumns } from "@/hooks/useKanbanColumns";
import { KanbanStatusManager } from "@/components/licitacoes/KanbanStatusManager";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { useSearchParams } from "react-router-dom";
import { useUserSetor } from "@/hooks/useUserSetor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function Licitacoes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [quickEditDialogOpen, setQuickEditDialogOpen] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [selectedLicitacao, setSelectedLicitacao] = useState<any>(null);
  const [filters, setFilters] = useState<any>({});
  const [isNewEdital, setIsNewEdital] = useState(false);
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const [kanbanHasMore, setKanbanHasMore] = useState(false);
  const [kanbanLoadMore, setKanbanLoadMore] = useState<(() => void) | null>(null);
  const [addByIdOpen, setAddByIdOpen] = useState(false);
  const [addByIdValue, setAddByIdValue] = useState("");
  const [addByIdLoading, setAddByIdLoading] = useState(false);

  const { isAdmin, userRoles, canView, isLoadingRoles, isLeader } = usePermissions();
  const { user } = useAuth();
  const { isSetorAges } = useUserSetor();
  const { data: columns = [], isLoading: columnsLoading } = useKanbanColumns("licitacoes");

  // Verificar se é gestor_ages exclusivo (sem acesso GSS)
  const isGestorAgesOnly =
    userRoles?.some((r) => r.role === "gestor_ages") &&
    !userRoles?.some(
      (r) =>
        r.role === "admin" ||
        r.role === "diretoria" ||
        r.role === "lideres" ||
        r.role === "gestor_captacao" ||
        r.role === "gestor_contratos",
    );

  // Ordenação padrão diferenciada para usuários do setor AGES
  const shouldUseAgesDefaultOrdering = isSetorAges || isGestorAgesOnly;

  // Buscar IDs das licitações AGES para filtrar
  const { data: agesLicitacaoIds } = useQuery({
    queryKey: ["ages-licitacao-ids"],
    enabled: isGestorAgesOnly,
    queryFn: async () => {
      const { data, error } = await supabase.from("ages_licitacoes").select("licitacao_id");

      if (error) throw error;
      return data?.map((al) => al.licitacao_id).filter(Boolean) || [];
    },
  });

  const { data: licitacoes, refetch } = useQuery({
    queryKey: ["licitacoes", isGestorAgesOnly, isSetorAges, shouldUseAgesDefaultOrdering, agesLicitacaoIds],
    queryFn: async () => {
      let query = supabase
        .from("licitacoes")
        .select("id,titulo,numero_edital,orgao,status,valor_estimado,data_disputa,municipio_uf,tipo_modalidade,responsavel_id,etiquetas,prioridade")
        .order(shouldUseAgesDefaultOrdering ? "data_limite" : "created_at", {
          ascending: shouldUseAgesDefaultOrdering ? true : false,
          nullsFirst: false,
        });

      if (shouldUseAgesDefaultOrdering) {
        query = query
          .order("data_disputa", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false });
      }

      // Se for gestor_ages exclusivo, filtrar apenas licitações AGES
      if (isGestorAgesOnly && agesLicitacaoIds) {
        if (agesLicitacaoIds.length === 0) {
          return []; // Nenhuma licitação AGES vinculada
        }
        query = query.in("id", agesLicitacaoIds);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    },
  });

  // Realtime subscription removida - já existe em useLicitacoesRealtime hook global

  // Deep linking: abrir licitação específica via URL param
  useEffect(() => {
    const openLicitacaoId = searchParams.get("open");
    if (openLicitacaoId && licitacoes) {
      const licitacaoToOpen = licitacoes.find((l) => l.id === openLicitacaoId);
      if (licitacaoToOpen) {
        setSelectedLicitacao(licitacaoToOpen);
        setIsNewEdital(false);
        setDetailDialogOpen(true);
        // Limpar o parâmetro da URL após abrir
        searchParams.delete("open");
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [searchParams, licitacoes, setSearchParams]);


  const handleSync = async () => {
    setSyncLoading(true);
    try {
      await refetch();
      toast.success("Dados atualizados com sucesso!");
    } catch (error: any) {
      console.error("Erro ao atualizar:", error);
      toast.error("Erro ao atualizar os dados");
    } finally {
      setSyncLoading(false);
    }
  };

  const handleViewLicitacao = (licitacao: any) => {
    setSelectedLicitacao(licitacao);
    setIsNewEdital(false);
    setDetailDialogOpen(true);
  };

  const handleCloseDetailDialog = (open: boolean) => {
    setDetailDialogOpen(open);
    if (!open) {
      setSelectedLicitacao(null);
      setIsNewEdital(false);
    }
  };

  const handleQuickEdit = (licitacao: any) => {
    setSelectedLicitacao(licitacao);
    setQuickEditDialogOpen(true);
  };

  const handleCloseQuickEditDialog = (open: boolean) => {
    setQuickEditDialogOpen(open);
    if (!open) {
      setSelectedLicitacao(null);
    }
  };

  const handleOpenNewEdital = () => {
    setSelectedLicitacao(null);
    setIsNewEdital(true);
    setDetailDialogOpen(true);
  };

  const handleAddById = async () => {
    const id = addByIdValue.trim();
    if (!id) { toast.error("Informe o ID da licitação"); return; }

    const webhookUrl = await fetchWebhookByIdUrl();
    if (!webhookUrl) {
      toast.error("URL do webhook por ID não configurada. Configure em Webhook → Busca por ID.");
      return;
    }

    setAddByIdLoading(true);
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("ID enviado com sucesso!");
      setAddByIdOpen(false);
      setAddByIdValue("");
    } catch (err: any) {
      toast.error("Erro ao enviar: " + (err.message || ""));
    } finally {
      setAddByIdLoading(false);
    }
  };

  // Líderes e gestor_ages também têm acesso ao módulo de Licitações
  const hasLicitacoesAccess = isAdmin || isLeader || canView('licitacoes') ||
    userRoles?.some(r => r.role === 'gestor_ages' || r.role === 'gestor_contratos');

  // Guard: sem permissão de visualizar licitações (após todos os hooks)
  if (!isLoadingRoles && !hasLicitacoesAccess) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center p-8">
            <div className="text-destructive text-4xl mb-4">🔒</div>
            <h2 className="text-xl font-semibold mb-2">Acesso Negado</h2>
            <p className="text-muted-foreground">Você não tem permissão para acessar o módulo de Licitações.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const headerActions = (
    <div className="flex items-center justify-between w-full">
      <div>
        <h1 className="text-2xl font-bold">Licitações</h1>
        <p className="text-sm text-muted-foreground">Gerencie licitações e editais</p>
      </div>
      <div className="flex gap-2">
        {isAdmin && <KanbanStatusManager modulo="licitacoes" />}
        {isAdmin && (
          <Button variant="outline" onClick={() => setWebhookDialogOpen(true)}>
            <Webhook className="mr-2 h-4 w-4" />
            Webhook
          </Button>
        )}
        <Button variant="outline" onClick={handleSync} disabled={syncLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${syncLoading ? "animate-spin" : ""}`} />
          {syncLoading ? "Sincronizando..." : "Sincronizar"}
        </Button>
        <Button onClick={handleOpenNewEdital}>
          <Plus className="mr-2 h-4 w-4" />
          Inserir Edital
        </Button>
      </div>
      <LicitacaoWebhookDialog open={webhookDialogOpen} onOpenChange={setWebhookDialogOpen} />
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-4 flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-end gap-4 mb-4 flex-shrink-0">
          <FiltroLicitacoes onFilterChange={setFilters} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setAddByIdValue(""); setAddByIdOpen(true); }}
          >
            <Search className="mr-2 h-4 w-4" />
            Adicionar por ID Effect
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => kanbanLoadMore?.()}
            disabled={!kanbanHasMore}
          >
            {kanbanHasMore ? 'Carregar mais' : 'Sem mais registros'}
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          {columnsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-muted-foreground">Carregando colunas...</div>
            </div>
          ) : (
            <LicitacoesKanban
              columns={columns}
              onCardClick={handleViewLicitacao}
              onCardDoubleClick={handleQuickEdit}
              filters={filters}
              onHasMoreChange={(hasMore, loadMore) => {
                setKanbanHasMore(hasMore);
                setKanbanLoadMore(() => loadMore);
              }}
            />
          )}
        </div>
      </div>

      <LicitacaoDetailDialog
        open={detailDialogOpen}
        onOpenChange={handleCloseDetailDialog}
        licitacao={selectedLicitacao}
        onSuccess={refetch}
        isNew={isNewEdital}
      />

      <LicitacaoQuickEditDialog
        open={quickEditDialogOpen}
        onOpenChange={handleCloseQuickEditDialog}
        licitacao={selectedLicitacao}
      />

      {/* Modal: Adicionar por ID Effect */}
      <Dialog open={addByIdOpen} onOpenChange={setAddByIdOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Adicionar por ID Effect
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="effect-id">ID da Licitação</Label>
            <Input
              id="effect-id"
              placeholder="Ex: 123456"
              value={addByIdValue}
              onChange={(e) => setAddByIdValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddById()}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              O ID será enviado via POST para o webhook de busca por ID configurado.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddByIdOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddById} disabled={addByIdLoading}>
              {addByIdLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
