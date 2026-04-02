import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Search, Database } from "lucide-react";
import { useState } from "react";
import type { ResidenteData } from "./constants";

interface ResidentesTableProps {
  residentes: ResidenteData[];
}

export function ResidentesTable({ residentes }: ResidentesTableProps) {
  const [busca, setBusca] = useState("");

  const filtered = residentes.filter(r =>
    !busca || r.medico.toLowerCase().includes(busca.toLowerCase()) ||
    r.crm.includes(busca) ||
    r.especialidade.toLowerCase().includes(busca.toLowerCase()) ||
    r.instituicao.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-foreground tracking-wide">Residentes</h3>
          <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-md font-medium">
            {filtered.length}
          </span>
        </div>
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
      <ScrollArea className="h-[calc(100vh-580px)] min-h-[250px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border/30">
              {["Médico", "CRM", "Especialidade", "Período", "Início", "Término", "Emissão", "Nº Certificado", "Instituição"].map((col, i) => (
                <th
                  key={col}
                  className={cn(
                    "px-4 py-2.5 font-medium text-[10px] uppercase tracking-wider text-muted-foreground",
                    [3, 4, 5, 6].includes(i) ? "text-center" : "text-left"
                  )}
                >
                  {col}
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
