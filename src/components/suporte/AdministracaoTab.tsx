import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, List, Kanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketKanbanBoard } from "./TicketKanbanBoard";
import { TicketListView } from "./TicketListView";

interface AdministracaoTabProps {
  onTicketClick: (ticketId: string) => void;
}

export function AdministracaoTab({ onTicketClick }: AdministracaoTabProps) {
  const [activeView, setActiveView] = useState<"lista" | "kanban">("kanban");
  const [showFilters, setShowFilters] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroDestino, setFiltroDestino] = useState("todos");
  const [filtroSetor, setFiltroSetor] = useState("todos");
  const [filtroBusca, setFiltroBusca] = useState("");

  const filtros = {
    busca: filtroBusca,
    tipo: filtroTipo,
    destino: filtroDestino,
    setor: filtroSetor,
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      <Card className="flex-shrink-0">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Administração de Tickets</CardTitle>
              <CardDescription className="text-xs">
                {activeView === "lista" 
                  ? "Triagem rápida, foco e controle de SLA" 
                  : "Acompanhamento de fluxo e gargalos"
                }
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Tabs de visualização */}
              <Tabs value={activeView} onValueChange={(v) => setActiveView(v as "lista" | "kanban")}>
                <TabsList className="h-9">
                  <TabsTrigger value="lista" className="gap-1.5 text-xs px-3">
                    <List className="h-4 w-4" />
                    Lista
                  </TabsTrigger>
                  <TabsTrigger value="kanban" className="gap-1.5 text-xs px-3">
                    <Kanban className="h-4 w-4" />
                    Kanban
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filtros
              </Button>
            </div>
          </div>
        </CardHeader>

        {showFilters && (
          <CardContent className="border-t pt-4 pb-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="busca" className="text-xs">Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="busca"
                    placeholder="Número, solicitante..."
                    value={filtroBusca}
                    onChange={(e) => setFiltroBusca(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tipo" className="text-xs">Tipo</Label>
                <Select value={filtroTipo} onValueChange={setFiltroTipo}>
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

              <div className="space-y-1.5">
                <Label htmlFor="destino" className="text-xs">Destino</Label>
                <Select value={filtroDestino} onValueChange={setFiltroDestino}>
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

              <div className="space-y-1.5">
                <Label htmlFor="setor" className="text-xs">Setor Responsável</Label>
                <Select value={filtroSetor} onValueChange={setFiltroSetor}>
                  <SelectTrigger id="setor">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="TI">TI</SelectItem>
                    <SelectItem value="Financeiro">Financeiro</SelectItem>
                    <SelectItem value="RH">RH</SelectItem>
                    <SelectItem value="Operacional">Operacional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeView === "lista" ? (
          <TicketListView 
            onTicketClick={onTicketClick}
            filtros={filtros}
          />
        ) : (
          <TicketKanbanBoard 
            onTicketClick={onTicketClick}
            filtros={filtros}
          />
        )}
      </div>
    </div>
  );
}
