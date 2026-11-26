// Sequência de avisos do SLA (21/11): abas Avisos (destino "plantonista") e Coordenação (destino "contato").
// Tabela sla_aviso_passos; o motor (sla-alertas, _shared/slaEscada.ts passosAgora) dispara cada passo uma vez por exame
// enquanto ninguém assumiu. minutos é relativo ao vencimento do laudo: negativo = antes, positivo = depois.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabelas do SLA fora dos tipos gerados (ver useSla.ts)
const db = supabase as any;

export type Canal = "whatsapp" | "ligacao" | "email";
export type PapelContato = "coordenacao" | "equipe" | "diretoria";
export type Passo = {
  id?: string;
  destino: "plantonista" | "contato";
  minutos: number;
  canal: Canal;
  ativo: boolean;
  contato_nome?: string | null;
  contato_papel?: PapelContato | null;
  contato_telefone?: string | null;
  contato_email?: string | null;
  periodo?: Periodo | null;
};
// Quando o contato recebe (Wagner, 26/11): comercial = seg a sex, 7h às 19h de Brasília; fora = o resto.
// Mesma regra do motor: noPeriodo em supabase/functions/_shared/slaEscada.ts.
export type Periodo = "sempre" | "comercial" | "fora";
export const PERIODO: Record<Periodo, string> = { sempre: "A qualquer hora", comercial: "Seg a sex, 7h às 19h", fora: "Noites e fins de semana" };

export const CANAL: Record<Canal, string> = { whatsapp: "WhatsApp", ligacao: "Ligação", email: "E-mail" };
export const PAPEL_CONTATO: Record<PapelContato, string> = { coordenacao: "Coordenação", equipe: "Equipe", diretoria: "Diretoria" };
// O motor não avisa exame vencido há mais de 120 min (trava de 16/11); antes do prazo, até 48 h.
export const MAX_DEPOIS = 120;
export const MAX_ANTES = 2880;

export function quando(min: number) {
  if (min === 0) return "no vencimento";
  const a = Math.abs(min);
  const t = a >= 60 && a % 60 === 0 ? `${a / 60} h` : a >= 60 ? `${Math.floor(a / 60)} h ${a % 60} min` : `${a} min`;
  return min < 0 ? `${t} antes do prazo` : `${t} depois do prazo`;
}

export function usePassos() {
  return useQuery({
    queryKey: ["sla-avisos"],
    queryFn: async () => {
      const { data, error } = await db.rpc("sla_avisos");
      if (error) throw error;
      return (data ?? []) as Passo[];
    },
  });
}

export function useSalvarPassos(destino: Passo["destino"], ok: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (passos: Passo[]) => {
      // Ordem pelo tempo: o 1º aviso é sempre o que sai primeiro.
      const lista = [...passos].sort((a, b) => a.minutos - b.minutos).map((p) => ({ ...p, destino }));
      const { error } = await db.rpc("sla_avisos_salvar", { p_destino: destino, p_passos: lista });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(ok); qc.invalidateQueries({ queryKey: ["sla-avisos"] }); },
    onError: (e) => toast.error(`Não salvou: ${(e as Error).message}`),
  });
}
