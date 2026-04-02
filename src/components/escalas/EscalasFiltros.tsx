import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useEscalasLocais, useEscalasSetores } from "@/hooks/useEscalasData";

interface EscalasFiltrosProps {
  mes: number;
  ano: number;
  localId: string;
  setorId: string;
  profissional: string;
  apenasIncompletos: boolean;
  onMesChange: (mes: number) => void;
  onAnoChange: (ano: number) => void;
  onLocalChange: (localId: string) => void;
  onSetorChange: (setorId: string) => void;
  onProfissionalChange: (profissional: string) => void;
  onApenasIncompletosChange: (value: boolean) => void;
  onSync: () => void;
  isSyncing: boolean;
  syncProgress?: string;
  totalIncompletos?: number;
}

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

export function EscalasFiltros({
  mes,
  ano,
  localId,
  setorId,
  profissional,
  apenasIncompletos,
  onMesChange,
  onAnoChange,
  onLocalChange,
  onSetorChange,
  onProfissionalChange,
  onApenasIncompletosChange,
  onSync,
  isSyncing,
  syncProgress,
  totalIncompletos = 0,
}: EscalasFiltrosProps) {
  const { data: locais = [] } = useEscalasLocais();
  const { data: setores = [] } = useEscalasSetores(localId || undefined);

  const currentYear = new Date().getFullYear();
  const anos = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        {/* Mês */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Mês</label>
          <Select value={String(mes)} onValueChange={(v) => onMesChange(Number(v))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES.map((m) => (
                <SelectItem key={m.value} value={String(m.value)}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Ano */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Ano</label>
          <Select value={String(ano)} onValueChange={(v) => onAnoChange(Number(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anos.map((a) => (
                <SelectItem key={a} value={String(a)}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Local (Hospital) */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Local (Hospital)</label>
          <Select value={localId || "all"} onValueChange={(v) => onLocalChange(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Todos os locais" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os locais</SelectItem>
              {locais.map((local) => (
                <SelectItem key={local.id} value={local.id}>
                  {local.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Setor */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Setor</label>
          <Select 
            value={setorId || "all"} 
            onValueChange={(v) => onSetorChange(v === "all" ? "" : v)}
            disabled={!localId}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Todos os setores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os setores</SelectItem>
              {setores.map((setor) => (
                <SelectItem key={setor.id} value={setor.id}>
                  {setor.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Profissional */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Profissional</label>
          <Input
            placeholder="Buscar por nome..."
            value={profissional}
            onChange={(e) => onProfissionalChange(e.target.value)}
            className="w-[180px]"
          />
        </div>

        {/* Botão Sincronizar */}
        <Button 
          onClick={onSync} 
          disabled={isSyncing}
          variant="default"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Sincronizando..." : "Sincronizar Dr. Escala"}
        </Button>
      </div>

      {/* Filtro de Incompletos e Status */}
      <div className="flex items-center gap-4">
        {totalIncompletos > 0 && (
          <Button
            variant={apenasIncompletos ? "destructive" : "outline"}
            size="sm"
            onClick={() => onApenasIncompletosChange(!apenasIncompletos)}
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            {apenasIncompletos ? "Mostrando apenas incompletos" : `${totalIncompletos} plantões incompletos`}
          </Button>
        )}
        
        {syncProgress && (
          <Badge variant="secondary" className="animate-pulse">
            {syncProgress}
          </Badge>
        )}
      </div>
    </div>
  );
}
