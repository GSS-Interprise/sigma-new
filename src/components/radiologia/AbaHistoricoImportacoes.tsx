import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Trash2, FileSpreadsheet, Loader2, History, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { handleError } from "@/lib/errorHandler";

interface AbaHistoricoImportacoesProps {
  clienteIdFilter?: string;
}

interface ImportHistorico {
  id: string;
  arquivo_id: string;
  arquivo_nome: string;
  cliente_id: string;
  usuario_nome: string;
  total_registros: number;
  registros_novos: number;
  registros_atualizados: number;
  created_at: string;
  clientes?: {
    nome_empresa: string;
  };
}

export function AbaHistoricoImportacoes({ clienteIdFilter }: AbaHistoricoImportacoesProps) {
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // Buscar histórico de importações
  const { data: historico = [], isLoading } = useQuery({
    queryKey: ['radiologia-imports-historico', clienteIdFilter],
    queryFn: async () => {
      let query = supabase
        .from('radiologia_imports_historico')
        .select(`
          *,
          clientes:cliente_id (nome_empresa)
        `)
        .order('created_at', { ascending: false });

      if (clienteIdFilter) {
        query = query.eq('cliente_id', clienteIdFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ImportHistorico[];
    },
  });

  // Mutation para deletar import e restaurar dados
  const deleteImportMutation = useMutation({
    mutationFn: async (importId: string) => {
      setDeletingId(importId);
      
      let deletedCount = 0;
      let restoredCount = 0;
      let errorCount = 0;
      const errors: string[] = [];
      
      // 1. Buscar todos os snapshots desse import
      const { data: snapshots, error: snapshotsError } = await supabase
        .from('radiologia_pendencias_snapshots')
        .select('*')
        .eq('import_id', importId);

      if (snapshotsError) {
        console.error('[DELETE IMPORT] Erro ao buscar snapshots:', snapshotsError);
        throw new Error(`Erro ao buscar snapshots: ${snapshotsError.message}`);
      }

      console.log(`[DELETE IMPORT] Encontrados ${snapshots?.length || 0} snapshots para processar`);

      if (snapshots && snapshots.length > 0) {
        // 2. Processar cada snapshot
        for (const snapshot of snapshots) {
          if (snapshot.tipo_operacao === 'insert') {
            // Se foi um insert, deletar a pendência
            const { error, count } = await supabase
              .from('radiologia_pendencias')
              .delete()
              .eq('id', snapshot.pendencia_id)
              .select();
            
            if (error) {
              errorCount++;
              const errorMsg = `Erro ao deletar pendência ${snapshot.pendencia_id}: ${error.message} (code: ${error.code})`;
              console.error('[DELETE IMPORT]', errorMsg);
              errors.push(errorMsg);
            } else {
              deletedCount++;
              console.log(`[DELETE IMPORT] Pendência ${snapshot.pendencia_id} deletada com sucesso`);
            }
          } else if (snapshot.tipo_operacao === 'update') {
            // Se foi um update, restaurar dados anteriores
            const dadosAnteriores = snapshot.dados_anteriores as Record<string, any>;
            
            // Remover campos que não devem ser restaurados
            delete dadosAnteriores.id;
            delete dadosAnteriores.created_at;
            
            const { error } = await supabase
              .from('radiologia_pendencias')
              .update(dadosAnteriores as any)
              .eq('id', snapshot.pendencia_id);
            
            if (error) {
              errorCount++;
              const errorMsg = `Erro ao restaurar pendência ${snapshot.pendencia_id}: ${error.message} (code: ${error.code})`;
              console.error('[DELETE IMPORT]', errorMsg);
              errors.push(errorMsg);
            } else {
              restoredCount++;
              console.log(`[DELETE IMPORT] Pendência ${snapshot.pendencia_id} restaurada com sucesso`);
            }
          }
        }
      }

      console.log(`[DELETE IMPORT] Resumo: ${deletedCount} deletadas, ${restoredCount} restauradas, ${errorCount} erros`);

      // Se todos falharam, lançar erro
      if (errorCount > 0 && deletedCount === 0 && restoredCount === 0) {
        throw new Error(`Falha ao processar pendências. Erros: ${errors.slice(0, 3).join('; ')}`);
      }

      // 3. Deletar o registro de histórico (cascade deleta os snapshots)
      const { error: deleteError } = await supabase
        .from('radiologia_imports_historico')
        .delete()
        .eq('id', importId);

      if (deleteError) {
        console.error('[DELETE IMPORT] Erro ao deletar histórico:', deleteError);
        throw new Error(`Erro ao deletar histórico: ${deleteError.message}`);
      }

      return { 
        deletedCount, 
        restoredCount, 
        errorCount,
        totalSnapshots: snapshots?.length || 0 
      };
    },
    onSuccess: (result) => {
      let message = `Importação removida.`;
      if (result.deletedCount > 0) message += ` ${result.deletedCount} pendências removidas.`;
      if (result.restoredCount > 0) message += ` ${result.restoredCount} pendências restauradas.`;
      if (result.errorCount > 0) {
        toast.warning(`${message} (${result.errorCount} falhas - veja o console)`);
      } else {
        toast.success(message);
      }
      queryClient.invalidateQueries({ queryKey: ['radiologia-imports-historico'] });
      queryClient.invalidateQueries({ queryKey: ['radiologia-pendencias'] });
      queryClient.invalidateQueries({ queryKey: ['radiologia-pendencias-abertas'] });
      queryClient.invalidateQueries({ queryKey: ['radiologia-pendencias-atrasos'] });
      queryClient.invalidateQueries({ queryKey: ['radiologia-grouped-data'] });
      queryClient.invalidateQueries({ queryKey: ['radiologia-metrics-agregadas'] });
      queryClient.invalidateQueries({ queryKey: ['clientes-com-pendencias'] });
      queryClient.invalidateQueries({ queryKey: ['datas-com-pendencias'] });
    },
    onError: (error: any) => {
      console.error('[DELETE IMPORT] Erro geral:', error);
      const friendlyError = handleError(error, 'Deletar importação');
      toast.error(friendlyError);
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  // Função auxiliar para deletar em lotes (Supabase tem limite de 1000 por operação)
  const deleteInBatches = async (table: 'radiologia_pendencias' | 'radiologia_pendencias_snapshots' | 'radiologia_imports_historico', batchSize = 500) => {
    let totalDeleted = 0;
    let hasMore = true;
    
    while (hasMore) {
      // Buscar IDs para deletar
      const { data: ids, error: selectError } = await supabase
        .from(table)
        .select('id')
        .limit(batchSize);
      
      if (selectError) {
        console.error(`[DELETE ALL] Erro ao buscar IDs de ${table}:`, selectError);
        throw new Error(`Erro ao buscar registros de ${table}: ${selectError.message}`);
      }
      
      if (!ids || ids.length === 0) {
        hasMore = false;
        break;
      }
      
      // Deletar os IDs encontrados
      const idsToDelete = ids.map((item: { id: string }) => item.id);
      const { error: deleteError } = await supabase
        .from(table)
        .delete()
        .in('id', idsToDelete);
      
      if (deleteError) {
        console.error(`[DELETE ALL] Erro ao deletar lote de ${table}:`, deleteError);
        throw new Error(`Erro ao deletar registros de ${table}: ${deleteError.message}`);
      }
      
      totalDeleted += ids.length;
      console.log(`[DELETE ALL] ${table}: ${totalDeleted} registros deletados`);
      
      // Se retornou menos que o batch size, não há mais registros
      if (ids.length < batchSize) {
        hasMore = false;
      }
    }
    
    return totalDeleted;
  };

  // Mutation para deletar toda a base de dados
  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      setIsDeletingAll(true);
      
      console.log('[DELETE ALL] Iniciando exclusão de toda a base de dados...');

      const { data, error } = await supabase.functions.invoke('radiologia-clear-base', {
        body: {},
      });

      if (error) {
        console.error('[DELETE ALL] Erro ao chamar backend:', error);
        throw error;
      }

      const stats = data as { pendencias: number; snapshots: number; historico: number };
      console.log('[DELETE ALL] Base de dados limpa com sucesso', stats);
      return stats;
    },
    onSuccess: (stats) => {
      toast.success(`Base de dados apagada: ${stats.pendencias} pendências, ${stats.snapshots} snapshots, ${stats.historico} históricos removidos`);

      // Garantir refresh imediato (remover cache + invalidar)
      queryClient.removeQueries({ queryKey: ['radiologia-pendencias'] });
      queryClient.removeQueries({ queryKey: ['radiologia-pendencias-abertas'] });
      queryClient.removeQueries({ queryKey: ['radiologia-pendencias-atrasos'] });
      queryClient.removeQueries({ queryKey: ['radiologia-grouped-data'] });
      queryClient.removeQueries({ queryKey: ['radiologia-metrics-agregadas'] });
      queryClient.removeQueries({ queryKey: ['clientes-com-pendencias'] });
      queryClient.removeQueries({ queryKey: ['datas-com-pendencias'] });

      queryClient.invalidateQueries({ queryKey: ['radiologia-imports-historico'] });
      queryClient.invalidateQueries({ queryKey: ['radiologia-pendencias'] });
      queryClient.invalidateQueries({ queryKey: ['radiologia-pendencias-abertas'] });
      queryClient.invalidateQueries({ queryKey: ['radiologia-pendencias-atrasos'] });
      queryClient.invalidateQueries({ queryKey: ['radiologia-grouped-data'] });
      queryClient.invalidateQueries({ queryKey: ['radiologia-metrics-agregadas'] });
      queryClient.invalidateQueries({ queryKey: ['clientes-com-pendencias'] });
      queryClient.invalidateQueries({ queryKey: ['datas-com-pendencias'] });
    },
    onError: (error: any) => {
      console.error('[DELETE ALL] Erro:', error);
      const friendlyError = handleError(error, 'Deletar base de dados');
      toast.error(friendlyError);
    },
    onSettled: () => {
      setIsDeletingAll(false);
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Histórico de Importações
        </CardTitle>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              disabled={isDeletingAll}
            >
              {isDeletingAll ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Apagando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Apagar toda a base
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                ATENÇÃO: Exclusão total da base de dados
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p className="font-medium">
                  Você está prestes a apagar TODOS os dados de radiologia!
                </p>
                <p>Esta ação irá remover:</p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  <li>Todas as pendências de radiologia</li>
                  <li>Todo o histórico de importações</li>
                  <li>Todos os snapshots de alterações</li>
                </ul>
                <p className="font-bold text-destructive mt-4">
                  Esta ação é IRREVERSÍVEL e não pode ser desfeita!
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteAllMutation.mutate()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Sim, apagar TUDO
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardHeader>
      <CardContent>
        {historico.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileSpreadsheet className="h-12 w-12 mb-4 opacity-50" />
            <p>Nenhuma importação registrada</p>
            <p className="text-sm">As novas importações aparecerão aqui</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arquivo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead className="text-center">Total</TableHead>
                <TableHead className="text-center">Novos</TableHead>
                <TableHead className="text-center">Atualizados</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historico.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate max-w-[200px]" title={item.arquivo_nome}>
                        {item.arquivo_nome}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.clientes?.nome_empresa || '-'}
                  </TableCell>
                  <TableCell>{item.usuario_nome}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">{item.total_registros}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="bg-green-100 text-green-700">
                      {item.registros_novos}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                      {item.registros_atualizados}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {format(new Date(item.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          disabled={deletingId === item.id}
                        >
                          {deletingId === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-destructive" />
                            Confirmar exclusão
                          </AlertDialogTitle>
                          <AlertDialogDescription className="space-y-2">
                            <p>
                              Você está prestes a desfazer a importação <strong>"{item.arquivo_nome}"</strong>.
                            </p>
                            <p>Esta ação irá:</p>
                            <ul className="list-disc list-inside text-sm space-y-1">
                              <li>Remover {item.registros_novos} pendências que foram criadas</li>
                              <li>Restaurar {item.registros_atualizados} pendências ao estado anterior</li>
                            </ul>
                            <p className="font-medium text-destructive">Esta ação não pode ser desfeita.</p>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteImportMutation.mutate(item.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Confirmar Exclusão
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
