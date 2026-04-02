import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2, Clock, Play, SkipForward, XCircle, RefreshCw, Download, Users } from "lucide-react";
import { toast } from "sonner";
import { MedicoSearchSelect } from "./MedicoSearchSelect";

interface MigrationResult {
  medico_id: string;
  medico_nome: string;
  status: 'success' | 'skipped' | 'error';
  reason?: string;
  lead_id?: string;
  payload?: Record<string, unknown>;
  warnings_count?: number;
  summary_fields?: {
    phone_e164: string | null;
    cpf: string | null;
    crm: string | null;
    especialidade: string | null;
  };
}

interface MigrationResponse {
  success: boolean;
  summary?: {
    total_processed: number;
    success: number;
    skipped: number;
    errors: number;
    dry_run: boolean;
    include_full_payload?: boolean;
  };
  results?: MigrationResult[];
  error?: string;
}

export function MigracaoMedicosAdmin() {
  const [dryRun, setDryRun] = useState(true);
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [selectedMedicoIds, setSelectedMedicoIds] = useState<string[]>([]);
  const [lastResponse, setLastResponse] = useState<MigrationResponse | null>(null);

  // Query to get migration stats
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['migracao-stats'],
    queryFn: async () => {
      const { count: semLeadIdCount } = await supabase
        .from('medicos')
        .select('id', { count: 'exact', head: true })
        .is('lead_id', null);
      
      const { count: comLeadIdCount } = await supabase
        .from('medicos')
        .select('id', { count: 'exact', head: true })
        .not('lead_id', 'is', null);
      
      const { count: leadsMigradosCount } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .not('migrado_de_medico_id', 'is', null);

      return {
        totalMedicos: (semLeadIdCount || 0) + (comLeadIdCount || 0),
        semLeadId: semLeadIdCount || 0,
        comLeadId: comLeadIdCount || 0,
        leadsMigrados: leadsMigradosCount || 0,
      };
    },
  });

  const hasSelectedMedicos = selectedMedicoIds.length > 0;

  // Migration mutation
  const migrationMutation = useMutation({
    mutationFn: async (useSelectedIds: boolean) => {
      const body = useSelectedIds && hasSelectedMedicos
        ? { dry_run: dryRun, medico_ids: selectedMedicoIds }
        : { dry_run: dryRun, limit, offset };

      const { data, error } = await supabase.functions.invoke('migrate-medicos-to-leads', {
        body,
      });

      if (error) throw error;
      return data as MigrationResponse;
    },
    onSuccess: (data) => {
      setLastResponse(data);
      refetchStats();
      
      if (data.success) {
        const mode = dryRun ? 'DRY RUN' : 'MIGRAÇÃO';
        toast.success(`${mode} concluído: ${data.summary?.success} sucesso, ${data.summary?.skipped} pulados, ${data.summary?.errors} erros`);
      } else {
        toast.error(`Erro: ${data.error}`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Erro ao executar: ${error.message}`);
      setLastResponse({ success: false, error: error.message });
    },
  });

  const handleExportJson = () => {
    if (!lastResponse) return;
    
    const blob = new Blob([JSON.stringify(lastResponse, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `migracao-${dryRun ? 'dry-run' : 'real'}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('JSON exportado com sucesso');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'skipped': return <SkipForward className="h-4 w-4 text-yellow-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success': return <Badge variant="default" className="bg-green-500">Sucesso</Badge>;
      case 'skipped': return <Badge variant="secondary">Pulado</Badge>;
      case 'error': return <Badge variant="destructive">Erro</Badge>;
      default: return <Badge variant="outline">-</Badge>;
    }
  };

  // Calcular totais do resultado
  const resultTotals = lastResponse?.results ? {
    success: lastResponse.results.filter(r => r.status === 'success').length,
    skipped: lastResponse.results.filter(r => r.status === 'skipped').length,
    error: lastResponse.results.filter(r => r.status === 'error').length,
  } : null;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Médicos</CardDescription>
            <CardTitle className="text-2xl">{stats?.totalMedicos || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sem lead_id (candidatos)</CardDescription>
            <CardTitle className="text-2xl text-amber-600">{stats?.semLeadId || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Com lead_id (já vinculados)</CardDescription>
            <CardTitle className="text-2xl text-green-600">{stats?.comLeadId || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Leads Migrados</CardDescription>
            <CardTitle className="text-2xl text-blue-600">{stats?.leadsMigrados || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Control Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Controle de Migração
          </CardTitle>
          <CardDescription>
            Execute a migração em modo dry-run primeiro para validar, depois execute a migração real em lotes pequenos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Seleção de médicos específicos */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Selecionar Médicos Específicos (opcional)
            </Label>
            <MedicoSearchSelect
              selectedIds={selectedMedicoIds}
              onSelectionChange={setSelectedMedicoIds}
              placeholder="Buscar médico por nome, CPF, CRM ou telefone..."
            />
            {hasSelectedMedicos && (
              <p className="text-xs text-muted-foreground">
                ℹ️ Com médicos selecionados, os campos Limite e Offset são ignorados.
              </p>
            )}
          </div>

          <Separator />

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="dryRun"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="dryRun" className="font-medium">
                Dry Run (apenas simular, não gravar)
              </Label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="limit" className={hasSelectedMedicos ? "text-muted-foreground" : ""}>
                Limite de registros
              </Label>
              <Input
                id="limit"
                type="number"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                min={1}
                max={500}
                disabled={hasSelectedMedicos}
                className={hasSelectedMedicos ? "opacity-50" : ""}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {dryRun && limit > 10 && !hasSelectedMedicos && "⚠️ Payload completo só é exibido com limit ≤ 10"}
              </p>
            </div>
            <div>
              <Label htmlFor="offset" className={hasSelectedMedicos ? "text-muted-foreground" : ""}>
                Offset (pular primeiros N)
              </Label>
              <Input
                id="offset"
                type="number"
                value={offset}
                onChange={(e) => setOffset(Number(e.target.value))}
                min={0}
                disabled={hasSelectedMedicos}
                className={hasSelectedMedicos ? "opacity-50" : ""}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {hasSelectedMedicos ? (
              <>
                <Button
                  onClick={() => migrationMutation.mutate(true)}
                  disabled={migrationMutation.isPending}
                  variant={dryRun ? "outline" : "default"}
                  className={!dryRun ? "bg-red-600 hover:bg-red-700" : ""}
                >
                  {migrationMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  {dryRun ? `Dry Run (${selectedMedicoIds.length} selecionados)` : `Migrar ${selectedMedicoIds.length} selecionados`}
                </Button>
              </>
            ) : (
              <Button
                onClick={() => migrationMutation.mutate(false)}
                disabled={migrationMutation.isPending}
                variant={dryRun ? "outline" : "default"}
                className={!dryRun ? "bg-red-600 hover:bg-red-700" : ""}
              >
                {migrationMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {dryRun ? "Executar Dry Run" : "Executar Migração Real"}
              </Button>
            )}
            <Button variant="ghost" onClick={() => refetchStats()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar Stats
            </Button>
          </div>

          {!dryRun && (
            <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4" />
                <span className="font-medium">ATENÇÃO: Modo de migração REAL ativado!</span>
              </div>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                Os dados serão gravados no banco. {hasSelectedMedicos ? `${selectedMedicoIds.length} médicos serão migrados.` : 'Execute em lotes pequenos (10-50) primeiro.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {lastResponse && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {lastResponse.success ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                Resultado da Última Execução
                {lastResponse.summary?.dry_run && (
                  <Badge variant="outline" className="ml-2">DRY RUN</Badge>
                )}
              </CardTitle>
              {lastResponse.results && lastResponse.results.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleExportJson}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar JSON
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Summary totals - always visible */}
            {lastResponse.summary && (
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="text-center p-2 bg-muted rounded">
                  <div className="text-2xl font-bold">{lastResponse.summary.total_processed}</div>
                  <div className="text-sm text-muted-foreground">Processados</div>
                </div>
                <div className="text-center p-2 bg-green-100 dark:bg-green-900 rounded">
                  <div className="text-2xl font-bold text-green-700 dark:text-green-300">{lastResponse.summary.success}</div>
                  <div className="text-sm text-green-600 dark:text-green-400">Sucesso</div>
                </div>
                <div className="text-center p-2 bg-yellow-100 dark:bg-yellow-900 rounded">
                  <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">{lastResponse.summary.skipped}</div>
                  <div className="text-sm text-yellow-600 dark:text-yellow-400">Pulados</div>
                </div>
                <div className="text-center p-2 bg-red-100 dark:bg-red-900 rounded">
                  <div className="text-2xl font-bold text-red-700 dark:text-red-300">{lastResponse.summary.errors}</div>
                  <div className="text-sm text-red-600 dark:text-red-400">Erros</div>
                </div>
              </div>
            )}

            {lastResponse.error && (
              <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md mb-4">
                <p className="text-red-700 dark:text-red-300">{lastResponse.error}</p>
              </div>
            )}

            {lastResponse.results && lastResponse.results.length > 0 && (
              <>
                <Separator className="my-4" />
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">Detalhes por Registro:</h4>
                  {!lastResponse.summary?.include_full_payload && lastResponse.summary?.dry_run && (
                    <span className="text-xs text-muted-foreground">
                      ℹ️ Payload resumido (limit &gt; 10)
                    </span>
                  )}
                </div>
                <ScrollArea className="h-[400px] border rounded-md">
                  <div className="p-4 space-y-3">
                    {lastResponse.results.map((result) => (
                      <div 
                        key={result.medico_id} 
                        className="p-3 border rounded-md bg-muted/30"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(result.status)}
                            <span className="font-medium">{result.medico_nome}</span>
                            {result.warnings_count !== undefined && result.warnings_count > 0 && (
                              <Badge variant="outline" className="text-amber-600">
                                {result.warnings_count} warning{result.warnings_count > 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                          {getStatusBadge(result.status)}
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div><strong>Médico ID:</strong> {result.medico_id}</div>
                          {result.lead_id && <div><strong>Lead ID:</strong> {result.lead_id}</div>}
                          {result.reason && <div><strong>Motivo:</strong> {result.reason}</div>}
                          
                          {/* Summary fields (when payload is not included) */}
                          {result.summary_fields && !result.payload && (
                            <div className="mt-2 p-2 bg-muted rounded text-xs">
                              <div><strong>phone_e164:</strong> {result.summary_fields.phone_e164 || '❌ N/A'}</div>
                              <div><strong>cpf:</strong> {result.summary_fields.cpf || 'N/A'}</div>
                              <div><strong>crm:</strong> {result.summary_fields.crm || 'N/A'}</div>
                              <div><strong>especialidade:</strong> {result.summary_fields.especialidade || 'N/A'}</div>
                            </div>
                          )}
                        </div>
                        {result.payload && (
                          <details className="mt-2">
                            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                              Ver payload completo
                            </summary>
                            <pre className="text-xs mt-2 p-2 bg-muted rounded overflow-x-auto max-h-[200px]">
                              {JSON.stringify(result.payload, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Rollback Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-amber-600">Script de Rollback</CardTitle>
          <CardDescription>
            Use apenas em caso de problemas. Não execute sem necessidade.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="p-4 bg-muted rounded-md text-xs overflow-x-auto">
{`-- ROLLBACK: Reverter migração (USE COM CUIDADO!)

-- 1. Apagar leads migrados automaticamente
DELETE FROM leads WHERE migrado_de_medico_id IS NOT NULL;

-- 2. Limpar vínculos em médicos
UPDATE medicos SET lead_id = NULL 
WHERE lead_id IS NOT NULL 
  AND lead_id NOT IN (SELECT id FROM leads);

-- 3. Verificar resultado
SELECT COUNT(*) as medicos_sem_lead FROM medicos WHERE lead_id IS NULL;
SELECT COUNT(*) as leads_migrados FROM leads WHERE migrado_de_medico_id IS NOT NULL;`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
