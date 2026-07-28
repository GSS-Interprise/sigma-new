import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Bot, Flame, MessageCircle, MessageSquare, MapPin, Stethoscope, Clock, Layers, Tag, DollarSign, Sparkles, UserCheck, Target } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { AcompanhamentoLead } from "@/hooks/useAcompanhamentoLeads";
import { CardActionsMenu } from "@/components/demandas/CardActionsMenu";

interface Props {
  lead: AcompanhamentoLead;
  /** Lista das campanhas onde o lead também está (incluindo a atual). F2.7 */
  crossCampanhas?: Array<{ id: string; nome: string }>;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  /** Bloco C — bulk actions: estado de seleção e callback de toggle. Quando undefined, sem checkbox. */
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function AcompanhamentoCard({
  lead,
  crossCampanhas,
  onClick,
  onDragStart,
  onDragEnd,
  selected,
  onToggleSelect,
}: Props) {
  const idade = lead.data_status
    ? formatDistanceToNow(new Date(lead.data_status), { addSuffix: false, locale: ptBR })
    : null;

  const semDono = !lead.assumido_por;
  const atendimentoHumano = lead.humano_assumiu === true;
  const campanhaManual = lead.tipo_envio === "manual";
  const iniciaisDono = lead.assumido_por_nome
    ? lead.assumido_por_nome.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()
    : "";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        // Se clicou no checkbox, deixa o handler do checkbox cuidar
        if ((e.target as HTMLElement).closest('[data-bulk-checkbox]')) return;
        onClick();
      }}
      className={`group relative bg-card border rounded-md p-3 cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all ${
        semDono && lead.etapa_acompanhamento === "quente" ? "border-l-4 border-l-red-500" : ""
      } ${selected ? "ring-2 ring-primary border-primary" : ""}`}
    >
      {lead.unread_messages > 0 && (
        <div
          className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center gap-1 rounded-full border-2 border-background bg-emerald-600 px-1.5 text-[10px] font-bold text-white shadow-sm"
          aria-label={`${lead.unread_messages} mensagem(ns) nova(s) do lead`}
          title={`${lead.unread_messages} mensagem(ns) nova(s) do lead`}
        >
          <MessageCircle className="h-3 w-3" aria-hidden="true" />
          {lead.unread_messages > 9 ? "9+" : lead.unread_messages}
        </div>
      )}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        {/* Bloco C — checkbox de seleção (aparece on hover OU quando algum tá selecionado) */}
        {onToggleSelect !== undefined && (
          <div
            data-bulk-checkbox
            className={`shrink-0 transition-opacity ${
              selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
          >
            <Checkbox
              checked={selected ?? false}
              onCheckedChange={() => onToggleSelect()}
              aria-label={`Selecionar ${lead.lead_nome}`}
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium leading-tight truncate">{lead.lead_nome}</h4>
          {lead.lead_especialidade && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
              <Stethoscope className="h-3 w-3 shrink-0" />
              {lead.lead_especialidade}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {semDono && lead.etapa_acompanhamento === "quente" && (
            <Flame className="h-4 w-4 text-red-500" />
          )}
          <CardActionsMenu
            tipo="lead"
            recursoId={lead.lead_id}
            label={`${lead.lead_nome}${lead.lead_especialidade ? " — " + lead.lead_especialidade : ""}`}
          />
        </div>
      </div>

      {(lead.lead_cidade || lead.lead_uf) && (
        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
          <MapPin className="h-3 w-3" />
          {[lead.lead_cidade, lead.lead_uf].filter(Boolean).join("/")}
        </p>
      )}

      <div className="flex items-center gap-1.5 mb-2">
        <p className="text-[11px] text-muted-foreground truncate flex-1" title={lead.campanha_nome}>
          {lead.campanha_nome}
        </p>
        {crossCampanhas && crossCampanhas.length > 1 && (
          <Badge
            variant="outline"
            className="text-[10px] h-4 px-1 gap-0.5 shrink-0 border-indigo-200 bg-indigo-50 text-indigo-700"
            title={`Este lead também está em: ${crossCampanhas
              .filter((c) => c.nome !== lead.campanha_nome)
              .map((c) => c.nome)
              .join(", ")}`}
          >
            <Layers className="h-2.5 w-2.5" />
            {crossCampanhas.length}
          </Badge>
        )}
      </div>

      {lead.strategy_name && (
        <Badge
          variant="outline"
          className="mb-2 max-w-full gap-1 border-violet-200 bg-violet-50 text-[10px] text-violet-700"
          title={`Estratégia da campanha: ${lead.strategy_name}`}
        >
          <Target className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">Estratégia: {lead.strategy_name}</span>
        </Badge>
      )}

      {/* A2 — tags de insight do perfil IA (banco_interesse_leads) */}
      <div className="mb-2">
        {atendimentoHumano ? (
          <Badge
            variant="outline"
            className="max-w-full gap-1 border-blue-200 bg-blue-50 text-blue-700"
            title={`IA pausada. Atendimento humano${lead.assumido_por_nome ? ` por ${lead.assumido_por_nome}` : ""}.`}
          >
            <UserCheck className="h-3 w-3 shrink-0" />
            <span className="truncate">Atendimento humano{lead.assumido_por_nome ? ` · ${lead.assumido_por_nome}` : ""}</span>
          </Badge>
        ) : campanhaManual ? (
          <Badge variant="outline" className="gap-1 border-slate-200 bg-slate-50 text-slate-600">
            <UserCheck className="h-3 w-3" /> Equipe conduz
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="gap-1 border-cyan-200 bg-cyan-50 text-cyan-700"
            title="A IA está habilitada para responder este lead."
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" aria-hidden="true" />
            <Bot className="h-3 w-3" /> IA atuando
          </Badge>
        )}
      </div>

      {((lead.perfil_modalidade && lead.perfil_modalidade.length > 0) || (lead.perfil_valor_min != null && lead.perfil_valor_min > 0)) && (
        <div className="flex flex-wrap items-center gap-1 mb-2" title={lead.perfil_resumo || undefined}>
          {lead.perfil_modalidade?.slice(0, 2).map((m) => (
            <Badge key={m} variant="secondary" className="text-[10px] h-4 px-1.5 gap-0.5">
              <Tag className="h-2.5 w-2.5" />
              {m}
            </Badge>
          ))}
          {lead.perfil_valor_min != null && lead.perfil_valor_min > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 gap-0.5 border-emerald-200 bg-emerald-50 text-emerald-700">
              <DollarSign className="h-2.5 w-2.5" />
              {lead.perfil_valor_min >= 1000 ? `${Math.round(lead.perfil_valor_min / 1000)}k+` : `${lead.perfil_valor_min}+`}
            </Badge>
          )}
          {lead.perfil_resumo && (
            <Sparkles className="h-3 w-3 text-primary/60" />
          )}
        </div>
      )}

      <div className="flex items-center gap-1 mb-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < lead.validacoes_ok ? "bg-green-500" : "bg-muted"
            }`}
          />
        ))}
        <span className="text-[10px] text-muted-foreground ml-1 tabular-nums">
          {lead.validacoes_ok}/4
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MessageSquare className="h-3 w-3" />
          <span>{lead.msgs_total}</span>
          {idade && (
            <>
              <Clock className="h-3 w-3 ml-1" />
              <span className="truncate">{idade}</span>
            </>
          )}
        </div>
        {semDono ? (
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 border-amber-300 text-amber-700 bg-amber-50">
            sem dono
          </Badge>
        ) : (
          <Avatar className="h-5 w-5">
            <AvatarFallback className="text-[10px] bg-primary/10">{iniciaisDono}</AvatarFallback>
          </Avatar>
        )}
      </div>

      {lead.etapa_acompanhamento === "perdido" && lead.motivo_perdido && (
        <p className="text-[10px] text-muted-foreground mt-2 italic line-clamp-2 border-t pt-1.5">
          {lead.motivo_perdido}
        </p>
      )}
    </div>
  );
}
