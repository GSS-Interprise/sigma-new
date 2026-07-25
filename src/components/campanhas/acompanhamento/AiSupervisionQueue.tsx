import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bot, ChevronDown, ChevronUp, CircleAlert, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface QueueItem {
  campanha_lead_id: string;
  lead_nome: string;
  campanha_nome: string;
  data_ultimo_contato: string | null;
  supervision_reason:
    | "aguarda_resposta_humana"
    | "interessado_sem_responsavel"
    | "interessado_sem_proximo_passo"
    | "conversa_sem_proximo_passo"
    | "revisao_necessaria";
  priority: number;
}

const REASON_LABEL: Record<QueueItem["supervision_reason"], string> = {
  aguarda_resposta_humana: "IA aguarda resposta humana",
  interessado_sem_responsavel: "Interessado sem responsável",
  interessado_sem_proximo_passo: "Interessado sem próximo passo",
  conversa_sem_proximo_passo: "Conversa sem próximo passo",
  revisao_necessaria: "Revisão necessária",
};

export function AiSupervisionQueue({
  onOpenLead,
}: {
  onOpenLead: (campanhaLeadId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["ai-supervision-queue"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_ai_supervision_queue" as never)
        .select("campanha_lead_id, lead_nome, campanha_nome, data_ultimo_contato, supervision_reason, priority")
        .order("priority", { ascending: false })
        .order("data_ultimo_contato", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as QueueItem[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center rounded-lg border p-3 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Auditando conversas da IA...
      </div>
    );
  }
  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, 5);
  return (
    <section className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-violet-900">
            <Bot className="h-4 w-4" />
            Supervisão da IA
            <Badge variant="outline" className="border-violet-300 bg-white">
              {items.length}
            </Badge>
          </h3>
          <p className="mt-1 text-xs text-violet-800/80">
            Conversas que precisam de responsável, resposta ou próximo passo.
          </p>
        </div>
        {items.length > 5 && (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-full text-violet-800 sm:w-auto"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
            {expanded ? "Recolher" : `Ver todas (${items.length})`}
          </Button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
        {visible.map((item) => (
          <button
            key={item.campanha_lead_id}
            type="button"
            className="min-h-14 rounded-md border bg-background p-3 text-left transition-colors hover:bg-muted"
            onClick={() => onOpenLead(item.campanha_lead_id)}
          >
            <div className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.lead_nome}</p>
                <p className="truncate text-xs text-muted-foreground">{item.campanha_nome}</p>
                <p className="mt-1 text-xs font-medium text-violet-800">
                  {REASON_LABEL[item.supervision_reason]}
                  {item.data_ultimo_contato && (
                    <span className="font-normal text-muted-foreground">
                      {" "}· {formatDistanceToNow(new Date(item.data_ultimo_contato), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
