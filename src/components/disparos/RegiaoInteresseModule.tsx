import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, Users, CheckSquare, Send, Trash2, User, Filter } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { VincularCampanhaDialog } from "./VincularCampanhaDialog";

const PAGE_SIZE = 50;

interface RegiaoLead {
  id: string;
  lead_id: string;
  encaminhado_por_nome: string | null;
  ufs: string[];
  cidades: string[];
  created_at: string;
  // Campos enriquecidos pela IA (A1 — busca retroativa por perfil)
  modalidade_preferida: string[] | null;
  tipo_contratacao_preferida: string[] | null;
  valor_minimo_aceitavel: number | null;
  valor_minimo_unidade: string | null;
  confianca_score: number | null;
  lead: {
    id: string;
    nome: string;
    phone_e164: string | null;
    especialidade: string | null;
    uf: string | null;
    cidade: string | null;
  } | null;
}

export function RegiaoInteresseModule() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [ufFilter, setUfFilter] = useState("");
  const [especialidadeFilter, setEspecialidadeFilter] = useState("");
  const [cidadeFilter, setCidadeFilter] = useState("");
  // A1 — filtros por perfil IA
  const [modalidadeFilter, setModalidadeFilter] = useState("");
  const [tipoContratacaoFilter, setTipoContratacaoFilter] = useState("");
  const [valorVagaFilter, setValorVagaFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [vincularDialogOpen, setVincularDialogOpen] = useState(false);

  // Fetch leads sent to Região de Interesse
  const { data: regiaoLeads, isLoading } = useQuery({
    queryKey: ["regiao-interesse-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("banco_interesse_leads")
        .select(`
          id,
          lead_id,
          encaminhado_por_nome,
          ufs,
          cidades,
          created_at,
          modalidade_preferida,
          tipo_contratacao_preferida,
          valor_minimo_aceitavel,
          valor_minimo_unidade,
          confianca_score,
          lead:leads!banco_interesse_leads_lead_id_fkey (
            id, nome, phone_e164, especialidade, uf, cidade
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as RegiaoLead[];
    },
  });

  // Extract unique filter options from loaded data
  const filterOptions = useMemo(() => {
    if (!regiaoLeads) return { ufs: [], especialidades: [], cidades: [], modalidades: [], tiposContratacao: [] };
    const ufSet = new Set<string>();
    const espSet = new Set<string>();
    const cidSet = new Set<string>();
    const modSet = new Set<string>();
    const tipoSet = new Set<string>();
    regiaoLeads.forEach((r) => {
      if (r.lead?.uf) ufSet.add(r.lead.uf.toUpperCase());
      if (r.lead?.especialidade) espSet.add(r.lead.especialidade);
      if (r.lead?.cidade) cidSet.add(r.lead.cidade);
      (r.modalidade_preferida || []).forEach((m) => m && modSet.add(m));
      (r.tipo_contratacao_preferida || []).forEach((t) => t && tipoSet.add(t));
    });
    return {
      ufs: Array.from(ufSet).sort(),
      especialidades: Array.from(espSet).sort(),
      cidades: Array.from(cidSet).sort(),
      modalidades: Array.from(modSet).sort(),
      tiposContratacao: Array.from(tipoSet).sort(),
    };
  }, [regiaoLeads]);

  // Filter by search + dropdowns
  const filteredLeads = useMemo(() => {
    if (!regiaoLeads) return [];
    return regiaoLeads.filter((r) => {
      const lead = r.lead;
      if (!lead) return false;
      if (ufFilter && lead.uf?.toUpperCase() !== ufFilter) return false;
      if (especialidadeFilter && lead.especialidade !== especialidadeFilter) return false;
      if (cidadeFilter && lead.cidade !== cidadeFilter) return false;
      // A1 — filtros por perfil IA
      if (modalidadeFilter && !(r.modalidade_preferida || []).includes(modalidadeFilter)) return false;
      if (tipoContratacaoFilter && !(r.tipo_contratacao_preferida || []).includes(tipoContratacaoFilter)) return false;
      if (valorVagaFilter) {
        const v = Number(valorVagaFilter);
        // mostra médicos cujo mínimo aceitável é <= valor da vaga (cabem na vaga)
        if (!Number.isNaN(v) && (r.valor_minimo_aceitavel == null || r.valor_minimo_aceitavel > v)) return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return (
          lead.nome?.toLowerCase().includes(term) ||
          lead.phone_e164?.includes(term) ||
          lead.especialidade?.toLowerCase().includes(term) ||
          r.encaminhado_por_nome?.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [regiaoLeads, searchTerm, ufFilter, especialidadeFilter, cidadeFilter, modalidadeFilter, tipoContratacaoFilter, valorVagaFilter]);

  const totalCount = filteredLeads.length;

  const allSelected = useMemo(
    () => filteredLeads.length > 0 && filteredLeads.every((r) => selectedIds.has(r.id)),
    [filteredLeads, selectedIds]
  );

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        filteredLeads.forEach((r) => next.delete(r.id));
      } else {
        filteredLeads.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  // Remove selected leads from região de interesse
  const removeMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("banco_interesse_leads")
        .delete()
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["regiao-interesse-leads"] });
      setSelectedIds(new Set());
      toast.success("Leads removidos do Banco de Interesse");
    },
    onError: () => {
      toast.error("Erro ao remover leads");
    },
  });

  const handleEnviarParaDisparo = () => {
    if (selectedIds.size === 0) {
      toast.warning("Selecione ao menos um lead");
      return;
    }
    setVincularDialogOpen(true);
  };

  const leadsParaVincular = filteredLeads
    .filter((r) => selectedIds.has(r.id))
    .map((r) => ({
      lead_id: r.lead_id,
      nome: r.lead?.nome || "",
      phone_e164: r.lead?.phone_e164 || null,
    }));

  const handleRemoveSelected = () => {
    if (selectedIds.size === 0) return;
    removeMutation.mutate(Array.from(selectedIds));
  };

  return (
    <div className="space-y-4">
      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Encaminhados</p>
                <p className="text-2xl font-bold">{regiaoLeads?.length ?? 0}</p>
              </div>
              <div className="p-3 rounded-full bg-blue-50">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Selecionados</p>
                <p className="text-2xl font-bold">{selectedIds.size}</p>
              </div>
              <div className="p-3 rounded-full bg-green-50">
                <CheckSquare className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Filtrados</p>
                <p className="text-2xl font-bold">{totalCount}</p>
              </div>
              <div className="p-3 rounded-full bg-purple-50">
                <MapPin className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Search + Actions */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, telefone, especialidade ou quem encaminhou..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRemoveSelected}
                disabled={selectedIds.size === 0 || removeMutation.isPending}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Remover ({selectedIds.size})
              </Button>
              <Button
                onClick={handleEnviarParaDisparo}
                disabled={selectedIds.size === 0}
                className="gap-2"
                size="sm"
              >
                <Send className="h-4 w-4" />
                Enviar para Disparo ({selectedIds.size})
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={ufFilter || undefined} onValueChange={(v) => setUfFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="Estado (UF)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os estados</SelectItem>
                {filterOptions.ufs.map((uf) => (
                  <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={especialidadeFilter || undefined} onValueChange={(v) => setEspecialidadeFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="Especialidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas especialidades</SelectItem>
                {filterOptions.especialidades.map((esp) => (
                  <SelectItem key={esp} value={esp}>{esp}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={cidadeFilter || undefined} onValueChange={(v) => setCidadeFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="Cidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas cidades</SelectItem>
                {filterOptions.cidades.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* A1 — filtros por perfil enriquecido pela IA */}
            {filterOptions.modalidades.length > 0 && (
              <Select value={modalidadeFilter || undefined} onValueChange={(v) => setModalidadeFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Modalidade (IA)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas modalidades</SelectItem>
                  {filterOptions.modalidades.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {filterOptions.tiposContratacao.length > 0 && (
              <Select value={tipoContratacaoFilter || undefined} onValueChange={(v) => setTipoContratacaoFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Contratação (IA)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Toda contratação</SelectItem>
                  {filterOptions.tiposContratacao.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input
              type="number"
              placeholder="Valor da vaga (R$)"
              value={valorVagaFilter}
              onChange={(e) => setValorVagaFilter(e.target.value)}
              className="w-[160px] h-9"
              title="Mostra médicos cujo valor mínimo aceitável (extraído pela IA) é ≤ esse valor"
            />
          </div>
        </CardContent>
      </Card>

      {/* Lead list */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-3 flex items-center gap-3 bg-muted/30">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleAll}
            />
            <span className="text-sm font-medium text-muted-foreground">
              Selecionar todos ({totalCount})
            </span>
          </div>

          <ScrollArea className="h-[500px]">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Carregando...</div>
            ) : filteredLeads.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {regiaoLeads?.length === 0
                  ? "Nenhum lead encaminhado para o Banco de Interesse ainda. Use o menu de contexto no SigZap para encaminhar leads."
                  : "Nenhum lead encontrado com esse filtro"}
              </div>
            ) : (
              <div className="divide-y">
                {filteredLeads.map((item) => {
                  const lead = item.lead;
                  if (!lead) return null;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors cursor-pointer",
                        selectedIds.has(item.id) && "bg-primary/5"
                      )}
                      onClick={() => toggleItem(item.id)}
                    >
                      <Checkbox
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={() => toggleItem(item.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{lead.nome}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {lead.phone_e164}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        {lead.especialidade && (
                          <Badge variant="outline" className="text-xs">
                            {lead.especialidade}
                          </Badge>
                        )}
                        {lead.uf && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <MapPin className="h-3 w-3" />
                            {lead.uf}
                          </Badge>
                        )}
                        {lead.cidade && (
                          <span className="text-xs text-muted-foreground">
                            {lead.cidade}
                          </span>
                        )}
                        {(item.modalidade_preferida || []).slice(0, 1).map((m) => (
                          <Badge key={m} variant="outline" className="text-xs border-cyan-300 bg-cyan-50 text-cyan-700">
                            {m}
                          </Badge>
                        ))}
                        {item.valor_minimo_aceitavel != null && item.valor_minimo_aceitavel > 0 && (
                          <Badge variant="outline" className="text-xs border-emerald-300 bg-emerald-50 text-emerald-700">
                            ≥ R$ {item.valor_minimo_aceitavel >= 1000 ? `${Math.round(item.valor_minimo_aceitavel / 1000)}k` : item.valor_minimo_aceitavel}
                            {item.valor_minimo_unidade ? `/${item.valor_minimo_unidade}` : ""}
                          </Badge>
                        )}
                        {item.encaminhado_por_nome && (
                          <Badge variant="outline" className="text-xs gap-1 border-primary/30 text-primary">
                            <User className="h-3 w-3" />
                            {item.encaminhado_por_nome}
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(item.created_at), "dd/MM HH:mm")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <VincularCampanhaDialog
        open={vincularDialogOpen}
        onOpenChange={setVincularDialogOpen}
        leads={leadsParaVincular}
      />
    </div>
  );
}
