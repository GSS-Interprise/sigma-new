import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { toast } from "sonner";
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  LayoutDashboard, 
  Building2, 
  FileText, 
  Users, 
  Activity, 
  Gavel, 
  Send, 
  UserCheck, 
  Briefcase, 
  Megaphone, 
  Calendar, 
  DollarSign, 
  Package, 
  Stethoscope, 
  BarChart3, 
  MessageCircle, 
  Headset, 
  MessageSquare, 
  ListTodo, 
  Shield, 
  Settings,
  Copy,
  RotateCcw,
  CheckSquare,
  Square,
  Save,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

type Modulo = 'dashboard' | 'clientes' | 'contratos' | 'medicos' | 'relacionamento' | 'disparos' | 'configuracoes' | 'financeiro' | 'radiologia' | 'licitacoes' | 'escalas' | 'patrimonio' | 'bi' | 'suporte' | 'comunicacao' | 'sigzap' | 'demandas' | 'marketing' | 'auditoria' | 'captadores' | 'ages';
type Acao = 'visualizar' | 'criar' | 'editar' | 'excluir' | 'aprovar';
type Perfil = 'admin' | 'gestor_contratos' | 'gestor_captacao' | 'coordenador_escalas' | 'gestor_financeiro' | 'diretoria' | 'gestor_radiologia' | 'gestor_marketing' | 'gestor_ages' | 'marketing' | 'lideres' | 'externos';

const MODULOS: { value: Modulo; label: string; icon: any; description: string }[] = [
  { value: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Painel principal com métricas e resumos' },
  { value: 'clientes', label: 'Clientes', icon: Building2, description: 'Gestão de clientes e unidades' },
  { value: 'contratos', label: 'Contratos', icon: FileText, description: 'Contratos e documentação' },
  { value: 'medicos', label: 'Médicos', icon: Users, description: 'Cadastro e gestão de médicos' },
  { value: 'relacionamento', label: 'Relacionamento', icon: Activity, description: 'Relacionamento com médicos' },
  { value: 'licitacoes', label: 'Licitações', icon: Gavel, description: 'Gestão de licitações e editais' },
  { value: 'disparos', label: 'Disparos e Captação', icon: Send, description: 'Campanhas de captação' },
  { value: 'captadores', label: 'Captadores', icon: UserCheck, description: 'Gestão da equipe de captação' },
  { value: 'ages', label: 'AGES', icon: Briefcase, description: 'Gestão de profissionais AGES' },
  { value: 'marketing', label: 'Marketing', icon: Megaphone, description: 'Campanhas e conteúdos' },
  { value: 'escalas', label: 'Escalas', icon: Calendar, description: 'Escalas médicas' },
  { value: 'financeiro', label: 'Financeiro', icon: DollarSign, description: 'Gestão financeira' },
  { value: 'patrimonio', label: 'Patrimônio', icon: Package, description: 'Controle de patrimônio' },
  { value: 'radiologia', label: 'Radiologia', icon: Stethoscope, description: 'Produção e pendências' },
  { value: 'bi', label: 'Business Intelligence', icon: BarChart3, description: 'Relatórios e análises' },
  { value: 'sigzap', label: 'SigZap', icon: MessageCircle, description: 'WhatsApp integrado' },
  { value: 'suporte', label: 'Suporte', icon: Headset, description: 'Tickets de suporte' },
  { value: 'comunicacao', label: 'Comunicação', icon: MessageSquare, description: 'Comunicação interna' },
  { value: 'demandas', label: 'Demandas', icon: ListTodo, description: 'Gestão de demandas' },
  { value: 'auditoria', label: 'Auditoria', icon: Shield, description: 'Logs e auditoria' },
  { value: 'configuracoes', label: 'Configurações', icon: Settings, description: 'Configurações do sistema' },
];

const ACOES: { value: Acao; label: string; description: string }[] = [
  { value: 'visualizar', label: 'Visualizar', description: 'Ver registros' },
  { value: 'criar', label: 'Criar', description: 'Adicionar novos' },
  { value: 'editar', label: 'Editar', description: 'Modificar existentes' },
  { value: 'excluir', label: 'Excluir', description: 'Remover registros' },
  { value: 'aprovar', label: 'Aprovar', description: 'Aprovar itens' },
];

const PERFIS: { value: Perfil; label: string; description: string }[] = [
  { value: 'admin', label: 'Administrador', description: 'Acesso total ao sistema' },
  { value: 'gestor_contratos', label: 'Gestor de Contratos', description: 'Gestão de contratos e clientes' },
  { value: 'gestor_captacao', label: 'Gestor de Captação', description: 'Gestão de captação de médicos' },
  { value: 'coordenador_escalas', label: 'Coordenador de Escalas', description: 'Gestão de escalas médicas' },
  { value: 'gestor_financeiro', label: 'Gestor Financeiro', description: 'Gestão financeira' },
  { value: 'diretoria', label: 'Diretoria', description: 'Visão executiva' },
  { value: 'gestor_radiologia', label: 'Gestor de Radiologia', description: 'Gestão de radiologia' },
  { value: 'gestor_marketing', label: 'Gestor de Marketing', description: 'Gestão de marketing' },
  { value: 'gestor_ages', label: 'Gestor AGES', description: 'Gestão do setor AGES' },
  { value: 'marketing', label: 'Marketing', description: 'Equipe de marketing' },
  { value: 'lideres', label: 'Líder de Setor', description: 'Líderes de equipe' },
  { value: 'externos', label: 'Encerramento de Tickets', description: 'Acesso exclusivo para encerrar tickets' },
];

// Templates de permissões pré-definidos
const TEMPLATES: Record<string, { label: string; permissions: Record<Modulo, Acao[]> }> = {
  admin_total: {
    label: 'Administrador (Acesso Total)',
    permissions: Object.fromEntries(
      MODULOS.map(m => [m.value, ACOES.map(a => a.value)])
    ) as Record<Modulo, Acao[]>
  },
  gestor_operacional: {
    label: 'Gestor Operacional',
    permissions: {
      dashboard: ['visualizar'],
      clientes: ['visualizar', 'criar', 'editar'],
      contratos: ['visualizar', 'criar', 'editar'],
      medicos: ['visualizar', 'criar', 'editar'],
      relacionamento: ['visualizar', 'criar', 'editar'],
      licitacoes: ['visualizar'],
      disparos: ['visualizar'],
      captadores: [],
      ages: [],
      marketing: ['visualizar'],
      escalas: ['visualizar', 'criar', 'editar'],
      financeiro: ['visualizar'],
      patrimonio: ['visualizar'],
      radiologia: ['visualizar'],
      bi: ['visualizar'],
      sigzap: ['visualizar'],
      suporte: ['visualizar', 'criar'],
      comunicacao: ['visualizar', 'criar'],
      demandas: ['visualizar', 'criar'],
      auditoria: [],
      configuracoes: [],
    }
  },
  gestor_financeiro: {
    label: 'Gestor Financeiro',
    permissions: {
      dashboard: ['visualizar'],
      clientes: ['visualizar'],
      contratos: ['visualizar', 'criar', 'editar', 'aprovar'],
      medicos: ['visualizar'],
      relacionamento: [],
      licitacoes: ['visualizar'],
      disparos: [],
      captadores: [],
      ages: [],
      marketing: [],
      escalas: [],
      financeiro: ['visualizar', 'criar', 'editar', 'excluir', 'aprovar'],
      patrimonio: ['visualizar', 'criar', 'editar'],
      radiologia: [],
      bi: ['visualizar'],
      sigzap: [],
      suporte: ['visualizar', 'criar'],
      comunicacao: ['visualizar', 'criar'],
      demandas: [],
      auditoria: ['visualizar'],
      configuracoes: [],
    }
  },
  usuario_consulta: {
    label: 'Usuário Consulta',
    permissions: {
      dashboard: ['visualizar'],
      clientes: ['visualizar'],
      contratos: ['visualizar'],
      medicos: ['visualizar'],
      relacionamento: ['visualizar'],
      licitacoes: ['visualizar'],
      disparos: ['visualizar'],
      captadores: [],
      ages: ['visualizar'],
      marketing: ['visualizar'],
      escalas: ['visualizar'],
      financeiro: ['visualizar'],
      patrimonio: ['visualizar'],
      radiologia: ['visualizar'],
      bi: ['visualizar'],
      sigzap: [],
      suporte: ['visualizar', 'criar'],
      comunicacao: ['visualizar'],
      demandas: ['visualizar'],
      auditoria: [],
      configuracoes: [],
    }
  },
  usuario_externo: {
    label: 'Usuário Externo',
    permissions: {
      dashboard: ['visualizar'],
      clientes: [],
      contratos: [],
      medicos: [],
      relacionamento: [],
      licitacoes: [],
      disparos: [],
      captadores: [],
      ages: ['visualizar'],
      marketing: [],
      escalas: [],
      financeiro: [],
      patrimonio: [],
      radiologia: [],
      bi: [],
      sigzap: [],
      suporte: ['visualizar', 'criar'],
      comunicacao: ['visualizar'],
      demandas: [],
      auditoria: [],
      configuracoes: [],
    }
  },
};

export function PermissoesTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedPerfil, setSelectedPerfil] = useState<Perfil | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Map<string, boolean>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: '', description: '', onConfirm: () => {} });
  const [copyFromPerfil, setCopyFromPerfil] = useState<Perfil | null>(null);

  const { data: permissions, isLoading } = useQuery({
    queryKey: ['permissoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permissoes')
        .select('*')
        .order('modulo, perfil, acao');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: userRolesData } = useQuery({
    queryKey: ['user-roles', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id);
      return data;
    },
  });

  const isAdmin = userRolesData?.some(r => r.role === 'admin') ?? false;

  const getPermissionKey = (modulo: Modulo, acao: Acao) => `${modulo}:${acao}`;

  const getPermissionValue = (modulo: Modulo, acao: Acao): boolean => {
    if (!selectedPerfil) return false;
    if (selectedPerfil === 'admin') return true;

    const key = getPermissionKey(modulo, acao);
    if (pendingChanges.has(key)) {
      return pendingChanges.get(key)!;
    }

    const permission = permissions?.find(
      p => p.modulo === modulo && p.acao === acao && p.perfil === selectedPerfil
    );
    return permission?.ativo ?? false;
  };

  const hasModuleAccess = (modulo: Modulo): boolean => {
    return getPermissionValue(modulo, 'visualizar');
  };

  const getModulePermissionCount = (modulo: Modulo): number => {
    return ACOES.filter(a => getPermissionValue(modulo, a.value)).length;
  };

  const getTotalModulesEnabled = (): number => {
    return MODULOS.filter(m => hasModuleAccess(m.value)).length;
  };

  const handlePermissionChange = (modulo: Modulo, acao: Acao, value: boolean) => {
    if (!isAdmin || selectedPerfil === 'admin') return;

    const key = getPermissionKey(modulo, acao);
    const newChanges = new Map(pendingChanges);
    newChanges.set(key, value);

    // Se desabilitar visualizar, desabilitar todas as outras ações
    if (acao === 'visualizar' && !value) {
      ACOES.forEach(a => {
        if (a.value !== 'visualizar') {
          newChanges.set(getPermissionKey(modulo, a.value), false);
        }
      });
    }

    setPendingChanges(newChanges);
  };

  const handleModuleToggle = (modulo: Modulo, enabled: boolean) => {
    if (!isAdmin || selectedPerfil === 'admin') return;

    const newChanges = new Map(pendingChanges);
    
    if (enabled) {
      // Habilitar apenas visualizar
      newChanges.set(getPermissionKey(modulo, 'visualizar'), true);
    } else {
      // Desabilitar todas as ações
      ACOES.forEach(a => {
        newChanges.set(getPermissionKey(modulo, a.value), false);
      });
    }

    setPendingChanges(newChanges);
  };

  const handleSelectAllModule = (modulo: Modulo) => {
    if (!isAdmin || selectedPerfil === 'admin') return;

    const newChanges = new Map(pendingChanges);
    ACOES.forEach(a => {
      newChanges.set(getPermissionKey(modulo, a.value), true);
    });
    setPendingChanges(newChanges);
  };

  const handleDeselectAllModule = (modulo: Modulo) => {
    if (!isAdmin || selectedPerfil === 'admin') return;

    const newChanges = new Map(pendingChanges);
    ACOES.forEach(a => {
      newChanges.set(getPermissionKey(modulo, a.value), false);
    });
    setPendingChanges(newChanges);
  };

  const handleApplyTemplate = (templateKey: string) => {
    if (!isAdmin || selectedPerfil === 'admin' || !selectedPerfil) return;

    const template = TEMPLATES[templateKey];
    if (!template) return;

    setConfirmDialog({
      open: true,
      title: 'Aplicar Template',
      description: `Isso substituirá todas as permissões atuais do perfil "${PERFIS.find(p => p.value === selectedPerfil)?.label}" pelo template "${template.label}". Deseja continuar?`,
      onConfirm: () => {
        const newChanges = new Map<string, boolean>();
        
        MODULOS.forEach(modulo => {
          ACOES.forEach(acao => {
            const hasPermission = template.permissions[modulo.value]?.includes(acao.value) ?? false;
            newChanges.set(getPermissionKey(modulo.value, acao.value), hasPermission);
          });
        });

        setPendingChanges(newChanges);
        setConfirmDialog({ ...confirmDialog, open: false });
        toast.success(`Template "${template.label}" aplicado`);
      }
    });
  };

  const handleCopyFromPerfil = () => {
    if (!isAdmin || !selectedPerfil || !copyFromPerfil || selectedPerfil === 'admin') return;

    const sourcePerfilLabel = PERFIS.find(p => p.value === copyFromPerfil)?.label;
    const targetPerfilLabel = PERFIS.find(p => p.value === selectedPerfil)?.label;

    setConfirmDialog({
      open: true,
      title: 'Copiar Permissões',
      description: `Isso copiará todas as permissões de "${sourcePerfilLabel}" para "${targetPerfilLabel}". Deseja continuar?`,
      onConfirm: () => {
        const newChanges = new Map<string, boolean>();

        MODULOS.forEach(modulo => {
          ACOES.forEach(acao => {
            const sourcePermission = permissions?.find(
              p => p.modulo === modulo.value && p.acao === acao.value && p.perfil === copyFromPerfil
            );
            newChanges.set(
              getPermissionKey(modulo.value, acao.value), 
              sourcePermission?.ativo ?? false
            );
          });
        });

        setPendingChanges(newChanges);
        setCopyFromPerfil(null);
        setConfirmDialog({ ...confirmDialog, open: false });
        toast.success(`Permissões copiadas de "${sourcePerfilLabel}"`);
      }
    });
  };

  const handleResetChanges = () => {
    setPendingChanges(new Map());
    toast.info('Alterações descartadas');
  };

  const handleSaveChanges = async () => {
    if (!isAdmin || !selectedPerfil || pendingChanges.size === 0) return;

    setIsSaving(true);

    try {
      for (const [key, value] of pendingChanges.entries()) {
        const [modulo, acao] = key.split(':') as [Modulo, Acao];

        const { data: existing } = await supabase
          .from('permissoes')
          .select('id, ativo')
          .eq('modulo', modulo)
          .eq('perfil', selectedPerfil as any)
          .eq('acao', acao)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('permissoes')
            .update({ ativo: value, updated_at: new Date().toISOString() })
            .eq('id', existing.id);

          await supabase.from('permissoes_log').insert({
            user_id: user!.id,
            modulo,
            acao,
            perfil: selectedPerfil as any,
            campo_modificado: 'ativo',
            valor_anterior: String(existing.ativo),
            valor_novo: String(value),
          } as any);
        } else {
          await supabase
            .from('permissoes')
            .insert({ modulo, acao, perfil: selectedPerfil as any, ativo: value } as any);

          await supabase.from('permissoes_log').insert({
            user_id: user!.id,
            modulo,
            acao,
            perfil: selectedPerfil as any,
            campo_modificado: 'criado',
            valor_anterior: null,
            valor_novo: String(value),
          } as any);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['permissoes'] });
      setPendingChanges(new Map());
      toast.success('Permissões salvas com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar permissões:', error);
      toast.error('Erro ao salvar permissões');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const selectedPerfilData = PERFIS.find(p => p.value === selectedPerfil);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold">Controle de Permissões</h2>
        <p className="text-muted-foreground">
          Configure as permissões de acesso para cada perfil do sistema
        </p>
        {isAdmin ? (
          <div className="mt-2 text-sm text-green-600 dark:text-green-400">
            ✓ Você tem permissão para editar as configurações
          </div>
        ) : (
          <div className="mt-2 text-sm text-amber-600 dark:text-amber-400">
            ⚠ Apenas administradores podem editar permissões
          </div>
        )}
      </div>

      {/* Seleção de Perfil */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Selecione um Perfil</CardTitle>
          <CardDescription>
            Escolha o perfil que deseja configurar as permissões
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {PERFIS.map(perfil => (
              <button
                key={perfil.value}
                onClick={() => {
                  setSelectedPerfil(perfil.value);
                  setPendingChanges(new Map());
                }}
                className={cn(
                  "p-3 rounded-lg border text-left transition-all",
                  selectedPerfil === perfil.value
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border hover:border-primary/50 hover:bg-muted/50",
                  perfil.value === 'admin' && "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
                )}
              >
                <div className="font-medium text-sm truncate">{perfil.label}</div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {perfil.description}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedPerfil && (
        <>
          {/* Resumo e Ações */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-base px-3 py-1">
                {selectedPerfilData?.label}
              </Badge>
              <Badge variant="secondary">
                {getTotalModulesEnabled()} de {MODULOS.length} módulos
              </Badge>
              {pendingChanges.size > 0 && (
                <Badge variant="default" className="bg-amber-500">
                  {pendingChanges.size} alterações pendentes
                </Badge>
              )}
            </div>

            {isAdmin && selectedPerfil !== 'admin' && (
              <div className="flex flex-wrap gap-2">
                {/* Template */}
                <Select onValueChange={handleApplyTemplate}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Aplicar template" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TEMPLATES).map(([key, template]) => (
                      <SelectItem key={key} value={key}>
                        {template.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Copiar de outro perfil */}
                <div className="flex gap-1">
                  <Select value={copyFromPerfil || ''} onValueChange={(v) => setCopyFromPerfil(v as Perfil)}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Copiar de..." />
                    </SelectTrigger>
                    <SelectContent>
                      {PERFIS.filter(p => p.value !== selectedPerfil && p.value !== 'admin').map(perfil => (
                        <SelectItem key={perfil.value} value={perfil.value}>
                          {perfil.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyFromPerfil}
                    disabled={!copyFromPerfil}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>

                {pendingChanges.size > 0 && (
                  <Button variant="ghost" onClick={handleResetChanges}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Descartar
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Aviso Admin */}
          {selectedPerfil === 'admin' && (
            <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
              <CardContent className="py-4">
                <p className="text-amber-800 dark:text-amber-200 text-sm">
                  <Shield className="h-4 w-4 inline mr-2" />
                  O perfil Administrador possui acesso total ao sistema e não pode ter suas permissões alteradas.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Accordions de Módulos */}
          {selectedPerfil !== 'admin' && (
            <Accordion type="multiple" className="space-y-2">
              {MODULOS.map(modulo => {
                const Icon = modulo.icon;
                const isEnabled = hasModuleAccess(modulo.value);
                const permCount = getModulePermissionCount(modulo.value);

                return (
                  <AccordionItem
                    key={modulo.value}
                    value={modulo.value}
                    className={cn(
                      "border rounded-lg px-4",
                      isEnabled ? "bg-card" : "bg-muted/30"
                    )}
                  >
                    <div className="flex items-center gap-4 py-4">
                      {/* Toggle de Acesso */}
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => handleModuleToggle(modulo.value, checked)}
                        disabled={!isAdmin}
                      />

                      {/* Trigger do Accordion */}
                      <AccordionTrigger className="flex-1 hover:no-underline py-0">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-lg",
                            isEnabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                          )}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="text-left">
                            <div className={cn(
                              "font-medium",
                              !isEnabled && "text-muted-foreground"
                            )}>
                              {modulo.label}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {modulo.description}
                            </div>
                          </div>
                        </div>
                      </AccordionTrigger>

                      {/* Badge de contagem */}
                      <Badge variant={isEnabled ? "secondary" : "outline"} className="mr-2">
                        {permCount}/{ACOES.length}
                      </Badge>
                    </div>

                    <AccordionContent className="pb-4">
                      <div className="pl-14 space-y-4">
                        {/* Ações em massa */}
                        {isAdmin && (
                          <div className="flex gap-2 pb-2 border-b">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSelectAllModule(modulo.value)}
                              disabled={!isEnabled}
                            >
                              <CheckSquare className="h-4 w-4 mr-2" />
                              Marcar todas
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeselectAllModule(modulo.value)}
                            >
                              <Square className="h-4 w-4 mr-2" />
                              Desmarcar todas
                            </Button>
                          </div>
                        )}

                        {/* Checkboxes de Ações */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                          {ACOES.map(acao => {
                            const checked = getPermissionValue(modulo.value, acao.value);
                            const disabled = !isAdmin || !isEnabled || (acao.value === 'visualizar' && isEnabled);

                            return (
                              <label
                                key={acao.value}
                                className={cn(
                                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                                  checked 
                                    ? "bg-primary/5 border-primary/30" 
                                    : "bg-background border-border",
                                  disabled && "opacity-50 cursor-not-allowed"
                                )}
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(value) => 
                                    handlePermissionChange(modulo.value, acao.value, value as boolean)
                                  }
                                  disabled={disabled}
                                />
                                <div>
                                  <div className="font-medium text-sm">{acao.label}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {acao.description}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}

          {/* Botão Salvar Fixo */}
          {isAdmin && selectedPerfil !== 'admin' && pendingChanges.size > 0 && (
            <div className="fixed bottom-6 right-6 z-50">
              <Button 
                size="lg" 
                onClick={handleSaveChanges}
                disabled={isSaving}
                className="shadow-lg"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar Alterações ({pendingChanges.size})
              </Button>
            </div>
          )}
        </>
      )}

      {/* Dialog de Confirmação */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDialog.onConfirm}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
