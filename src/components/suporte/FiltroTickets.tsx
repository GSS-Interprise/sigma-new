import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

interface FiltroTicketsProps {
  numeroTicket: string;
  onNumeroTicketChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  tipo: string;
  onTipoChange: (value: string) => void;
  destino: string;
  onDestinoChange: (value: string) => void;
  mostrarConcluidos: boolean;
  onMostrarConcluidosChange: (value: boolean) => void;
}

export function FiltroTickets({
  numeroTicket,
  onNumeroTicketChange,
  status,
  onStatusChange,
  tipo,
  onTipoChange,
  destino,
  onDestinoChange,
  mostrarConcluidos,
  onMostrarConcluidosChange,
}: FiltroTicketsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-5">
      <div className="space-y-2">
        <Label htmlFor="numero-ticket">Nº do Ticket</Label>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="numero-ticket"
            placeholder="SUP-2025-000001"
            value={numeroTicket}
            onChange={(e) => onNumeroTicketChange(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger id="status">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="aberto">Aberto</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="em_analise">Em Análise</SelectItem>
            <SelectItem value="aguardando_usuario">Aguardando Usuário</SelectItem>
            <SelectItem value="em_validacao">Em Validação</SelectItem>
            {mostrarConcluidos ? (
              <SelectItem value="concluido">Concluído</SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tipo">Tipo</Label>
        <Select value={tipo} onValueChange={onTipoChange}>
          <SelectTrigger id="tipo">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="software">Software</SelectItem>
            <SelectItem value="hardware">Hardware</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="destino">Destino</Label>
        <Select value={destino} onValueChange={onDestinoChange}>
          <SelectTrigger id="destino">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="interno">Interno</SelectItem>
            <SelectItem value="externo">Externo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="mostrar-concluidos">Concluídos</Label>
        <div className="flex items-center gap-2 h-10">
          <Checkbox
            id="mostrar-concluidos"
            checked={mostrarConcluidos}
            onCheckedChange={(v) => onMostrarConcluidosChange(v === true)}
          />
          <Label htmlFor="mostrar-concluidos" className="font-normal">
            Mostrar concluídos
          </Label>
        </div>
      </div>
    </div>
  );
}
