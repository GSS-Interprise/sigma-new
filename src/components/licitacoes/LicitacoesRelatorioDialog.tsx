import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Relatório de licitações e concorrentes (T7 de docs/arquitetura/licitacoes-contratos-gss.md).
 * Ramone, reunião de 07/10: relatório semanal para o Maikon (quantas surgiram, quantas fomos,
 * quantas ganhamos, por que não entramos, por que não ganhamos, quem ganhou), exportável em Excel
 * e PDF, e os concorrentes por região. Dados das funções licitacoes_relatorio e
 * licitacoes_concorrentes (só o quadro da GSS).
 */
type Periodo = "semana" | "semana_passada" | "mes" | "mes_passado" | "personalizado";

function intervalo(p: Periodo, de: string, ate: string): [Date, Date] {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const segunda = new Date(hoje); segunda.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
  const amanha = new Date(hoje.getTime() + 864e5);
  if (p === "semana") return [segunda, amanha];
  if (p === "semana_passada") return [new Date(segunda.getTime() - 7 * 864e5), segunda];
  if (p === "mes") return [new Date(hoje.getFullYear(), hoje.getMonth(), 1), amanha];
  if (p === "mes_passado") return [new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1), new Date(hoje.getFullYear(), hoje.getMonth(), 1)];
  const a = de ? new Date(`${de}T00:00:00`) : segunda;
  const b = ate ? new Date(new Date(`${ate}T00:00:00`).getTime() + 864e5) : amanha;
  return [a, b];
}
const brl = (v: number | null | undefined) => v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const dia = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");
const COLOCACAO = (r: any) => r.colocacao ? `${r.colocacao}º` : r.situacao === "inabilitada" ? "Inabilitada" : r.situacao === "desclassificada" ? "Desclassificada" : "—";
const REGIOES = ["Sul", "Sudeste", "Centro-Oeste", "Nordeste", "Norte"];

export function LicitacoesRelatorioDialog({ open, onOpenChange, onAbrir }: {
  open: boolean; onOpenChange: (o: boolean) => void; onAbrir: (id: string) => void;
}) {
  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [regiao, setRegiao] = useState("todas");
  const [ini, fim] = useMemo(() => intervalo(periodo, de, ate), [periodo, de, ate]);
  const rotuloPeriodo = `${ini.toLocaleDateString("pt-BR")} a ${new Date(fim.getTime() - 1).toLocaleDateString("pt-BR")}`;

  const { data: rel, isLoading } = useQuery({
    queryKey: ["licitacoes-relatorio", ini.toISOString(), fim.toISOString()],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("licitacoes_relatorio", { _ini: ini.toISOString(), _fim: fim.toISOString() });
      if (error) throw error;
      return data as any;
    },
  });
  const { data: conc, isLoading: carregandoConc } = useQuery({
    queryKey: ["licitacoes-concorrentes", regiao],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("licitacoes_concorrentes", { _ini: null, _fim: null, _regiao: regiao === "todas" ? null : regiao });
      if (error) throw error;
      return data as any;
    },
  });

  const r = rel?.resumo ?? {};
  const indicadores = [
    { rotulo: "Surgiram", valor: r.surgiram },
    { rotulo: "Disputas no período", valor: r.disputas_no_periodo },
    { rotulo: "Fomos (participamos)", valor: r.fomos },
    { rotulo: "Ganhamos", valor: r.ganhamos, extra: r.valor_ganho ? brl(r.valor_ganho) : undefined },
    { rotulo: "Não ganhamos", valor: r.nao_ganhamos },
    { rotulo: "Não entramos", valor: r.nao_entramos },
  ];

  const exportarExcel = () => {
    if (!rel) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { Período: rotuloPeriodo }, ...indicadores.map((i) => ({ Indicador: i.rotulo, Quantidade: i.valor ?? 0, Valor: i.extra ?? "" })),
    ]), "Resumo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((rel.nao_ganhamos ?? []).map((x: any) => ({
      Edital: x.titulo, Órgão: x.orgao, UF: x.uf, Colocação: COLOCACAO(x), "Motivo": x.motivo, Arrematante: x.arrematante,
      "Valor arrematante": x.valor_arrematante, "Valor GSS": x.valor_gss, Data: dia(x.em),
    }))), "Não ganhamos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((rel.nao_entramos ?? []).map((x: any) => ({
      Edital: x.titulo, Órgão: x.orgao, UF: x.uf, Motivo: x.motivo, Justificativa: x.justificativa, "Valor estimado": x.valor_estimado, Data: dia(x.em),
    }))), "Não entramos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((rel.ganhamos ?? []).map((x: any) => ({
      Edital: x.titulo, Órgão: x.orgao, UF: x.uf, Valor: x.valor, Data: dia(x.em),
    }))), "Ganhamos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((rel.quem_ganhou ?? []).map((x: any) => ({ Empresa: x.empresa, Vezes: x.n, Valor: x.valor }))), "Quem ganhou");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((conc?.empresas ?? []).map((x: any) => ({
      Empresa: x.empresa, CNPJ: x.cnpj, Disputas: x.disputas, Vitórias: x.vitorias, "À frente da GSS": x.a_frente_da_gss,
      "GSS acima (%)": x.gss_acima_pct, "Valor médio da vitória": x.valor_medio_vitoria, UFs: (x.ufs ?? []).join(", "),
    }))), "Concorrentes");
    XLSX.writeFile(wb, `relatorio-licitacoes-${ini.toISOString().slice(0, 10)}.xlsx`);
  };

  const exportarPdf = () => {
    if (!rel) return;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14); doc.text("Relatório de licitações · GSS", 14, 14);
    doc.setFontSize(10); doc.text(`Período: ${rotuloPeriodo}`, 14, 21);
    autoTable(doc, { startY: 26, head: [["Indicador", "Quantidade", "Valor"]], body: indicadores.map((i) => [i.rotulo, String(i.valor ?? 0), i.extra ?? ""]), styles: { fontSize: 9 } });
    const tabela = (titulo: string, head: string[], body: any[][]) => {
      if (!body.length) return;
      const y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(11); doc.text(titulo, 14, y);
      autoTable(doc, { startY: y + 3, head: [head], body, styles: { fontSize: 8, cellPadding: 1.5 }, columnStyles: { 0: { cellWidth: 70 } } });
    };
    tabela("Não ganhamos", ["Edital", "UF", "Colocação", "Motivo", "Arrematante", "Valor arrematante", "Valor GSS"],
      (rel.nao_ganhamos ?? []).map((x: any) => [x.titulo, x.uf ?? "", COLOCACAO(x), x.motivo ?? "", x.arrematante ?? "", brl(x.valor_arrematante), brl(x.valor_gss)]));
    tabela("Por que não entramos", ["Motivo", "Quantidade"], (rel.motivos_nao_entramos ?? []).map((x: any) => [x.motivo, String(x.n)]));
    tabela("Quem ganhou", ["Empresa", "Vezes", "Valor"], (rel.quem_ganhou ?? []).map((x: any) => [x.empresa, String(x.n), brl(x.valor)]));
    tabela("Ganhamos", ["Edital", "UF", "Valor", "Data"], (rel.ganhamos ?? []).map((x: any) => [x.titulo, x.uf ?? "", brl(x.valor), dia(x.em)]));
    doc.save(`relatorio-licitacoes-${ini.toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94dvh] max-w-5xl flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Relatório de licitações</DialogTitle>
          <DialogDescription>Quadro da GSS. "Fomos" conta as disputas do período em que a proposta foi cadastrada ou que já têm resultado.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="relatorio" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="w-fit">
            <TabsTrigger value="relatorio">Período</TabsTrigger>
            <TabsTrigger value="concorrentes">Concorrentes</TabsTrigger>
          </TabsList>

          <TabsContent value="relatorio" className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="flex flex-wrap items-end gap-2">
              <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
                <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="semana">Esta semana</SelectItem>
                  <SelectItem value="semana_passada">Semana passada</SelectItem>
                  <SelectItem value="mes">Este mês</SelectItem>
                  <SelectItem value="mes_passado">Mês passado</SelectItem>
                  <SelectItem value="personalizado">Escolher datas</SelectItem>
                </SelectContent>
              </Select>
              {periodo === "personalizado" && (
                <>
                  <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-9 w-[150px]" />
                  <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-9 w-[150px]" />
                </>
              )}
              <span className="text-sm text-muted-foreground">{rotuloPeriodo}</span>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={exportarExcel} disabled={!rel}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={exportarPdf} disabled={!rel}><FileDown className="h-4 w-4" /> PDF</Button>
              </div>
            </div>

            {isLoading ? <div className="py-10 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div> : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {indicadores.map((i) => (
                    <div key={i.rotulo} className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">{i.rotulo}</p>
                      <p className="text-2xl font-semibold tabular-nums">{i.valor ?? 0}</p>
                      {i.extra && <p className="text-xs text-muted-foreground">{i.extra}</p>}
                    </div>
                  ))}
                </div>

                <Secao titulo="Não ganhamos" vazio="Nenhum edital foi para Não ganhamos no período.">
                  {(rel?.nao_ganhamos ?? []).map((x: any) => (
                    <button key={x.id} type="button" onClick={() => onAbrir(x.id)} className="block w-full p-2.5 text-left text-sm hover:bg-muted/50">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{x.titulo}</span>
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">GSS {COLOCACAO(x)}</Badge>
                        {x.como === "fracassado" && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">fracassada</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {x.arrematante ? <>Arrematante: {x.arrematante} · {brl(x.valor_arrematante)}{x.valor_gss ? ` · GSS ${brl(x.valor_gss)}` : ""}</> : "Arrematante não registrado"}
                      </p>
                      <p className="text-xs">{x.motivo || <span className="text-amber-700">Sem motivo registrado</span>}</p>
                    </button>
                  ))}
                </Secao>

                <div className="grid gap-4 md:grid-cols-2">
                  <Secao titulo="Por que não entramos" vazio="Nenhum descarte no período.">
                    {(rel?.motivos_nao_entramos ?? []).map((x: any) => (
                      <div key={x.motivo} className="flex justify-between p-2 text-sm"><span>{x.motivo}</span><span className="tabular-nums text-muted-foreground">{x.n}</span></div>
                    ))}
                  </Secao>
                  <Secao titulo="Quem ganhou de nós" vazio="Sem arrematante registrado no período.">
                    {(rel?.quem_ganhou ?? []).map((x: any) => (
                      <div key={x.empresa} className="flex justify-between gap-2 p-2 text-sm"><span className="truncate">{x.empresa}</span><span className="shrink-0 tabular-nums text-muted-foreground">{x.n}× · {brl(x.valor)}</span></div>
                    ))}
                  </Secao>
                </div>

                <Secao titulo="Ganhamos" vazio="Nenhum edital arrematado no período.">
                  {(rel?.ganhamos ?? []).map((x: any) => (
                    <button key={x.id} type="button" onClick={() => onAbrir(x.id)} className="flex w-full justify-between gap-2 p-2.5 text-left text-sm hover:bg-muted/50">
                      <span className="truncate font-medium">{x.titulo}</span><span className="shrink-0 tabular-nums">{brl(x.valor)}</span>
                    </button>
                  ))}
                </Secao>
                <p className="text-xs text-muted-foreground">
                  Dinheiro que entrou, horas e receita dos contratos ganhos (pedido da Ramone para o relatório mensal) entram quando o contrato estiver ligado à licitação (Bloco 2).
                </p>
              </>
            )}
          </TabsContent>

          <TabsContent value="concorrentes" className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={regiao} onValueChange={setRegiao}>
                <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as regiões</SelectItem>
                  {REGIOES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">Todos os resultados registrados ({conc?.total_resultados ?? 0} disputas). Cresce a cada ata lida.</span>
            </div>
            {carregandoConc ? <div className="py-10 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div> : (
              <>
                <div className="flex flex-wrap gap-2">
                  {(conc?.por_regiao ?? []).map((g: any) => (
                    <div key={g.regiao} className="rounded-md border px-3 py-1.5 text-xs"><b>{g.regiao}</b>: {g.disputas} disputas · {g.empresas} empresas</div>
                  ))}
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="p-2 text-left font-medium">Empresa</th>
                        <th className="p-2 text-right font-medium">Disputas</th>
                        <th className="p-2 text-right font-medium">Vitórias</th>
                        <th className="p-2 text-right font-medium">À frente da GSS</th>
                        <th className="p-2 text-right font-medium" title="Quanto o lance da GSS ficou acima do dela, em média">GSS acima</th>
                        <th className="p-2 text-left font-medium">Onde aparece</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(conc?.empresas ?? []).map((e: any) => (
                        <tr key={`${e.empresa}-${e.cnpj}`} className="border-t">
                          <td className="p-2"><span className="font-medium">{e.empresa}</span>{e.cnpj && <span className="block text-xs text-muted-foreground">{e.cnpj}</span>}</td>
                          <td className="p-2 text-right tabular-nums">{e.disputas}</td>
                          <td className="p-2 text-right tabular-nums">{e.vitorias}</td>
                          <td className="p-2 text-right tabular-nums">{e.a_frente_da_gss}</td>
                          <td className="p-2 text-right tabular-nums">{e.gss_acima_pct != null ? `${e.gss_acima_pct}%` : "—"}</td>
                          <td className="p-2 text-xs">{(e.ufs ?? []).join(", ") || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Secao({ titulo, vazio, children }: { titulo: string; vazio: string; children: React.ReactNode }) {
  const itens = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : [];
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <div className="divide-y rounded-md border">
        {itens.length ? children : <p className="p-3 text-sm text-muted-foreground">{vazio}</p>}
      </div>
    </div>
  );
}
