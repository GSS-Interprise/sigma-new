import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Campanha, CANAIS_CAMPANHA, useCampanhaMutations, useCampanha } from "@/hooks/useCampanhas";
import { useEspecialidades } from "@/hooks/useEspecialidades";
import { 
  FileText, Users, MessageSquare, Calendar, 
  Upload, Save, Send, Clock, X, Plus 
} from "lucide-react";
import { format } from "date-fns";

interface CampanhaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanhaId?: string | null;
}

const VARIAVEIS_DISPONIVEIS = [
  { key: '{{nome}}', label: 'Nome do médico' },
  { key: '{{crm}}', label: 'CRM' },
  { key: '{{especialidade}}', label: 'Especialidade' },
  { key: '{{cidade}}', label: 'Cidade' },
  { key: '{{estado}}', label: 'Estado' },
  { key: '{{email}}', label: 'E-mail' },
];

const ESTADOS_BRASIL = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 
  'SP', 'SE', 'TO'
];

export function CampanhaDialog({ open, onOpenChange, campanhaId }: CampanhaDialogProps) {
  const { data: campanhaExistente, isLoading: isLoadingCampanha } = useCampanha(campanhaId || null);
  const { createMutation, updateMutation } = useCampanhaMutations();
  const { data: especialidades } = useEspecialidades();
  const [activeTab, setActiveTab] = useState("geral");
  
  const [formData, setFormData] = useState<Partial<Campanha>>({
    nome: '',
    objetivo: '',
    descricao: '',
    canal: 'email',
    status: 'rascunho',
    mensagem: '',
    assunto_email: '',
    corpo_html: '',
    agendamento_tipo: 'imediato',
    horario_inteligente: false,
    tamanho_lote: 50,
    publico_alvo: {
      especialidades: [],
      estados: [],
      status_medico: 'todos',
      tipo_vinculo: 'todos',
      apenas_novos: false,
      apenas_inativos: false,
    },
  });

  useEffect(() => {
    if (campanhaExistente) {
      setFormData({
        ...campanhaExistente,
        publico_alvo: campanhaExistente.publico_alvo || {
          especialidades: [],
          estados: [],
          status_medico: 'todos',
          tipo_vinculo: 'todos',
          apenas_novos: false,
          apenas_inativos: false,
        },
      });
    } else if (!campanhaId) {
      setFormData({
        nome: '',
        objetivo: '',
        descricao: '',
        canal: 'email',
        status: 'rascunho',
        mensagem: '',
        assunto_email: '',
        corpo_html: '',
        agendamento_tipo: 'imediato',
        horario_inteligente: false,
        tamanho_lote: 50,
        publico_alvo: {
          especialidades: [],
          estados: [],
          status_medico: 'todos',
          tipo_vinculo: 'todos',
          apenas_novos: false,
          apenas_inativos: false,
        },
      });
    }
  }, [campanhaExistente, campanhaId]);

  const handleSave = async (status?: string) => {
    const dataToSave = { ...formData };
    if (status) dataToSave.status = status;

    if (campanhaId) {
      await updateMutation.mutateAsync({ id: campanhaId, ...dataToSave });
    } else {
      await createMutation.mutateAsync(dataToSave);
    }
    onOpenChange(false);
  };

  const insertVariable = (variable: string) => {
    const field = formData.canal === 'email' ? 'corpo_html' : 'mensagem';
    setFormData(prev => ({
      ...prev,
      [field]: (prev[field] || '') + variable,
    }));
  };

  const togglePublicoAlvoArray = (field: string, value: string) => {
    setFormData(prev => {
      const current = prev.publico_alvo?.[field] || [];
      const updated = current.includes(value)
        ? current.filter((v: string) => v !== value)
        : [...current, value];
      return {
        ...prev,
        publico_alvo: { ...prev.publico_alvo, [field]: updated },
      };
    });
  };

  const isEditing = !!campanhaId;
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {isEditing ? 'Editar Campanha' : 'Nova Campanha'}
          </DialogTitle>
        </DialogHeader>

        {isLoadingCampanha ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TabsTrigger value="geral" className="gap-2">
                <FileText className="h-4 w-4" />
                Geral
              </TabsTrigger>
              <TabsTrigger value="publico" className="gap-2">
                <Users className="h-4 w-4" />
                Público
              </TabsTrigger>
              <TabsTrigger value="conteudo" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                Conteúdo
              </TabsTrigger>
              <TabsTrigger value="agendamento" className="gap-2">
                <Calendar className="h-4 w-4" />
                Agendamento
              </TabsTrigger>
            </TabsList>

            <TabsContent value="geral" className="space-y-4">
              <Card className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome da Campanha *</Label>
                    <Input
                      id="nome"
                      value={formData.nome}
                      onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                      placeholder="Ex: Captação Cardiologistas SP"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="canal">Canal *</Label>
                    <Select 
                      value={formData.canal} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, canal: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CANAIS_CAMPANHA).map(([key, { label }]) => (
                          <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="objetivo">Objetivo</Label>
                  <Input
                    id="objetivo"
                    value={formData.objetivo || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, objetivo: e.target.value }))}
                    placeholder="Ex: Aumentar base de médicos cardiologistas"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="descricao">Descrição</Label>
                  <Textarea
                    id="descricao"
                    value={formData.descricao || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
                    placeholder="Descrição detalhada da campanha..."
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="data_inicio">Data de Início</Label>
                    <Input
                      id="data_inicio"
                      type="date"
                      value={formData.data_inicio || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, data_inicio: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="data_termino">Data de Término</Label>
                    <Input
                      id="data_termino"
                      type="date"
                      value={formData.data_termino || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, data_termino: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orcamento">Orçamento (R$)</Label>
                  <Input
                    id="orcamento"
                    type="number"
                    value={formData.orcamento || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, orcamento: parseFloat(e.target.value) || 0 }))}
                    placeholder="0,00"
                  />
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="publico" className="space-y-4">
              <Card className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label>Especialidades</Label>
                  <div className="flex flex-wrap gap-2 p-3 border rounded-md max-h-40 overflow-y-auto">
                    {especialidades?.map((esp) => (
                      <Badge
                        key={typeof esp === 'string' ? esp : esp.nome}
                        variant={formData.publico_alvo?.especialidades?.includes(typeof esp === 'string' ? esp : esp.nome) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => togglePublicoAlvoArray('especialidades', typeof esp === 'string' ? esp : esp.nome)}
                      >
                        {typeof esp === 'string' ? esp : esp.nome}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formData.publico_alvo?.especialidades?.length || 0} selecionadas
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Estados (UF)</Label>
                  <div className="flex flex-wrap gap-2 p-3 border rounded-md">
                    {ESTADOS_BRASIL.map((uf) => (
                      <Badge
                        key={uf}
                        variant={formData.publico_alvo?.estados?.includes(uf) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => togglePublicoAlvoArray('estados', uf)}
                      >
                        {uf}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Status do Médico</Label>
                    <Select
                      value={formData.publico_alvo?.status_medico || 'todos'}
                      onValueChange={(value) => setFormData(prev => ({
                        ...prev,
                        publico_alvo: { ...prev.publico_alvo, status_medico: value }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="Ativo">Ativos</SelectItem>
                        <SelectItem value="Inativo">Inativos</SelectItem>
                        <SelectItem value="Pendente">Pendentes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Tipo de Vínculo</Label>
                    <Select
                      value={formData.publico_alvo?.tipo_vinculo || 'todos'}
                      onValueChange={(value) => setFormData(prev => ({
                        ...prev,
                        publico_alvo: { ...prev.publico_alvo, tipo_vinculo: value }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="CLT">CLT</SelectItem>
                        <SelectItem value="PJ">PJ</SelectItem>
                        <SelectItem value="RPA">RPA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.publico_alvo?.apenas_novos || false}
                      onCheckedChange={(checked) => setFormData(prev => ({
                        ...prev,
                        publico_alvo: { ...prev.publico_alvo, apenas_novos: checked }
                      }))}
                    />
                    <Label>Apenas médicos novos</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.publico_alvo?.apenas_inativos || false}
                      onCheckedChange={(checked) => setFormData(prev => ({
                        ...prev,
                        publico_alvo: { ...prev.publico_alvo, apenas_inativos: checked }
                      }))}
                    />
                    <Label>Apenas inativos</Label>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <Button variant="outline" className="gap-2">
                    <Upload className="h-4 w-4" />
                    Importar lista CSV
                  </Button>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="conteudo" className="space-y-4">
              <Card className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label>Variáveis Dinâmicas</Label>
                  <div className="flex flex-wrap gap-2">
                    {VARIAVEIS_DISPONIVEIS.map((v) => (
                      <Badge
                        key={v.key}
                        variant="secondary"
                        className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                        onClick={() => insertVariable(v.key)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {v.label}
                      </Badge>
                    ))}
                  </div>
                </div>

                {formData.canal === 'email' && (
                  <div className="space-y-2">
                    <Label htmlFor="assunto">Assunto do E-mail</Label>
                    <Input
                      id="assunto"
                      value={formData.assunto_email || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, assunto_email: e.target.value }))}
                      placeholder="Ex: Oportunidade exclusiva para {{nome}}"
                    />
                  </div>
                )}

                {formData.canal === 'email' ? (
                  <div className="space-y-2">
                    <Label htmlFor="corpo">Corpo do E-mail (HTML)</Label>
                    <Textarea
                      id="corpo"
                      value={formData.corpo_html || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, corpo_html: e.target.value }))}
                      placeholder="<p>Olá {{nome}},</p>..."
                      rows={12}
                      className="font-mono text-sm"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="mensagem">Mensagem</Label>
                    <Textarea
                      id="mensagem"
                      value={formData.mensagem || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, mensagem: e.target.value }))}
                      placeholder="Olá {{nome}}, temos uma oportunidade..."
                      rows={8}
                    />
                    <p className="text-xs text-muted-foreground">
                      {formData.mensagem?.length || 0} caracteres
                    </p>
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="agendamento" className="space-y-4">
              <Card className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de Envio</Label>
                  <Select
                    value={formData.agendamento_tipo || 'imediato'}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, agendamento_tipo: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="imediato">Enviar Agora</SelectItem>
                      <SelectItem value="agendado">Agendar Envio</SelectItem>
                      <SelectItem value="inteligente">Envio Inteligente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.agendamento_tipo === 'agendado' && (
                  <div className="space-y-2">
                    <Label htmlFor="data_agendamento">Data e Hora do Envio</Label>
                    <Input
                      id="data_agendamento"
                      type="datetime-local"
                      value={formData.data_agendamento?.slice(0, 16) || ''}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        data_agendamento: new Date(e.target.value).toISOString() 
                      }))}
                    />
                  </div>
                )}

                {formData.agendamento_tipo === 'inteligente' && (
                  <div className="bg-muted/50 p-4 rounded-md">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-4 w-4 text-primary" />
                      <span className="font-medium">Envio Inteligente</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      O sistema irá enviar as mensagens nos horários com maior probabilidade de abertura,
                      baseado no histórico de engajamento de cada destinatário.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="lote">Tamanho do Lote</Label>
                  <Input
                    id="lote"
                    type="number"
                    value={formData.tamanho_lote || 50}
                    onChange={(e) => setFormData(prev => ({ ...prev, tamanho_lote: parseInt(e.target.value) || 50 }))}
                    min={1}
                    max={500}
                  />
                  <p className="text-xs text-muted-foreground">
                    Quantidade de mensagens enviadas por vez (para grandes volumes)
                  </p>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleSave('rascunho')}
              disabled={isPending || !formData.nome}
            >
              <Save className="h-4 w-4 mr-2" />
              Salvar Rascunho
            </Button>
            {formData.agendamento_tipo === 'agendado' ? (
              <Button
                onClick={() => handleSave('agendada')}
                disabled={isPending || !formData.nome}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Agendar
              </Button>
            ) : (
              <Button
                onClick={() => handleSave('ativa')}
                disabled={isPending || !formData.nome}
              >
                <Send className="h-4 w-4 mr-2" />
                Ativar Campanha
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
