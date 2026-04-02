import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Upload, RefreshCw, Eye, Pencil, CheckCircle2, XCircle, Clock, Loader2, FileSpreadsheet, AlertTriangle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ImportarLeadsDialog } from "./ImportarLeadsDialog";
import { LeadBulkEditDialog } from "./LeadBulkEditDialog";

interface ImportJob {
  id: string;
  status: string;
  arquivo_nome: string;
  total_linhas: number;
  inseridos: number;
  atualizados: number;
  ignorados: number;
  erros: string[];
  mapeamento_colunas: Record<string, string | null>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  created_by_nome: string | null;
  // Campos para chunks
  chunk_atual: number;
  total_chunks: number;
  linhas_processadas: number;
}

const statusConfig: Record<string, { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", icon: <Clock className="h-3.5 w-3.5" />, variant: "secondary" },
  processando: { label: "Processando", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, variant: "default" },
  concluido: { label: "Concluído", icon: <CheckCircle2 className="h-3.5 w-3.5" />, variant: "outline" },
  erro: { label: "Erro", icon: <XCircle className="h-3.5 w-3.5" />, variant: "destructive" },
};

export function LeadImportHistoryTab() {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<ImportJob | null>(null);
  const [bulkEditJob, setBulkEditJob] = useState<ImportJob | null>(null);
  const queryClient = useQueryClient();
  const { isAdmin } = usePermissions();

  const { data: jobs, isLoading, refetch } = useQuery({
    queryKey: ["lead-import-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_import_jobs")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as unknown as ImportJob[];
    },
  });

  // Realtime subscription para atualizações de status
  useEffect(() => {
    const channel = supabase
      .channel("lead-import-jobs-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_import_jobs",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["lead-import-jobs"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const handleViewDetails = (job: ImportJob) => {
    setSelectedJob(job);
    setDetailDialogOpen(true);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: ptBR });
  };

  const calculateDuration = (start: string | null, end: string | null) => {
    if (!start || !end) return "-";
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    if (diffSecs < 60) return `${diffSecs}s`;
    const diffMins = Math.floor(diffSecs / 60);
    const remainingSecs = diffSecs % 60;
    return `${diffMins}m ${remainingSecs}s`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Histórico de Importações</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
          <Button onClick={() => setImportDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Nova Importação
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Arquivo</TableHead>
              <TableHead className="text-center">Total</TableHead>
              <TableHead className="text-center">Inseridos</TableHead>
              <TableHead className="text-center">Atualizados</TableHead>
              <TableHead className="text-center">Ignorados</TableHead>
              <TableHead className="text-center">Erros</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead>Duração</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Carregando...
                </TableCell>
              </TableRow>
            ) : !jobs || jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Nenhuma importação realizada ainda
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => {
                const status = statusConfig[job.status] || statusConfig.pendente;
                const errorsCount = Array.isArray(job.erros) ? job.erros.length : 0;
                const isProcessing = job.status === "processando";
                const progressPercent = job.total_linhas > 0 
                  ? Math.round((job.linhas_processadas / job.total_linhas) * 100)
                  : 0;
                
                return (
                  <TableRow key={job.id}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={status.variant} className="gap-1 w-fit">
                          {status.icon}
                          {status.label}
                        </Badge>
                        {isProcessing && job.total_chunks > 1 && (
                          <span className="text-xs text-muted-foreground">
                            Chunk {job.chunk_atual + 1}/{job.total_chunks} ({progressPercent}%)
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate" title={job.arquivo_nome}>
                      {job.arquivo_nome}
                    </TableCell>
                    <TableCell className="text-center">
                      {isProcessing ? (
                        <span className="text-muted-foreground">
                          {job.linhas_processadas}/{job.total_linhas}
                        </span>
                      ) : (
                        job.total_linhas
                      )}
                    </TableCell>
                    <TableCell className="text-center text-green-600 font-medium">{job.inseridos}</TableCell>
                    <TableCell className="text-center text-blue-600 font-medium">{job.atualizados}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{job.ignorados}</TableCell>
                    <TableCell className="text-center">
                      {errorsCount > 0 ? (
                        <span className="text-red-600 font-medium">{errorsCount}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(job.created_at)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {calculateDuration(job.started_at, job.finished_at)}
                    </TableCell>
                    <TableCell className="text-right flex gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetails(job)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {isAdmin && (job.status === "concluido" || job.status === "erro") && job.inseridos > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setBulkEditJob(job)}
                          title="Edição em massa"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ImportarLeadsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["lead-import-jobs"] });
          queryClient.invalidateQueries({ queryKey: ["leads"] });
        }}
      />

      {/* Dialog de detalhes */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Detalhes da Importação
            </DialogTitle>
          </DialogHeader>
          
          {selectedJob && (
            <div className="space-y-4">
              {/* Progresso de chunks (se aplicável) */}
              {selectedJob.total_chunks > 1 && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-purple-700">
                      Processamento em Chunks
                    </span>
                    <span className="text-sm text-purple-600">
                      {selectedJob.status === "concluido" 
                        ? `${selectedJob.total_chunks}/${selectedJob.total_chunks} concluídos`
                        : `${selectedJob.chunk_atual + 1}/${selectedJob.total_chunks} em andamento`
                      }
                    </span>
                  </div>
                  <div className="w-full bg-purple-200 rounded-full h-2">
                    <div 
                      className="bg-purple-600 h-2 rounded-full transition-all duration-500"
                      style={{ 
                        width: `${selectedJob.status === "concluido" 
                          ? 100 
                          : Math.round(((selectedJob.chunk_atual + 1) / selectedJob.total_chunks) * 100)}%` 
                      }}
                    />
                  </div>
                  <p className="text-xs text-purple-600 mt-1">
                    {selectedJob.linhas_processadas} de {selectedJob.total_linhas} linhas processadas
                  </p>
                </div>
              )}

              {/* Resumo */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Total de Linhas</p>
                  <p className="text-2xl font-bold">{selectedJob.total_linhas}</p>
                </div>
                <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                  <p className="text-xs text-green-600">Inseridos</p>
                  <p className="text-2xl font-bold text-green-600">{selectedJob.inseridos}</p>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                  <p className="text-xs text-blue-600">Atualizados</p>
                  <p className="text-2xl font-bold text-blue-600">{selectedJob.atualizados}</p>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                  <p className="text-xs text-amber-600">Ignorados</p>
                  <p className="text-2xl font-bold text-amber-600">{selectedJob.ignorados}</p>
                </div>
              </div>

              {/* Info do arquivo */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Informações</h4>
                <div className="text-sm space-y-1 bg-muted/30 p-3 rounded-lg">
                  <p><span className="text-muted-foreground">Arquivo:</span> {selectedJob.arquivo_nome}</p>
                  <p><span className="text-muted-foreground">Criado por:</span> {selectedJob.created_by_nome || "Sistema"}</p>
                  <p><span className="text-muted-foreground">Iniciado em:</span> {formatDate(selectedJob.started_at)}</p>
                  <p><span className="text-muted-foreground">Finalizado em:</span> {formatDate(selectedJob.finished_at)}</p>
                  <p><span className="text-muted-foreground">Duração:</span> {calculateDuration(selectedJob.started_at, selectedJob.finished_at)}</p>
                </div>
              </div>

              {/* Mapeamento de colunas */}
              {selectedJob.mapeamento_colunas && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Mapeamento de Colunas</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(selectedJob.mapeamento_colunas).map(([field, column]) => {
                      // Garantir que column seja string ou null
                      const columnValue = typeof column === 'object' && column !== null
                        ? JSON.stringify(column)
                        : column;
                      return (
                        <Badge key={field} variant={columnValue ? "outline" : "secondary"} className="text-xs">
                          {field}: {columnValue || "não encontrado"}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Lista de erros detalhados */}
              {Array.isArray(selectedJob.erros) && selectedJob.erros.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2 text-red-600">
                    <AlertTriangle className="h-4 w-4" />
                    Linhas com Erro ({selectedJob.erros.length})
                  </h4>
                  <ScrollArea className="h-[250px] border rounded-lg bg-red-50/50">
                    <div className="p-3 space-y-2">
                      {selectedJob.erros.map((error, index) => {
                        // Suporta tanto objetos JSON quanto strings
                        let parsed: { linha?: number; motivo?: string; dados?: { nome?: string; telefone?: string; telefone_normalizado?: string; email?: string } } | null = null;
                        
                        if (typeof error === 'object' && error !== null) {
                          // Já é um objeto JSON
                          parsed = error as typeof parsed;
                        } else if (typeof error === 'string') {
                          // Tentar parsear string como JSON
                          try {
                            parsed = JSON.parse(error);
                          } catch {
                            // String simples - renderizar diretamente
                            return (
                              <p key={index} className="text-sm text-red-600 bg-white p-2 rounded border border-red-200">
                                • {error}
                              </p>
                            );
                          }
                        }
                        
                        if (parsed && (parsed.linha !== undefined || parsed.motivo)) {
                          return (
                            <div key={index} className="bg-white p-2 rounded border border-red-200 text-sm">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-red-700">Linha {parsed.linha ?? '?'}</span>
                                <Badge variant="destructive" className="text-xs">{parsed.motivo ?? 'Erro desconhecido'}</Badge>
                              </div>
                              <div className="text-xs text-muted-foreground space-y-0.5">
                                {parsed.dados?.nome && <p><strong>Nome:</strong> {parsed.dados.nome}</p>}
                                {parsed.dados?.telefone && <p><strong>Telefone:</strong> {parsed.dados.telefone}</p>}
                                {parsed.dados?.telefone_normalizado && (
                                  <p><strong>Tel. Normalizado:</strong> {parsed.dados.telefone_normalizado}</p>
                                )}
                                {parsed.dados?.email && <p><strong>Email:</strong> {parsed.dados.email}</p>}
                              </div>
                            </div>
                          );
                        }
                        
                        // Fallback para qualquer outro formato
                        return (
                          <p key={index} className="text-sm text-red-600 bg-white p-2 rounded border border-red-200">
                            • {String(error)}
                          </p>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {bulkEditJob && (
        <LeadBulkEditDialog
          open={!!bulkEditJob}
          onOpenChange={(open) => !open && setBulkEditJob(null)}
          arquivoNome={bulkEditJob.arquivo_nome}
          totalLeads={bulkEditJob.inseridos}
        />
      )}
    </div>
  );
}
