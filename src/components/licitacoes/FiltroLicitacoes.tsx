import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMinhasPreferenciasLicitacoes } from "./LicitacaoTarefasPanel";
import { TIPOS_TAREFA } from "@/lib/licitacaoTarefas";
import { toast } from "sonner";
import { useLicitacoesProfiles } from "@/hooks/useLicitacoesProfiles";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, CalendarClock, Search, X, ChevronDown, ChevronUp, Filter } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface FiltroLicitacoesProps {
  onFilterChange: (filters: any) => void;
  compact?: boolean;
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

export function FiltroLicitacoes({ onFilterChange, compact = false }: FiltroLicitacoesProps) {
  const [search, setSearch] = useState("");
  const [selectedEtiquetas, setSelectedEtiquetas] = useState<string[]>([]);
  const [responsavel, setResponsavel] = useState<string>("");
  // empresa do quadro: GSS por padrão; AGES e Todas por escolha (a AGES também é cliente)
  const [tipoLicitacao, setTipoLicitacao] = useState<string>("GSS");
  const [dataInicio, setDataInicio] = useState<Date | undefined>();
  const [dataFim, setDataFim] = useState<Date | undefined>();
  const [isOpen, setIsOpen] = useState(false);
  // prazo (T5): período e tipo; o período com que o quadro abre é escolha de cada pessoa
  const [prazoDias, setPrazoDias] = useState(0);
  const [prazoTipo, setPrazoTipo] = useState("");
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: pref } = useMinhasPreferenciasLicitacoes();
  const prefAplicada = useRef(false);
  useEffect(() => {
    if (pref && !prefAplicada.current) { prefAplicada.current = true; setPrazoDias(pref.filtro_dias ?? 0); }
  }, [pref]);
  const fixarPeriodo = async () => {
    if (!user) return;
    const { error } = await (supabase as any).from("licitacoes_preferencias")
      .upsert({ user_id: user.id, filtro_dias: prazoDias || null, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) return toast.error("Não foi possível salvar: " + error.message);
    toast.success(prazoDias ? `O quadro vai abrir mostrando ${prazoDias === 1 ? "hoje" : `${prazoDias} dias`}` : "O quadro vai abrir mostrando tudo");
    qc.invalidateQueries({ queryKey: ["licitacoes-preferencias"] });
  };

  const { data: profiles } = useLicitacoesProfiles();

  useEffect(() => {
    onFilterChange({
      search,
      etiquetas: selectedEtiquetas.length > 0 ? selectedEtiquetas : undefined,
      responsavel: responsavel || undefined,
      tipoLicitacao: tipoLicitacao || "GSS",
      dataInicio,
      dataFim,
      prazoDias: prazoDias || undefined,
      prazoTipo: prazoTipo || undefined,
    });
  }, [search, selectedEtiquetas, responsavel, tipoLicitacao, dataInicio, dataFim, prazoDias, prazoTipo]);

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
    setTipoLicitacao("GSS");
    setDataInicio(undefined);
    setDataFim(undefined);
    setPrazoTipo("");
  };

  const outraEmpresa = tipoLicitacao !== "GSS";
  const hasActiveFilters = search || selectedEtiquetas.length > 0 || responsavel || outraEmpresa || dataInicio || dataFim || prazoTipo;
  const hasAdvancedFilters = selectedEtiquetas.length > 0 || responsavel || outraEmpresa || dataInicio || dataFim;

  const activeCount = selectedEtiquetas.length + (responsavel ? 1 : 0) + (dataInicio ? 1 : 0) + (dataFim ? 1 : 0) + (prazoTipo ? 1 : 0);

  if (compact) {
    return (
      <Popover>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar licitação"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9 rounded-md bg-muted/40 border-border/60 focus-visible:bg-background text-sm"
            />
          </div>
          <Select
            value={String(prazoDias)}
            onValueChange={(v) => { if (v === "fixar") { fixarPeriodo(); return; } setPrazoDias(Number(v)); }}
          >
            <SelectTrigger className="h-9 w-[132px] gap-1 border-border/60 bg-muted/40 text-sm" title="Prazos: disputas e tarefas no período (tarefa atrasada sempre aparece)">
              <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="0">Tudo</SelectItem>
              <SelectItem value="1">Hoje</SelectItem>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="15">15 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              {(pref?.filtro_dias ?? 0) !== prazoDias && (
                <SelectItem value="fixar" className="border-t text-xs text-primary">Abrir sempre assim</SelectItem>
              )}
            </SelectContent>
          </Select>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2.5 gap-1.5 text-muted-foreground hover:text-foreground relative"
            >
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Filtros</span>
              {activeCount > 0 && (
                <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                  {activeCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </div>
        <PopoverContent align="end" className="w-[560px] p-5 bg-background z-50">
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Etiquetas</Label>
              <div className="flex flex-wrap gap-1.5">
                {ETIQUETAS_DISPONIVEIS.map((etiqueta) => (
                  <Badge
                    key={etiqueta}
                    variant={selectedEtiquetas.includes(etiqueta) ? "default" : "outline"}
                    className="cursor-pointer text-xs py-1 px-2.5 font-normal"
                    onClick={() => toggleEtiqueta(etiqueta)}
                  >
                    {etiqueta}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Responsável</Label>
                <Select value={responsavel} onValueChange={setResponsavel}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Todos" />
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
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Empresa</Label>
                <Select value={tipoLicitacao} onValueChange={setTipoLicitacao}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="GSS">GSS</SelectItem>
                    <SelectItem value="AGES">AGES</SelectItem>
                    <SelectItem value="TODAS">GSS e AGES</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipo de prazo</Label>
                <Select value={prazoTipo || "__qualquer"} onValueChange={(v) => setPrazoTipo(v === "__qualquer" ? "" : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="__qualquer">Qualquer (disputa ou tarefa)</SelectItem>
                    <SelectItem value="disputa">Disputa</SelectItem>
                    {TIPOS_TAREFA.map((t) => <SelectItem key={t.value} value={t.value}>{t.value === "personalizada" ? "Outras tarefas" : t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Data início</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full h-9 justify-start text-left font-normal text-sm">
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {dataInicio ? format(dataInicio, "P", { locale: ptBR }) : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background z-50">
                    <Calendar mode="single" selected={dataInicio} onSelect={setDataInicio} initialFocus className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Data fim</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full h-9 justify-start text-left font-normal text-sm">
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {dataFim ? format(dataFim, "P", { locale: ptBR }) : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background z-50">
                    <Calendar mode="single" selected={dataFim} onSelect={setDataFim} initialFocus className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {hasActiveFilters && (
              <div className="flex justify-end pt-1 border-t border-border/60">
                <Button variant="ghost" size="sm" onClick={limparFiltros} className="h-8 text-xs text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Limpar filtros
                </Button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

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
                <Label className="text-sm font-medium text-foreground">Empresa</Label>
                <Select value={tipoLicitacao} onValueChange={setTipoLicitacao}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Todos os setores" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="GSS">GSS</SelectItem>
                    <SelectItem value="AGES">AGES</SelectItem>
                    <SelectItem value="TODAS">GSS e AGES</SelectItem>
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
