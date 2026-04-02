import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";

interface FiltroDisparosProps {
  especialidade: string;
  estado: string;
  especialidades: string[];
  estados: string[];
  onEspecialidadeChange: (value: string) => void;
  onEstadoChange: (value: string) => void;
}

export function FiltroDisparos({
  especialidade,
  estado,
  especialidades,
  estados,
  onEspecialidadeChange,
  onEstadoChange,
}: FiltroDisparosProps) {
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-4">Filtros de Destinatários</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="especialidade" className="text-sm font-medium mb-2 block">
            Especialidade Destino *
          </Label>
          <Select value={especialidade} onValueChange={onEspecialidadeChange}>
            <SelectTrigger id="especialidade" className="bg-background">
              <SelectValue placeholder="Selecione a especialidade" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              {especialidades.map((esp) => (
                <SelectItem key={esp} value={esp}>
                  {esp}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="estado" className="text-sm font-medium mb-2 block">
            Estado (UF)
          </Label>
          <Select value={estado || undefined} onValueChange={(value) => onEstadoChange(value || "")}>
            <SelectTrigger id="estado" className="bg-background">
              <SelectValue placeholder="Todos os estados" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              {estados.map((uf) => (
                <SelectItem key={uf} value={uf}>
                  {uf}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </Card>
  );
}
