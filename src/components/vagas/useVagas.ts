import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Vagas em aberto (Fase 4 do plano GSS dono no comando).
// Tabela e visão em supabase/migrations/20261108190000_vagas.sql.

export type TipoVaga = "plantao" | "ambulatorio" | "fixa" | "sobreaviso";
export type FaixaDias = "ate_7" | "8_a_15" | "16_a_30" | "mais_30";

export const TIPOS_VAGA: { value: TipoVaga; label: string }[] = [
  { value: "plantao", label: "Plantão" },
  { value: "ambulatorio", label: "Ambulatório" },
  { value: "fixa", label: "Vaga fixa" },
  { value: "sobreaviso", label: "Sobreaviso" },
];
export const rotuloTipo = (t: string) => TIPOS_VAGA.find((x) => x.value === t)?.label || t;

export type Vaga = {
  id: string;
  cliente_id: string | null;
  hospital_nome: string;
  cidade: string;
  uf: string | null;
  especialidade_id: string;
  especialidade_nome: string;
  tipo: TipoVaga;
  descricao: string | null;
  valor: string | null;
  quantidade: number;
  prioridade: "normal" | "urgente";
  aberta_em: string;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  status: "aberta" | "em_negociacao";
  campanha_id: string | null;
  campanha_nome: string | null;
  campanha_status: string | null;
  observacoes: string | null;
  dias_aberta: number;
  faixa: FaixaDias;
};

export type VagaForm = {
  hospital_nome: string;
  cliente_id: string | null;
  especialidade_id: string;
  tipo: TipoVaga;
  cidade: string;
  uf: string;
  descricao: string;
  valor: string;
  quantidade: number;
  prioridade: "normal" | "urgente";
  aberta_em: string;
  responsavel_id: string | null;
};

const db = supabase as any;

export function useVagasAbertas() {
  return useQuery({
    queryKey: ["vagas-abertas"],
    queryFn: async () => {
      const { data, error } = await db
        .from("vagas_abertas_v")
        .select("*")
        .order("aberta_em", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as Vaga[];
    },
  });
}

export function usePodeGerirVagas() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pode-gerir-vagas", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("pode_gerir_vagas", { _uid: user!.id });
      if (error) throw error;
      return !!data;
    },
  });
}

export function useResponsaveis() {
  return useQuery({
    queryKey: ["vagas-responsaveis"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome_completo").eq("status", "ativo").order("nome_completo");
      if (error) throw error;
      return (data || []).filter((p) => p.nome_completo) as { id: string; nome_completo: string }[];
    },
  });
}

export function useClientesNomes() {
  return useQuery({
    queryKey: ["vagas-clientes"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.from("clientes").select("id, nome_fantasia, nome_empresa, razao_social, uf");
      if (error) throw error;
      return ((data || []) as any[])
        .map((c) => ({ id: c.id as string, nome: (c.nome_fantasia || c.nome_empresa || c.razao_social || "").trim(), uf: c.uf as string | null }))
        .filter((c) => c.nome)
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
  });
}

export function useMedicosBusca(termo: string) {
  return useQuery({
    queryKey: ["vagas-medicos", termo],
    enabled: termo.trim().length >= 3,
    queryFn: async () => {
      const t = termo.trim();
      const { data, error } = await db
        .from("medicos")
        .select("id, nome_completo, crm, estado")
        .or(`nome_completo.ilike.%${t}%,crm.ilike.%${t.replace(/\D/g, "") || t}%`)
        .order("nome_completo")
        .limit(8);
      if (error) throw error;
      return (data || []) as { id: string; nome_completo: string; crm: string | null; estado: string | null }[];
    },
  });
}

export function useSalvarVaga() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, form }: { id?: string; form: VagaForm }) => {
      const valores = {
        ...form,
        hospital_nome: form.hospital_nome.trim(),
        cidade: form.cidade.trim(),
        uf: form.uf || null,
        descricao: form.descricao.trim() || null,
        valor: form.valor.trim() || null,
      };
      const { error } = id
        ? await db.from("vagas").update(valores).eq("id", id)
        : await db.from("vagas").insert(valores);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vagas-abertas"] }),
  });
}

export function useMudarVaga() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Record<string, unknown> }) => {
      const { error } = await db.from("vagas").update(campos).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vagas-abertas"] }),
  });
}
