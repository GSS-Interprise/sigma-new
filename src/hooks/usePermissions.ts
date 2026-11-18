import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type Modulo = 
  | 'dashboard'
  | 'clientes'
  | 'contratos'
  | 'medicos'
  | 'relacionamento'
  | 'disparos'
  | 'configuracoes'
  | 'financeiro'
  | 'radiologia'
  | 'licitacoes'
  | 'escalas'
  | 'patrimonio'
  | 'bi'
  | 'suporte'
  | 'comunicacao'
  | 'sigzap'
  | 'demandas'
  | 'marketing'
  | 'auditoria'
  | 'captadores'
  | 'ages';

export type Acao = 
  | 'visualizar'
  | 'criar'
  | 'editar'
  | 'excluir'
  | 'aprovar';

export function usePermissions() {
  const { user } = useAuth();

  const { data: userRoles, isLoading: isLoadingRoles } = useQuery({
    queryKey: ['user-roles', user?.id],
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutos
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id);
      return data || [];
    },
  });

  const roles = userRoles || [];
  const isAdmin = roles.some(r => r.role === 'admin');
  const isLeader = roles.some(r => r.role === 'lideres');
  const isLicitador = roles.some(r => r.role === 'licitador');
  const isLiderLicitacao = roles.some(r => r.role === 'lider_licitacao');

  const { data: permissions, isLoading: isLoadingPermissions } = useQuery({
    queryKey: ['user-permissions', user?.id, roles],
    enabled: !!user?.id && roles.length > 0,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data } = await supabase
        .from('permissoes')
        .select('*')
        .in('perfil', roles.map(r => r.role))
        .eq('ativo', true);
      return data || [];
    },
  });

  // Módulo bloqueado só para esta pessoa (usuario_modulos_bloqueados), acima do que o perfil dá: a permissão é por
  // perfil e o perfil é dividido com outras pessoas (caso da Bianca e Licitações, 18/11).
  const { data: bloqueados = [] } = useQuery({
    queryKey: ['user-modulos-bloqueados', user?.id],
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data } = await supabase
        .from('usuario_modulos_bloqueados' as never)
        .select('modulo')
        .eq('user_id', user!.id);
      return ((data || []) as { modulo: string }[]).map((b) => b.modulo);
    },
  });

  const hasPermission = (modulo: Modulo, acao: Acao): boolean => {
    if (bloqueados.includes(modulo)) return false;
    if (isAdmin) return true;
    if (!permissions) return false;
    
    return permissions.some(
      p => p.modulo === modulo && p.acao === acao
    );
  };

  const canView = (modulo: Modulo) => hasPermission(modulo, 'visualizar');
  const canCreate = (modulo: Modulo) => hasPermission(modulo, 'criar');
  const canEdit = (modulo: Modulo) => hasPermission(modulo, 'editar');
  const canDelete = (modulo: Modulo) => hasPermission(modulo, 'excluir');
  const canApprove = (modulo: Modulo) => hasPermission(modulo, 'aprovar');

  const isLoadingPermissions_ = isLoadingRoles || (roles.length > 0 && isLoadingPermissions);

  return {
    isAdmin,
    isLeader,
    isLicitador,
    isLiderLicitacao,
    isLoadingRoles: isLoadingPermissions_,
    hasPermission,
    canView,
    canCreate,
    canEdit,
    canDelete,
    canApprove,
    userRoles: roles,
    permissions: permissions || [],
  };
}
