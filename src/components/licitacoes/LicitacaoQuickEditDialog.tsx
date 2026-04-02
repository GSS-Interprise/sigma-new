import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLicitacoesProfiles } from "@/hooks/useLicitacoesProfiles";
import { useLicitacaoRealtimeSync } from "@/hooks/useLicitacaoRealtimeSync";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toLocalTime } from "@/lib/dateUtils";
import { TIPO_MODALIDADE_OPTIONS, getSubtiposForTipo } from "@/lib/modalidadeConfig";

interface LicitacaoQuickEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  licitacao: any;
}

const ETIQUETAS_DISPONIVEIS = [
  "Saúde",
  "Radiologia",
  "Urgente",
  "Prioritário",
  "Médico",
  "Equipamento",
  "Análise Técnica",
  "Documentação",
];

const TAG_COLORS: { [key: string]: string } = {
  "Saúde": "bg-chart-1",
  "Radiologia": "bg-chart-2",
  "Urgente": "bg-chart-3",
  "Prioritário": "bg-chart-4",
  "Médico": "bg-chart-5",
  "Equipamento": "bg-secondary",
  "Análise Técnica": "bg-accent",
  "Documentação": "bg-primary",
};

const STATUS_OPTIONS = [
  { value: 'captacao_edital', label: 'Captação de edital' },
  { value: 'capitacao_de_credenciamento', label: 'Captação de Credenciamento' },
  { value: 'edital_analise', label: 'Edital em análise' },
  { value: 'conferencia', label: 'Conferência' },
  { value: 'deliberacao', label: 'Deliberação' },
  { value: 'esclarecimentos_impugnacao', label: 'Esclarecimentos/Impugnação' },
  { value: 'cadastro_proposta', label: 'Cadastro de proposta' },
  { value: 'aguardando_sessao', label: 'Aguardando sessão' },
  { value: 'em_disputa', label: 'Em disputa' },
  { value: 'proposta_final', label: 'Proposta final' },
  { value: 'recurso_contrarrazao', label: 'Recurso/Contrarrazão' },
  { value: 'adjudicacao_homologacao', label: 'Adjudicação/Homologação' },
  { value: 'arrematados', label: 'Arrematados' },
  { value: 'descarte_edital', label: 'Descarte de edital' },
  { value: 'suspenso_revogado', label: 'Suspensos/Revogados' },
  { value: 'nao_ganhamos', label: 'Não ganhamos' },
];

export function LicitacaoQuickEditDialog({ open, onOpenChange, licitacao }: LicitacaoQuickEditDialogProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<any>({});
  const [novaEtiqueta, setNovaEtiqueta] = useState("");
  const updatedAtRef = useRef<string | null>(null);

  const { data: profiles } = useLicitacoesProfiles();

  // Realtime sync - sincroniza updated_at automaticamente
  const { markAsSavedByMe } = useLicitacaoRealtimeSync(
    licitacao?.id || null,
    open,
    {
      onSelfUpdate: (newUpdatedAt) => {
        console.log('[QuickEditDialog] Self-update synced:', newUpdatedAt);
        updatedAtRef.current = newUpdatedAt;
      },
      onExternalUpdate: (newData) => {
        // Sincroniza o token updated_at para evitar falsos conflitos
        if (newData?.updated_at) {
          updatedAtRef.current = newData.updated_at;
        }
      },
    }
  );

  useEffect(() => {
    if (licitacao) {
      updatedAtRef.current = licitacao.updated_at || null;
      setFormData({
        titulo: licitacao.titulo || '',
        numero_edital: licitacao.numero_edital || '',
        orgao: licitacao.orgao || '',
        objeto: licitacao.objeto || '',
        status: licitacao.status || 'captacao_edital',
        responsavel_id: licitacao.responsavel_id || '',
        data_disputa: licitacao.data_disputa ? toLocalTime(licitacao.data_disputa) : undefined,
        valor_estimado: licitacao.valor_estimado || '',
        tipo_modalidade: licitacao.tipo_modalidade || '',
        subtipo_modalidade: licitacao.subtipo_modalidade || '',
        municipio_uf: licitacao.municipio_uf || '',
        etiquetas: licitacao.etiquetas || [],
        observacoes: licitacao.observacoes || '',
        tipo_licitacao: licitacao.tipo_licitacao || 'GSS',
      });
    }
  }, [licitacao]);

  /**
   * Executa UPDATE com retry automático em caso de conflito de updated_at.
   */
  const executeUpdateWithRetry = async (
    data: any,
    expectedUpdatedAt: string | null,
    retryCount = 0
  ): Promise<string> => {
    const MAX_RETRIES = 3;
    const nextUpdatedAt = new Date().toISOString();

    let updateQuery = supabase
      .from('licitacoes')
      .update({ ...data, updated_at: nextUpdatedAt })
      .eq('id', licitacao.id);

    const isFallback = retryCount >= MAX_RETRIES;

    if (!isFallback && expectedUpdatedAt) {
      updateQuery = updateQuery.eq('updated_at', expectedUpdatedAt);
    } else if (!isFallback && !expectedUpdatedAt) {
      updateQuery = updateQuery.is('updated_at', null);
    }

    const { data: updatedRows, error } = await updateQuery.select('id, updated_at');
    if (error) throw error;

    if (updatedRows && updatedRows.length > 0) {
      return updatedRows[0].updated_at as string;
    }

    if (retryCount >= MAX_RETRIES) {
      throw new Error('Não foi possível salvar após múltiplas tentativas.');
    }

    // Fetch updated_at atual e retry
    console.log(`[QuickEdit] Conflito detectado, retry ${retryCount + 1}/${MAX_RETRIES}`);
    
    const { data: currentRow, error: fetchErr } = await supabase
      .from('licitacoes')
      .select('updated_at')
      .eq('id', licitacao.id)
      .maybeSingle();

    if (fetchErr || !currentRow) {
      throw new Error('Erro ao buscar dados atuais para retry.');
    }

    return executeUpdateWithRetry(data, currentRow.updated_at as string, retryCount + 1);
  };

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const expectedUpdatedAt = updatedAtRef.current ?? licitacao?.updated_at ?? null;

      // Executa update com retry automático
      const serverUpdatedAt = await executeUpdateWithRetry(data, expectedUpdatedAt);

      // Atualiza ref e marca para o realtime sync
      updatedAtRef.current = serverUpdatedAt;
      markAsSavedByMe(serverUpdatedAt);

      // Log activity for significant changes
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const changes = [];
        if (data.status && data.status !== licitacao.status) {
          changes.push({ campo: 'status', antigo: licitacao.status, novo: data.status });
        }
        if (data.responsavel_id && data.responsavel_id !== licitacao.responsavel_id) {
          changes.push({ campo: 'responsavel_id', antigo: licitacao.responsavel_id, novo: data.responsavel_id });
        }
        if (data.tipo_licitacao && data.tipo_licitacao !== licitacao.tipo_licitacao) {
          changes.push({ campo: 'tipo_licitacao', antigo: licitacao.tipo_licitacao, novo: data.tipo_licitacao });
        }

        for (const change of changes) {
          await supabase.from('licitacoes_atividades').insert({
            licitacao_id: licitacao.id,
            user_id: user.id,
            tipo: 'campo_atualizado',
            descricao: `Campo ${change.campo} alterado`,
            campo_alterado: change.campo,
            valor_antigo: change.antigo,
            valor_novo: change.novo,
          });
        }
      }

      // Notificar setor AGES quando tipo_licitacao mudar de GSS para AGES
      const oldTipo = licitacao?.tipo_licitacao;
      const newTipo = data.tipo_licitacao;
      
      if (oldTipo !== 'AGES' && newTipo === 'AGES') {
        try {
          const { data: usersAges } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('role', 'gestor_ages');

          if (usersAges && usersAges.length > 0) {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            
            const notificacoes = usersAges
              .filter(u => u.user_id !== currentUser?.id)
              .map(u => ({
                user_id: u.user_id,
                tipo: 'licitacao_transferida_ages',
                titulo: '📋 Nova licitação transferida para AGES',
                mensagem: `A licitação "${data.titulo || licitacao?.titulo || data.numero_edital || licitacao?.numero_edital || 'Sem título'}" foi transferida de GSS para AGES`,
                link: `/licitacoes?open=${licitacao.id}`,
                referencia_id: licitacao.id,
                lida: false,
              }));

            if (notificacoes.length > 0) {
              await supabase.from('system_notifications').insert(notificacoes);
            }
          }
        } catch (notifError) {
          console.error('Erro ao criar notificações para AGES:', notifError);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licitacoes-kanban'] });
      queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
      toast.success('Licitação atualizada com sucesso');
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error('Erro ao atualizar:', error);
      toast.error(error.message || 'Erro ao atualizar licitação');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSend = {
      ...formData,
      data_disputa: formData.data_disputa?.toISOString(),
      // updated_at agora é definido dentro da mutation (para o controle de concorrência)
    };
    updateMutation.mutate(dataToSend);
  };

  const toggleEtiqueta = (etiqueta: string) => {
    setFormData((prev: any) => ({
      ...prev,
      etiquetas: prev.etiquetas.includes(etiqueta)
        ? prev.etiquetas.filter((e: string) => e !== etiqueta)
        : [...prev.etiquetas, etiqueta],
    }));
  };

  const adicionarNovaEtiqueta = () => {
    if (novaEtiqueta.trim() && !formData.etiquetas.includes(novaEtiqueta.trim())) {
      setFormData((prev: any) => ({
        ...prev,
        etiquetas: [...prev.etiquetas, novaEtiqueta.trim()],
      }));
      setNovaEtiqueta("");
    }
  };

  const getTagColor = (tag: string) => {
    return TAG_COLORS[tag] || "bg-gray-500";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Licitação</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Etiquetas */}
          <div className="space-y-2">
            <Label>Etiquetas</Label>
            <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/50">
              {formData.etiquetas?.map((tag: string, idx: number) => (
                <Badge
                  key={idx}
                  className={`${getTagColor(tag)} text-white cursor-pointer`}
                  onClick={() => toggleEtiqueta(tag)}
                >
                  {tag}
                  <X className="ml-1 h-3 w-3" />
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Nova etiqueta..."
                value={novaEtiqueta}
                onChange={(e) => setNovaEtiqueta(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    adicionarNovaEtiqueta();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={adicionarNovaEtiqueta}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Label className="text-xs text-muted-foreground w-full">Etiquetas sugeridas:</Label>
              {ETIQUETAS_DISPONIVEIS.map((etiqueta) => (
                <Badge
                  key={etiqueta}
                  variant={formData.etiquetas?.includes(etiqueta) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleEtiqueta(etiqueta)}
                >
                  {etiqueta}
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="titulo">Título</Label>
              <Input
                id="titulo"
                value={formData.titulo}
                onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="numero_edital">Número do Edital</Label>
              <Input
                id="numero_edital"
                value={formData.numero_edital}
                onChange={(e) => setFormData({ ...formData, numero_edital: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="orgao">Órgão</Label>
            <Input
              id="orgao"
              value={formData.orgao}
              onChange={(e) => setFormData({ ...formData, orgao: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="responsavel">Responsável</Label>
              <Select value={formData.responsavel_id} onValueChange={(value) => setFormData({ ...formData, responsavel_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {profiles?.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.nome_completo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tipo_licitacao">Setor Responsável</Label>
              <Select value={formData.tipo_licitacao || 'GSS'} onValueChange={(value) => setFormData({ ...formData, tipo_licitacao: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GSS">GSS</SelectItem>
                  <SelectItem value="AGES">AGES</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data e Hora da Disputa</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex-1 justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.data_disputa ? format(formData.data_disputa, "dd/MM/yyyy", { locale: ptBR }) : "Data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.data_disputa}
                      onSelect={(date) => {
                        if (date) {
                          const currentDate = formData.data_disputa || new Date();
                          date.setHours(currentDate.getHours(), currentDate.getMinutes());
                        }
                        setFormData({ ...formData, data_disputa: date });
                      }}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  type="time"
                  className="w-24"
                  value={formData.data_disputa ? format(formData.data_disputa, "HH:mm") : ""}
                  onChange={(e) => {
                    const [hours, minutes] = e.target.value.split(':').map(Number);
                    const newDate = formData.data_disputa ? new Date(formData.data_disputa) : new Date();
                    newDate.setHours(hours || 0, minutes || 0);
                    setFormData({ ...formData, data_disputa: newDate });
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="valor_estimado">Valor Estimado</Label>
              <Input
                id="valor_estimado"
                type="number"
                step="0.01"
                value={formData.valor_estimado}
                onChange={(e) => setFormData({ ...formData, valor_estimado: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tipo_modalidade">Tipo</Label>
              <Select value={formData.tipo_modalidade || ''} onValueChange={(value) => setFormData({ ...formData, tipo_modalidade: value, subtipo_modalidade: '' })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_MODALIDADE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subtipo_modalidade">Subtipo</Label>
              <Select value={formData.subtipo_modalidade || ''} onValueChange={(value) => setFormData({ ...formData, subtipo_modalidade: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {getSubtiposForTipo(formData.tipo_modalidade).map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

            <div className="space-y-2">
              <Label htmlFor="municipio_uf">Município/UF</Label>
              <Input
                id="municipio_uf"
                value={formData.municipio_uf}
                onChange={(e) => setFormData({ ...formData, municipio_uf: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
