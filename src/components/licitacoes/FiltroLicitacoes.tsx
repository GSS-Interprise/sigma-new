import { useState, useEffect } from "react";
import { useLicitacoesProfiles } from "@/hooks/useLicitacoesProfiles";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, Search, X, ChevronDown, ChevronUp, Filter } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface FiltroLicitacoesProps {
  onFilterChange: (filters: any) => void;
}

const ETIQUETAS_DISPONIVEIS = [
  "Saúde",
  "Radiologia",
  "Urgente",
  "Prioritário",
  "Médico",
  "Equipamento",
  "Análise Técnica",
  "Documentação",
];

export function FiltroLicitacoes({ onFilterChange }: FiltroLicitacoesProps) {
  const [search, setSearch] = useState("");
  const [selectedEtiquetas, setSelectedEtiquetas] = useState<string[]>([]);
  const [responsavel, setResponsavel] = useState<string>("");
  const [tipoLicitacao, setTipoLicitacao] = useState<string>("");
  const [dataInicio, setDataInicio] = useState<Date | undefined>();
  const [dataFim, setDataFim] = useState<Date | undefined>();
  const [isOpen, setIsOpen] = useState(false);

  const { data: profiles } = useLicitacoesProfiles();

  useEffect(() => {
    onFilterChange({
      search,
      etiquetas: selectedEtiquetas.length > 0 ? selectedEtiquetas : undefined,
      responsavel: responsavel || undefined,
      tipoLicitacao: tipoLicitacao && tipoLicitacao !== '__all__' ? tipoLicitacao : undefined,
      dataInicio,
      dataFim,
    });
  }, [search, selectedEtiquetas, responsavel, tipoLicitacao, dataInicio, dataFim]);

  const toggleEtiqueta = (etiqueta: string) => {
    setSelectedEtiquetas(prev =>
      prev.includes(etiqueta)
        ? prev.filter(e => e !== etiqueta)
        : [...prev, etiqueta]
    );
  };

  const limparFiltros = () => {
    setSearch("");
    setSelectedEtiquetas([]);
    setResponsavel("");
    setTipoLicitacao("");
    setDataInicio(undefined);
    setDataFim(undefined);
  };

  const hasActiveFilters = search || selectedEtiquetas.length > 0 || responsavel || tipoLicitacao || dataInicio || dataFim;
  const hasAdvancedFilters = selectedEtiquetas.length > 0 || responsavel || tipoLicitacao || dataInicio || dataFim;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="space-y-4">
        {/* Linha principal de busca */}
        <div className="flex items-center gap-3 justify-center">
          <div className="relative w-80">
            <Input
              id="search"
              placeholder="Buscar Licitação"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10 h-12 rounded-full border border-border bg-white text-sm placeholder:text-muted-foreground/60"
            />
            <Search className="absolute right-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          </div>
          
          <CollapsibleTrigger asChild>
            <Button
              className="h-12 px-8 rounded-full bg-[hsl(160,70%,25%)] hover:bg-[hsl(160,70%,20%)] text-white font-semibold"
              type="button"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filtrar
              {hasAdvancedFilters && (
                <Badge variant="secondary" className="ml-2 h-5 px-2 text-xs bg-white/20">
                  {selectedEtiquetas.length + (responsavel ? 1 : 0) + (dataInicio ? 1 : 0) + (dataFim ? 1 : 0)}
                </Badge>
              )}
            </Button>
          </CollapsibleTrigger>
        </div>

          <CollapsibleContent className="mt-6">
            <div className="space-y-6 max-w-4xl mx-auto p-6 border-2 border-border rounded-lg bg-background/50 shadow-sm">
            {/* Etiquetas */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-foreground">Etiquetas</Label>
              <div className="flex flex-wrap gap-2">
                {ETIQUETAS_DISPONIVEIS.map((etiqueta) => (
                  <Badge
                    key={etiqueta}
                    variant={selectedEtiquetas.includes(etiqueta) ? "default" : "outline"}
                    className="cursor-pointer hover:scale-105 transition-transform text-sm py-1.5 px-3"
                    onClick={() => toggleEtiqueta(etiqueta)}
                  >
                    {etiqueta}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Responsável, Setor e Datas */}
            <div className="grid grid-cols-4 gap-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground">Responsável</Label>
                <Select value={responsavel} onValueChange={setResponsavel}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Todos os responsáveis" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {profiles?.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.nome_completo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground">Setor</Label>
                <Select value={tipoLicitacao} onValueChange={setTipoLicitacao}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Todos os setores" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="__all__">Todos</SelectItem>
                    <SelectItem value="GSS">GSS</SelectItem>
                    <SelectItem value="AGES">AGES</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground">Data início</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-11 justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dataInicio ? format(dataInicio, "P", { locale: ptBR }) : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background z-50">
                    <Calendar
                      mode="single"
                      selected={dataInicio}
                      onSelect={setDataInicio}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground">Data fim</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-11 justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dataFim ? format(dataFim, "P", { locale: ptBR }) : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background z-50">
                    <Calendar
                      mode="single"
                      selected={dataFim}
                      onSelect={setDataFim}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Botão limpar filtros */}
            {hasActiveFilters && (
              <div className="flex justify-center pt-2">
                <Button 
                  variant="ghost" 
                  onClick={limparFiltros} 
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4 mr-2" />
                  Limpar todos os filtros
                </Button>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
