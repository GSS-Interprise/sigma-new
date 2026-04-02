import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Upload, FileSpreadsheet, AlertCircle, CheckCircle, Info, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from 'xlsx';
import { handleError } from "@/lib/errorHandler";

// Import parser V2 (único suportado)
import { parseLayoutV2 } from "./import/parseLayoutV2";
import { createMedicoMap } from "./import/utils";
import type { ImportResult } from "./import/types";

interface ImportarPendenciasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

export function ImportarPendenciasDialog({ open, onOpenChange, onImportComplete }: ImportarPendenciasDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [syncedAcessos, setSyncedAcessos] = useState<Map<string, { id: string; status_pendencia: string; cliente_id: string }> | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [selectedClienteId, setSelectedClienteId] = useState<string>("");
  const [resultado, setResultado] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes-radiologia-import'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome_empresa')
        .order('nome_empresa');
      if (error) throw error;
      return data || [];
    },
  });

  const validateAndSetFile = (selectedFile: File) => {
    if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls') || selectedFile.name.endsWith('.xlsm')) {
      setFile(selectedFile);
      setResultado(null);
      toast.info('Arquivo selecionado - Formato V2');
      return true;
    } else {
      toast.error('Por favor, selecione um arquivo Excel (.xlsx, .xls ou .xlsm)');
      return false;
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!importing && selectedClienteId) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (importing) {
      toast.error('Aguarde a importação atual terminar');
      return;
    }

    if (!selectedClienteId) {
      toast.error('Selecione um cliente antes de adicionar o arquivo');
      return;
    }

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  };

  // Sincronização paginada para buscar TODOS os registros existentes (globalmente)
  // Busca global porque o UNIQUE constraint no 'acesso' é global, não por cliente
  const handleSync = async () => {
    if (!selectedClienteId) {
      toast.error("Selecione um cliente antes de sincronizar");
      return;
    }

    setSyncing(true);
    setSyncProgress({ current: 0, total: 0 });

    try {
      // Primeiro, contar total de registros GLOBALMENTE (não apenas do cliente)
      // Isso é necessário porque o constraint UNIQUE no 'acesso' é global
      const { count, error: countError } = await supabase
        .from('radiologia_pendencias')
        .select('id', { count: 'exact', head: true });

      if (countError) throw countError;

      const totalRecords = count || 0;
      setSyncProgress({ current: 0, total: totalRecords });

      if (totalRecords === 0) {
        setSyncedAcessos(new Map());
        toast.success("Base sincronizada (nenhum registro existente)");
        setSyncing(false);
        return;
      }

      // Buscar em lotes paginados de 1000 (limite do Supabase)
      const PAGE_SIZE = 1000;
      const allRecords = new Map<string, { id: string; status_pendencia: string; cliente_id: string }>();
      let offset = 0;

      while (offset < totalRecords) {
        const { data: batch, error } = await supabase
          .from('radiologia_pendencias')
          .select('id, acesso, status_pendencia, cliente_id')
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;

        if (batch) {
          batch.forEach(record => {
            if (record.acesso) {
              allRecords.set(record.acesso, {
                id: record.id,
                status_pendencia: record.status_pendencia || 'aberta',
                cliente_id: record.cliente_id || ''
              });
            }
          });
        }

        offset += PAGE_SIZE;
        setSyncProgress({ current: Math.min(offset, totalRecords), total: totalRecords });

        // Pequena pausa para não sobrecarregar
        if (offset < totalRecords) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Contar quantos são do cliente selecionado
      const clienteRecords = Array.from(allRecords.values()).filter(r => r.cliente_id === selectedClienteId).length;
      
      setSyncedAcessos(allRecords);
      toast.success(`Base sincronizada: ${allRecords.size} registros totais (${clienteRecords} deste cliente)`);
    } catch (error: any) {
      const friendlyError = handleError(error, 'Sincronizar base');
      toast.error(friendlyError);
      console.error('Erro na sincronização:', error);
    } finally {
      setSyncing(false);
    }
  };

  // Buscar perfil do usuário para nome
  const { data: userProfile } = useQuery({
    queryKey: ['user-profile-import', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('nome_completo')
        .eq('id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const handleImport = async () => {
    if (!file || !user || !selectedClienteId) return;

    // Verificar se a base foi sincronizada
    if (!syncedAcessos) {
      toast.error("Sincronize a base antes de importar");
      return;
    }

    setImporting(true);
    let inseridas = 0;
    let atualizadas = 0;
    let ignoradas = 0; // Registros finalizados que não foram atualizados
    let erros = 0;
    const detalhesErros: string[] = [];

    // Para rastrear snapshots
    const insertedPendenciaIds: string[] = [];
    const updatedSnapshots: { pendenciaId: string; dadosAnteriores: any }[] = [];
    const updatedSuccessIds = new Set<string>();
    let importHistoricoId: string | null = null;

    try {
      // Gerar arquivo_id único para esta importação (para histórico)
      const arquivoId = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9]/g, '_')}`;

      // Registrar no histórico ANTES de mexer na base (se falhar, aborta para evitar import sem rastreio)
      const { data: importHistorico, error: historicoError } = await supabase
        .from('radiologia_imports_historico')
        .insert({
          arquivo_id: arquivoId,
          arquivo_nome: file.name,
          cliente_id: selectedClienteId,
          usuario_id: user.id,
          usuario_nome: userProfile?.nome_completo || user.email || 'Usuário',
          total_registros: 0,
          registros_novos: 0,
          registros_atualizados: 0,
        })
        .select('id')
        .single();

      if (historicoError || !importHistorico?.id) {
        throw historicoError || new Error('Falha ao registrar histórico da importação');
      }

      importHistoricoId = importHistorico.id;

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      toast.info(`Processando ${jsonData.length} registros em lote...`);

      // Buscar médicos para lookup
      const { data: medicos } = await supabase.from('medicos').select('id, nome_completo');
      const medicoMap = createMedicoMap(medicos || []);

      // Usar parser V2 (único suportado)
      const parseResult = parseLayoutV2(jsonData, {
        clienteId: selectedClienteId,
        medicoMap,
        fileName: file.name,
        userId: user.id,
      });

      // Adicionar erros do parser
      detalhesErros.push(...parseResult.erros);

      const pendencias = parseResult.pendencias;
      
      // Usar dados já sincronizados (sem precisar buscar novamente)
      const existingByAcesso = syncedAcessos;

      // Separar pendências para insert e update, filtrando duplicatas internas
      const toInsert: any[] = [];
      const toUpdate: { id: string; data: any }[] = [];
      const seenAcessos = new Set<string>(); // Para evitar duplicatas no mesmo lote (baseado em 'acesso')

      // Buscar dados anteriores para updates (para snapshot)
      const pendenciasToFetchForSnapshot: string[] = [];

      for (const pendencia of pendencias) {
        const acesso = pendencia.acesso;
        const existingRecord = acesso ? existingByAcesso.get(acesso) : null;
        
        if (existingRecord) {
          // Verificar se o registro pertence a OUTRO cliente (conflito global)
          if (existingRecord.cliente_id !== selectedClienteId) {
            // Registro existe em outro cliente - não pode inserir nem atualizar
            erros++;
            detalhesErros.push(`Acesso ${acesso?.substring(0, 30)}... já existe em outro cliente`);
            continue;
          }
          
          // Verificar se o registro está finalizado (protegido)
          if (existingRecord.status_pendencia === 'resolvida') {
            // Registro finalizado - NÃO ATUALIZAR
            ignoradas++;
            continue;
          }
          
          // Marcar para buscar dados anteriores
          pendenciasToFetchForSnapshot.push(existingRecord.id);
          
          // Atualizar registro existente (não finalizado, mesmo cliente)
          toUpdate.push({
            id: existingRecord.id,
            data: {
              ...pendencia,
              nivel_urgencia: pendencia.nivel_urgencia as any,
              updated_at: new Date().toISOString(),
            }
          });
        } else if (acesso && !seenAcessos.has(acesso)) {
          // Novo registro - só adicionar se ainda não foi visto neste lote
          seenAcessos.add(acesso);
          toInsert.push({
            ...pendencia,
            nivel_urgencia: pendencia.nivel_urgencia as any,
          });
        } else if (!acesso) {
          // Sem acesso, inserir como novo (pode gerar duplicata se não tiver constraint)
          toInsert.push({
            ...pendencia,
            nivel_urgencia: pendencia.nivel_urgencia as any,
          });
        }
        // Se acesso já foi visto, ignora para evitar duplicata
      }

      // Buscar dados anteriores para snapshots (em lotes)
      if (pendenciasToFetchForSnapshot.length > 0) {
        const FETCH_BATCH = 100;
        for (let i = 0; i < pendenciasToFetchForSnapshot.length; i += FETCH_BATCH) {
          const ids = pendenciasToFetchForSnapshot.slice(i, i + FETCH_BATCH);
          const { data: existingData } = await supabase
            .from('radiologia_pendencias')
            .select('*')
            .in('id', ids);
          
          if (existingData) {
            for (const record of existingData) {
              updatedSnapshots.push({
                pendenciaId: record.id,
                dadosAnteriores: record,
              });
            }
          }
        }
      }

      // Inserir em lotes de 500
      const BATCH_SIZE = 500;
      
      if (toInsert.length > 0) {
        toast.info(`Inserindo ${toInsert.length} novos registros...`);
        
        for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
          const batch = toInsert.slice(i, i + BATCH_SIZE);
          const { data: insertedData, error } = await supabase
            .from('radiologia_pendencias')
            .insert(batch as any)
            .select('id');
          
          if (error) {
            const friendlyError = handleError(error, 'Inserir lote');
            detalhesErros.push(`Erro no lote ${Math.floor(i/BATCH_SIZE) + 1}: ${friendlyError}`);
            erros += batch.length;
          } else {
            inseridas += batch.length;
            // Guardar IDs dos inseridos para snapshot
            if (insertedData) {
              insertedPendenciaIds.push(...insertedData.map(d => d.id));
            }
          }
        }
      }

      // Atualizar registros existentes (ainda precisa ser individual por limitação do Supabase)
      if (toUpdate.length > 0) {
        toast.info(`Atualizando ${toUpdate.length} registros existentes...`);
        
        // Processar updates em paralelo com limite de concorrência
        const CONCURRENT_UPDATES = 10;
        for (let i = 0; i < toUpdate.length; i += CONCURRENT_UPDATES) {
          const batch = toUpdate.slice(i, i + CONCURRENT_UPDATES);
          const updatePromises = batch.map(({ id, data }) =>
            supabase
              .from('radiologia_pendencias')
              .update(data as any)
              .eq('id', id)
              .then(({ error }) => ({ id, error }))
          );
          
          const results = await Promise.all(updatePromises);
          
          for (const { id, error } of results) {
            if (error) {
              const friendlyError = handleError(error, 'Atualizar');
              detalhesErros.push(`Atualização ${id}: ${friendlyError}`);
              erros++;
            } else {
              atualizadas++;
              updatedSuccessIds.add(id);
            }
          }
        }
      }

      // Atualizar totais no histórico
      const { error: historicoUpdateError } = await supabase
        .from('radiologia_imports_historico')
        .update({
          total_registros: inseridas + atualizadas,
          registros_novos: inseridas,
          registros_atualizados: atualizadas,
        })
        .eq('id', importHistoricoId);

      if (historicoUpdateError) throw historicoUpdateError;

      // Criar snapshots para inserts (sem dados anteriores)
      if (insertedPendenciaIds.length > 0) {
        const insertSnapshots = insertedPendenciaIds.map((pendenciaId) => ({
          import_id: importHistoricoId,
          pendencia_id: pendenciaId,
          dados_anteriores: {}, // Insert não tem dados anteriores
          tipo_operacao: 'insert',
        }));

        for (let i = 0; i < insertSnapshots.length; i += BATCH_SIZE) {
          const batch = insertSnapshots.slice(i, i + BATCH_SIZE);
          const { error } = await supabase.from('radiologia_pendencias_snapshots').insert(batch);
          if (error) throw error;
        }
      }

      // Criar snapshots para updates (com dados anteriores) - apenas para updates que realmente deram certo
      const updatedSnapshotsForSuccess = updatedSnapshots.filter((s) => updatedSuccessIds.has(s.pendenciaId));
      if (updatedSnapshotsForSuccess.length > 0) {
        const updateSnapshotsData = updatedSnapshotsForSuccess.map((s) => ({
          import_id: importHistoricoId,
          pendencia_id: s.pendenciaId,
          dados_anteriores: s.dadosAnteriores,
          tipo_operacao: 'update',
        }));

        for (let i = 0; i < updateSnapshotsData.length; i += BATCH_SIZE) {
          const batch = updateSnapshotsData.slice(i, i + BATCH_SIZE);
          const { error } = await supabase.from('radiologia_pendencias_snapshots').insert(batch);
          if (error) throw error;
        }
      }

      setResultado({
        total: jsonData.length,
        inseridas,
        atualizadas,
        ignoradas,
        erros,
        detalhes: detalhesErros,
      });

      // Invalidar cache de clientes com pendências para atualizar o dropdown
      queryClient.invalidateQueries({ queryKey: ['clientes-com-pendencias'] });
      queryClient.invalidateQueries({ queryKey: ['radiologia-imports-historico'] });
      queryClient.invalidateQueries({ queryKey: ['radiologia-pendencias'] });
      queryClient.invalidateQueries({ queryKey: ['datas-com-pendencias'] });

      if (erros === 0) {
        toast.success(`Importação concluída: ${inseridas} inseridas, ${atualizadas} atualizadas`);
        if (onImportComplete) onImportComplete();
      } else {
        toast.warning(`Importação concluída com ${erros} erros`);
      }
    } catch (error: any) {
      // Se o histórico foi criado mas o processo falhou, remover para não ficar um registro “quebrado”
      if (importHistoricoId) {
        try {
          await supabase.from('radiologia_imports_historico').delete().eq('id', importHistoricoId);
        } catch {
          // best-effort
        }
      }
      const friendlyError = handleError(error, 'Processar arquivo');
      toast.error(friendlyError);
      console.error('Erro na importação:', error);
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const link = document.createElement('a');
    link.href = '/templates/template-pendencias-radiologia.xlsx';
    link.download = 'template-pendencias-radiologia.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Pendências (Excel)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p>Use o modelo V2 para importar pendências:</p>
              <ul className="list-disc list-inside text-sm mt-2 space-y-1">
                <li><strong>Colunas:</strong> data_entrada, nome_paciente, sla, hora_entrada, atribuido, cod_acesso, mod...</li>
              </ul>
              <p className="text-sm mt-2">
                O sistema agrupa exames por paciente e calcula automaticamente os prazos de SLA.
              </p>
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">1. Baixe o modelo de planilha</Label>
              <Button
                variant="outline"
                onClick={handleDownloadTemplate}
                className="mt-2 w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                Baixar Modelo (Template)
              </Button>
            </div>

            <div>
              <Label className="text-sm font-medium">2. Selecione o cliente</Label>
              <Select value={selectedClienteId} onValueChange={(value) => {
                setSelectedClienteId(value);
                setSyncedAcessos(null); // Reset sync ao trocar cliente
              }}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Selecione o cliente da planilha" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((cliente) => (
                    <SelectItem key={cliente.id} value={cliente.id}>
                      {cliente.nome_empresa}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium">3. Sincronize a base de dados</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Carrega todos os registros existentes para evitar duplicatas na importação.
              </p>
              <Button
                variant={syncedAcessos ? "outline" : "default"}
                onClick={handleSync}
                disabled={!selectedClienteId || syncing || importing}
                className="mt-2 w-full"
              >
                {syncing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Sincronizando... {syncProgress.current}/{syncProgress.total}
                  </>
                ) : syncedAcessos ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Sincronizado ({syncedAcessos.size} registros) - Clique para atualizar
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Sincronizar Base
                  </>
                )}
              </Button>
            </div>

            <div>
              <Label className="text-sm font-medium">4. Selecione ou arraste o arquivo Excel</Label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`mt-2 border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  isDragging 
                    ? 'border-primary bg-primary/10' 
                    : selectedClienteId && syncedAcessos
                      ? 'border-muted-foreground/25 hover:border-primary/50' 
                      : 'border-muted-foreground/10 bg-muted/50 cursor-not-allowed'
                }`}
              >
                {!selectedClienteId ? (
                  <p className="text-sm text-muted-foreground">
                    Selecione um cliente primeiro
                  </p>
                ) : !syncedAcessos ? (
                  <p className="text-sm text-muted-foreground">
                    Sincronize a base antes de selecionar o arquivo
                  </p>
                ) : file ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFile(null)}
                      className="h-6 w-6 p-0"
                    >
                      ×
                    </Button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mb-2">
                      Arraste a planilha aqui ou clique para selecionar
                    </p>
                    <Input
                      type="file"
                      accept=".xlsx,.xls,.xlsm"
                      onChange={handleFileChange}
                      className="hidden"
                      id="file-upload"
                      disabled={importing || !syncedAcessos}
                    />
                    <Label htmlFor="file-upload" className="cursor-pointer">
                      <Button variant="outline" size="sm" asChild disabled={!syncedAcessos}>
                        <span>Selecionar arquivo</span>
                      </Button>
                    </Label>
                  </>
                )}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">5. Importe os dados</Label>
              <Button
                onClick={handleImport}
                disabled={!file || !selectedClienteId || !syncedAcessos || importing}
                className="mt-2 w-full"
              >
                {importing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Processando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Importar Pendências
                  </>
                )}
              </Button>
            </div>
          </div>

          {resultado && (
            <Alert variant={resultado.erros === 0 ? 'default' : 'destructive'}>
              {resultado.erros === 0 ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription className="space-y-2">
                <div className="font-semibold">Resultado da Importação:</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Total de linhas: {resultado.total}</div>
                  <div>Inseridas: {resultado.inseridas}</div>
                  <div>Atualizadas: {resultado.atualizadas}</div>
                  {resultado.ignoradas > 0 && (
                    <div className="text-amber-600">
                      Ignoradas (finalizadas): {resultado.ignoradas}
                    </div>
                  )}
                  <div>Erros: {resultado.erros}</div>
                </div>
                {resultado.detalhes.length > 0 && (
                  <div className="mt-4">
                    <div className="font-semibold mb-2">Detalhes dos erros:</div>
                    <div className="max-h-40 overflow-y-auto text-xs space-y-1">
                      {resultado.detalhes.map((detalhe, idx) => (
                        <div key={idx} className="text-red-600">{detalhe}</div>
                      ))}
                    </div>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
