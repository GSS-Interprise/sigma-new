import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Dados do Raio-X do mercado (Fase 7). RPCs em supabase/migrations/20261109120000_bi_raiox.sql.

export type Funil = {
  mercado_brasil: number; mercado_regiao: number | null; base_crm: number;
  alcancados: number; alcancados_whatsapp: number; alcancados_email: number;
  responderam: number; interessados: number; contratados: number;
  campanhas: number; desde: string | null; classificadas: number; cfm_atualizado_em: string | null;
};
export type Objecoes = {
  classificadas: number; com_motivo: number;
  objecoes: { objecao: string; n: number; pct: number; trecho: string | null }[];
  outros: Record<string, number>;
  valores: { unidade: string; n: number; mediana: number }[];
};
export type Destrava = {
  regras: ({ regra: "distancia" | "agenda"; pct: number; nao_abordados_na_regiao?: number }
    | { regra: "valor"; n: number; mediana: number; unidade: string; oferta_atual: number | null }
    | { regra: "indicacao"; n: number })[];
  nao_abordados_na_regiao: number; classificadas: number;
};
export type Gestao = {
  esperando_resposta: number;
  esperando: { conversation_id: string; ultima_do_medico: string; nome: string; campanha: string | null }[];
  mediana_primeira_resposta_min: number | null; sem_resposta_nossa: number;
  por_campanha: { id: string; nome: string; alcancados: number; responderam: number; falharam: number;
    interessados: number; convertidos: number; resposta_min: number | null }[];
};

// bi_raiox_esforco (20261113200000): série por semana (segunda-feira, horário de Brasília) e por canal.
export type SemanaEsforco = {
  semana: string; whatsapp_medicos: number; whatsapp_mensagens: number; email: number; linkedin: number; instagram: number;
};
export type Esforco = {
  semanas: SemanaEsforco[];
  totais: { whatsapp_medicos: number; whatsapp_mensagens: number; email: number; linkedin: number; instagram: number };
  desde: string | null;
};

// campanhaId (26/11): null = todas; ZENVIA_RAIOX = tudo o que saiu pela Zenvia (no Raio-X a Zenvia é uma campanha só).
export type FiltroRaioX = { especialidadeId: string; uf: string | null; desde: string | null; campanhaId?: string | null };
export const ZENVIA_RAIOX = "4f43ab5a-ba5b-d453-dc18-45e4a9177c54"; // md5('zenvia')::uuid, ver _raiox_contatos

function useRpc<T>(nome: string, f: FiltroRaioX, enabled = true) {
  return useQuery({
    queryKey: ["raiox", nome, f.especialidadeId, f.uf, f.desde, f.campanhaId ?? null],
    enabled: enabled && !!f.especialidadeId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(nome, {
        p_especialidade_ids: [f.especialidadeId], p_ufs: f.uf ? [f.uf] : null, p_desde: f.desde,
        p_campanha_ids: f.campanhaId ? [f.campanhaId] : null,
      });
      if (error) throw error;
      return data as T;
    },
  });
}

export const useRaioXFunil = (f: FiltroRaioX) => useRpc<Funil>("bi_raiox_funil", f);
export const useRaioXObjecoes = (f: FiltroRaioX) => useRpc<Objecoes>("bi_raiox_objecoes", f);
export const useRaioXDestrava = (f: FiltroRaioX) => useRpc<Destrava>("bi_raiox_destrava", f);
export const useRaioXEsforco = (f: FiltroRaioX, enabled: boolean) => useRpc<Esforco>("bi_raiox_esforco", f, enabled);
export const useRaioXGestao =(f: FiltroRaioX, enabled: boolean) => useRpc<Gestao>("bi_raiox_gestao", f, enabled);

export const mil = (n: number | null | undefined) => (n ?? 0).toLocaleString("pt-BR");
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
