import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Check, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TipoContratacaoSelectProps {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  campoNome?: string; // Allows different config for different contract types
  allowCustomTypes?: boolean; // Controls if user can add/delete custom types
}

const DEFAULT_TIPOS = [
  { id: "credenciamento", label: "Credenciamento" },
  { id: "licitacao", label: "Licitação" },
  { id: "dispensa", label: "Dispensa de Licitação" },
  { id: "direta_privada", label: "Contratação Direta/Privada" },
];

export function TipoContratacaoSelect({ 
  value, 
  onChange, 
  disabled,
  campoNome = "tipo_contratacao",
  allowCustomTypes = false 
}: TipoContratacaoSelectProps) {
  const [open, setOpen] = useState(false);
  const [novoTipo, setNovoTipo] = useState("");
  const [showAddInput, setShowAddInput] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; label: string } | null>(null);
  const queryClient = useQueryClient();

  // Fetch custom types from config_lista_items
  const { data: customTipos = [] } = useQuery({
    queryKey: ['config-tipos-contratacao', campoNome],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('config_lista_items')
        .select('*')
        .eq('campo_nome', campoNome)
        .order('valor');
      
      if (error) throw error;
      return data || [];
    },
  });

  // Combine default types with custom types
  const allTipos = [
    ...DEFAULT_TIPOS,
    ...customTipos.map(t => ({ id: t.id, label: t.valor, isCustom: true }))
  ];

  // Get current selected label
  const selectedLabel = allTipos.find(t => t.id === value || t.label === value)?.label || value;

  // Add new type mutation
  const addMutation = useMutation({
    mutationFn: async (novoValor: string) => {
      const { data, error } = await supabase
        .from('config_lista_items')
        .insert({ campo_nome: campoNome, valor: novoValor })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['config-tipos-contratacao', campoNome] });
      onChange(data.valor);
      setNovoTipo("");
      setShowAddInput(false);
      toast.success("Tipo adicionado com sucesso");
    },
    onError: (error: any) => {
      toast.error("Erro ao adicionar tipo: " + error.message);
    },
  });

  // Delete type mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('config_lista_items')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config-tipos-contratacao', campoNome] });
      toast.success("Tipo removido com sucesso");
      // If deleted type was selected, clear selection
      if (deleteConfirm && (value === deleteConfirm.id || value === deleteConfirm.label)) {
        onChange("");
      }
      setDeleteConfirm(null);
    },
    onError: (error: any) => {
      toast.error("Erro ao remover tipo: " + error.message);
    },
  });

  const handleAddTipo = () => {
    const trimmed = novoTipo.trim();
    if (!trimmed) {
      toast.error("Digite um nome para o tipo");
      return;
    }
    // Check if already exists
    const exists = allTipos.some(t => t.label.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      toast.error("Este tipo já existe");
      return;
    }
    addMutation.mutate(trimmed);
  };

  const handleSelect = (tipoId: string) => {
    // For default types, use the id (enum value), for custom types use the label
    const tipo = allTipos.find(t => t.id === tipoId || t.label === tipoId);
    const valueToSave = tipo && !('isCustom' in tipo && tipo.isCustom) ? tipo.id : (tipo?.label || tipoId);
    onChange(valueToSave);
    setOpen(false);
    setShowAddInput(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between font-normal",
              !value && "text-muted-foreground"
            )}
            disabled={disabled}
          >
            {selectedLabel || "Selecione o tipo"}
            <svg
              className="ml-2 h-4 w-4 shrink-0 opacity-50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0 bg-background border shadow-lg z-50" align="start">
          <Command>
            <CommandInput placeholder="Buscar tipo..." />
            <CommandList>
              <CommandEmpty>Nenhum tipo encontrado.</CommandEmpty>
              <CommandGroup heading="Tipos de Contratação">
                {allTipos.map((tipo) => (
                  <CommandItem
                    key={tipo.id}
                    value={tipo.label}
                    onSelect={() => handleSelect(tipo.id)}
                    className="flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2">
                      <Check
                        className={cn(
                          "h-4 w-4",
                          value === tipo.id || value === tipo.label
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      <span>{tipo.label}</span>
                    </div>
                    {allowCustomTypes && 'isCustom' in tipo && tipo.isCustom && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm({ id: tipo.id, label: tipo.label });
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
              {allowCustomTypes && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    {showAddInput ? (
                      <div className="p-2 space-y-2">
                        <Input
                          placeholder="Nome do novo tipo..."
                          value={novoTipo}
                          onChange={(e) => setNovoTipo(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddTipo();
                            }
                            if (e.key === "Escape") {
                              setShowAddInput(false);
                              setNovoTipo("");
                            }
                          }}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={handleAddTipo}
                            disabled={addMutation.isPending}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Adicionar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setShowAddInput(false);
                              setNovoTipo("");
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <CommandItem
                        onSelect={() => setShowAddInput(true)}
                        className="cursor-pointer"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Adicionar novo tipo
                      </CommandItem>
                    )}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o tipo "{deleteConfirm?.label}"? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
