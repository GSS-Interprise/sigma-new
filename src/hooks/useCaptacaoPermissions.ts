import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "./usePermissions";
import { useEffect } from "react";

export type CaptacaoPermission = 
  | 'disparos_email'
  | 'disparos_zap'
  | 'acompanhamento'
  | 'leads'
  | 'blacklist'
  | 'seigzaps_config'
  | 'contratos_servicos';

export interface CaptacaoPermissoes {
  id: string;
  user_id: string;
  pode_disparos_email: boolean;
  pode_disparos_zap: boolean;
  pode_acompanhamento: boolean;
  pode_leads: boolean;
  pode_blacklist: boolean;
  pode_seigzaps_config: boolean;
  pode_contratos_servicos: boolean;
  created_at: string;
  updated_at: string;
}

export function useCaptacaoPermissions() {
  const { user } = useAuth();
  const { isAdmin } = usePermissions();
  const queryClient = useQueryClient();

  // Check if current user is captação leader
  const { data: isCaptacaoLeader, isLoading: isLoadingLeader } = useQuery({
    queryKey: ['is-captacao-leader', user?.id],
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('is_captacao_leader', { _user_id: user!.id });
      
      if (error) {
        console.error('Error checking captação leader:', error);
        return false;
      }
      return data as boolean;
    },
  });

  // Check if user has gestor_captacao role
  const { data: isGestorCaptacao, isLoading: isLoadingGestor } = useQuery({
    queryKey: ['is-gestor-captacao', user?.id],
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('has_role', { _user_id: user!.id, _role: 'gestor_captacao' });
      
      if (error) {
        console.error('Error checking gestor captação:', error);
        return false;
      }
      return data as boolean;
    },
  });

  // Get user's captação permissions
  const { data: userPermissions, isLoading: isLoadingPermissions } = useQuery({
    queryKey: ['captacao-permissions', user?.id],
    enabled: !!user?.id,
    staleTime: 0, // Always fresh for realtime updates
    queryFn: async () => {
      const { data, error } = await supabase
        .from('captacao_permissoes_usuario')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching captação permissions:', error);
        return null;
      }
      return data as CaptacaoPermissoes | null;
    },
  });

  // Realtime subscription for permission changes
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`captacao-permissions-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'captacao_permissoes_usuario',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Invalidate and refetch permissions immediately
          queryClient.invalidateQueries({ queryKey: ['captacao-permissions', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Check if user can manage captadores
  const canManageCaptadores = isAdmin || isCaptacaoLeader || isGestorCaptacao;

  // Check specific captação permission
  const hasCaptacaoPermission = (permission: CaptacaoPermission): boolean => {
    // Admins, leaders and gestores have all permissions
    if (isAdmin || isCaptacaoLeader || isGestorCaptacao) return true;
    
    if (!userPermissions) return false;

    switch (permission) {
      case 'disparos_email':
        return userPermissions.pode_disparos_email;
      case 'disparos_zap':
        return userPermissions.pode_disparos_zap;
      case 'acompanhamento':
        return userPermissions.pode_acompanhamento;
      case 'leads':
        return userPermissions.pode_leads;
      case 'blacklist':
        return userPermissions.pode_blacklist;
      case 'seigzaps_config':
        return userPermissions.pode_seigzaps_config;
      case 'contratos_servicos':
        return userPermissions.pode_contratos_servicos;
      default:
        return false;
    }
  };

  // Check if user has ANY captação permission (for showing the module in sidebar)
  const hasAnyCaptacaoAccess = (): boolean => {
    if (isAdmin || isCaptacaoLeader || isGestorCaptacao) return true;
    if (!userPermissions) return false;
    
    return (
      userPermissions.pode_disparos_email ||
      userPermissions.pode_disparos_zap ||
      userPermissions.pode_acompanhamento ||
      userPermissions.pode_leads ||
      userPermissions.pode_blacklist ||
      userPermissions.pode_seigzaps_config ||
      userPermissions.pode_contratos_servicos
    );
  };

  // Mutation to update user permissions
  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ 
      userId, 
      permissions 
    }: { 
      userId: string; 
      permissions: Partial<Omit<CaptacaoPermissoes, 'id' | 'user_id' | 'created_at' | 'updated_at'>> 
    }) => {
      // Check if user already has permissions record
      const { data: existing } = await supabase
        .from('captacao_permissoes_usuario')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        // Update existing record
        const { error } = await supabase
          .from('captacao_permissoes_usuario')
          .update(permissions)
          .eq('user_id', userId);
        
        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from('captacao_permissoes_usuario')
          .insert({
            user_id: userId,
            ...permissions,
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['captacao-permissions'] });
      queryClient.invalidateQueries({ queryKey: ['all-captacao-permissions'] });
    },
  });

  return {
    isCaptacaoLeader: isCaptacaoLeader || false,
    isGestorCaptacao: isGestorCaptacao || false,
    canManageCaptadores,
    userPermissions,
    hasCaptacaoPermission,
    hasAnyCaptacaoAccess,
    updatePermissions: updatePermissionsMutation.mutate,
    isUpdating: updatePermissionsMutation.isPending,
    isLoading: isLoadingLeader || isLoadingGestor || isLoadingPermissions,
  };
}
