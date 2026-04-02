import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Package,
  Users,
  Trophy,
  Star,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Edit2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LicitacaoCompetitividadeViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  licitacaoId: string;
  licitacaoTitulo?: string;
  onEdit?: () => void;
}

const TIPO_ITEM_LABELS: Record<string, string> = {
  consulta: "Consulta",
  exame: "Exame",
  servico: "Serviço Médico",
  plantao: "Plantão",
  especialidade: "Especialidade",
  outro: "Outro",
};

const SITUACAO_CONFIG: Record<string, { label: string; color: string; textColor: string }> = {
  habilitada: { label: "Habilitada", color: "bg-green-100", textColor: "text-green-700" },
  inabilitada: { label: "Inabilitada", color: "bg-orange-100", textColor: "text-orange-700" },
  desclassificada: { label: "Desclassificada", color: "bg-red-100", textColor: "text-red-700" },
};

export function LicitacaoCompetitividadeViewDialog({
  open,
  onOpenChange,
  licitacaoId,
  licitacaoTitulo,
  onEdit,
}: LicitacaoCompetitividadeViewDialogProps) {
  // Buscar itens e concorrentes
  const { data: itens = [], isLoading } = useQuery({
    queryKey: ["licitacao-itens-view", licitacaoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("licitacao_itens")
        .select(`
          *,
          licitacao_item_concorrentes(*)
        `)
        .eq("licitacao_id", licitacaoId)
        .order("created_at");
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: open && !!licitacaoId,
  });

  // Buscar resultado geral
  const { data: resultado } = useQuery({
    queryKey: ["licitacao-resultado-view", licitacaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licitacao_resultados")
        .select("*")
        .eq("licitacao_id", licitacaoId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!licitacaoId,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  // Calcular estatísticas da GSS
  const gssStats = (() => {
    if (!itens.length) return null;

    let totalItens = itens.length;
    let itensGanhos = 0;
    let totalValorGSS = 0;
    let totalValorVencedor = 0;
    let posicaoMedia = 0;
    let countPosicao = 0;

    itens.forEach((item: any) => {
      const concorrentes = item.licitacao_item_concorrentes || [];
      const gss = concorrentes.find((c: any) => c.is_gss);
      const vencedor = concorrentes.find((c: any) => c.is_vencedor);

      if (gss) {
        if (gss.is_vencedor) itensGanhos++;
        totalValorGSS += gss.valor_ofertado * (item.quantidade || 1);
        posicaoMedia += gss.posicao;
        countPosicao++;
      }

      if (vencedor) {
        totalValorVencedor += vencedor.valor_ofertado * (item.quantidade || 1);
      }
    });

    const taxaSucesso = totalItens > 0 ? (itensGanhos / totalItens) * 100 : 0;
    const diferencaPreco = totalValorVencedor > 0 ? ((totalValorGSS - totalValorVencedor) / totalValorVencedor) * 100 : 0;
    const posMediaFinal = countPosicao > 0 ? posicaoMedia / countPosicao : 0;

    return {
      totalItens,
      itensGanhos,
      taxaSucesso,
      totalValorGSS,
      totalValorVencedor,
      diferencaPreco,
      posicaoMedia: posMediaFinal,
    };
  })();

  const hasData = itens.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Inteligência Competitiva
              </DialogTitle>
              <DialogDescription>
                {licitacaoTitulo && (
                  <span className="font-medium text-foreground">{licitacaoTitulo}</span>
                )}
              </DialogDescription>
            </div>
            {onEdit && hasData && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Edit2 className="h-4 w-4 mr-1" />
                Editar
              </Button>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : !hasData ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-muted-foreground mb-1">
                Nenhuma informação de competitividade registrada
              </p>
              <p className="text-xs text-muted-foreground">
                As informações serão registradas ao encerrar a licitação.
              </p>
            </div>
          ) : (
            <div className="space-y-6 py-4">
              {/* Cards de Resumo */}
              {gssStats && (
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-muted/50 rounded-lg p-3 border">
                    <div className="flex items-center gap-2 mb-1">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Itens</span>
                    </div>
                    <div className="text-xl font-bold">{gssStats.totalItens}</div>
                    <div className="text-xs text-muted-foreground">
                      {gssStats.itensGanhos} ganhos pela GSS
                    </div>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-3 border">
                    <div className="flex items-center gap-2 mb-1">
                      <Trophy className="h-4 w-4 text-amber-500" />
                      <span className="text-xs text-muted-foreground">Taxa de Sucesso</span>
                    </div>
                    <div className={cn(
                      "text-xl font-bold",
                      gssStats.taxaSucesso >= 50 ? "text-green-600" : "text-red-600"
                    )}>
                      {gssStats.taxaSucesso.toFixed(0)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Itens arrematados
                    </div>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-3 border">
                    <div className="flex items-center gap-2 mb-1">
                      <Star className="h-4 w-4 text-blue-500" />
                      <span className="text-xs text-muted-foreground">Posição Média</span>
                    </div>
                    <div className="text-xl font-bold">
                      {gssStats.posicaoMedia > 0 ? `${gssStats.posicaoMedia.toFixed(1)}º` : "-"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Ranking da GSS
                    </div>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-3 border">
                    <div className="flex items-center gap-2 mb-1">
                      {gssStats.diferencaPreco > 0 ? (
                        <TrendingUp className="h-4 w-4 text-red-500" />
                      ) : gssStats.diferencaPreco < 0 ? (
                        <TrendingDown className="h-4 w-4 text-green-500" />
                      ) : (
                        <Minus className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-xs text-muted-foreground">Δ Preço vs Vencedor</span>
                    </div>
                    <div className={cn(
                      "text-xl font-bold",
                      gssStats.diferencaPreco > 0 ? "text-red-600" : 
                      gssStats.diferencaPreco < 0 ? "text-green-600" : ""
                    )}>
                      {gssStats.diferencaPreco > 0 ? "+" : ""}
                      {gssStats.diferencaPreco.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {gssStats.diferencaPreco > 0 ? "Acima do vencedor" : "Abaixo do vencedor"}
                    </div>
                  </div>
                </div>
              )}

              {/* Resultado Geral */}
              {resultado && (
                <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <Trophy className="h-4 w-4 text-primary" />
                    Resultado Geral
                  </h3>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Empresa Vencedora:</span>
                      <p className="font-medium">{resultado.empresa_vencedora_nome || "-"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Valor Homologado:</span>
                      <p className="font-medium">
                        {resultado.valor_homologado ? formatCurrency(resultado.valor_homologado) : "-"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Classificação GSS:</span>
                      <p className="font-medium capitalize">
                        {resultado.classificacao_gss?.replace(/_/g, " ") || "-"}
                      </p>
                    </div>
                  </div>
                  {resultado.observacoes_estrategicas && (
                    <div className="mt-3 pt-3 border-t">
                      <span className="text-xs text-muted-foreground">Observações Estratégicas:</span>
                      <p className="text-sm mt-1">{resultado.observacoes_estrategicas}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Lista de Itens */}
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <Package className="h-4 w-4" />
                  Itens e Concorrentes ({itens.length})
                </h3>

                <Accordion type="multiple" className="space-y-2">
                  {itens.map((item: any, index: number) => {
                    const concorrentes = item.licitacao_item_concorrentes || [];
                    const gss = concorrentes.find((c: any) => c.is_gss);
                    const vencedor = concorrentes.find((c: any) => c.is_vencedor);

                    return (
                      <AccordionItem
                        key={item.id}
                        value={`item-${index}`}
                        className="border rounded-lg px-4"
                      >
                        <AccordionTrigger className="hover:no-underline py-3">
                          <div className="flex items-center gap-3 flex-1 text-left">
                            <Badge variant="outline">
                              {TIPO_ITEM_LABELS[item.tipo] || item.tipo}
                            </Badge>
                            <span className="font-medium truncate">{item.nome}</span>
                            {item.valor_referencia && (
                              <span className="text-xs text-muted-foreground">
                                Ref: {formatCurrency(item.valor_referencia)}
                              </span>
                            )}
                            <Badge variant="secondary" className="ml-auto mr-2">
                              <Users className="h-3 w-3 mr-1" />
                              {concorrentes.length}
                            </Badge>
                            {gss?.is_vencedor && (
                              <Badge className="bg-green-500 text-white">
                                <Trophy className="h-3 w-3 mr-1" />
                                GSS Venceu
                              </Badge>
                            )}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-12">Pos.</TableHead>
                                <TableHead>Empresa</TableHead>
                                <TableHead className="w-32">Valor</TableHead>
                                <TableHead className="w-28">Situação</TableHead>
                                <TableHead className="w-20 text-center">Flags</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {concorrentes
                                .sort((a: any, b: any) => a.posicao - b.posicao)
                                .map((conc: any) => {
                                  const situacaoConfig = SITUACAO_CONFIG[conc.situacao] || SITUACAO_CONFIG.habilitada;
                                  
                                  return (
                                    <TableRow 
                                      key={conc.id}
                                      className={cn(
                                        conc.is_gss && "bg-primary/5",
                                        conc.is_vencedor && "bg-green-50"
                                      )}
                                    >
                                      <TableCell className="font-medium">
                                        {conc.posicao}º
                                      </TableCell>
                                      <TableCell>
                                        <div>
                                          <span className={cn(conc.is_gss && "font-semibold text-primary")}>
                                            {conc.empresa_nome}
                                          </span>
                                          {conc.empresa_cnpj && (
                                            <span className="text-xs text-muted-foreground ml-2">
                                              ({conc.empresa_cnpj})
                                            </span>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="font-mono">
                                        {formatCurrency(conc.valor_ofertado)}
                                      </TableCell>
                                      <TableCell>
                                        <span className={cn(
                                          "px-2 py-0.5 rounded text-xs",
                                          situacaoConfig.color,
                                          situacaoConfig.textColor
                                        )}>
                                          {situacaoConfig.label}
                                        </span>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <div className="flex items-center justify-center gap-1">
                                          {conc.is_gss && (
                                            <Badge variant="outline" className="text-xs px-1.5 py-0 border-primary text-primary">
                                              GSS
                                            </Badge>
                                          )}
                                          {conc.is_vencedor && (
                                            <Trophy className="h-4 w-4 text-amber-500" />
                                          )}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                            </TableBody>
                          </Table>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
