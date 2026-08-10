import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUp, Loader2, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
].map((label, i) => ({ value: String(i + 1), label }));

// arraybuffer → base64 em chunks (btoa estoura em arrays grandes)
function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
}

/**
 * F1 — Importar fechamento MULTI-FONTE. Diferente do "Importar produção" (fonte única
 * hard-coded), este lê a config por contrato (financeiro_import_config) e delega o parse
 * pra edge `financeiro-importar-fechamento`. O relatório entra JÁ CONSOLIDADO; o tratamento
 * do relatório cru (doppler/ajuste) é outro projeto.
 */
export function FinanceiroImportarFechamentoDialog({ mesDefault, anoDefault }: { mesDefault: number; anoDefault: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [configId, setConfigId] = useState("");
  const [mes, setMes] = useState(mesDefault);
  const [ano, setAno] = useState(anoDefault);
  const [file, setFile] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [aviso, setAviso] = useState<any>(null);

  const { data: configs = [] } = useQuery({
    queryKey: ["financeiro-import-configs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("financeiro_import_config")
        .select("id, nome, fonte")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // a competência da tela pode mudar depois deste componente montar; sem isto o dialog
  // abriria no mês antigo — foi assim que julho entrou como agosto.
  useEffect(() => { setMes(mesDefault); setAno(anoDefault); }, [mesDefault, anoDefault]);

  const reset = () => { setResultado(null); setFile(null); setConfigId(""); setAviso(null); };

  const importar = async (confirmarPeriodo = false, confirmarReimport = false) => {
    if (!configId || !file) return;
    setImportando(true); setResultado(null); setAviso(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const arquivo_base64 = toBase64(bytes);
      const { data, error } = await supabase.functions.invoke("financeiro-importar-fechamento", {
        body: { config_id: configId, mes, ano, arquivo_base64, arquivo_nome: file.name, confirmar_periodo: confirmarPeriodo, confirmar_reimport: confirmarReimport },
      });
      // non-2xx vem como erro com o corpo dentro de error.context — é lá que moram
      // as recusas conscientes (período divergente, checksum estourado)
      if (error) {
        const corpo = await (error as any)?.context?.json?.().catch(() => null);
        if (corpo?.erro_periodo || corpo?.erro_checksum) { setAviso(corpo); return; }
        throw new Error(corpo?.error || error.message);
      }
      if (data?.ja_importado) { setResultado(data); return; }
      if (!data?.ok) throw new Error(data?.error || "falha no import");
      setResultado(data);
      if (data.mes) { setMes(data.mes); setAno(data.ano); }
      qc.invalidateQueries({ queryKey: ["financeiro-pagamentos"] });
      qc.invalidateQueries({ queryKey: ["financeiro-fases"] });
      qc.invalidateQueries({ queryKey: ["financeiro-receber"] });
      toast.success(`Importado: ${data.inseridos} médicos (${data.casados} casados).`);
    } catch (e: any) {
      toast.error("Falha no import: " + (e?.message || ""));
    } finally {
      setImportando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2"><FileUp className="h-4 w-4" /> Importar fechamento</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Importar fechamento (multi-fonte)</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          Suba o relatório <b>como ele vem da origem</b> (Dr. Escala Completo, Marieta, CIS…). O sistema lê pela
          config da fonte, casa os médicos e gera os pagamentos do mês. Reimportar reprocessa a fonte e
          <b> preserva os ajustes</b> já lançados.
        </p>
        <div className="space-y-4">
          <div>
            <Label>Fonte / contrato</Label>
            <Select value={configId} onValueChange={setConfigId}>
              <SelectTrigger><SelectValue placeholder="Selecione a fonte…" /></SelectTrigger>
              <SelectContent>
                {configs.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome} <span className="text-muted-foreground">({c.fonte})</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
            {configs.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <Info className="h-3 w-3" /> Nenhuma fonte configurada ainda (tabela financeiro_import_config).
              </p>
            )}
          </div>
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
            <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { setFile(e.target.files?.[0] || null); setResultado(null); setAviso(null); }} />
          </div>
          {aviso?.erro_periodo && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
              <p className="flex items-start gap-1.5 font-medium">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {aviso.msg}
              </p>
              <p className="text-xs">O mês vem do próprio arquivo — foi assim que julho entrou como agosto da última vez.</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { setMes(aviso.periodo_arquivo.mes); setAno(aviso.periodo_arquivo.ano); importar(true); }}>
                  Usar {String(aviso.periodo_arquivo.mes).padStart(2, "0")}/{aviso.periodo_arquivo.ano} (do arquivo)
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAviso(null)}>Cancelar</Button>
              </div>
            </div>
          )}
          {aviso?.erro_checksum && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 space-y-1.5">
              <p className="flex items-start gap-1.5 font-medium">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {aviso.msg}
              </p>
              <p className="text-xs">Nada foi importado. Confira o arquivo com o Dr. Escala:</p>
              <ul className="ml-5 list-disc text-xs space-y-0.5">
                {aviso.divergencias?.map((d: any, i: number) => (
                  <li key={i}>{d.medico}: soma dos plantões R$ {Number(d.calculado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} × relatório R$ {Number(d.relatorio).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</li>
                ))}
              </ul>
            </div>
          )}
          {resultado && !resultado.ja_importado && (
            <div className="rounded-md border p-3 text-sm space-y-1.5">
              <p className="flex items-center gap-1.5 text-emerald-700 font-medium">
                <CheckCircle2 className="h-4 w-4" /> {resultado.inseridos} médicos · {resultado.casados} casados
                {resultado.plantoes ? ` · ${resultado.plantoes} plantões` : ""}
              </p>
              <div className="text-xs space-y-0.5 border-t pt-1.5">
                <div className="flex justify-between"><span className="text-muted-foreground">Produzido</span><span>R$ {Number(resultado.total_produzido || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></div>
                {Number(resultado.total_a_vista) > 0 && (
                  <div className="flex justify-between text-amber-700"><span>Já pago à vista</span><span>− R$ {Number(resultado.total_a_vista).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></div>
                )}
                <div className="flex justify-between font-semibold"><span>A pagar</span><span>R$ {Number(resultado.total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></div>
                <div className="text-muted-foreground pt-0.5">Competência: {String(resultado.mes).padStart(2, "0")}/{resultado.ano}</div>
                {resultado.ajustes_restaurados > 0 && (
                  <div className="text-muted-foreground">{resultado.ajustes_restaurados} ajuste(s) preservado(s) do import anterior.</div>
                )}
                {resultado.ajustes_perdidos > 0 && (
                  <div className="text-amber-700">{resultado.ajustes_perdidos} ajuste(s) não puderam ser reaplicados — médico saiu do relatório.</div>
                )}
              </div>
              {resultado.avisos?.length > 0 && (
                <div className="text-amber-800 border-t pt-1.5">
                  <p className="flex items-center gap-1.5 text-xs font-medium">
                    <AlertTriangle className="h-3.5 w-3.5" /> {resultado.avisos.length} médico(s) com total da planilha diferente do calculado:
                  </p>
                  <ul className="ml-5 list-disc text-[11px] mt-0.5">
                    {resultado.avisos.map((d: any, i: number) => (
                      <li key={i}>{d.medico}: planilha R$ {Number(d.relatorio).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} × calculado R$ {Number(d.calculado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</li>
                    ))}
                  </ul>
                  <p className="text-[11px] mt-1">Foi importado o <b>calculado</b>. Se o valor da planilha estiver certo, lance a diferença como ajuste no médico.</p>
                </div>
              )}
              {resultado.nao_casados?.length > 0 && (
                <div className="text-amber-700">
                  <p className="flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> {resultado.nao_casados.length} sem médico casado (resolver manual):</p>
                  <ul className="ml-6 list-disc text-xs text-muted-foreground max-h-32 overflow-auto mt-1">
                    {resultado.nao_casados.map((n: any, i: number) => <li key={i}>{n.nome}{n.crm ? ` — ${n.crm}` : ""}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
          {resultado?.ja_importado && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
              <p className="flex items-start gap-1.5 font-medium">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {resultado.msg || "Este arquivo já tinha sido importado."}
              </p>
              <p className="text-xs">
                Renomear o arquivo não muda o conteúdo. Se quiser processar de novo — porque
                corrigiu algo na origem, por exemplo — pode seguir: os ajustes que você lançou são preservados.
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => importar(true, true)} disabled={importando}>
                  {importando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Importar mesmo assim
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setResultado(null)}>Cancelar</Button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => importar(false)} disabled={!configId || !file || importando}>
            {importando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {resultado && !resultado.ja_importado ? "Reimportar" : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
