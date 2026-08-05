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
  // Módulo Financeiro (fluxo novo)
  medico_id?: string | null;
  setor?: string | null;
  fonte?: string | null;
  conferido_por?: string | null;
  conferido_em?: string | null;
  nf_status?: string | null;
  nf_solicitada_em?: string | null;
  aprovado_por?: string | null;
  aprovado_em?: string | null;
  comprovante_status?: string | null;
  // E1/E2 — valor_total é derivado: produzido - à vista + ajustes
  valor_produzido?: number;
  valor_a_vista?: number;
  valor_ajustes?: number;
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
  tipo?: string | null;
  pago_a_vista?: boolean;
}

export interface FinanceiroAjusteCategoria {
  id: string;
  nome: string;
  sinal: "mais" | "menos" | "ambos";
  ativo: boolean;
}

export interface FinanceiroAjuste {
  id: string;
  pagamento_id: string;
  categoria_id: string;
  valor: number;
  justificativa: string;
  criado_por: string | null;
  created_at: string;
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

// ── E2: ajustes por categoria (valores a mais/a menos no fechamento do médico) ──

export function useFinanceiroAjusteCategorias() {
  return useQuery({
    queryKey: ["financeiro-ajuste-categorias"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("financeiro_ajuste_categorias")
        .select("id, nome, sinal, ativo")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data || []) as FinanceiroAjusteCategoria[];
    },
  });
}

export function useCriarAjusteCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ nome, sinal }: { nome: string; sinal: string }) => {
      const { data, error } = await (supabase as any)
        .from("financeiro_ajuste_categorias")
        .insert({ nome: nome.trim(), sinal })
        .select("id, nome, sinal, ativo")
        .single();
      if (error) throw error;
      return data as FinanceiroAjusteCategoria;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financeiro-ajuste-categorias"] });
      toast.success("Categoria criada.");
    },
    onError: (e: any) =>
      toast.error(e?.code === "23505" ? "Já existe uma categoria com esse nome." : "Erro ao criar categoria: " + e.message),
  });
}

export function useFinanceiroAjustes(pagamentoId: string | null) {
  return useQuery({
    queryKey: ["financeiro-ajustes", pagamentoId],
    queryFn: async () => {
      if (!pagamentoId) return [];
      const { data, error } = await (supabase as any)
        .from("financeiro_pagamento_ajustes")
        .select("*")
        .eq("pagamento_id", pagamentoId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as FinanceiroAjuste[];
    },
    enabled: !!pagamentoId,
  });
}

// O trigger no banco recalcula valor_ajustes/valor_total, então toda mutação
// precisa invalidar também a lista de pagamentos.
export function useSalvarAjuste() {
  const qc = useQueryClient();
  const invalidar = (pagamentoId: string) => {
    qc.invalidateQueries({ queryKey: ["financeiro-ajustes", pagamentoId] });
    qc.invalidateQueries({ queryKey: ["financeiro-pagamentos"] });
  };
  return useMutation({
    mutationFn: async (a: { id?: string; pagamento_id: string; categoria_id: string; valor: number; justificativa: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        pagamento_id: a.pagamento_id, categoria_id: a.categoria_id,
        valor: a.valor, justificativa: a.justificativa.trim(),
      };
      const { error } = a.id
        ? await (supabase as any).from("financeiro_pagamento_ajustes").update(payload).eq("id", a.id)
        : await (supabase as any).from("financeiro_pagamento_ajustes").insert({ ...payload, criado_por: u.user?.id });
      if (error) throw error;
      return a.pagamento_id;
    },
    onSuccess: (pagamentoId) => { invalidar(pagamentoId); toast.success("Ajuste salvo."); },
    onError: (e: any) => toast.error("Erro ao salvar ajuste: " + e.message),
  });
}

export function useRemoverAjuste() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pagamento_id }: { id: string; pagamento_id: string }) => {
      const { error } = await (supabase as any).from("financeiro_pagamento_ajustes").delete().eq("id", id);
      if (error) throw error;
      return pagamento_id;
    },
    onSuccess: (pagamentoId) => {
      qc.invalidateQueries({ queryKey: ["financeiro-ajustes", pagamentoId] });
      qc.invalidateQueries({ queryKey: ["financeiro-pagamentos"] });
      toast.success("Ajuste removido.");
    },
    onError: (e: any) => toast.error("Erro ao remover ajuste: " + e.message),
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

// T08 — contas a receber (a partir dos contratos)
export interface FinanceiroReceber {
  id: string;
  contrato_id: string | null;
  cliente_id: string | null;
  mes_referencia: number;
  ano_referencia: number;
  descricao: string | null;
  condicao_pagamento: string | null;
  valor_previsto: number;
  valor_faturado: number | null;
  valor_contrato_total: number | null;
  prazo_meses: number | null;
  regra_rateio: string | null;
  status: string;
  nf_saida_status: string;
  data_prevista: string | null;
  observacoes: string | null;
}

export function useFinanceiroReceber(mes: number, ano: number) {
  return useQuery({
    queryKey: ["financeiro-receber", mes, ano],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("financeiro_receber").select("*")
        .eq("mes_referencia", mes).eq("ano_referencia", ano)
        .order("valor_previsto", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FinanceiroReceber[];
    },
    enabled: !!mes && !!ano,
  });
}

export function useSyncFinanceiroReceber() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ mes, ano }: { mes: number; ano: number }) => {
      const { data, error } = await (supabase as any).rpc("sync_financeiro_receber", { p_mes: mes, p_ano: ano });
      if (error) throw error;
      return data as { inseridos: number; competencia: string };
    },
    onSuccess: (d, v) => {
      toast.success(`Sincronizado: ${d?.inseridos ?? 0} novos contratos a faturar em ${d?.competencia ?? ""}.`);
      queryClient.invalidateQueries({ queryKey: ["financeiro-receber", v.mes, v.ano] });
    },
    onError: (e: any) => toast.error("Erro ao sincronizar: " + (e?.message || "")),
  });
}

// T08 (fluxo) — atualiza uma conta a receber: status (a_faturar→faturado→recebido),
// valor faturado (real), NF de saída emitida, valor previsto editado, observações.
export type ReceberPatch = Partial<
  Pick<FinanceiroReceber, "status" | "valor_faturado" | "valor_previsto" | "nf_saida_status" | "observacoes" | "regra_rateio">
>;

export function useAtualizarReceber() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ReceberPatch }) => {
      const { error } = await (supabase as any)
        .from("financeiro_receber")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta a receber atualizada.");
      queryClient.invalidateQueries({ queryKey: ["financeiro-receber"] });
    },
    onError: (e: any) => toast.error("Erro ao atualizar: " + (e?.message || "")),
  });
}

// T05 — posta o lançamento conferido num canal "Financeiro" da Comunicação (tipo
// Slack), pros sócios (Diretoria) aprovarem. Canal configurado em config_lista_items
// (campo_nome='financeiro_canal_id'). Silencioso se o canal não estiver configurado.
async function postarNoCanalFinanceiro(pagamento: FinanceiroPagamento) {
  const { data: cfg } = await (supabase as any)
    .from("config_lista_items").select("valor").eq("campo_nome", "financeiro_canal_id").maybeSingle();
  const canalId = cfg?.valor as string | undefined;
  if (!canalId) return { posted: false };

  const { data: uRes } = await supabase.auth.getUser();
  const uid = uRes?.user?.id;
  const nome = (uRes?.user?.user_metadata as any)?.nome_completo || (uRes?.user?.user_metadata as any)?.nome || "Financeiro";
  const valor = Number(pagamento.valor_total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const msg = `💰 *Lançamento para aprovação*\n${pagamento.profissional_nome}${pagamento.profissional_crm ? ` (${pagamento.profissional_crm})` : ""}\nValor: *${valor}*\nCompetência: ${String(pagamento.mes_referencia).padStart(2, "0")}/${pagamento.ano_referencia}${pagamento.unidade ? ` · ${pagamento.unidade}` : ""}\nConferido pelo financeiro — aguardando aprovação.`;

  const { data: m, error } = await (supabase as any)
    .from("comunicacao_mensagens")
    .insert({ canal_id: canalId, user_id: uid, user_nome: nome, mensagem: msg })
    .select("id").single();
  if (error || !m) return { posted: false };

  const { data: parts } = await (supabase as any)
    .from("comunicacao_participantes").select("user_id").eq("canal_id", canalId);
  const notifs = (parts ?? []).filter((p: any) => p.user_id !== uid).map((p: any) => ({ user_id: p.user_id, canal_id: canalId, mensagem_id: m.id }));
  if (notifs.length) await (supabase as any).from("comunicacao_notificacoes").insert(notifs);
  return { posted: true };
}

// T04 — conferência do financeiro (Mavi): marca conferido + posta no canal Financeiro (T05).
export function useConferirPagamento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pagamento }: { pagamento: FinanceiroPagamento }) => {
      const { data: uRes } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("financeiro_pagamentos")
        .update({ conferido_por: uRes?.user?.id ?? null, conferido_em: new Date().toISOString() })
        .eq("id", pagamento.id);
      if (error) throw error;
      const r = await postarNoCanalFinanceiro(pagamento);
      return r;
    },
    onSuccess: (r) => {
      toast.success(r?.posted ? "Conferido e enviado ao canal Financeiro." : "Conferido. (Canal Financeiro não configurado — configure em config_lista_items.financeiro_canal_id)");
      queryClient.invalidateQueries({ queryKey: ["financeiro-pagamentos"] });
    },
    onError: (e: any) => toast.error("Erro ao conferir: " + (e?.message || "")),
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
        .update(updateData as any)
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
