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

  const hasPermission = (modulo: Modulo, acao: Acao): boolean => {
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

  return {
    isAdmin,
    isLeader,
    isLoadingRoles,
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
