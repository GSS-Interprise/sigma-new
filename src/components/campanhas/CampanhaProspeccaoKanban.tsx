import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Clock,
  Send,
  Bot,
  Flame,
  ThermometerSun,
  CheckCircle,
  Search,
  Phone,
  Mail,
  MapPin,
  User,
  GripVertical,
} from "lucide-react";
import {
  useCampanhaLeadsByStatus,
  useAtualizarStatusLead,
  type CampanhaLead,
  type StatusLeadCampanha,
} from "@/hooks/useCampanhaLeads";

interface KanbanColumn {
  id: StatusLeadCampanha;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ElementType;
  description: string;
}

const COLUMNS: KanbanColumn[] = [
  {
    id: "frio",
    label: "Pendentes",
    color: "text-slate-600",
    bgColor: "bg-slate-50",
    borderColor: "border-slate-200",
    icon: Clock,
    description: "Aguardando disparo",
  },
  {
    id: "contatado",
    label: "Aguardando Resposta",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    icon: Send,
    description: "Mensagem enviada",
  },
  {
    id: "em_conversa",
    label: "IA Conversando",
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
    borderColor: "border-cyan-200",
    icon: Bot,
    description: "IA qualificando",
  },
  {
    id: "aquecido",
    label: "Aquecidos",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    icon: ThermometerSun,
    description: "Interesse detectado",
  },
  {
    id: "quente",
    label: "Leads Quentes",
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    icon: Flame,
    description: "Pronto pro operador",
  },
  {
    id: "convertido",
    label: "Convertidos",
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    icon: CheckCircle,
    description: "Negócio fechado",
  },
];

interface Props {
  campanhaId: string;
}

export function CampanhaProspeccaoKanban({ campanhaId }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [draggedLead, setDraggedLead] = useState<string | null>(null);
  const { byStatus, leads, isLoading } = useCampanhaLeadsByStatus(campanhaId);
  const atualizarStatus = useAtualizarStatusLead();

  const filteredByStatus = (status: StatusLeadCampanha) => {
    const leadsInStatus = byStatus[status] || [];
    if (!searchTerm.trim()) return leadsInStatus;
    const term = searchTerm.toLowerCase();
    return leadsInStatus.filter(
      (cl) =>
        cl.lead?.nome?.toLowerCase().includes(term) ||
        cl.lead?.phone_e164?.includes(term) ||
        cl.lead?.cidade?.toLowerCase().includes(term)
    );
  };

  const handleDragStart = (leadId: string) => setDraggedLead(leadId);

  const handleDrop = (targetStatus: StatusLeadCampanha) => {
    if (!draggedLead) return;
    const lead = leads.find((l) => l.lead_id === draggedLead);
    if (!lead || lead.status === targetStatus) {
      setDraggedLead(null);
      return;
    }
    atualizarStatus.mutate({
      campanha_id: campanhaId,
      lead_id: draggedLead,
      novo_status: targetStatus,
    });
    setDraggedLead(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        Carregando pipeline...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar lead no pipeline..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Badge variant="outline" className="text-sm">
          {leads.length} leads no pipeline
        </Badge>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colLeads = filteredByStatus(col.id);
          const Icon = col.icon;
          return (
            <div
              key={col.id}
              className={`flex-shrink-0 w-[280px] rounded-lg border ${col.borderColor} ${col.bgColor}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(col.id)}
            >
              <div className="p-3 border-b border-inherit">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${col.color}`} />
                    <span className={`font-semibold text-sm ${col.color}`}>
                      {col.label}
                    </span>
                  </div>
                  <Badge
                    variant="secondary"
                    className="text-xs font-bold min-w-[24px] justify-center"
                  >
                    {colLeads.length}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {col.description}
                </p>
              </div>

              <ScrollArea className="h-[calc(100vh-320px)] p-2">
                <div className="space-y-2">
                  {colLeads.map((cl) => (
                    <LeadCard
                      key={cl.id}
                      campLead={cl}
                      onDragStart={() => handleDragStart(cl.lead_id)}
                    />
                  ))}
                  {colLeads.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">
                      Nenhum lead
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeadCard({
  campLead,
  onDragStart,
}: {
  campLead: CampanhaLead;
  onDragStart: () => void;
}) {
  const lead = campLead.lead;
  if (!lead) return null;

  return (
    <Card
      className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
      draggable
      onDragStart={onDragStart}
    >
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-start gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground/40 mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate">{lead.nome}</p>
            {lead.especialidade && (
              <p className="text-xs text-muted-foreground truncate">
                {lead.especialidade}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground pl-6">
          {lead.phone_e164 && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {lead.phone_e164.replace("+55", "")}
            </span>
          )}
          {lead.uf && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {lead.cidade ? `${lead.cidade}/${lead.uf}` : lead.uf}
            </span>
          )}
        </div>
        {campLead.tentativas > 0 && (
          <div className="pl-6">
            <Badge variant="outline" className="text-xs">
              {campLead.tentativas} tentativa{campLead.tentativas > 1 ? "s" : ""}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
