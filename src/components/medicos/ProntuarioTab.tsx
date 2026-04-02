import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, AlertCircle, Sparkles, Loader2, CheckCircle, Edit2 } from "lucide-react";

interface ProntuarioTabProps {
  medicoId: string;
}

type AnotacaoComUsuario = {
  id: string;
  medico_id: string;
  anotacao: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  usuario_nome: string;
};

type BlacklistComUsuario = {
  id: string;
  phone_e164: string;
  nome: string;
  origem: string;
  reason: string;
  created_at: string;
  created_by: string;
  usuario_nome: string;
};

export function ProntuarioTab({ medicoId }: ProntuarioTabProps) {
  const [novaAnotacao, setNovaAnotacao] = useState("");
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [editingResume, setEditingResume] = useState(false);
  const [resumeText, setResumeText] = useState("");
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Buscar dados do médico
  const { data: medicoData } = useQuery({
    queryKey: ['medico', medicoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('medicos')
        .select('*')
        .eq('id', medicoId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!medicoId,
  });

  // Buscar documentos para o resumo IA
  const { data: documentos } = useQuery({
    queryKey: ['medico-documentos', medicoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('medico_documentos')
        .select('arquivo_nome, tipo_documento')
        .eq('medico_id', medicoId)
        .not('texto_extraido', 'is', null);

      if (error) throw error;
      return data;
    },
    enabled: !!medicoId,
  });

  // Buscar anotações do prontuário
  const { data: anotacoes = [], isLoading: loadingAnotacoes } = useQuery<AnotacaoComUsuario[]>({
    queryKey: ['prontuario', medicoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('medico_prontuario')
        .select('*')
        .eq('medico_id', medicoId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Buscar nomes dos usuários
      if (data && data.length > 0) {
        const userIds = data.map(a => a.created_by).filter(Boolean);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, nome_completo')
          .in('id', userIds);
        
        return data.map(anotacao => ({
          ...anotacao,
          usuario_nome: profiles?.find(p => p.id === anotacao.created_by)?.nome_completo || 'Usuário'
        })) as AnotacaoComUsuario[];
      }
      
      return data as AnotacaoComUsuario[];
    },
    enabled: !!medicoId,
  });

  // Buscar histórico de blacklist
  const { data: blacklistHistory = [], isLoading: loadingBlacklist } = useQuery<BlacklistComUsuario[]>({
    queryKey: ['blacklist-history', medicoId],
    queryFn: async () => {
      // Buscar telefone do médico
      const { data: medico } = await supabase
        .from('medicos')
        .select('phone_e164')
        .eq('id', medicoId)
        .single();
      
      if (!medico?.phone_e164) return [];

      const { data, error } = await supabase
        .from('blacklist')
        .select('*')
        .eq('phone_e164', medico.phone_e164)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Buscar nomes dos usuários
      if (data && data.length > 0) {
        const userIds = data.map(b => b.created_by).filter(Boolean);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, nome_completo')
          .in('id', userIds);
        
        return data.map(entry => ({
          ...entry,
          usuario_nome: profiles?.find(p => p.id === entry.created_by)?.nome_completo || 'Sistema'
        })) as BlacklistComUsuario[];
      }
      
      return data as BlacklistComUsuario[];
    },
    enabled: !!medicoId,
  });

  // Mutation para adicionar anotação
  const addAnotacaoMutation = useMutation({
    mutationFn: async (anotacao: string) => {
      const { error } = await supabase
        .from('medico_prontuario')
        .insert({
          medico_id: medicoId,
          anotacao,
          created_by: user?.id,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prontuario', medicoId] });
      setNovaAnotacao("");
      toast.success('Anotação adicionada');
    },
    onError: () => {
      toast.error('Erro ao adicionar anotação');
    },
  });

  const handleSalvarAnotacao = () => {
    if (!novaAnotacao.trim()) {
      toast.error('Digite uma anotação');
      return;
    }
    addAnotacaoMutation.mutate(novaAnotacao);
  };

  // Gerar resumo com IA
  const handleGenerateSummary = async () => {
    setGeneratingSummary(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-doctor-document', {
        body: { 
          action: 'generate-summary',
          medicoId 
        }
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success("Resumo gerado com sucesso!");
        queryClient.invalidateQueries({ queryKey: ['medico', medicoId] });
      }
    } catch (error: any) {
      toast.error("Erro ao gerar resumo: " + error.message);
    } finally {
      setGeneratingSummary(false);
    }
  };

  // Aprovar resumo
  const handleApproveResume = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('medicos')
        .update({
          resumo_ia: resumeText,
          resumo_ia_aprovado: true,
          resumo_ia_aprovado_por: currentUser?.id,
          resumo_ia_aprovado_em: new Date().toISOString()
        })
        .eq('id', medicoId);

      if (error) throw error;

      toast.success("Resumo aprovado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ['medico', medicoId] });
      setEditingResume(false);
    } catch (error: any) {
      toast.error("Erro ao aprovar resumo: " + error.message);
    }
  };

  if (!medicoId) {
    return (
      <div className="text-center text-muted-foreground py-8">
        Salve o cadastro do médico para acessar o prontuário
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumo Profissional com IA */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Resumo Profissional (IA)
              </CardTitle>
              <CardDescription>
                Resumo automático baseado nos documentos anexados
              </CardDescription>
            </div>
            {medicoData?.resumo_ia && !editingResume && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setResumeText(medicoData.resumo_ia || "");
                  setEditingResume(true);
                }}
              >
                <Edit2 className="h-4 w-4 mr-2" />
                Editar
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!medicoData?.resumo_ia && !editingResume ? (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Clique no botão abaixo para gerar um resumo profissional automático baseado nos documentos anexados.
              </p>
              {documentos && documentos.length > 0 && (
                <div className="text-sm">
                  <p className="font-medium mb-2">Documentos disponíveis ({documentos.length}):</p>
                  <div className="flex flex-wrap gap-2">
                    {documentos.map((doc, i) => (
                      <Badge key={i} variant="secondary">
                        {doc.tipo_documento}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <Button
                onClick={handleGenerateSummary}
                disabled={generatingSummary || !documentos || documentos.length === 0}
              >
                {generatingSummary ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Gerando resumo...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Gerar Resumo
                  </>
                )}
              </Button>
            </div>
          ) : editingResume ? (
            <div className="space-y-4">
              <Textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                rows={6}
                placeholder="Edite o resumo profissional..."
              />
              <div className="flex gap-2">
                <Button onClick={handleApproveResume}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Aprovar Resumo
                </Button>
                <Button variant="outline" onClick={() => setEditingResume(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="outline"
                  onClick={handleGenerateSummary}
                  disabled={generatingSummary}
                >
                  {generatingSummary ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Regenerando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Regenerar
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="whitespace-pre-wrap">{medicoData?.resumo_ia}</p>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <div className="flex items-center gap-4">
                  <span>
                    Gerado em: {medicoData?.resumo_ia_gerado_em 
                      ? format(new Date(medicoData.resumo_ia_gerado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                      : 'N/A'}
                  </span>
                  {medicoData?.resumo_ia_aprovado && (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Aprovado
                    </Badge>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateSummary}
                  disabled={generatingSummary}
                >
                  {generatingSummary ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Atualizando...
                    </>
                  ) : (
                    'Atualizar resumo'
                  )}
                </Button>
              </div>
              {documentos && documentos.length > 0 && (
                <div className="text-sm">
                  <p className="font-medium mb-2">Fontes utilizadas:</p>
                  <div className="flex flex-wrap gap-2">
                    {documentos.map((doc, i) => (
                      <Badge key={i} variant="outline">
                        {doc.arquivo_nome}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Nova Anotação */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Nova Anotação</CardTitle>
          <CardDescription>Adicione observações sobre o médico</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Digite suas observações..."
            value={novaAnotacao}
            onChange={(e) => setNovaAnotacao(e.target.value)}
            rows={4}
          />
          <Button 
            onClick={handleSalvarAnotacao}
            disabled={addAnotacaoMutation.isPending || !novaAnotacao.trim()}
          >
            {addAnotacaoMutation.isPending ? 'Salvando...' : 'Salvar Anotação'}
          </Button>
        </CardContent>
      </Card>

      {/* Histórico da Blacklist */}
      {blacklistHistory.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Histórico de Blacklist
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-4">
                {blacklistHistory.map((entry) => (
                  <div key={entry.id} className="space-y-1">
                    <div className="flex justify-between items-start">
                      <p className="font-medium text-sm">
                        {entry.usuario_nome}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(entry.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      <strong>Motivo:</strong> {entry.reason}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Origem: {entry.origem}
                    </p>
                    {entry !== blacklistHistory[blacklistHistory.length - 1] && (
                      <Separator className="mt-3" />
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Histórico de Anotações */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Histórico de Anotações
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingAnotacoes ? (
            <div className="text-center text-muted-foreground py-4">
              Carregando...
            </div>
          ) : anotacoes.length === 0 ? (
            <div className="text-center text-muted-foreground py-4">
              Nenhuma anotação registrada
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-4">
                {anotacoes.map((anotacao) => (
                  <div key={anotacao.id} className="space-y-1">
                    <div className="flex justify-between items-start">
                      <p className="font-medium text-sm">
                        {anotacao.usuario_nome}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(anotacao.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{anotacao.anotacao}</p>
                    {anotacao !== anotacoes[anotacoes.length - 1] && (
                      <Separator className="mt-3" />
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
