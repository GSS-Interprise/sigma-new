import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { MapPin, Send, Search, X } from "lucide-react";

const normalize = (str: string) =>
  str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

interface RegiaoInteresseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId?: string;
  onAfterNavigate?: () => void;
}

interface IBGEEstado {
  id: number;
  sigla: string;
  nome: string;
}

interface IBGEMunicipio {
  id: number;
  nome: string;
}

// Stores selections as UF -> Set of cities
type SelectionMap = Record<string, Set<string>>;

export function RegiaoInteresseDialog({ open, onOpenChange, leadId, onAfterNavigate }: RegiaoInteresseDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  // UF currently being browsed (for city list)
  const [browsingUf, setBrowsingUf] = useState<string>("");
  // All selections: { "SC": Set(["Florianópolis"]), "PR": Set() }
  const [selections, setSelections] = useState<SelectionMap>({});
  const [cidadeSearch, setCidadeSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const { data: estados } = useQuery({
    queryKey: ["ibge-estados"],
    queryFn: async () => {
      const res = await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome");
      if (!res.ok) throw new Error("Erro ao buscar estados");
      const data: IBGEEstado[] = await res.json();
      return data.map((e) => ({ sigla: e.sigla, nome: e.nome })).sort((a, b) => a.nome.localeCompare(b.nome));
    },
    staleTime: Infinity,
  });

  const { data: cidades, isLoading: loadingCidades } = useQuery({
    queryKey: ["ibge-cidades", browsingUf],
    queryFn: async () => {
      const res = await fetch(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${browsingUf}/municipios?orderBy=nome`
      );
      if (!res.ok) throw new Error("Erro ao buscar cidades");
      const data: IBGEMunicipio[] = await res.json();
      return data.map((m) => m.nome).sort((a, b) => a.localeCompare(b));
    },
    enabled: !!browsingUf,
    staleTime: Infinity,
  });

  const filteredCidades = useMemo(() => {
    if (!cidades) return [];
    if (!cidadeSearch.trim()) return cidades;
    const term = normalize(cidadeSearch);
    return cidades.filter((c) => normalize(c).includes(term));
  }, [cidades, cidadeSearch]);

  // Get all selected UFs
  const selectedUfs = Object.keys(selections);

  // Get all selected cities across all UFs as flat list with UF info
  const allSelectedCidades = useMemo(() => {
    const result: { uf: string; cidade: string }[] = [];
    for (const [uf, cidadesSet] of Object.entries(selections)) {
      for (const cidade of cidadesSet) {
        result.push({ uf, cidade });
      }
    }
    return result;
  }, [selections]);

  const toggleCidade = (cidade: string) => {
    if (!browsingUf) return;
    setSelections((prev) => {
      const next = { ...prev };
      const set = new Set(next[browsingUf] || []);
      if (set.has(cidade)) {
        set.delete(cidade);
      } else {
        set.add(cidade);
      }
      next[browsingUf] = set;
      return next;
    });
  };

  const removeCidade = (uf: string, cidade: string) => {
    setSelections((prev) => {
      const next = { ...prev };
      const set = new Set(next[uf] || []);
      set.delete(cidade);
      next[uf] = set;
      return next;
    });
  };

  const removeUf = (uf: string) => {
    setSelections((prev) => {
      const next = { ...prev };
      delete next[uf];
      return next;
    });
  };

  const handleUfChange = (uf: string) => {
    setBrowsingUf(uf);
    setCidadeSearch("");
    // Ensure UF exists in selections (even with no cities = "all cities in UF")
    setSelections((prev) => {
      if (prev[uf]) return prev;
      return { ...prev, [uf]: new Set() };
    });
  };

  const isCidadeSelected = (cidade: string) => {
    if (!browsingUf) return false;
    return selections[browsingUf]?.has(cidade) || false;
  };

  const handleSubmit = async () => {
    if (selectedUfs.length === 0) {
      toast.warning("Selecione ao menos um estado");
      return;
    }
    if (!leadId) {
      toast.error("Lead não encontrado");
      return;
    }

    setSubmitting(true);
    try {
      // Collect all selected cities across UFs
      const allCidades: string[] = [];
      for (const set of Object.values(selections)) {
        for (const cidade of set) {
          allCidades.push(cidade);
        }
      }

      const { error } = await supabase.from("regiao_interesse_leads").insert({
        lead_id: leadId,
        encaminhado_por: user?.id || null,
        encaminhado_por_nome: user?.user_metadata?.nome_completo || user?.email || "Desconhecido",
        ufs: selectedUfs,
        cidades: allCidades,
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["regiao-interesse-leads"] });
      toast.success("Lead encaminhado para o Banco de Interesse");
      onOpenChange(false);
      onAfterNavigate?.();
      navigate("/disparos/regiao-interesse");

      // Reset
      setBrowsingUf("");
      setSelections({});
      setCidadeSearch("");
    } catch (err: any) {
      console.error("Erro ao encaminhar lead:", err);
      toast.error("Erro ao encaminhar lead");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Banco de Interesse
          </DialogTitle>
          <DialogDescription>
            Selecione estados e opcionalmente cidades. Suas seleções são mantidas ao trocar de estado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Selected UFs badges */}
          {selectedUfs.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Selecionados</Label>
              <div className="flex flex-wrap gap-1.5">
                {selectedUfs.map((uf) => {
                  const cidadesCount = selections[uf]?.size || 0;
                  return (
                    <Badge key={uf} variant="default" className="gap-1 pr-1">
                      {uf}{cidadesCount > 0 ? ` (${cidadesCount} cidades)` : " (todas)"}
                      <button
                        type="button"
                        onClick={() => removeUf(uf)}
                        className="ml-0.5 rounded-full hover:bg-primary-foreground/20 p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selected cities badges */}
          {allSelectedCidades.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allSelectedCidades.map(({ uf, cidade }) => (
                <Badge key={`${uf}-${cidade}`} variant="secondary" className="gap-1 pr-1 text-xs">
                  {cidade} ({uf})
                  <button
                    type="button"
                    onClick={() => removeCidade(uf, cidade)}
                    className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label>Estado (UF) *</Label>
            <Select
              value={browsingUf}
              onValueChange={handleUfChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o estado" />
              </SelectTrigger>
              <SelectContent>
                {estados?.map((estado) => (
                  <SelectItem key={estado.sigla} value={estado.sigla}>
                    {estado.sigla} - {estado.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Cidades (opcional)</Label>
            <div className="border rounded-md">
              <div className="relative border-b">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder={browsingUf ? "Buscar cidade..." : "Selecione o estado primeiro"}
                  value={cidadeSearch}
                  onChange={(e) => setCidadeSearch(e.target.value)}
                  disabled={!browsingUf}
                  className="border-0 pl-8 h-9 focus-visible:ring-0 shadow-none"
                />
              </div>
              <ScrollArea className="h-[160px]">
                {!browsingUf ? (
                  <p className="text-xs text-muted-foreground p-3 text-center">
                    Selecione o estado primeiro
                  </p>
                ) : loadingCidades ? (
                  <p className="text-xs text-muted-foreground p-3 text-center">
                    Carregando cidades...
                  </p>
                ) : filteredCidades.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3 text-center">
                    Nenhuma cidade encontrada
                  </p>
                ) : (
                  <div className="p-1">
                    {filteredCidades.map((cidade) => (
                      <label
                        key={cidade}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={isCidadeSelected(cidade)}
                          onCheckedChange={() => toggleCidade(cidade)}
                        />
                        {cidade}
                      </label>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={selectedUfs.length === 0 || submitting} className="gap-2">
            <Send className="h-4 w-4" />
            {submitting ? "Enviando..." : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
