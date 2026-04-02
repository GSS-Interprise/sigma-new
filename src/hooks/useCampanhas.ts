import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Campanha {
  id: string;
  nome: string;
  objetivo?: string;
  descricao?: string;
  canal: string;
  status: string;
  data_inicio?: string;
  data_termino?: string;
  orcamento?: number;
  responsavel_id?: string;
  publico_alvo?: any;
  mensagem?: string;
  assunto_email?: string;
  corpo_html?: string;
  variaveis_dinamicas?: string[];
  agendamento_tipo?: string;
  data_agendamento?: string;
  horario_inteligente?: boolean;
  tamanho_lote?: number;
  total_enviados?: number;
  total_entregues?: number;
  total_aberturas?: number;
  total_cliques?: number;
  total_respostas?: number;
  total_conversoes?: number;
  custo_total?: number;
  criado_por?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CampanhaEnvio {
  id: string;
  campanha_id: string;
  destinatario_id?: string;
  destinatario_nome?: string;
  destinatario_email?: string;
  destinatario_telefone?: string;
  status: string;
  motivo_falha?: string;
  data_envio?: string;
  data_abertura?: string;
  data_clique?: string;
  data_resposta?: string;
  created_at?: string;
}

export interface CampanhaFilters {
  search: string;
  status: string;
  canal: string;
  periodo: string;
}

export const STATUS_CAMPANHA = {
  rascunho: { label: 'Rascunho', variant: 'outline' as const, color: 'bg-muted' },
  agendada: { label: 'Agendada', variant: 'secondary' as const, color: 'bg-blue-500/20' },
  ativa: { label: 'Ativa', variant: 'default' as const, color: 'bg-emerald-500/20' },
  pausada: { label: 'Pausada', variant: 'outline' as const, color: 'bg-yellow-500/20' },
  finalizada: { label: 'Finalizada', variant: 'secondary' as const, color: 'bg-slate-500/20' },
  arquivada: { label: 'Arquivada', variant: 'outline' as const, color: 'bg-slate-300/20' },
  planejada: { label: 'Planejada', variant: 'secondary' as const, color: 'bg-purple-500/20' },
};

export const CANAIS_CAMPANHA = {
  whatsapp: { label: 'WhatsApp', icon: 'MessageSquare' },
  email: { label: 'E-mail', icon: 'Mail' },
  sms: { label: 'SMS', icon: 'Smartphone' },
  instagram: { label: 'Instagram', icon: 'Instagram' },
  push: { label: 'Push', icon: 'Bell' },
  automacao: { label: 'Automação', icon: 'Zap' },
};

export function useCampanhas(filters: CampanhaFilters) {
  return useQuery({
    queryKey: ['campanhas', filters],
    queryFn: async () => {
      let query = supabase
        .from('campanhas')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status as any);
      }

      if (filters.canal && filters.canal !== 'all') {
        query = query.eq('canal', filters.canal as any);
      }

      if (filters.periodo && filters.periodo !== 'all') {
        const now = new Date();
        let startDate: Date;
        
        switch (filters.periodo) {
          case 'mes_atual':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case 'mes_anterior':
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            query = query.lt('created_at', new Date(now.getFullYear(), now.getMonth(), 1).toISOString());
            break;
          case 'trimestre':
            startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
            break;
          default:
            startDate = new Date(0);
        }
        
        if (filters.periodo !== 'mes_anterior') {
          query = query.gte('created_at', startDate.toISOString());
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      let campanhas = (data || []) as Campanha[];

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        campanhas = campanhas.filter(c => 
          c.nome.toLowerCase().includes(searchLower) ||
          c.objetivo?.toLowerCase().includes(searchLower) ||
          c.descricao?.toLowerCase().includes(searchLower)
        );
      }

      return campanhas;
    },
  });
}

export function useCampanha(id: string | null) {
  return useQuery({
    queryKey: ['campanha', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('campanhas')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as Campanha | null;
    },
    enabled: !!id,
  });
}

export function useCampanhaEnvios(campanhaId: string | null) {
  return useQuery({
    queryKey: ['campanha-envios', campanhaId],
    queryFn: async () => {
      if (!campanhaId) return [];
      const { data, error } = await supabase
        .from('campanhas_envios')
        .select('*')
        .eq('campanha_id', campanhaId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as CampanhaEnvio[];
    },
    enabled: !!campanhaId,
  });
}

export function useCampanhaMutations() {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (campanha: Partial<Campanha>) => {
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('campanhas')
        .insert({ 
          ...campanha, 
          criado_por: user?.user?.id,
          status: campanha.status || 'rascunho'
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campanhas'] });
      toast.success('Campanha criada com sucesso');
    },
    onError: (error: any) => {
      toast.error('Erro ao criar campanha: ' + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...campanha }: Partial<Campanha> & { id: string }) => {
      const { data, error } = await supabase
        .from('campanhas')
        .update(campanha as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campanhas'] });
      queryClient.invalidateQueries({ queryKey: ['campanha'] });
      toast.success('Campanha atualizada com sucesso');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar campanha: ' + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('campanhas')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campanhas'] });
      toast.success('Campanha excluída com sucesso');
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir campanha: ' + error.message);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: original, error: fetchError } = await supabase
        .from('campanhas')
        .select('*')
        .eq('id', id)
        .single();
      if (fetchError) throw fetchError;

      const { id: _, created_at, updated_at, total_enviados, total_entregues, total_aberturas, total_cliques, total_respostas, total_conversoes, ...rest } = original as any;
      
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('campanhas')
        .insert({
          ...rest,
          nome: `${rest.nome} (cópia)`,
          status: 'rascunho',
          criado_por: user?.user?.id,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campanhas'] });
      toast.success('Campanha duplicada com sucesso');
    },
    onError: (error: any) => {
      toast.error('Erro ao duplicar campanha: ' + error.message);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('campanhas')
        .update({ status } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campanhas'] });
      queryClient.invalidateQueries({ queryKey: ['campanha'] });
      toast.success('Status atualizado');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar status: ' + error.message);
    },
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
    duplicateMutation,
    updateStatusMutation,
  };
}
