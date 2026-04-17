import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface TarefaCaptacao {
  id: string;
  lead_id: string | null;
  campanha_proposta_id: string | null;
  canal: string | null;
  tipo: "lead_aberto" | "follow_up" | "tentativa_canal" | "solicitacao";
  status: "aberta" | "em_andamento" | "concluida" | "cancelada";
  prioridade: "baixa" | "media" | "alta" | "urgente";
  titulo: string;
  descricao: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  prazo: string | null;
  concluida_em: string | null;
  concluida_por: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TarefaFiltros {
  status?: TarefaCaptacao["status"][];
  canal?: string[];
  responsavelId?: string;
  campanhaPropostaId?: string;
}

export function useTarefasCaptacao(filtros: TarefaFiltros = {}) {
  return useQuery({
    queryKey: ["tarefas-captacao", filtros],
    queryFn: async () => {
      let q = supabase
        .from("tarefas_captacao")
        .select("*, lead:lead_id(id, nome, phone_e164, email, status)")
        .order("created_at", { ascending: false });
      if (filtros.status?.length) q = q.in("status", filtros.status);
      if (filtros.canal?.length) q = q.in("canal", filtros.canal);
      if (filtros.responsavelId) q = q.eq("responsavel_id", filtros.responsavelId);
      if (filtros.campanhaPropostaId) q = q.eq("campanha_proposta_id", filtros.campanhaPropostaId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCriarTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<TarefaCaptacao> & { titulo: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("tarefas_captacao")
        .insert({ ...input, created_by: userData.user?.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tarefas-captacao"] });
      toast.success("Tarefa criada");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });
}

export function useAtualizarTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string } & Partial<TarefaCaptacao>) => {
      const { id, ...rest } = input;
      const patch: any = { ...rest };
      if (rest.status === "concluida" && !rest.concluida_em) {
        patch.concluida_em = new Date().toISOString();
        const { data: userData } = await supabase.auth.getUser();
        patch.concluida_por = userData.user?.id;
      }
      const { error } = await supabase.from("tarefas_captacao").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tarefas-captacao"] });
      toast.success("Tarefa atualizada");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });
}
