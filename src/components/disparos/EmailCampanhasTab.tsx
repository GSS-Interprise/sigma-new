import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Play, Trash2, UserPlus, Users, CheckCircle, XCircle, Clock, Power, PowerOff, Mail, Eye, Settings, Copy, ExternalLink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { EmailImportDialog } from "./EmailImportDialog";
import { EmailContatosPanel } from "./EmailContatosPanel";
interface CampanhaEmail {
  id: string;
  nome: string;
  proposta_id: string | null;
  texto_ia: string | null;
  assunto_email: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  status: string;
  total_contatos: number;
  enviados: number;
  falhas: number;
  respondidos: number;
  created_at: string;
  ativo: boolean;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "outline" },
  em_andamento: { label: "Em Andamento", variant: "default" },
  concluido: { label: "Concluído", variant: "outline" },
  cancelado: { label: "Cancelado", variant: "destructive" },
};

export function EmailCampanhasTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [campanhaParaImportar, setCampanhaParaImportar] = useState<string | null>(null);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [campanhaSelecionada, setCampanhaSelecionada] = useState<CampanhaEmail | null>(null);
  const [webhookConfigOpen, setWebhookConfigOpen] = useState(false);
  const [emailWebhookUrl, setEmailWebhookUrl] = useState("");
  const queryClient = useQueryClient();
  const { isAdmin } = usePermissions();

  // Form state
  const [propostaId, setPropostaId] = useState("");
  const [assuntoEmail, setAssuntoEmail] = useState("");

  // Buscar configuração de webhook para email
  const { data: webhookConfig } = useQuery({
    queryKey: ["email-webhook-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supabase_config" as any)
        .select("valor")
        .eq("chave", "email_webhook_url")
        .maybeSingle();
      if (error) throw error;
      return (data as any)?.valor || "";
    },
    enabled: isAdmin,
  });

  // Sincronizar URL do webhook quando carregar
  useEffect(() => {
    if (webhookConfig) {
      setEmailWebhookUrl(webhookConfig);
    }
  }, [webhookConfig]);

  // Salvar webhook config
  const saveWebhookMutation = useMutation({
    mutationFn: async (url: string) => {
      const { data: existing } = await supabase
        .from("supabase_config" as any)
        .select("id")
        .eq("chave", "email_webhook_url")
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("supabase_config" as any)
          .update({ valor: url })
          .eq("chave", "email_webhook_url");
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("supabase_config" as any)
          .insert({ chave: "email_webhook_url", valor: url });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-webhook-config"] });
      toast.success("Webhook de email salvo com sucesso!");
      setWebhookConfigOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Buscar campanhas de email
  const { data: campanhas = [], isLoading } = useQuery({
    queryKey: ["email-campanhas", mostrarInativos],
    queryFn: async () => {
      const query: any = supabase
        .from("email_campanhas")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (!mostrarInativos) {
        query.eq("ativo", true);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as CampanhaEmail[];
    },
  });

  // Buscar propostas do tipo email para criar campanha
  const { data: propostas = [] } = useQuery({
    queryKey: ["propostas-tipo-email"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposta")
        .select("id, id_proposta, descricao, observacoes, contrato_id, status, criado_em")
        .eq("tipo_disparo", "email")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Buscar propostas para exibir mensagens
  const { data: propostasParaMensagem = [] } = useQuery({
    queryKey: ["propostas-email-mensagens", campanhas.map(c => c.proposta_id)],
    queryFn: async () => {
      const propostaIds = campanhas.map(c => c.proposta_id).filter(Boolean) as string[];
      if (propostaIds.length === 0) return [];
      const { data, error } = await supabase
        .from("proposta")
        .select("id, observacoes")
        .in("id", propostaIds);
      if (error) throw error;
      return data;
    },
    enabled: campanhas.length > 0,
  });

  // Criar campanha
  const criarMutation = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome_completo")
        .eq("id", user?.id)
        .single();

      const propostaSelecionada = propostas.find((p) => p.id === propostaId);

      // Usar descrição da proposta como nome da campanha
      const nomeCampanha =
        propostaSelecionada?.descricao?.replace(/^Proposta de Captação\s*-\s*/i, "") ||
        propostaSelecionada?.id_proposta ||
        `Campanha Email ${propostaId.slice(0, 8)}`;

      const { error } = await supabase.from("email_campanhas" as any).insert({
        nome: nomeCampanha,
        proposta_id: propostaId || null,
        texto_ia: propostaSelecionada?.observacoes || null,
        assunto_email: assuntoEmail || null,
        responsavel_id: user?.id,
        responsavel_nome: profile?.nome_completo || "Usuário",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campanhas"] });
      toast.success("Campanha de email criada!");
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Iniciar envio de emails - envia para webhook configurado
  const enviarMutation = useMutation({
    mutationFn: async (campanhaId: string) => {
      // Buscar webhook URL configurado
      const { data: configData, error: configError } = await supabase
        .from("supabase_config" as any)
        .select("valor")
        .eq("chave", "email_webhook_url")
        .maybeSingle();
      
      if (configError) throw configError;
      
      const webhookUrl = (configData as any)?.valor;
      if (!webhookUrl) {
        throw new Error("URL do Webhook de Email não configurada. Solicite a um administrador.");
      }

      // Buscar contatos da campanha
      const { data: contatos, error: contatosError } = await supabase
        .from("email_contatos" as any)
        .select("id, email, nome")
        .eq("campanha_id", campanhaId)
        .eq("status", "pendente");

      if (contatosError) throw contatosError;
      if (!contatos || contatos.length === 0) {
        throw new Error("Nenhum contato pendente para enviar");
      }

      // Buscar campanha para obter dados
      const { data: campanha, error: campanhaError } = await supabase
        .from("email_campanhas" as any)
        .select("texto_ia, nome, assunto_email, responsavel_id")
        .eq("id", campanhaId)
        .single();

      if (campanhaError) throw campanhaError;

      const campanhaData = campanha as any;

      // Buscar email do responsável
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", campanhaData?.responsavel_id)
        .single();

      // Montar payload no formato especificado (objeto, não array)
      const payload = {
        id_envio: campanhaId,
        mensagem: campanhaData?.texto_ia || "",
        assunto: campanhaData?.assunto_email || `Oportunidade - ${campanhaData?.nome || ""}`,
        email_remetente: profile?.email || "",
        usuario_id: campanhaData?.responsavel_id || "",
        leads: (contatos as any[]).map(c => ({
          email: c.email,
          nome: c.nome || "Profissional",
        })),
      };

      // Enviar para o webhook configurado
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro ao enviar para webhook: ${response.status} - ${errorText}`);
      }

      // Atualizar status dos contatos para "enviando"
      await supabase
        .from("email_contatos" as any)
        .update({ status: "enviando", data_envio: new Date().toISOString() })
        .eq("campanha_id", campanhaId)
        .eq("status", "pendente");

      // Atualizar campanha
      await supabase
        .from("email_campanhas" as any)
        .update({ status: "em_andamento" })
        .eq("id", campanhaId);

      return { enviados: (contatos as any[]).length };
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["email-campanhas"] });
      toast.success(`${data?.enviados || 0} leads enviados para o webhook!`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Deletar campanha
  const deletarMutation = useMutation({
    mutationFn: async (id: string) => {
      // Primeiro deletar contatos
      await supabase.from("email_contatos" as any).delete().eq("campanha_id", id);
      // Depois deletar campanha
      const { error } = await supabase.from("email_campanhas" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campanhas"] });
      toast.success("Campanha excluída.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Toggle ativo/inativo
  const toggleAtivoMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("email_campanhas" as any)
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["email-campanhas"] });
      toast.success(variables.ativo ? "Campanha ativada." : "Campanha inativada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resetForm = () => {
    setPropostaId("");
    setAssuntoEmail("");
  };

  const handleImportarContatos = (campanhaId: string) => {
    setCampanhaParaImportar(campanhaId);
    setImportDialogOpen(true);
  };

  // Se uma campanha está selecionada, mostrar o painel de contatos
  if (campanhaSelecionada) {
    return (
      <EmailContatosPanel
        campanha={campanhaSelecionada}
        onBack={() => setCampanhaSelecionada(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold">Campanhas de Email</h2>
          <p className="text-sm text-muted-foreground">Gerencie suas campanhas de disparo por email</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="mostrar-inativos-email"
              checked={mostrarInativos}
              onCheckedChange={setMostrarInativos}
            />
            <Label htmlFor="mostrar-inativos-email" className="text-sm cursor-pointer">
              Mostrar inativos
            </Label>
          </div>

          {/* Botão de configuração de webhook - apenas admin */}
          {isAdmin && (
            <Dialog open={webhookConfigOpen} onOpenChange={setWebhookConfigOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon" title="Configurar Webhook de Email">
                  <Settings className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Configuração de Webhook - Email
                  </DialogTitle>
                  <DialogDescription>
                    Configure a URL do webhook que receberá os dados dos leads para envio de emails.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>URL do Webhook (n8n ou outro)</Label>
                    <Input
                      value={emailWebhookUrl}
                      onChange={(e) => setEmailWebhookUrl(e.target.value)}
                      placeholder="https://seu-n8n.com/webhook/email-leads"
                    />
                    <p className="text-xs text-muted-foreground">
                      Esta URL receberá os leads quando você clicar em "Enviar" em uma campanha de email.
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Estrutura do Payload</Label>
                    <Card className="p-3 bg-muted/50">
                      <pre className="text-xs whitespace-pre-wrap overflow-x-auto">
{`[
  {
    "id_envio": "uuid da campanha",
    "mensagem": "corpo do email",
    "assunto": "assunto do email",
    "email_remetente": "email de quem criou",
    "usuario_id": "id do responsável",
    "leads": [
      {
        "email": "email@lead.com",
        "nome": "Nome do Lead"
      },
      ...
    ]
  }
]`}
                      </pre>
                    </Card>
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => saveWebhookMutation.mutate(emailWebhookUrl)}
                    disabled={saveWebhookMutation.isPending}
                  >
                    {saveWebhookMutation.isPending ? "Salvando..." : "Salvar Webhook"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova Campanha
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Criar Campanha de Email
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Proposta (tipo Email) *</Label>
                  <Select value={propostaId} onValueChange={setPropostaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma proposta" />
                    </SelectTrigger>
                    <SelectContent>
                      {propostas.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground text-center">
                          Nenhuma proposta do tipo Email encontrada.
                          <br />
                          Crie uma em "Contratos de Captação".
                        </div>
                      ) : (
                        propostas.map((proposta) => {
                          const descricaoLimpa = proposta.descricao?.replace(/^Proposta de Captação\s*-\s*/i, "") || "";
                          return (
                            <SelectItem key={proposta.id} value={proposta.id}>
                              {proposta.id_proposta || descricaoLimpa || `Proposta ${proposta.id.slice(0, 8)}`}
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Propostas do tipo "Email" são criadas em Contratos de Captação
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="assunto-email">Assunto do E-mail</Label>
                  <Input
                    id="assunto-email"
                    placeholder="Ex: Oportunidade de Trabalho"
                    value={assuntoEmail}
                    onChange={(e) => setAssuntoEmail(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => criarMutation.mutate()}
                  disabled={!propostaId || criarMutation.isPending}
                >
                  {criarMutation.isPending ? "Criando..." : "Criar Campanha"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Lista de campanhas */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : campanhas.length === 0 ? (
        <Card className="p-8 text-center">
          <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Nenhuma campanha de email criada ainda.</p>
          <p className="text-sm text-muted-foreground mt-2">
            Crie uma proposta do tipo "Email" em Contratos de Captação
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {campanhas.map((campanha) => {
            const config = statusConfig[campanha.status] || statusConfig.pendente;
            const progresso = campanha.total_contatos > 0
              ? Math.round((campanha.enviados / campanha.total_contatos) * 100)
              : 0;

            // Obter mensagem
            const mensagemProposta = propostasParaMensagem.find(p => p.id === campanha.proposta_id)?.observacoes;
            const mensagemExibir = campanha.texto_ia || mensagemProposta;

            return (
              <Card key={campanha.id} className={`p-4 ${!campanha.ativo ? 'opacity-60 bg-muted/50' : ''}`}>
                {/* Cabeçalho */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                      <Mail className="h-5 w-5 text-blue-600" />
                    </div>
                    <h3 className="font-semibold">{campanha.nome}</h3>
                    <Badge variant={config.variant}>{config.label}</Badge>
                    {!campanha.ativo && (
                      <Badge variant="secondary" className="gap-1">
                        <PowerOff className="h-3 w-3" />
                        Inativo
                      </Badge>
                    )}
                  </div>

                  {/* Métricas */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{campanha.total_contatos}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span>{campanha.enviados}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-purple-600">
                      <Clock className="h-4 w-4" />
                      <span>{campanha.respondidos}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-red-600">
                      <XCircle className="h-4 w-4" />
                      <span>{campanha.falhas}</span>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2">
                    {campanha.total_contatos > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCampanhaSelecionada(campanha)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Ver Leads
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleImportarContatos(campanha.id)}
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Adicionar Leads
                    </Button>
                    {(campanha.status === "pendente" || campanha.status === "em_andamento") && campanha.total_contatos > 0 && (
                      <Button
                        size="sm"
                        onClick={() => enviarMutation.mutate(campanha.id)}
                        disabled={enviarMutation.isPending}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Enviar
                      </Button>
                    )}
                    {isAdmin && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. Todos os contatos serão removidos.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deletarMutation.mutate(campanha.id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    <Button
                      variant={campanha.ativo ? "ghost" : "outline"}
                      size="sm"
                      onClick={() => toggleAtivoMutation.mutate({ id: campanha.id, ativo: !campanha.ativo })}
                      disabled={toggleAtivoMutation.isPending}
                      title={campanha.ativo ? "Inativar" : "Ativar"}
                    >
                      {campanha.ativo ? (
                        <PowerOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Power className="h-4 w-4 text-green-600" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex flex-col lg:flex-row gap-4">
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Disparo: {campanha.id?.slice(0, 8)} | Proposta: {campanha.proposta_id?.slice(0, 8) || "N/A"}</p>
                    <p className="text-xs">
                      Criado por {campanha.responsavel_nome} em {new Date(campanha.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  {mensagemExibir && (
                    <div className="flex-1 bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg">
                      <p className="text-xs font-semibold text-blue-600 mb-1">Mensagem a ser enviada:</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-3">{mensagemExibir}</p>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                {campanha.total_contatos > 0 && (
                  <div className="mt-3">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${progresso}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {progresso}% concluído ({campanha.enviados} de {campanha.total_contatos})
                    </p>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog de importação de leads */}
      {campanhaParaImportar && (
        <EmailImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          campanhaId={campanhaParaImportar}
          propostaId={campanhas.find(c => c.id === campanhaParaImportar)?.proposta_id || null}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["email-campanhas"] });
            setImportDialogOpen(false);
            setCampanhaParaImportar(null);
          }}
        />
      )}
    </div>
  );
}
