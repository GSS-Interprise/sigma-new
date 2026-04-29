import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useVincularProposta } from "@/hooks/useCampanhaPropostas";
import { FileText, Check, ChevronsUpDown } from "lucide-react";

interface Props {
  campanhaId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function VincularPropostaCampanhaDialog({ campanhaId, open, onOpenChange }: Props) {
  const [propostaId, setPropostaId] = useState("");
  const [comboOpen, setComboOpen] = useState(false);

  const { data: propostas = [] } = useQuery({
    queryKey: ["propostas-todas-vinculo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposta")
        .select("id, id_proposta, descricao, status")
        .eq("status", "geral")
        .order("id_proposta", { ascending: true, nullsFirst: false })
        .limit(10000);
      if (error) throw error;
      return (data || []).filter(
        (p: any) => !/personalizada/i.test(p.descricao || "")
      );
    },
  });

  const vincular = useVincularProposta();

  const propostaSelecionada = propostas.find((p: any) => p.id === propostaId);
  const labelOf = (p: any) =>
    p?.id_proposta || p?.descricao || (p?.id ? p.id.slice(0, 8) : "");

  const handleSubmit = async () => {
    if (!propostaId) return;
    await vincular.mutateAsync({
      campanha_id: campanhaId,
      proposta_id: propostaId,
      lista_id: null,
    });
    setPropostaId("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Vincular proposta à campanha
          </DialogTitle>
          <DialogDescription>
            Selecione a proposta geral que será associada a esta campanha.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Proposta *</Label>
            <Popover open={comboOpen} onOpenChange={setComboOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboOpen}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate text-left">
                    {propostaSelecionada
                      ? labelOf(propostaSelecionada)
                      : "Selecione uma proposta"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command
                  filter={(value, search) =>
                    value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                  }
                >
                  <CommandInput placeholder="Buscar proposta..." />
                  <CommandList>
                    <CommandEmpty>Nenhuma proposta encontrada.</CommandEmpty>
                    <CommandGroup>
                      {propostas.map((p: any) => {
                        const label = labelOf(p);
                        const searchValue = `${label} ${p.descricao || ""} ${p.id_proposta || ""}`;
                        return (
                          <CommandItem
                            key={p.id}
                            value={searchValue}
                            onSelect={() => {
                              setPropostaId(p.id);
                              setComboOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                propostaId === p.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span className="truncate">{label}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!propostaId || vincular.isPending}
            className="w-full"
          >
            {vincular.isPending ? "Vinculando..." : "Vincular proposta"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
