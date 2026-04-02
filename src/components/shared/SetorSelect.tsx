import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface SetorSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function SetorSelect({ value, onValueChange, disabled }: SetorSelectProps) {
  const { data: setores, isLoading } = useQuery({
    queryKey: ["setores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("setores")
        .select(`
          id,
          nome,
          centros_custo:centro_custo_id (
            nome
          )
        `)
        .order("nome");

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-10">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  return (
    <Select value={value || ""} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder="Selecione um setor" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Nenhum setor</SelectItem>
        {setores?.map((setor) => (
          <SelectItem key={setor.id} value={setor.id}>
            {setor.nome} {setor.centros_custo?.nome ? `(${setor.centros_custo.nome})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
