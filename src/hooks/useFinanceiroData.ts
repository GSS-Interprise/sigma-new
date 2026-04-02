import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface FinanceiroPagamento {
  id: string;
  profissional_nome: string;
  profissional_id_externo: string | null;
  profissional_crm: string | null;
  mes_referencia: number;
  ano_referencia: number;
  unidade: string | null;
  total_plantoes: number;
  total_horas_minutos: number;
  valor_total: number;
  status: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  observacoes: string | null;
  created_at: string;
}

export interface FinanceiroPagamentoItem {
  id: string;
  pagamento_id: string;
  escala_integrada_id: string | null;
  data_plantao: string;
  hora_inicio: string;
  hora_fim: string;
  carga_horaria_minutos: number | null;
  setor: string | null;
  local_nome: string | null;
  valor_hora: number;
  valor_total: number;
}

export interface FinanceiroConfigValor {
  id: string;
  descricao: string;
  tipo_plantao: string | null;
  setor: string | null;
  unidade_id: string | null;
  valor_hora: number;
  ativo: boolean;
}

interface Filters {
  mesReferencia?: number;
  anoReferencia?: number;
  profissional?: string;
  unidade?: string;
  status?: string;
}

export function useFinanceiroPagamentos(filters: Filters) {
  return useQuery({
    queryKey: ["financeiro-pagamentos", filters],
    queryFn: async () => {
      let query = supabase
        .from("financeiro_pagamentos")
        .select("*")
        .order("created_at", { ascending: false });

      if (filters.mesReferencia) query = query.eq("mes_referencia", filters.mesReferencia);
      if (filters.anoReferencia) query = query.eq("ano_referencia", filters.anoReferencia);
      if (filters.profissional) query = query.ilike("profissional_nome", `%${filters.profissional}%`);
      if (filters.unidade) query = query.ilike("unidade", `%${filters.unidade}%`);
      if (filters.status && filters.status !== "todos") query = query.eq("status", filters.status);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as FinanceiroPagamento[];
    },
  });
}

export function useFinanceiroPagamentoItens(pagamentoId: string | null) {
  return useQuery({
    queryKey: ["financeiro-pagamento-itens", pagamentoId],
    queryFn: async () => {
      if (!pagamentoId) return [];
      const { data, error } = await supabase
        .from("financeiro_pagamento_itens")
        .select("*")
        .eq("pagamento_id", pagamentoId)
        .order("data_plantao", { ascending: true });
      if (error) throw error;
      return (data || []) as FinanceiroPagamentoItem[];
    },
    enabled: !!pagamentoId,
  });
}

export function useFinanceiroConfigValores() {
  return useQuery({
    queryKey: ["financeiro-config-valores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financeiro_config_valores")
        .select("*")
        .eq("ativo", true)
        .order("descricao");
      if (error) throw error;
      return (data || []) as FinanceiroConfigValor[];
    },
  });
}

export function useGerarPagamentos() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      mes,
      ano,
      valorHoraPadrao,
    }: {
      mes: number;
      ano: number;
      valorHoraPadrao: number;
    }) => {
      // 1. Fetch all shifts for the given month/year
      const startDate = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const endDate =
        mes === 12
          ? `${ano + 1}-01-01`
          : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;

      const { data: escalas, error: escErr } = await supabase
        .from("escalas_integradas")
        .select("*")
        .gte("data_escala", startDate)
        .lt("data_escala", endDate)
        .eq("sistema_origem", "DR_ESCALA");

      if (escErr) throw escErr;
      if (!escalas || escalas.length === 0) {
        throw new Error("Nenhuma escala encontrada para o período selecionado.");
      }

      // 2. Fetch config valores for rate matching
      const { data: configValores } = await supabase
        .from("financeiro_config_valores")
        .select("*")
        .eq("ativo", true);

      const configs = configValores || [];

      // 3. Group shifts by profissional + unidade
      const groups: Record<
        string,
        {
          profissional_nome: string;
          profissional_id_externo: string | null;
          profissional_crm: string | null;
          unidade: string | null;
          shifts: typeof escalas;
        }
      > = {};

      for (const e of escalas) {
        const key = `${e.profissional_id_externo || e.profissional_nome}__${e.unidade || "sem_unidade"}`;
        if (!groups[key]) {
          groups[key] = {
            profissional_nome: e.profissional_nome,
            profissional_id_externo: e.profissional_id_externo,
            profissional_crm: e.profissional_crm,
            unidade: e.unidade,
            shifts: [],
          };
        }
        groups[key].shifts.push(e);
      }

      // Helper to find best matching rate
      const findRate = (setor: string | null, tipo: string | null): number => {
        // Try exact match first
        const exact = configs.find(
          (c) =>
            c.setor &&
            c.tipo_plantao &&
            c.setor.toLowerCase() === (setor || "").toLowerCase() &&
            c.tipo_plantao.toLowerCase() === (tipo || "").toLowerCase()
        );
        if (exact) return Number(exact.valor_hora);

        const bySetor = configs.find(
          (c) => c.setor && !c.tipo_plantao && c.setor.toLowerCase() === (setor || "").toLowerCase()
        );
        if (bySetor) return Number(bySetor.valor_hora);

        const byTipo = configs.find(
          (c) => !c.setor && c.tipo_plantao && c.tipo_plantao.toLowerCase() === (tipo || "").toLowerCase()
        );
        if (byTipo) return Number(byTipo.valor_hora);

        // Default
        const defaultConfig = configs.find((c) => !c.setor && !c.tipo_plantao);
        if (defaultConfig) return Number(defaultConfig.valor_hora);

        return valorHoraPadrao;
      };

      // 4. Create pagamentos
      let totalCreated = 0;
      for (const group of Object.values(groups)) {
        // Check if already exists
        const { data: existing } = await supabase
          .from("financeiro_pagamentos")
          .select("id")
          .eq("mes_referencia", mes)
          .eq("ano_referencia", ano)
          .eq("profissional_nome", group.profissional_nome)
          .maybeSingle();

        if (existing) continue;

        let totalMinutos = 0;
        let valorTotal = 0;
        const itens: Array<{
          escala_integrada_id: string;
          data_plantao: string;
          hora_inicio: string;
          hora_fim: string;
          carga_horaria_minutos: number | null;
          setor: string | null;
          local_nome: string | null;
          valor_hora: number;
          valor_total: number;
        }> = [];

        for (const shift of group.shifts) {
          const mins = shift.carga_horaria_minutos || 0;
          totalMinutos += mins;
          const rate = findRate(shift.setor, shift.tipo_plantao);
          const shiftValue = (mins / 60) * rate;
          valorTotal += shiftValue;

          itens.push({
            escala_integrada_id: shift.id,
            data_plantao: shift.data_escala,
            hora_inicio: shift.hora_inicio,
            hora_fim: shift.hora_fim,
            carga_horaria_minutos: mins,
            setor: shift.setor,
            local_nome: shift.local_nome,
            valor_hora: rate,
            valor_total: Math.round(shiftValue * 100) / 100,
          });
        }

        // Vencimento: dia 10 do mês seguinte
        const vencMes = mes === 12 ? 1 : mes + 1;
        const vencAno = mes === 12 ? ano + 1 : ano;
        const dataVencimento = `${vencAno}-${String(vencMes).padStart(2, "0")}-10`;

        const { data: pagamento, error: pagErr } = await supabase
          .from("financeiro_pagamentos")
          .insert({
            profissional_nome: group.profissional_nome,
            profissional_id_externo: group.profissional_id_externo,
            profissional_crm: group.profissional_crm,
            mes_referencia: mes,
            ano_referencia: ano,
            unidade: group.unidade,
            total_plantoes: group.shifts.length,
            total_horas_minutos: totalMinutos,
            valor_total: Math.round(valorTotal * 100) / 100,
            status: "pendente",
            data_vencimento: dataVencimento,
          })
          .select("id")
          .single();

        if (pagErr) throw pagErr;

        // Insert itens in batch
        const itensWithPagId = itens.map((i) => ({
          ...i,
          pagamento_id: pagamento.id,
        }));

        const batchSize = 100;
        for (let i = 0; i < itensWithPagId.length; i += batchSize) {
          const batch = itensWithPagId.slice(i, i + batchSize);
          const { error: itemErr } = await supabase
            .from("financeiro_pagamento_itens")
            .insert(batch);
          if (itemErr) throw itemErr;
        }

        totalCreated++;
      }

      return { totalCreated, totalEscalas: escalas.length };
    },
    onSuccess: (result) => {
      toast.success(
        `${result.totalCreated} pagamento(s) gerado(s) a partir de ${result.totalEscalas} plantão(ões).`
      );
      queryClient.invalidateQueries({ queryKey: ["financeiro-pagamentos"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao gerar pagamentos.");
    },
  });
}

export function useAtualizarStatusPagamento() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      dataPagamento,
    }: {
      id: string;
      status: string;
      dataPagamento?: string;
    }) => {
      const updateData: Record<string, unknown> = { status };
      if (dataPagamento) updateData.data_pagamento = dataPagamento;

      const { error } = await supabase
        .from("financeiro_pagamentos")
        .update(updateData)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["financeiro-pagamentos"] });
    },
    onError: () => {
      toast.error("Erro ao atualizar status.");
    },
  });
}
