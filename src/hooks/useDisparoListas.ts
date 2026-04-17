import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DisparoLista {
  id: string;
  nome: string;
  descricao: string | null;
  filtro_ufs: string[];
  filtro_cidades: string[];
  filtro_especialidades: string[];
  filtro_status: string[];
  excluir_blacklist: boolean;
  total_estimado: number | null;
  created_by: string | null;
  created_by_nome: string | null;
  created_at: string;
  updated_at: string;
}

export interface DisparoListaInput {
  nome: string;
  descricao?: string | null;
  filtro_ufs?: string[];
  filtro_cidades?: string[];
  filtro_especialidades?: string[];
  filtro_status?: string[];
  excluir_blacklist?: boolean;
}

export function useDisparoListas() {
  return useQuery({
    queryKey: ["disparo-listas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("disparo_listas")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as DisparoLista[];
    },
  });
}

export function useDisparoListaItens(listaId: string | null) {
  return useQuery({
    queryKey: ["disparo-lista-itens", listaId],
    queryFn: async () => {
      if (!listaId) return [];
      const { data, error } = await supabase
        .from("disparo_lista_itens")
        .select(
          "id, lead_id, created_at, leads:lead_id (id, nome, phone_e164, especialidade, uf, cidade, status)"
        )
        .eq("lista_id", listaId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!listaId,
  });
}

export function useUpsertDisparoLista() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id?: string } & DisparoListaInput) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      let nomeUser: string | null = null;
      if (userId) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("nome_completo")
          .eq("id", userId)
          .maybeSingle();
        nomeUser = prof?.nome_completo ?? null;
      }

      if (payload.id) {
        const { id, ...rest } = payload;
        const { data, error } = await supabase
          .from("disparo_listas")
          .update(rest)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("disparo_listas")
        .insert({
          ...payload,
          created_by: userId,
          created_by_nome: nomeUser,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["disparo-listas"] });
      toast.success("Lista salva");
    },
    onError: (e: any) => toast.error("Erro ao salvar lista: " + e.message),
  });
}

export function useDeleteDisparoLista() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("disparo_listas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["disparo-listas"] });
      toast.success("Lista removida");
    },
    onError: (e: any) => toast.error("Erro ao remover: " + e.message),
  });
}

export function useAddLeadsToLista() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ listaId, leadIds }: { listaId: string; leadIds: string[] }) => {
      if (leadIds.length === 0) return;
      const rows = leadIds.map((lead_id) => ({ lista_id: listaId, lead_id }));
      const { error } = await supabase
        .from("disparo_lista_itens")
        .upsert(rows, { onConflict: "lista_id,lead_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["disparo-lista-itens", vars.listaId] });
      qc.invalidateQueries({ queryKey: ["disparo-listas"] });
      toast.success("Leads adicionados");
    },
    onError: (e: any) => toast.error("Erro ao adicionar: " + e.message),
  });
}

export function useRemoveLeadFromLista() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, listaId: _listaId }: { itemId: string; listaId: string }) => {
      const { error } = await supabase.from("disparo_lista_itens").delete().eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["disparo-lista-itens", vars.listaId] });
    },
    onError: (e: any) => toast.error("Erro ao remover: " + e.message),
  });
}

/**
 * Resolve os contatos finais de uma lista (manual + filtros dinâmicos),
 * aplicando exclusão de blacklist quando configurado.
 * Retorna leads únicos (por id) com phone_e164 não nulo.
 */
export async function resolverContatosDaLista(lista: DisparoLista) {
  const leadIds = new Set<string>();
  const leadsMap = new Map<string, any>();

  // Itens da lista
  const { data: itens } = await supabase
    .from("disparo_lista_itens")
    .select("leads:lead_id (id, nome, phone_e164, especialidade, uf, cidade, status)")
    .eq("lista_id", lista.id);
  (itens || []).forEach((i: any) => {
    const l = i.leads;
    if (l?.id && l.phone_e164) {
      leadIds.add(l.id);
      leadsMap.set(l.id, l);
    }
  });

  // 3. Excluir blacklist
  if (lista.excluir_blacklist) {
    const { data: bl } = await supabase.from("blacklist").select("phone_e164");
    const blPhones = new Set(
      (bl || [])
        .map((b: any) => (b.phone_e164 || "").replace(/\D/g, ""))
        .filter(Boolean)
    );
    for (const [id, lead] of leadsMap.entries()) {
      const key = (lead.phone_e164 || "").replace(/\D/g, "");
      if (blPhones.has(key)) {
        leadsMap.delete(id);
        leadIds.delete(id);
      }
    }
  }

  return Array.from(leadsMap.values());
}
