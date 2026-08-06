import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { FinanceiroPagamento, useFinanceiroPagamentoItens, useConferirPagamento } from "@/hooks/useFinanceiroData";
import { FinanceiroAnexos } from "./FinanceiroAnexos";
import { FinanceiroAjustes } from "./FinanceiroAjustes";
import { CheckCircle2, Loader2, Send, FileText } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  pagamento: FinanceiroPagamento;
  onVoltar: () => void;
}

export function FinanceiroDetalhe({ pagamento, onVoltar }: Props) {
  const { data: itens = [], isLoading } = useFinanceiroPagamentoItens(pagamento.id);
  const conferir = useConferirPagamento();
  const qc = useQueryClient();
  const [solicitando, setSolicitando] = useState(false);
  const nfStatus = pagamento.nf_status ?? "nao_solicitada";

  const solicitarNF = async () => {
    setSolicitando(true);
    const { data, error } = await supabase.functions.invoke("financeiro-solicitar-nf", { body: { pagamento_id: pagamento.id } });
    setSolicitando(false);
    if (error || (data as any)?.ok === false) { toast.error("Erro ao solicitar NF: " + (error?.message || (data as any)?.error || "")); return; }
    toast.success("Solicitação de NF enviada ao médico.");
    qc.invalidateQueries({ queryKey: ["financeiro-pagamentos"] });
  };

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const produzido = Number(pagamento.valor_produzido ?? 0);
  const aVista = Number(pagamento.valor_a_vista ?? 0);
  const ajustes = Number(pagamento.valor_ajustes ?? 0);
  // depois de aprovado o fechamento não aceita mais lançamento
  const bloqueado = pagamento.status === "aprovado" || pagamento.status === "pago";

  const formatHoras = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h${m > 0 ? String(m).padStart(2, "0") + "min" : ""}`;
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onVoltar} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Profissional</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">{pagamento.profissional_nome}</p>
            {pagamento.profissional_crm && (
              <p className="text-sm text-muted-foreground">CRM: {pagamento.profissional_crm}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">A pagar</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(Number(pagamento.valor_total))}</p>
            <p className="text-sm text-muted-foreground">
              {pagamento.total_plantoes} plantões • {formatHoras(pagamento.total_horas_minutos)}
            </p>
            {/* decomposição: só aparece quando o import trouxe as parcelas (relatório completo) */}
            {(produzido > 0 || aVista > 0 || ajustes !== 0) && (
              <div className="mt-3 space-y-1 text-xs border-t pt-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Produzido</span><span>{fmt(produzido)}</span></div>
                {aVista > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>Já pago à vista</span><span>− {fmt(aVista)}</span>
                  </div>
                )}
                {ajustes !== 0 && (
                  <div className={`flex justify-between ${ajustes < 0 ? "text-red-600" : "text-emerald-700"}`}>
                    <span>Ajustes</span><span>{ajustes > 0 ? "+ " : "− "}{fmt(Math.abs(ajustes))}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={pagamento.status === "pago" ? "default" : "outline"} className="text-sm">
              {pagamento.status === "pago" ? "Pago" : pagamento.status === "aprovado" ? "Aprovado" : "Pendente"}
            </Badge>
            {pagamento.data_vencimento && (
              <p className="text-sm text-muted-foreground mt-1">
                Vencimento: {new Date(pagamento.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")}
              </p>
            )}
            <div className="mt-3">
              {pagamento.conferido_em ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Conferido em {new Date(pagamento.conferido_em).toLocaleDateString("pt-BR")}
                </span>
              ) : (
                <Button size="sm" onClick={() => conferir.mutate({ pagamento })} disabled={conferir.isPending}>
                  {conferir.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                  Conferir e enviar ao canal
                </Button>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">NF:</span>
              <Badge variant="outline" className="text-[11px]">
                {nfStatus === "recebida" ? "Recebida" : nfStatus === "solicitada" ? "Solicitada" : "Não solicitada"}
              </Badge>
              {nfStatus !== "recebida" && (
                <Button size="sm" variant="outline" onClick={solicitarNF} disabled={solicitando}>
                  {solicitando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileText className="h-4 w-4 mr-1.5" />}
                  {nfStatus === "solicitada" ? "Reenviar solicitação" : "Solicitar NF"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{itens.some((i) => !i.data_plantao) ? "Produção do mês" : "Plantões vinculados"}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-center py-4">Carregando...</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data / Exame</TableHead>
                    <TableHead>Horário / Qtde</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-center">Duração</TableHead>
                    <TableHead className="text-right">Valor/Hora</TableHead>
                    <TableHead className="text-right">Valor Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((item) => (
                    <TableRow key={item.id} className={item.pago_a_vista ? "bg-amber-50/60" : undefined}>
                      {/* radiologia não tem data: o item é o agregado do mês por tipo de exame */}
                      <TableCell className="whitespace-nowrap">
                        {item.data_plantao
                          ? new Date(item.data_plantao + "T00:00:00").toLocaleDateString("pt-BR")
                          : <span className="font-medium">{item.descricao || "—"}</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {item.data_plantao
                          ? `${item.hora_inicio} - ${item.hora_fim}`
                          : item.quantidade
                            ? `${Number(item.quantidade).toLocaleString("pt-BR")} × ${fmt(Number(item.valor_unitario || 0))}`
                            : "—"}
                      </TableCell>
                      <TableCell>{item.setor || "—"}</TableCell>
                      <TableCell>{item.local_nome || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {item.pago_a_vista ? (
                          <Badge variant="outline" className="text-[11px] border-amber-400 text-amber-700">
                            Pago à vista
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">{item.tipo || "—"}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {item.carga_horaria_minutos ? formatHoras(item.carga_horaria_minutos) : "—"}
                      </TableCell>
                      <TableCell className="text-right">{fmt(Number(item.valor_hora))}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(Number(item.valor_total))}</TableCell>
                    </TableRow>
                  ))}
                  {itens.length > 0 && (
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={5}>Total produzido</TableCell>
                      <TableCell className="text-center">
                        {formatHoras(itens.reduce((s, i) => s + (i.carga_horaria_minutos || 0), 0))}
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right">
                        {fmt(itens.reduce((s, i) => s + Number(i.valor_total), 0))}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <FinanceiroAjustes pagamentoId={pagamento.id} bloqueado={bloqueado} base={produzido - aVista} />

      <FinanceiroAnexos pagamentoId={pagamento.id} />
    </div>
  );
}
