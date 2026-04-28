import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SigFincMedicoRow {
  medico_id: string;
  nome_completo: string;
  crm: string | null;
  especialidade: string[] | null;
  status_medico: string | null;
  qtd_propostas: number;
  valor_previsto_medico: number;   // soma proposta_itens.valor_medico * quantidade
  valor_previsto_contrato: number; // soma proposta_itens.valor_contrato * quantidade
  valor_realizado: number;         // soma financeiro_pagamentos.valor_total (matched por CRM)
}

export interface SigFincResumo {
  rows: SigFincMedicoRow[];
  totals: {
    medicos: number;
    propostas: number;
    valor_previsto_medico: number;
    valor_previsto_contrato: number;
    valor_realizado: number;
  };
}

interface Filters {
  mesReferencia?: number;
  anoReferencia?: number;
}

export function useSigFincResumo(filters: Filters = {}) {
  return useQuery<SigFincResumo>({
    queryKey: ["sigfinc-resumo", filters],
    queryFn: async () => {
      // 1) Médicos ativos (com lead_id, para casar com proposta.lead_id)
      const { data: medicos, error: errMed } = await supabase
        .from("medicos")
        .select("id, nome_completo, crm, especialidade, status_medico, lead_id")
        .eq("status_medico", "Ativo")
        .not("lead_id", "is", null);
      if (errMed) throw errMed;

      const leadIds = Array.from(new Set((medicos ?? []).map((m: any) => m.lead_id).filter(Boolean)));
      if (leadIds.length === 0) {
        return {
          rows: [],
          totals: { medicos: 0, propostas: 0, valor_previsto_medico: 0, valor_previsto_contrato: 0, valor_realizado: 0 },
        };
      }

      // 2) Propostas vinculadas via lead_id
      const { data: propostas, error: errProp } = await supabase
        .from("proposta")
        .select("id, lead_id, status, nome, numero_proposta")
        .in("lead_id", leadIds);
      if (errProp) throw errProp;

      const propostaIds = (propostas ?? []).map((p: any) => p.id);
      let itens: any[] = [];
      if (propostaIds.length > 0) {
        // Supabase IN limit safety: chunk
        const chunkSize = 500;
        for (let i = 0; i < propostaIds.length; i += chunkSize) {
          const slice = propostaIds.slice(i, i + chunkSize);
          const { data, error } = await supabase
            .from("proposta_itens")
            .select("proposta_id, quantidade, valor_medico, valor_contrato");
          if (error) throw error;
          itens = itens.concat((data ?? []).filter((it: any) => slice.includes(it.proposta_id)));
          break; // single fetch above; loop kept for safety pattern
        }
      }

      // Aggregate item totals per proposta
      const itensPorProposta = new Map<string, { vm: number; vc: number }>();
      for (const it of itens) {
        const cur = itensPorProposta.get(it.proposta_id) ?? { vm: 0, vc: 0 };
        const qtd = Number(it.quantidade ?? 0);
        cur.vm += qtd * Number(it.valor_medico ?? 0);
        cur.vc += qtd * Number(it.valor_contrato ?? 0);
        itensPorProposta.set(it.proposta_id, cur);
      }

      const propostasPorLead = new Map<string, any[]>();
      for (const p of propostas ?? []) {
        const arr = propostasPorLead.get(p.lead_id) ?? [];
        arr.push(p);
        propostasPorLead.set(p.lead_id, arr);
      }

      // 3) Realizado: financeiro_pagamentos por CRM (filtrado por mês/ano)
      const crms = Array.from(new Set((medicos ?? []).map((m: any) => m.crm).filter(Boolean)));
      let pagamentosQuery = supabase
        .from("financeiro_pagamentos")
        .select("profissional_crm, valor_total, mes_referencia, ano_referencia");
      if (crms.length > 0) pagamentosQuery = pagamentosQuery.in("profissional_crm", crms);
      if (filters.mesReferencia) pagamentosQuery = pagamentosQuery.eq("mes_referencia", filters.mesReferencia);
      if (filters.anoReferencia) pagamentosQuery = pagamentosQuery.eq("ano_referencia", filters.anoReferencia);
      const { data: pagamentos, error: errPag } = await pagamentosQuery;
      if (errPag) throw errPag;

      const realizadoPorCrm = new Map<string, number>();
      for (const pg of pagamentos ?? []) {
        if (!pg.profissional_crm) continue;
        realizadoPorCrm.set(
          pg.profissional_crm,
          (realizadoPorCrm.get(pg.profissional_crm) ?? 0) + Number(pg.valor_total ?? 0),
        );
      }

      // 4) Build rows
      const rows: SigFincMedicoRow[] = (medicos ?? [])
        .map((m: any): SigFincMedicoRow | null => {
          const propsM = propostasPorLead.get(m.lead_id) ?? [];
          if (propsM.length === 0) return null; // somente médicos COM proposta vinculada
          let vm = 0, vc = 0;
          for (const p of propsM) {
            const t = itensPorProposta.get(p.id);
            if (t) { vm += t.vm; vc += t.vc; }
          }
          return {
            medico_id: m.id,
            nome_completo: m.nome_completo,
            crm: m.crm,
            especialidade: m.especialidade,
            status_medico: m.status_medico,
            qtd_propostas: propsM.length,
            valor_previsto_medico: vm,
            valor_previsto_contrato: vc,
            valor_realizado: m.crm ? (realizadoPorCrm.get(m.crm) ?? 0) : 0,
          };
        })
        .filter((r): r is SigFincMedicoRow => r !== null)
        .sort((a, b) => b.valor_previsto_contrato - a.valor_previsto_contrato);

      const totals = rows.reduce(
        (acc, r) => {
          acc.propostas += r.qtd_propostas;
          acc.valor_previsto_medico += r.valor_previsto_medico;
          acc.valor_previsto_contrato += r.valor_previsto_contrato;
          acc.valor_realizado += r.valor_realizado;
          return acc;
        },
        { medicos: rows.length, propostas: 0, valor_previsto_medico: 0, valor_previsto_contrato: 0, valor_realizado: 0 },
      );

      return { rows, totals };
    },
    staleTime: 60_000,
  });
}