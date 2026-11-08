import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Consultas do assistente de campanha (funções em supabase/migrations/20261108150000_campanha_assistente.sql).

export type NumeroOficial = {
  sender_id: string;
  phone_e164: string;
  display_name: string | null;
  disponibilidade: "disponivel" | "atencao" | "indisponivel" | null;
  disponibilidade_motivo: string | null;
  responsavel_nome: string | null;
  templates: string[];
};

export type ModeloAprovado = {
  friendly_name: string;
  body: string;
  variables: Record<string, string> | null;
  numeros: number;
};

export type Previa = {
  entram: number;
  em_outras_campanhas: number;
  top_cidades: { cidade: string; n: number }[];
};

export type UniversoCfm = { brasil: number; nas_ufs: number | null; atualizado_em: string | null };

const rpc = (nome: string, args?: Record<string, unknown>) => (supabase as any).rpc(nome, args);

export function useEspecialidades() {
  return useQuery({
    queryKey: ["assistente-especialidades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("especialidades")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data || []) as { id: string; nome: string }[];
    },
    staleTime: 10 * 60_000,
  });
}

export function useListasProntas() {
  return useQuery({
    queryKey: ["assistente-listas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("disparo_listas" as never)
        .select("id, nome, total_estimado, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as { id: string; nome: string; total_estimado: number | null; created_at: string }[];
    },
  });
}

export function useNumerosOficiais() {
  return useQuery({
    queryKey: ["assistente-numeros"],
    queryFn: async () => {
      const { data, error } = await rpc("campanha_assistente_numeros");
      if (error) throw error;
      return (data || []) as NumeroOficial[];
    },
  });
}

export function useModelosAprovados() {
  return useQuery({
    queryKey: ["assistente-modelos"],
    queryFn: async () => {
      const { data, error } = await rpc("campanha_assistente_modelos");
      if (error) throw error;
      return ((data || []) as ModeloAprovado[]).sort((a, b) => b.numeros - a.numeros);
    },
  });
}

export function useUniversoCfm(especialidadeIds: string[], ufs: string[]) {
  return useQuery({
    queryKey: ["assistente-cfm", especialidadeIds.join(","), ufs.join(",")],
    enabled: especialidadeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await rpc("campanha_assistente_universo_cfm", {
        p_especialidade_ids: especialidadeIds,
        p_ufs: ufs.length ? ufs : null,
      });
      if (error) throw error;
      return data as UniversoCfm;
    },
    staleTime: 5 * 60_000,
  });
}

export function usePrevia(especialidadeIds: string[], ufs: string[], listaId: string | null) {
  return useQuery({
    queryKey: ["assistente-previa", especialidadeIds.join(","), ufs.join(","), listaId],
    enabled: especialidadeIds.length > 0 || !!listaId,
    queryFn: async () => {
      const { data, error } = await rpc("campanha_assistente_previa", {
        p_especialidade_ids: especialidadeIds,
        p_ufs: ufs.length ? ufs : null,
        p_cidades: null,
        p_lista_id: listaId,
      });
      if (error) throw error;
      return data as Previa;
    },
    staleTime: 60_000,
  });
}
