import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
].map((label, i) => ({ value: String(i + 1), label }));

// Horas → minutos. Excel pode dar: número (serial de tempo = fração de dias),
// string "156:00" (HH:MM, pode passar de 24h), ou "156" (horas decimais).
function parseHoras(v: any): number {
  if (typeof v === "number") return Math.round(v * 24 * 60); // serial Excel (dias)
  const s = String(v ?? "").trim();
  if (s.includes(":")) {
    const [h, m] = s.split(":");
    return (parseInt(h) || 0) * 60 + (parseInt(m) || 0);
  }
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 60) : 0;
}
// número robusto: aceita number direto ou string "R$ 16.848,00"
function num(v: any): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[R$\s ]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

type Linha = { nome: string; crm: string; local: string; setor: string; plantoes: number; horas_min: number; valor_hora: number; valor_fixo: boolean; valor_total: number };

export function FinanceiroImportProducaoDialog({ mesDefault, anoDefault }: { mesDefault: number; anoDefault: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mes, setMes] = useState(mesDefault);
  const [ano, setAno] = useState(anoDefault);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [arquivo, setArquivo] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  const reset = () => { setLinhas([]); setResultado(null); setArquivo(""); };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true); setResultado(null); setArquivo(file.name); setLinhas([]);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" }) as any[][];
      const hi = grid.findIndex((r) => String(r?.[0] ?? "").trim().toLowerCase() === "profissional");
      if (hi < 0) { toast.error("Não achei o cabeçalho 'Profissional' na planilha. Confira se é o relatório certo."); setParsing(false); return; }
      // detecta mês/ano do período (dd/mm/aaaa) nas linhas de cabeçalho
      for (const r of grid.slice(0, hi)) {
        const m = String(r?.[0] ?? "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (m) { setMes(Number(m[2])); setAno(Number(m[3])); break; }
      }
      const out: Linha[] = [];
      for (const r of grid.slice(hi + 1)) {
        const nome = String(r?.[0] ?? "").trim();
        if (!nome || nome.toLowerCase() === "total") break;
        out.push({
          nome,
          crm: String(r?.[1] ?? "").trim(),
          local: String(r?.[5] ?? "").trim(),
          setor: String(r?.[6] ?? "").trim(),
          plantoes: parseInt(String(r?.[7] ?? "0")) || 0,
          horas_min: parseHoras(r?.[8]),
          valor_hora: num(r?.[11]),
          valor_fixo: String(r?.[12] ?? "").trim().toLowerCase() === "sim",
          valor_total: num(r?.[13]),
        });
      }
      setLinhas(out);
      if (out.length === 0) toast.error("Nenhuma linha de produção encontrada abaixo do cabeçalho.");
    } catch (err: any) {
      toast.error("Erro ao ler o arquivo: " + (err?.message || ""));
    }
    setParsing(false);
  };

  const importar = async () => {
    if (!linhas.length) return;
    setImportando(true);
    const { data, error } = await (supabase as any).rpc("importar_producao_financeiro", {
      p_mes: mes, p_ano: ano, p_arquivo: arquivo, p_linhas: linhas,
    });
    setImportando(false);
    if (error) { toast.error("Falha no import: " + error.message); return; }
    setResultado(data);
    qc.invalidateQueries({ queryKey: ["financeiro-pagamentos"] });
    toast.success(`Importado: ${data.inseridos} linhas (${data.casados} casadas com médico).`);
  };

  const totalReais = linhas.reduce((s, l) => s + l.valor_total, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2"><Upload className="h-4 w-4" /> Importar produção</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Importar produção do mês</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">Suba o relatório <b>Consolidado - Previsão</b> (.xlsx). Reprocessa o mês inteiro a cada import.</p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mês</Label>
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MESES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ano</Label>
              <Input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} min={2020} max={2030} />
            </div>
          </div>
          <div>
            <Label>Arquivo (.xlsx)</Label>
            <Input type="file" accept=".xlsx,.xls" onChange={onFile} />
            {parsing && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Lendo planilha…</p>}
          </div>
          {linhas.length > 0 && !resultado && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <b>{linhas.length}</b> médicos no relatório · total <b>R$ {totalReais.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</b>
            </div>
          )}
          {resultado && (
            <div className="rounded-md border p-3 text-sm space-y-1.5">
              <p className="flex items-center gap-1.5 text-emerald-700 font-medium"><CheckCircle2 className="h-4 w-4" /> {resultado.inseridos} importados · {resultado.casados} casados com médico</p>
              {resultado.nao_casados?.length > 0 && (
                <div className="text-amber-700">
                  <p className="flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> {resultado.nao_casados.length} sem médico cadastrado (por CRM):</p>
                  <ul className="ml-6 list-disc text-xs text-muted-foreground max-h-32 overflow-auto mt-1">
                    {resultado.nao_casados.map((n: any, i: number) => <li key={i}>{n.nome} — {n.crm || "sem CRM"}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={importar} disabled={!linhas.length || importando}>
            {importando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {resultado ? "Reimportar" : `Importar${linhas.length ? ` ${linhas.length} linhas` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
