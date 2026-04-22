import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CanalCascata =
  | "whatsapp"
  | "trafego_pago"
  | "email"
  | "instagram"
  | "ligacao"
  | "linkedin"
  | "tiktok";

export interface LeadCanalRow {
  id: string;
  campanha_proposta_id: string;
  lead_id: string;
  canal: CanalCascata;
  entrou_em: string;
  saiu_em: string | null;
  motivo_saida: string | null;
  proximo_canal: CanalCascata | null;
  status_final:
    | "aberto"
    | "transferido"
    | "respondeu"
    | "convertido"
    | "descartado"
    | "fechado";
  duracao_segundos: number | null;
  criado_por: string | null;
}

export function useLeadCanais(campanhaPropostaId?: string | null) {
  return useQuery({
    queryKey: ["lead-canais", campanhaPropostaId],
    enabled: !!campanhaPropostaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campanha_proposta_lead_canais")
        .select("*")
        .eq("campanha_proposta_id", campanhaPropostaId!)
        .order("entrou_em", { ascending: true });
      if (error) throw error;
      return (data || []) as LeadCanalRow[];
    },
  });
}

export function useTransferirLeadsCanal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      campanhaPropostaId: string;
      leadIds: string[];
      canalAtual: CanalCascata;
      proximoCanal: CanalCascata;
      motivo: string;
    }) => {
      const results = await Promise.all(
        input.leadIds.map((leadId) =>
          (supabase as any).rpc("transferir_lead_canal", {
            p_campanha_proposta_id: input.campanhaPropostaId,
            p_lead_id: leadId,
            p_canal_atual: input.canalAtual,
            p_proximo_canal: input.proximoCanal,
            p_motivo: input.motivo,
          })
        )
      );
      const erros = results.filter((r) => r.error).map((r) => r.error!.message);
      if (erros.length) throw new Error(erros.join("; "));
      return results.length;
    },
    onSuccess: (qtd) => {
      qc.invalidateQueries({ queryKey: ["lead-canais"] });
      qc.invalidateQueries({ queryKey: ["campanha-lista-leads"] });
      toast.success(`${qtd} lead(s) transferido(s)`);
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });
}

export function useFecharLeadsCanal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      campanhaPropostaId: string;
      leadIds: string[];
      canal: CanalCascata;
      statusFinal: "respondeu" | "convertido" | "descartado" | "fechado";
      motivo: string;
    }) => {
      const results = await Promise.all(
        input.leadIds.map((leadId) =>
          (supabase as any).rpc("fechar_lead_canal", {
            p_campanha_proposta_id: input.campanhaPropostaId,
            p_lead_id: leadId,
            p_canal: input.canal,
            p_status_final: input.statusFinal,
            p_motivo: input.motivo,
          })
        )
      );
      const erros = results.filter((r) => r.error).map((r) => r.error!.message);
      if (erros.length) throw new Error(erros.join("; "));
      return results.length;
    },
    onSuccess: (qtd) => {
      qc.invalidateQueries({ queryKey: ["lead-canais"] });
      qc.invalidateQueries({ queryKey: ["campanha-lista-leads"] });
      toast.success(`${qtd} lead(s) encerrado(s)`);
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });
}

export function useEnviarProximaFase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      campanhaPropostaId: string;
      leadId: string;
      canalAtual: CanalCascata;
      motivo?: string;
    }) => {
      const { data, error } = await (supabase as any).rpc("enviar_lead_proxima_fase", {
        p_campanha_proposta_id: input.campanhaPropostaId,
        p_lead_id: input.leadId,
        p_canal_atual: input.canalAtual,
        p_motivo: input.motivo ?? "Avançado para próxima fase",
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-canais"] });
      qc.invalidateQueries({ queryKey: ["lead-status-proposta"] });
      qc.invalidateQueries({ queryKey: ["campanha-lista-leads"] });
      qc.invalidateQueries({ queryKey: ["acompanhamento-leads"] });
      toast.success("Lead enviado para a próxima fase");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });
}

export function formatDuracao(segundos: number | null | undefined): string {
  if (!segundos || segundos <= 0) return "—";
  const dias = Math.floor(segundos / 86400);
  const horas = Math.floor((segundos % 86400) / 3600);
  const min = Math.floor((segundos % 3600) / 60);
  if (dias > 0) return `${dias}d ${horas}h`;
  if (horas > 0) return `${horas}h ${min}m`;
  return `${min}m`;
}

export function tempoNaRaia(entrouEm: string, saiuEm: string | null): number {
  const inicio = new Date(entrouEm).getTime();
  const fim = saiuEm ? new Date(saiuEm).getTime() : Date.now();
  return Math.floor((fim - inicio) / 1000);
}