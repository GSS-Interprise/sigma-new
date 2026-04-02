import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

interface FiltroUFProps {
  value: string;
  onChange: (value: string) => void;
}

export function FiltroUF({ value, onChange }: FiltroUFProps) {
  return (
    <div className="space-y-2">
      <Label>Estado (UF)</Label>
      <Select value={value || undefined} onValueChange={(v) => onChange(v === '__all__' ? '' : v)}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Todos os estados" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Todos</SelectItem>
          {UFS.map((uf) => (
            <SelectItem key={uf} value={uf}>
              {uf}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
