import { createContext, useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Linkedin, Instagram, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { AcompanhamentoLead } from "@/hooks/useAcompanhamentoLeads";

/**
 * Fase 9.2 do plano do Maikon: o card do Kanban mostra o estado de cada canal do lead.
 * Cinza = ainda não tentado; azul = enviado; verde = respondeu; vermelho = falhou.
 * LinkedIn/Instagram só aparecem quando o perfil do médico foi achado (leads.linkedin_url / instagram_handle).
 * Os dados vêm numa consulta só para o Kanban inteiro (contexto), não uma por card.
 */

export type EstadoCanal = "nao_tentado" | "enviado" | "respondeu" | "falhou";
export type CanaisDoLead = { whatsapp: EstadoCanal; linkedin?: EstadoCanal; instagram?: EstadoCanal };

const Ctx = createContext<Map<string, CanaisDoLead> | null>(null);

function estadoWhatsapp(l: AcompanhamentoLead): EstadoCanal {
  if (["em_conversa", "quente", "convertido"].includes(l.status) || (l.last_incoming_at ?? null)) return "respondeu";
  if (["contatado", "sem_resposta", "frio", "aquecido"].includes(l.status) || l.data_primeiro_contato) return "enviado";
  if (l.status === "sem_whatsapp") return "falhou";
  return "nao_tentado";
}

const ORDEM: Record<string, EstadoCanal> = { respondido: "respondeu", feito: "enviado", falhou: "falhou" };

export function CanaisProvider({ leads, children }: { leads: AcompanhamentoLead[]; children: React.ReactNode }) {
  // Busca só quem TEM perfil e os toques de LinkedIn/Instagram (conjuntos pequenos), em vez de filtrar pelos ~7 mil
  // ids do Kanban: em lotes de 300 eram ~48 consultas em fila e a faixa demorava demais para aparecer.
  const { data } = useQuery({
    queryKey: ["kanban-canais"],
    enabled: leads.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const perfis = new Map<string, { li: boolean; ig: boolean }>();
      const toques = new Map<string, { linkedin?: EstadoCanal; instagram?: EstadoCanal }>();
      const [rPerfis, rToques] = await Promise.all([
        supabase.from("leads").select("id, linkedin_url, instagram_handle")
          .or("linkedin_url.not.is.null,instagram_handle.not.is.null").limit(5000),
        (supabase as any).from("campanha_toques").select("campanha_lead_id, canal, status")
          .in("canal", ["linkedin", "instagram"]).limit(5000),
      ]);
      if (rPerfis.error) throw rPerfis.error;
      if (rToques.error) throw rToques.error;
      for (const l of (rPerfis.data ?? []) as any[]) perfis.set(l.id, { li: !!l.linkedin_url, ig: !!l.instagram_handle });
      for (const t of (rToques.data ?? []) as any[]) {
          const est = ORDEM[t.status];
          if (!est) continue;
          const atual = toques.get(t.campanha_lead_id) ?? {};
          const anterior = atual[t.canal as "linkedin" | "instagram"];
          // respondeu > enviado > falhou
          const peso = (e?: EstadoCanal) => (e === "respondeu" ? 3 : e === "enviado" ? 2 : e === "falhou" ? 1 : 0);
          if (peso(est) > peso(anterior)) atual[t.canal as "linkedin" | "instagram"] = est;
          toques.set(t.campanha_lead_id, atual);
      }
      return { perfis, toques };
    },
  });
  const mapa = useMemo(() => {
    const m = new Map<string, CanaisDoLead>();
    for (const l of leads) {
      const p = data?.perfis.get(l.lead_id);
      const t = data?.toques.get(l.campanha_lead_id) ?? {};
      m.set(l.campanha_lead_id, {
        whatsapp: estadoWhatsapp(l),
        ...(p?.li || t.linkedin ? { linkedin: t.linkedin ?? "nao_tentado" } : {}),
        ...(p?.ig || t.instagram ? { instagram: t.instagram ?? "nao_tentado" } : {}),
      });
    }
    return m;
  }, [leads, data]);
  return <Ctx.Provider value={mapa}>{children}</Ctx.Provider>;
}

const COR: Record<EstadoCanal, string> = {
  nao_tentado: "text-muted-foreground/60 bg-muted",
  enviado: "text-sky-700 bg-sky-50",
  respondeu: "text-emerald-700 bg-emerald-50",
  falhou: "text-red-700 bg-red-50",
};
const ROTULO: Record<EstadoCanal, string> = { nao_tentado: "ainda não tentado", enviado: "enviado", respondeu: "respondeu", falhou: "falhou" };

/** Faixa com os canais do lead. Só aparece quando há mais de um canal (WhatsApp sozinho já é a coluna do Kanban). */
export function FaixaCanais({ campanhaLeadId }: { campanhaLeadId: string }) {
  const mapa = useContext(Ctx);
  const c = mapa?.get(campanhaLeadId);
  if (!c || (!c.linkedin && !c.instagram)) return null;
  const itens: Array<[string, EstadoCanal, typeof Linkedin]> = [["WhatsApp", c.whatsapp, MessageCircle]];
  if (c.linkedin) itens.push(["LinkedIn", c.linkedin, Linkedin]);
  if (c.instagram) itens.push(["Instagram", c.instagram, Instagram]);
  return (
    <div className="mb-2 flex items-center gap-1" aria-label="Canais do lead">
      {itens.map(([nome, est, Icone]) => (
        <span key={nome} title={`${nome}: ${ROTULO[est]}`} aria-label={`${nome}: ${ROTULO[est]}`}
          className={cn("inline-flex h-6 w-6 items-center justify-center rounded-md", COR[est])}>
          <Icone className="h-3.5 w-3.5" />
        </span>
      ))}
    </div>
  );
}
