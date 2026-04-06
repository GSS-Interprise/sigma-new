import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Database, ArrowUpDown, ArrowUp, ArrowDown, Filter, Upload } from "lucide-react";
import { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImportarSigmaModal } from "./ImportarSigmaModal";
import type { ResidenteData } from "./constants";

type SortKey = keyof ResidenteData;
type SortDir = "asc" | "desc" | null;

interface ResidentesTableProps {
  residentes: ResidenteData[];
}

function extractYear(dateStr: string): string {
  const match = dateStr?.match(/(\d{4})/);
  return match ? match[1] : "";
}

function getUniqueYears(residentes: ResidenteData[], field: "termino" | "emissao"): string[] {
  const years = new Set<string>();
  residentes.forEach(r => {
    const y = extractYear(r[field]);
    if (y) years.add(y);
  });
  return Array.from(years).sort((a, b) => b.localeCompare(a));
}

const COLUMNS: { key: SortKey; label: string; center?: boolean }[] = [
  { key: "medico", label: "Médico" },
  { key: "crm", label: "CRM" },
  { key: "especialidade", label: "Especialidade" },
  { key: "periodo", label: "Período", center: true },
  { key: "inicio", label: "Início", center: true },
  { key: "termino", label: "Término", center: true },
  { key: "emissao", label: "Emissão", center: true },
  { key: "numero_certificado", label: "Nº Certificado" },
  { key: "instituicao", label: "Instituição" },
];

export function ResidentesTable({ residentes }: ResidentesTableProps) {
  const [busca, setBusca] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [anoTermino, setAnoTermino] = useState("todos");
  const [anoEmissao, setAnoEmissao] = useState("todos");
  const [importarOpen, setImportarOpen] = useState(false);

  const terminoYears = useMemo(() => getUniqueYears(residentes, "termino"), [residentes]);
  const emissaoYears = useMemo(() => getUniqueYears(residentes, "emissao"), [residentes]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortKey(null); setSortDir(null); }
      else setSortDir("asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    let result = residentes.filter(r =>
      !busca || r.medico.toLowerCase().includes(busca.toLowerCase()) ||
      r.crm.includes(busca) ||
      r.especialidade.toLowerCase().includes(busca.toLowerCase()) ||
      r.instituicao.toLowerCase().includes(busca.toLowerCase())
    );

    if (anoTermino !== "todos") {
      result = result.filter(r => extractYear(r.termino) === anoTermino);
    }
    if (anoEmissao !== "todos") {
      result = result.filter(r => extractYear(r.emissao) === anoEmissao);
    }

    if (sortKey && sortDir) {
      result = [...result].sort((a, b) => {
        const va = (a[sortKey] ?? "").toString().toLowerCase();
        const vb = (b[sortKey] ?? "").toString().toLowerCase();
        const cmp = va.localeCompare(vb, "pt-BR", { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [residentes, busca, anoTermino, anoEmissao, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-2.5 w-2.5 opacity-30" />;
    if (sortDir === "asc") return <ArrowUp className="h-2.5 w-2.5 text-primary" />;
    return <ArrowDown className="h-2.5 w-2.5 text-primary" />;
  };

  const activeFilters = [anoTermino !== "todos", anoEmissao !== "todos"].filter(Boolean).length;

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-foreground tracking-wide">Residentes</h3>
          <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-md font-medium">
            {filtered.length}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3 w-3 text-muted-foreground" />
            {activeFilters > 0 && (
              <span className="flex items-center justify-center h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                {activeFilters}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Término</span>
            <Select value={anoTermino} onValueChange={setAnoTermino}>
              <SelectTrigger className="w-[80px] h-6 text-[10px] rounded-md border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {terminoYears.map(y => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Emissão</span>
            <Select value={anoEmissao} onValueChange={setAnoEmissao}>
              <SelectTrigger className="w-[80px] h-6 text-[10px] rounded-md border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {emissaoYears.map(y => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="h-4 w-px bg-border/60" />
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar médico, CRM..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="pl-8 h-7 text-xs rounded-lg border-border/50 bg-muted/30 focus:bg-background"
            />
          </div>
        </div>
      </div>
      <ScrollArea className="h-[calc(100vh-580px)] min-h-[250px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border/30">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={cn(
                    "px-4 py-2.5 font-medium text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none",
                    col.center ? "text-center" : "text-left"
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <SortIcon col={col.key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? (
              filtered.map((r, i) => (
                <tr key={i} className="border-b border-border/15 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 font-medium truncate max-w-[200px]">{r.medico}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.crm}</td>
                  <td className="px-4 py-2.5 truncate max-w-[180px]">{r.especialidade}</td>
                  <td className="px-4 py-2.5 text-center">{r.periodo}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums">{r.inicio}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums">{r.termino}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums">{r.emissao}</td>
                  <td className="px-4 py-2.5">{r.numero_certificado}</td>
                  <td className="px-4 py-2.5 truncate max-w-[200px] text-muted-foreground">{r.instituicao}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Database className="h-8 w-8 opacity-30" />
                    <p className="text-sm font-medium">
                      {busca ? "Nenhum residente encontrado" : "Nenhum dado disponível"}
                    </p>
                    <p className="text-xs opacity-70">
                      {busca ? "Tente uma busca diferente" : "Configure o webhook para carregar os dados"}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
