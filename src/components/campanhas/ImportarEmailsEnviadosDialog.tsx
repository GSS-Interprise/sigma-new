import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Quem usa: o Vinicius, depois que a equipe mandou os e-mails nominais da campanha (~2.500/dia).
// Decisão: registrar que esses médicos receberam e-mail, para virar indicador da campanha.
// O Sigma lê qualquer planilha (xlsx/csv) e pega os e-mails de qualquer coluna.

type Resultado = { emails_na_planilha: number; registrados: number; ja_registrados_hoje: number; fora_da_campanha: number };
type Pessoa = { id: string; nome_completo: string | null };

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const hojeBrt = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

async function emailsDoArquivo(arquivo: File): Promise<string[]> {
  const wb = XLSX.read(await arquivo.arrayBuffer());
  const achados = new Set<string>();
  for (const nome of wb.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, raw: false });
    for (const linha of linhas) for (const celula of linha || []) {
      for (const e of String(celula ?? "").match(EMAIL) || []) achados.add(e.toLowerCase());
    }
  }
  return [...achados];
}

export function ImportarEmailsEnviadosDialog({ open, onOpenChange, campanhaId, campanhaNome }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanhaId: string;
  campanhaNome?: string | null;
}) {
  const { user } = useAuth();
  const [emails, setEmails] = useState<string[] | null>(null);
  const [arquivoNome, setArquivoNome] = useState("");
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [quem, setQuem] = useState<string>("");
  const [data, setData] = useState(hojeBrt());
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmails(null); setArquivoNome(""); setResultado(null); setData(hojeBrt()); setQuem(user?.id || "");
    void supabase.from("profiles").select("id, nome_completo").eq("status", "ativo").order("nome_completo")
      .then(({ data: rows }) => setPessoas((rows || []) as Pessoa[]));
  }, [open, user?.id]);

  const lerArquivo = async (arquivo?: File) => {
    if (!arquivo) return;
    setLendo(true); setResultado(null); setArquivoNome(arquivo.name);
    try {
      const lista = await emailsDoArquivo(arquivo);
      setEmails(lista);
      if (!lista.length) toast.error("Nenhum e-mail encontrado nessa planilha.");
    } catch {
      setEmails(null);
      toast.error("Não consegui ler esse arquivo. Use .xlsx ou .csv.");
    } finally {
      setLendo(false);
    }
  };

  const registrar = async () => {
    if (!emails?.length) return;
    setEnviando(true);
    // meio-dia de Brasília: a data escolhida não escorrega para o dia anterior por fuso
    const enviadoEm = new Date(`${data}T12:00:00-03:00`).toISOString();
    const { data: r, error } = await supabase.rpc("importar_envios_email" as never, {
      p_campanha_id: campanhaId, p_emails: emails, p_enviado_por: quem || null, p_enviado_em: enviadoEm,
    } as never);
    setEnviando(false);
    if (error) { toast.error("Não foi possível registrar: " + error.message); return; }
    setResultado(r as unknown as Resultado);
    toast.success(`${(r as unknown as Resultado).registrados.toLocaleString("pt-BR")} médicos com e-mail registrado.`);
  };

  const n = (v: number) => v.toLocaleString("pt-BR");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar e-mails enviados</DialogTitle>
          <DialogDescription className="truncate">{campanhaNome || "Campanha"}</DialogDescription>
        </DialogHeader>

        {resultado ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 font-medium text-emerald-700">
              <CheckCircle2 className="h-5 w-5 shrink-0" /> {n(resultado.registrados)} médicos com e-mail registrado
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>{n(resultado.emails_na_planilha)} e-mails na planilha</li>
              {resultado.ja_registrados_hoje > 0 && <li>{n(resultado.ja_registrados_hoje)} já estavam registrados nesse dia</li>}
              {resultado.fora_da_campanha > 0 && <li>{n(resultado.fora_da_campanha)} não são de médicos desta campanha</li>}
            </ul>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="planilha-emails">Planilha que foi enviada</Label>
              <Input id="planilha-emails" type="file" accept=".xlsx,.xls,.csv" className="min-h-11"
                onChange={(e) => void lerArquivo(e.target.files?.[0])} disabled={lendo || enviando} />
              {lendo && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo a planilha…</p>}
              {emails && !lendo && (
                <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{arquivoNome}</span>
                  <span className="shrink-0 font-medium text-foreground">· {n(emails.length)} e-mails</span>
                </p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="quem-enviou">Quem enviou</Label>
                <Select value={quem} onValueChange={setQuem}>
                  <SelectTrigger id="quem-enviou" className="min-h-11"><SelectValue placeholder="Escolher pessoa" /></SelectTrigger>
                  <SelectContent>
                    {pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_completo || "Sem nome"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dia-envio">Dia do envio</Label>
                <Input id="dia-envio" type="date" className="min-h-11" value={data} max={hojeBrt()} onChange={(e) => setData(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {resultado ? (
            <Button className="min-h-11" onClick={() => onOpenChange(false)}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={enviando}>Cancelar</Button>
              <Button className="min-h-11" onClick={() => void registrar()} disabled={!emails?.length || !quem || !data || enviando || lendo}>
                {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {emails?.length ? `Registrar ${n(emails.length)} e-mails` : "Registrar"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
