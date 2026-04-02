import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, Plus, AlertCircle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";

// Dados da licitação para snapshot
interface LicitacaoSnapshot {
  id: string;
  numero_edital?: string | null;
  valor_estimado?: number | null;
  municipio_uf?: string | null;
  orgao?: string | null;
  tipo_modalidade?: string | null;
  subtipo_modalidade?: string | null;
  objeto?: string | null;
  titulo?: string | null;
}

interface LicitacaoDescarteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  licitacao: LicitacaoSnapshot | null;
  onConfirm: () => void;
  onCancel: () => void;
}

interface MotivoDescarte {
  id: string;
  nome: string;
}

export function LicitacaoDescarteDialog({
  open,
  onOpenChange,
  licitacao,
  onConfirm,
  onCancel,
}: LicitacaoDescarteDialogProps) {
  const queryClient = useQueryClient();
  const { isAdmin } = usePermissions();
  const { user } = useAuth();
  
  // Buscar nome do usuário logado
  const { data: userProfile } = useQuery({
    queryKey: ["user-profile-descarte", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("nome_completo")
        .eq("id", user.id)
        .single();
      return data;
    },
    enabled: !!user?.id && open,
  });
  
  const [selectedMotivosIds, setSelectedMotivosIds] = useState<string[]>([]);
  const [justificativa, setJustificativa] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [novoMotivo, setNovoMotivo] = useState("");
  const [showAddMotivo, setShowAddMotivo] = useState(false);
  const [saving, setSaving] = useState(false);

  // Buscar motivos de descarte
  const { data: motivos = [], isLoading: loadingMotivos } = useQuery({
    queryKey: ["licitacao-motivos-descarte"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licitacao_motivos_descarte")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      
      if (error) throw error;
      return data as MotivoDescarte[];
    },
    enabled: open,
  });

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setSelectedMotivosIds([]);
      setJustificativa("");
      setNovoMotivo("");
      setShowAddMotivo(false);
    }
  }, [open]);

  const selectedMotivos = motivos.filter(m => selectedMotivosIds.includes(m.id));
  const justificativaLength = justificativa.trim().length;
  const isJustificativaValid = justificativaLength >= 10;

  const toggleMotivo = (motivoId: string) => {
    setSelectedMotivosIds(prev => 
      prev.includes(motivoId) 
        ? prev.filter(id => id !== motivoId)
        : [...prev, motivoId]
    );
  };

  // Mutation para adicionar novo motivo
  const addMotivoMutation = useMutation({
    mutationFn: async (nome: string) => {
      const { data, error } = await supabase
        .from("licitacao_motivos_descarte")
        .insert({ nome: nome.toUpperCase().trim(), created_by: user?.id })
        .select("id, nome")
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (newMotivo) => {
      queryClient.invalidateQueries({ queryKey: ["licitacao-motivos-descarte"] });
      setSelectedMotivosIds(prev => [...prev, newMotivo.id]);
      setNovoMotivo("");
      setShowAddMotivo(false);
      toast.success("Motivo adicionado com sucesso!");
    },
    onError: (error: any) => {
      if (error.code === "23505") {
        toast.error("Este motivo já existe.");
      } else {
        toast.error("Erro ao adicionar motivo.");
      }
    },
  });

  // Função auxiliar para extrair UF do municipio_uf
  const extractUF = (municipioUf: string | null | undefined): string | null => {
    if (!municipioUf) return null;
    // Formato esperado: "Cidade/UF" ou "Cidade - UF" ou apenas "UF"
    const match = municipioUf.match(/[/-]\s*([A-Z]{2})\s*$/i) || municipioUf.match(/^([A-Z]{2})$/i);
    return match ? match[1].toUpperCase() : null;
  };

  // Mutation para salvar o descarte com snapshot
  const saveDescarteMutation = useMutation({
    mutationFn: async () => {
      if (!licitacao) throw new Error("Dados da licitação não disponíveis");
      
      const motivosSelecionados = motivos.filter(m => selectedMotivosIds.includes(m.id));
      const motivosNomes = motivosSelecionados.map(m => m.nome).join(', ');
      
      const { error } = await supabase
        .from("licitacao_descartes")
        .insert({
          licitacao_id: licitacao.id,
          motivo_id: selectedMotivosIds[0] || null,
          justificativa: justificativa.trim(),
          created_by: user?.id,
          created_by_nome: userProfile?.nome_completo || "Usuário",
          valor_estimado: licitacao.valor_estimado,
          uf: extractUF(licitacao.municipio_uf),
          municipio: licitacao.municipio_uf?.split(/[/-]/)[0]?.trim() || null,
          orgao: licitacao.orgao,
          modalidade: licitacao.subtipo_modalidade,
          numero_edital: licitacao.numero_edital,
          objeto: licitacao.objeto,
          motivo_nome: motivosNomes || null,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      setSaving(false);
      toast.success("Descarte registrado com sucesso!");
      onConfirm();
    },
    onError: () => {
      toast.error("Erro ao registrar descarte.");
      setSaving(false);
    },
  });

  const handleSubmit = async () => {
    if (selectedMotivosIds.length === 0) {
      toast.error("Selecione ao menos um motivo de descarte.");
      return;
    }
    if (!isJustificativaValid) {
      toast.error("A justificativa deve ter no mínimo 10 caracteres.");
      return;
    }
    
    setSaving(true);
    saveDescarteMutation.mutate();
  };

  const handleAddMotivo = () => {
    if (!novoMotivo.trim()) {
      toast.error("Digite o nome do motivo.");
      return;
    }
    addMotivoMutation.mutate(novoMotivo);
  };

  const handleCancel = () => {
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            <DialogTitle>Descarte de Edital</DialogTitle>
          </div>
          <DialogDescription>
            {(licitacao?.titulo || licitacao?.numero_edital) && (
              <span className="font-medium text-foreground">
                {licitacao.titulo || licitacao.numero_edital}
              </span>
            )}
            <br />
            Registre o motivo do descarte deste edital.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Dropdown de Motivo */}
          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo do Descarte *</Label>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={popoverOpen}
                  className="w-full justify-between min-h-[40px] h-auto"
                  disabled={loadingMotivos}
                >
                  <span className="text-left flex-1">
                    {selectedMotivos.length > 0 
                      ? selectedMotivos.map(m => m.nome).join(', ')
                      : "Selecione um ou mais motivos..."}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[460px] p-0 z-50 bg-background border shadow-lg">
                <Command>
                  <CommandInput placeholder="Pesquisar motivo..." />
                  <CommandList>
                    <CommandEmpty>
                      Nenhum motivo encontrado.
                    </CommandEmpty>
                    <CommandGroup>
                      {motivos.map((motivo) => (
                        <CommandItem
                          key={motivo.id}
                          value={motivo.nome}
                          onSelect={() => toggleMotivo(motivo.id)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedMotivosIds.includes(motivo.id) ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {motivo.nome}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    
                    {/* Adicionar novo motivo (apenas admin) */}
                    {isAdmin && (
                      <CommandGroup>
                        {!showAddMotivo ? (
                          <CommandItem
                            onSelect={() => setShowAddMotivo(true)}
                            className="text-primary"
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Adicionar novo motivo
                          </CommandItem>
                        ) : (
                          <div className="p-2 space-y-2">
                            <Input
                              placeholder="Nome do novo motivo"
                              value={novoMotivo}
                              onChange={(e) => setNovoMotivo(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddMotivo();
                                }
                              }}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={handleAddMotivo}
                                disabled={addMotivoMutation.isPending}
                              >
                                {addMotivoMutation.isPending ? "Salvando..." : "Adicionar"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setShowAddMotivo(false);
                                  setNovoMotivo("");
                                }}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        )}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Justificativa */}
          <div className="space-y-2">
          <Label htmlFor="justificativa">
              Justificativa *
              <span className={cn(
                "ml-2 text-xs",
                isJustificativaValid ? "text-green-600" : "text-muted-foreground"
              )}>
                ({justificativaLength}/10 caracteres mínimos)
              </span>
            </Label>
            <Textarea
              id="justificativa"
              placeholder="Descreva detalhadamente o motivo do descarte..."
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              rows={4}
              className={cn(
                !isJustificativaValid && justificativa.length > 0 && "border-destructive"
              )}
            />
            {!isJustificativaValid && justificativa.length > 0 && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Mínimo de 30 caracteres necessário
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={saving || selectedMotivosIds.length === 0 || !isJustificativaValid}
            variant="destructive"
          >
            {saving ? "Salvando..." : "Confirmar Descarte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
