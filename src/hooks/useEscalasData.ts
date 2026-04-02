import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EscalaLocal {
  id: string;
  id_externo: string;
  nome: string;
  cidade?: string;
  uf?: string;
}

export interface EscalaSetor {
  id: string;
  id_externo: string;
  local_id: string;
  local_id_externo: string;
  nome: string;
}

export interface EscalaIntegrada {
  id: string;
  id_externo: string;
  profissional_nome: string;
  profissional_crm?: string;
  setor: string;
  unidade?: string;
  data_escala: string;
  hora_inicio: string;
  hora_fim: string;
  tipo_plantao?: string;
  status_escala: string;
  local_id_externo?: string;
  setor_id_externo?: string;
  local_nome?: string;
  setor_nome?: string;
  escala_local_id?: string;
  escala_setor_id?: string;
  dados_incompletos: boolean;
  motivo_incompleto?: string;
  sincronizado_em: string;
}

export interface EscalaInconsistencia {
  id: string;
  escala_id: string;
  tipo: string;
  descricao: string;
  resolvido: boolean;
  criado_em: string;
}

export interface EscalaAlerta {
  id: string;
  tipo: string;
  titulo: string;
  descricao?: string;
  local_id?: string;
  setor_id?: string;
  data_referencia?: string;
  prioridade: string;
  lido: boolean;
  criado_em: string;
}

export function useEscalasLocais() {
  return useQuery({
    queryKey: ["escalas-locais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("escalas_locais")
        .select("*")
        .eq("ativo", true)
        .order("nome");
      
      if (error) throw error;
      return data as EscalaLocal[];
    },
  });
}

export function useEscalasSetores(localId?: string) {
  return useQuery({
    queryKey: ["escalas-setores", localId],
    queryFn: async () => {
      let query = supabase
        .from("escalas_setores")
        .select("*")
        .eq("ativo", true)
        .order("nome");
      
      if (localId) {
        query = query.eq("local_id", localId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as EscalaSetor[];
    },
    enabled: true,
  });
}

export function useEscalasIntegradas(filters: {
  mes: number;
  ano: number;
  localId?: string;
  setorId?: string;
  profissional?: string;
  apenasIncompletos?: boolean;
}) {
  return useQuery({
    // Incluir todos os filtros na queryKey para forçar refetch ao mudar qualquer filtro
    queryKey: [
      "escalas-integradas", 
      filters.mes, 
      filters.ano, 
      filters.localId || "all", 
      filters.setorId || "all",
      filters.profissional || "",
      filters.apenasIncompletos || false
    ],
    queryFn: async () => {
      const startDate = `${filters.ano}-${String(filters.mes).padStart(2, "0")}-01`;
      const endDate = new Date(filters.ano, filters.mes, 0).toISOString().split("T")[0];
      
      console.log(`[useEscalasIntegradas] Buscando escalas: ${startDate} a ${endDate}`, filters);
      
      // Buscar o id_externo do local/setor selecionado para filtrar corretamente
      let localIdExterno: string | undefined;
      let setorIdExterno: string | undefined;
      
      if (filters.localId) {
        const { data: local } = await supabase
          .from("escalas_locais")
          .select("id_externo")
          .eq("id", filters.localId)
          .maybeSingle();
        localIdExterno = local?.id_externo;
      }
      
      if (filters.setorId) {
        const { data: setor } = await supabase
          .from("escalas_setores")
          .select("id_externo")
          .eq("id", filters.setorId)
          .maybeSingle();
        setorIdExterno = setor?.id_externo;
      }
      
      // Paginar para contornar limite de 1000 do PostgREST
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("escalas_integradas")
          .select("*")
          .eq("sistema_origem", "DR_ESCALA")
          .gte("data_escala", startDate)
          .lte("data_escala", endDate)
          .order("data_escala")
          .order("hora_inicio")
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        
        if (localIdExterno) {
          query = query.eq("local_id_externo", localIdExterno);
        }
        if (setorIdExterno) {
          query = query.eq("setor_id_externo", setorIdExterno);
        }
        if (filters.profissional) {
          query = query.ilike("profissional_nome", `%${filters.profissional}%`);
        }
        if (filters.apenasIncompletos) {
          query = query.eq("dados_incompletos", true);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        allData = allData.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        page++;
      }
      
      console.log(`[useEscalasIntegradas] ${allData.length} registros retornados (${page} páginas)`);
      return allData as EscalaIntegrada[];
    },
    // Desabilitar cache stale para garantir dados frescos ao mudar filtros
    staleTime: 0,
    // Não manter dados antigos enquanto recarrega
    refetchOnMount: true,
  });
}

export function useEscalasInconsistencias() {
  return useQuery({
    queryKey: ["escalas-inconsistencias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("escalas_inconsistencias")
        .select("*")
        .eq("resolvido", false)
        .order("criado_em", { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data as EscalaInconsistencia[];
    },
  });
}

export function useEscalasAlertas() {
  return useQuery({
    queryKey: ["escalas-alertas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("escalas_alertas")
        .select("*")
        .eq("lido", false)
        .order("prioridade", { ascending: true })
        .order("criado_em", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as EscalaAlerta[];
    },
  });
}

export function useEscalasStats(mes: number, ano: number) {
  return useQuery({
    queryKey: ["escalas-stats", mes, ano],
    queryFn: async () => {
      const startDate = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const endDate = new Date(ano, mes, 0).toISOString().split("T")[0];
      
      const { data: escalas, error } = await supabase
        .from("escalas_integradas")
        .select("*")
        .eq("sistema_origem", "DR_ESCALA")
        .gte("data_escala", startDate)
        .lte("data_escala", endDate);
      
      if (error) throw error;
      
      const total = escalas?.length || 0;
      const incompletos = escalas?.filter(e => e.dados_incompletos).length || 0;
      const completos = total - incompletos;
      
      // Contar por setor
      const porSetor = escalas?.reduce((acc, e) => {
        const setor = e.setor_nome || e.setor || "Não informado";
        acc[setor] = (acc[setor] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};
      
      // Contar por profissional
      const porProfissional = escalas?.reduce((acc, e) => {
        const prof = e.profissional_nome;
        acc[prof] = (acc[prof] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};
      
      // Contar por local
      const porLocal = escalas?.reduce((acc, e) => {
        const local = e.local_nome || e.unidade || "Não informado";
        acc[local] = (acc[local] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};
      
      // Calcular horas totais (apenas plantões com horários válidos)
      const horasTotais = escalas?.reduce((acc, e) => {
        // Excluir plantões com dados incompletos de horário do cálculo
        if (e.dados_incompletos) return acc;
        
        const inicio = e.hora_inicio?.split(":").map(Number) || [0, 0];
        const fim = e.hora_fim?.split(":").map(Number) || [0, 0];
        
        // Validar se horários são válidos (não 00:00 - 00:00)
        if (inicio[0] === 0 && inicio[1] === 0 && fim[0] === 0 && fim[1] === 0) {
          return acc;
        }
        
        let horas = fim[0] - inicio[0];
        if (horas < 0) horas += 24; // Plantão noturno
        return acc + horas;
      }, 0) || 0;
      
      return {
        total,
        completos,
        incompletos,
        horasTotais,
        porSetor,
        porProfissional,
        porLocal,
      };
    },
  });
}
