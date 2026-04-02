import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGerarPagamentos } from "@/hooks/useFinanceiroData";
import { Zap } from "lucide-react";

const MESES = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
];

export function FinanceiroGerarDialog() {
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [valorHoraPadrao, setValorHoraPadrao] = useState(150);
  const gerar = useGerarPagamentos();

  const handleGerar = () => {
    gerar.mutate({ mes, ano, valorHoraPadrao }, { onSuccess: () => setOpen(false) });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Zap className="h-4 w-4" />
          Gerar Pagamentos
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerar Pagamentos a partir das Escalas</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Mês</Label>
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map((m) => (
                    <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ano</Label>
              <Input
                type="number"
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
                min={2020}
                max={2030}
              />
            </div>
          </div>
          <div>
            <Label>Valor/Hora Padrão (R$)</Label>
            <Input
              type="number"
              value={valorHoraPadrao}
              onChange={(e) => setValorHoraPadrao(Number(e.target.value))}
              min={0}
              step={10}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Usado quando não há configuração específica por setor/tipo de plantão.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleGerar} disabled={gerar.isPending}>
            {gerar.isPending ? "Gerando..." : "Gerar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
