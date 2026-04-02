import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar } from "lucide-react";

interface FiltroPeriodoProps {
  dataInicio: string;
  dataFim: string;
  onDataInicioChange: (value: string) => void;
  onDataFimChange: (value: string) => void;
  children?: React.ReactNode;
}

export function FiltroPeriodo({
  dataInicio,
  dataFim,
  onDataInicioChange,
  onDataFimChange,
  children
}: FiltroPeriodoProps) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="data-inicio" className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4" />
            Data Início
          </Label>
          <Input
            id="data-inicio"
            type="date"
            value={dataInicio}
            onChange={(e) => onDataInicioChange(e.target.value)}
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="data-fim" className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4" />
            Data Fim
          </Label>
          <Input
            id="data-fim"
            type="date"
            value={dataFim}
            onChange={(e) => onDataFimChange(e.target.value)}
          />
        </div>
        {children}
      </div>
    </Card>
  );
}
