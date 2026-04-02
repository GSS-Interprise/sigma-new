import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Key, Plus, Copy, Trash2, RefreshCw, ExternalLink, Shield, Server, Activity, AlertTriangle, CheckCircle2, Clock, Database } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ApiToken {
  id: string;
  nome: string;
  token: string;
  sistema_origem: string;
  ativo: boolean;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
}

interface IntegrationLog {
  id: string;
  sistema_origem: string;
  tipo_operacao: string;
  status: string;
  total_registros: number;
  registros_sucesso: number;
  registros_erro: number;
  mensagem: string;
  created_at: string;
}

export function EscalasConfigTab() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [novoToken, setNovoToken] = useState({ nome: "", sistema_origem: "DR_ESCALA" });
  const [tokenGerado, setTokenGerado] = useState<string | null>(null);

  // Buscar status da integração
  const { data: integrationStatus, isLoading: isLoadingStatus } = useQuery({
    queryKey: ["escalas-integration-status"],
    queryFn: async () => {
      // Última sincronização
      const { data: lastSync, error: syncError } = await supabase
        .from("escalas_integracao_logs")
        .select("*")
        .eq("sistema_origem", "DR_ESCALA")
        .order("data_sincronizacao", { ascending: false })
        .limit(1)
        .single();

      // Total de escalas
      const { count: totalEscalas, error: countError } = await supabase
        .from("escalas_integradas")
        .select("*", { count: "exact", head: true })
        .eq("sistema_origem", "DR_ESCALA");

      // Escalas com dados incompletos
      const { count: incompletosTotal, error: incompletosError } = await supabase
        .from("escalas_integradas")
        .select("*", { count: "exact", head: true })
        .eq("sistema_origem", "DR_ESCALA")
        .eq("dados_incompletos", true);

      // Agrupar por motivo de incompleto
      const { data: motivosData, error: motivosError } = await supabase
        .from("escalas_integradas")
        .select("motivo_incompleto")
        .eq("sistema_origem", "DR_ESCALA")
        .eq("dados_incompletos", true);

      const motivosCounts: Record<string, number> = {};
      motivosData?.forEach(item => {
        const motivo = item.motivo_incompleto || "Motivo não especificado";
        motivosCounts[motivo] = (motivosCounts[motivo] || 0) + 1;
      });

      return {
        lastSync: lastSync || null,
        totalEscalas: totalEscalas || 0,
        incompletosTotal: incompletosTotal || 0,
        motivosCounts,
        isActive: !!lastSync && lastSync.status !== "erro",
      };
    },
  });

  // Buscar tokens
  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["escalas-api-tokens"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("escalas_api_tokens" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data as unknown) as ApiToken[];
    },
  });

  // Criar token
  const criarTokenMutation = useMutation({
    mutationFn: async () => {
      const token = `esc_${crypto.randomUUID().replace(/-/g, "")}`;

      const { error } = await supabase.from("escalas_api_tokens" as any).insert({
        nome: novoToken.nome,
        token,
        sistema_origem: novoToken.sistema_origem,
        created_by: user?.id,
      });

      if (error) throw error;
      return token;
    },
    onSuccess: (token) => {
      queryClient.invalidateQueries({ queryKey: ["escalas-api-tokens"] });
      setTokenGerado(token);
      toast.success("Token criado com sucesso");
    },
    onError: (error) => {
      toast.error("Erro ao criar token: " + (error as Error).message);
    },
  });

  // Alternar status do token
  const toggleTokenMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("escalas_api_tokens" as any).update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalas-api-tokens"] });
      toast.success("Status atualizado");
    },
  });

  // Deletar token
  const deletarTokenMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("escalas_api_tokens" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalas-api-tokens"] });
      toast.success("Token removido");
    },
  });

  const copiarToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast.success("Token copiado para a área de transferência");
  };

  const fecharDialogToken = () => {
    setDialogOpen(false);
    setNovoToken({ nome: "", sistema_origem: "DR_ESCALA" });
    setTokenGerado(null);
  };

  const endpointUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/escalas-api`;

  return (
    <div className="space-y-6">
      {/* Status da Integração */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Status da Integração
          </CardTitle>
          <CardDescription>
            Monitoramento da integração com Dr. Escala - Sistema de origem das escalas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingStatus ? (
            <p className="text-center text-muted-foreground py-4">Carregando status...</p>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Status Ativo */}
              <div className="p-4 rounded-lg bg-muted flex items-start gap-3">
                <div className={`p-2 rounded-full ${integrationStatus?.isActive ? "bg-green-100" : "bg-red-100"}`}>
                  {integrationStatus?.isActive ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">Status</p>
                  <p className={`text-lg font-bold ${integrationStatus?.isActive ? "text-green-600" : "text-red-600"}`}>
                    {integrationStatus?.isActive ? "Ativo" : "Inativo"}
                  </p>
                </div>
              </div>

              {/* Última Sincronização */}
              <div className="p-4 rounded-lg bg-muted flex items-start gap-3">
                <div className="p-2 rounded-full bg-accent/20">
                  <Clock className="h-4 w-4 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium">Última Sincronização</p>
                  <p className="text-lg font-bold">
                    {integrationStatus?.lastSync?.data_sincronizacao
                      ? format(parseISO(integrationStatus.lastSync.data_sincronizacao), "dd/MM/yyyy HH:mm", { locale: ptBR })
                      : "Nunca"}
                  </p>
                </div>
              </div>

              {/* Total Escalas */}
              <div className="p-4 rounded-lg bg-muted flex items-start gap-3">
                <div className="p-2 rounded-full bg-primary/10">
                  <Database className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Total Importado</p>
                  <p className="text-lg font-bold">{integrationStatus?.totalEscalas.toLocaleString()}</p>
                </div>
              </div>

              {/* Dados Incompletos */}
              <div className={`p-4 rounded-lg ${integrationStatus?.incompletosTotal ? "bg-destructive/10" : "bg-muted"} flex items-start gap-3`}>
                <div className={`p-2 rounded-full ${integrationStatus?.incompletosTotal ? "bg-destructive/20" : "bg-muted"}`}>
                  <AlertTriangle className={`h-4 w-4 ${integrationStatus?.incompletosTotal ? "text-destructive" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <p className="text-sm font-medium">Dados Incompletos</p>
                  <p className={`text-lg font-bold ${integrationStatus?.incompletosTotal ? "text-destructive" : ""}`}>
                    {integrationStatus?.incompletosTotal.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Detalhamento dos Motivos de Incompleto */}
          {integrationStatus?.incompletosTotal > 0 && Object.keys(integrationStatus.motivosCounts).length > 0 && (
            <div className="mt-4 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
              <h4 className="font-medium text-sm text-destructive mb-2">Detalhamento de Dados Incompletos:</h4>
              <ul className="space-y-1">
                {Object.entries(integrationStatus.motivosCounts).map(([motivo, count]) => (
                  <li key={motivo} className="text-sm flex justify-between">
                    <span className="text-muted-foreground">{motivo}</span>
                    <Badge variant="outline" className="text-destructive border-destructive/30">
                      {count.toLocaleString()}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground mt-3">
                ⚠️ Plantões com dados incompletos são exibidos no calendário, mas excluídos do cálculo de "Horas Totais" no BI.
              </p>
            </div>
          )}

          {/* Último Log */}
          {integrationStatus?.lastSync && (
            <div className="mt-4 p-3 rounded-lg bg-muted/50 border">
              <p className="text-sm text-muted-foreground">
                <strong>Último log:</strong> {integrationStatus.lastSync.mensagem}
              </p>
              <div className="flex gap-2 mt-2">
                <Badge variant="outline" className="text-xs">
                  ✓ {integrationStatus.lastSync.registros_sucesso} sucesso
                </Badge>
                {integrationStatus.lastSync.registros_erro > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    ✗ {integrationStatus.lastSync.registros_erro} erros
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informações da API */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Endpoint da API
          </CardTitle>
          <CardDescription>
            Configure a integração com o Dr. Escala usando esta API REST.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-muted font-mono text-sm flex items-center justify-between">
            <span className="truncate">{endpointUrl}</span>
            <Button variant="ghost" size="sm" onClick={() => copiarToken(endpointUrl)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-4">
                <h4 className="font-medium text-green-800 mb-2">POST - Enviar Escalas</h4>
                <pre className="text-xs bg-white p-2 rounded overflow-x-auto">
{`{
  "escalas": [
    {
      "id_externo": "ESC-001",
      "profissional_nome": "Dr. João",
      "profissional_crm": "12345-SP",
      "setor": "UTI",
      "data_escala": "2024-01-15",
      "hora_inicio": "07:00",
      "hora_fim": "19:00",
      "status_escala": "confirmado"
    }
  ]
}`}
                </pre>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-4">
                <h4 className="font-medium text-blue-800 mb-2">GET - Consultar Escalas</h4>
                <pre className="text-xs bg-white p-2 rounded overflow-x-auto">
{`GET /escalas-api
  ?data_inicio=2024-01-01
  &data_fim=2024-01-31
  &setor=UTI
  &crm=12345-SP

Headers:
  x-api-token: seu_token_aqui`}
                </pre>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Tokens de API */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Tokens de API
            </CardTitle>
            <CardDescription>
              Gerencie tokens de autenticação para a API de escalas.
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Token
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Token de API</DialogTitle>
              </DialogHeader>
              {tokenGerado ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                    <p className="text-sm text-amber-800 mb-2">
                      <strong>Importante:</strong> Copie este token agora. Ele não será exibido novamente.
                    </p>
                    <div className="flex items-center gap-2">
                      <Input value={tokenGerado} readOnly className="font-mono text-xs" />
                      <Button variant="outline" size="icon" onClick={() => copiarToken(tokenGerado)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={fecharDialogToken}>Fechar</Button>
                  </DialogFooter>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome do Token</Label>
                    <Input
                      placeholder="Ex: Dr. Escala Produção"
                      value={novoToken.nome}
                      onChange={(e) => setNovoToken({ ...novoToken, nome: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Sistema de Origem</Label>
                    <Input
                      placeholder="DR_ESCALA"
                      value={novoToken.sistema_origem}
                      onChange={(e) => setNovoToken({ ...novoToken, sistema_origem: e.target.value })}
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={fecharDialogToken}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => criarTokenMutation.mutate()}
                      disabled={!novoToken.nome || criarTokenMutation.isPending}
                    >
                      Gerar Token
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-4">Carregando...</p>
          ) : tokens.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              Nenhum token configurado. Crie um token para habilitar a API.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Sistema</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último Uso</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell className="font-medium">{token.nome}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{token.sistema_origem}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {token.token.substring(0, 12)}...
                        </code>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copiarToken(token.token)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={token.ativo}
                        onCheckedChange={(checked) =>
                          toggleTokenMutation.mutate({ id: token.id, ativo: checked })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {token.last_used_at
                        ? format(parseISO(token.last_used_at), "dd/MM/yy HH:mm", { locale: ptBR })
                        : "Nunca"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(parseISO(token.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover Token?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação é irreversível. Sistemas usando este token perderão acesso à API.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deletarTokenMutation.mutate(token.id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Remover
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

      {/* Segurança */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Segurança e Governança
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted">
              <div className="p-2 rounded-full bg-green-100">
                <Shield className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <h4 className="font-medium">Somente Leitura</h4>
                <p className="text-sm text-muted-foreground">
                  O Sigma não permite criação, edição ou exclusão de escalas integradas. 
                  Qualquer alteração deve ser feita no Dr. Escala.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted">
              <div className="p-2 rounded-full bg-blue-100">
                <RefreshCw className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <h4 className="font-medium">Sincronização Automática</h4>
                <p className="text-sm text-muted-foreground">
                  Escalas são atualizadas automaticamente quando recebidas via API.
                  O ID externo garante que não haja duplicatas.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted">
              <div className="p-2 rounded-full bg-amber-100">
                <ExternalLink className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <h4 className="font-medium">Dr. Escala como Sistema Mestre</h4>
                <p className="text-sm text-muted-foreground">
                  Todas as escalas são gerenciadas no Dr. Escala. O Sigma atua apenas como 
                  consumidor para consulta, cruzamento de dados e relatórios.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="p-2 rounded-full bg-amber-100">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <h4 className="font-medium text-amber-800">Dados Incompletos</h4>
                <p className="text-sm text-amber-700">
                  Plantões sem horário de início/fim são marcados como "Dados Incompletos" e 
                  <strong> não entram no cálculo de Horas Totais</strong>. Eles são exibidos no calendário
                  e aparecem no BI como problema a ser corrigido na origem.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
