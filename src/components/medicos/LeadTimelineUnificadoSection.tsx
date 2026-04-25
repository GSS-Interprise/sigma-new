import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare, Mail, Bot, User, Settings, Phone, Smartphone,
  AlertTriangle, CheckCircle2, Flame, Send, Ban
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  leadId: string;
  limit?: number;
}

interface TimelineRow {
  lead_id: string;
  ts: string;
  origem: "historico" | "campanha_ia" | "conversa_manual";
  tipo: string;
  operador: "sistema" | "ia" | "humano" | "lead";
  canal: string | null;
  conteudo: string;
  metadados: Record<string, any> | null;
}

type Filtro = "tudo" | "mensagens" | "eventos";

function isMensagem(ev: TimelineRow): boolean {
  return ev.origem === "campanha_ia" || ev.origem === "conversa_manual";
}

export function LeadTimelineUnificadoSection({ leadId, limit = 200 }: Props) {
  const [filtro, setFiltro] = useState<Filtro>("tudo");

  const { data: eventos = [], isLoading } = useQuery({
    queryKey: ["lead-timeline-unificado", leadId, limit],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_lead_timeline")
        .select("*")
        .eq("lead_id", leadId)
        .order("ts", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as TimelineRow[];
    },
  });

  const counts = useMemo(() => {
    const msgs = eventos.filter(isMensagem).length;
    return { tudo: eventos.length, mensagens: msgs, eventos: eventos.length - msgs };
  }, [eventos]);

  const eventosFiltrados = useMemo(() => {
    if (filtro === "mensagens") return eventos.filter(isMensagem);
    if (filtro === "eventos") return eventos.filter((e) => !isMensagem(e));
    return eventos;
  }, [eventos, filtro]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  if (eventos.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        Nenhum evento registrado para este lead ainda.
      </div>
    );
  }

  // Agrupa por dia
  const grupos = new Map<string, TimelineRow[]>();
  for (const ev of eventosFiltrados) {
    const dia = ev.ts.slice(0, 10);
    if (!grupos.has(dia)) grupos.set(dia, []);
    grupos.get(dia)!.push(ev);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <FiltroChip ativo={filtro === "tudo"} onClick={() => setFiltro("tudo")}>
          Tudo <span className="opacity-60 ml-1">{counts.tudo}</span>
        </FiltroChip>
        <FiltroChip ativo={filtro === "mensagens"} onClick={() => setFiltro("mensagens")}>
          Mensagens <span className="opacity-60 ml-1">{counts.mensagens}</span>
        </FiltroChip>
        <FiltroChip ativo={filtro === "eventos"} onClick={() => setFiltro("eventos")}>
          Eventos <span className="opacity-60 ml-1">{counts.eventos}</span>
        </FiltroChip>
      </div>

      {eventosFiltrados.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-6">
          Nenhum item nesse filtro.
        </div>
      ) : (
        <ScrollArea className="max-h-[600px] pr-2">
          <div className="space-y-5">
            {Array.from(grupos.entries()).map(([dia, evs]) => (
              <div key={dia}>
                <div className="text-xs font-medium text-muted-foreground mb-2 sticky top-0 bg-background py-1 z-10">
                  {formatDia(dia)} · {evs.length} {evs.length === 1 ? "item" : "itens"}
                </div>
                <div className="space-y-2">
                  {evs.map((ev, idx) => (
                    <EventoCard key={`${ev.ts}-${idx}`} ev={ev} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function FiltroChip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
        ativo
          ? "bg-foreground text-background border-foreground"
          : "bg-background text-foreground border-border hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function EventoCard({ ev }: { ev: TimelineRow }) {
  const { Icon, color, bg, label } = getVisual(ev);
  const hora = format(new Date(ev.ts), "HH:mm", { locale: ptBR });
  const conteudoCurto = (ev.conteudo || "").slice(0, 300);

  return (
    <div className={`flex gap-3 p-2 rounded border ${bg} hover:bg-opacity-80 transition-colors`}>
      <div className={`shrink-0 mt-0.5 ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap text-xs mb-0.5">
          <span className="font-medium">{label}</span>
          {ev.canal && (
            <Badge variant="outline" className="text-xs py-0 px-1.5 h-5">
              {ev.canal}
            </Badge>
          )}
          <span className="text-muted-foreground">{hora}</span>
          {ev.metadados?.campanha_id && (
            <span className="text-muted-foreground text-xs truncate max-w-[200px]">
              campanha: {String(ev.metadados.campanha_id).slice(0, 8)}
            </span>
          )}
        </div>
        <div className="text-sm break-words whitespace-pre-wrap">
          {conteudoCurto}
          {(ev.conteudo || "").length > 300 && "…"}
        </div>
      </div>
    </div>
  );
}

function formatDia(dia: string): string {
  try {
    return format(new Date(dia + "T12:00:00"), "PPPP", { locale: ptBR });
  } catch {
    return dia;
  }
}

function getVisual(ev: TimelineRow) {
  // IA em campanha
  if (ev.origem === "campanha_ia" && ev.operador === "ia") {
    return { Icon: Bot, color: "text-indigo-600", bg: "bg-indigo-50/50 border-indigo-100", label: "IA (GSS)" };
  }
  if (ev.origem === "campanha_ia" && ev.operador === "lead") {
    return { Icon: MessageSquare, color: "text-emerald-600", bg: "bg-emerald-50/50 border-emerald-100", label: "Médico respondeu (campanha)" };
  }

  // Conversa manual
  if (ev.origem === "conversa_manual" && ev.operador === "humano") {
    return { Icon: User, color: "text-blue-600", bg: "bg-blue-50/50 border-blue-100", label: "Operador (manual)" };
  }
  if (ev.origem === "conversa_manual" && ev.operador === "lead") {
    return { Icon: MessageSquare, color: "text-emerald-700", bg: "bg-emerald-50/50 border-emerald-100", label: "Médico respondeu (manual)" };
  }

  // Sistema (lead_historico)
  const tipo = ev.tipo || "";
  if (tipo === "campanha_disparo") return { Icon: Send, color: "text-blue-700", bg: "bg-blue-50/30 border-blue-100", label: "Disparo enviado" };
  if (tipo === "email_enviado") return { Icon: Mail, color: "text-violet-600", bg: "bg-violet-50/50 border-violet-100", label: "Email enviado" };
  if (tipo === "email_falhou") return { Icon: Mail, color: "text-red-600", bg: "bg-red-50/50 border-red-100", label: "Email FALHOU" };
  if (tipo === "opt_out_lgpd") return { Icon: Ban, color: "text-red-600", bg: "bg-red-50/50 border-red-100", label: "Opt-out LGPD" };
  if (tipo === "classificacao_alterada") return { Icon: Settings, color: "text-amber-600", bg: "bg-amber-50/50 border-amber-100", label: "Classificação alterada" };
  if (tipo === "cooldown_alterado") return { Icon: Settings, color: "text-amber-600", bg: "bg-amber-50/50 border-amber-100", label: "Cooldown alterado" };
  if (tipo === "perfil_extraido") return { Icon: Bot, color: "text-indigo-700", bg: "bg-indigo-50/30 border-indigo-100", label: "Perfil IA extraído" };
  if (tipo === "contato_vinculado") return { Icon: Phone, color: "text-green-700", bg: "bg-green-50/50 border-green-100", label: "Contato vinculado" };

  // Fallback
  return { Icon: Settings, color: "text-muted-foreground", bg: "bg-muted/30 border-muted", label: tipo || "Sistema" };
}
