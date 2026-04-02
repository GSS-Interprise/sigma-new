import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  FileText, 
  Building2, 
  DollarSign, 
  MapPin, 
  Calendar, 
  ExternalLink,
  ArrowRight,
  X,
  Paperclip,
  Link2
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useContratoRascunho } from "@/hooks/useContratoRascunho";
import { ConsolidarContratoDialog } from "./ConsolidarContratoDialog";
import { VincularContratoExistenteDialog } from "./VincularContratoExistenteDialog";
import { ContratoDialogWithClient } from "./ContratoDialogWithClient";
import { supabase } from "@/integrations/supabase/client";

interface ContratoRascunhoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rascunhoId: string;
  onConsolidado?: (contratoId: string) => void;
}

export function ContratoRascunhoDialog({
  open,
  onOpenChange,
  rascunhoId,
  onConsolidado,
}: ContratoRascunhoDialogProps) {
  const [consolidarOpen, setConsolidarOpen] = useState(false);
  const [vincularOpen, setVincularOpen] = useState(false);
  const [novoContratoOpen, setNovoContratoOpen] = useState(false);
  const [preenchimentoLicitacao, setPreenchimentoLicitacao] = useState<Record<string, any> | null>(null);

  // Abre o ContratoDialogWithClient APÓS o preenchimento estar no state
  useEffect(() => {
    if (preenchimentoLicitacao !== null) {
      setNovoContratoOpen(true);
    }
  }, [preenchimentoLicitacao]);
  const { rascunho, anexos, licitacao, isLoading } = useContratoRascunho(rascunhoId);

  const handleOpenAnexo = async (anexo: any) => {
    try {
      // Tentar abrir do bucket licitacoes-anexos
      const { data: urlData } = await supabase.storage
        .from('licitacoes-anexos')
        .createSignedUrl(anexo.arquivo_url, 3600);

      if (urlData?.signedUrl) {
        window.open(urlData.signedUrl, "_blank");
      }
    } catch (error) {
      console.error("Erro ao abrir anexo:", error);
    }
  };

  const overlay = rascunho?.overlay_json || {};

  // Sanitizar HTML do objeto (vem do editor rich-text da licitação)
  const sanitizeHtml = (html: string): string => {
    if (!html) return '';
    // Verificar se é HTML
    if (!html.includes('<')) return html;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    return tempDiv.textContent || tempDiv.innerText || '';
  };

  const objetoTexto = sanitizeHtml(
    licitacao?.objeto || (overlay as any).objeto || ''
  );

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Serviços do rascunho
  const servicos = (rascunho as any)?.servicos_json || [];
  const totalServicos = Array.isArray(servicos) 
    ? servicos.reduce((acc: number, s: any) => acc + (s.valor || 0), 0) 
    : 0;

  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return "N/A";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col overflow-hidden">
          {/* Banner de Contrato Temporário */}
          <div className="bg-amber-500 text-white px-4 py-3 -mx-6 -mt-6 rounded-t-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              <span className="font-semibold">CONTRATO TEMPORÁRIO</span>
              {licitacao && (
                <Badge variant="secondary" className="bg-white/20 text-white">
                  Licitação #{licitacao.licitacao_codigo || licitacao.numero_edital || licitacao.id.slice(0, 8)}
                </Badge>
              )}
            </div>
            <Badge variant="outline" className="border-white/50 text-white">
              Rascunho
            </Badge>
          </div>

          <DialogHeader className="pt-4">
            <DialogTitle className="text-xl flex items-center gap-2">
              Pré-contrato de Licitação
            </DialogTitle>
            <DialogDescription>
              Este contrato ainda não foi consolidado. Preencha os dados necessários e clique em "Consolidar Contrato".
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 pr-4">
            <div className="space-y-6">
              {/* Dados da Licitação (overlay) - Somente leitura */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Dados da Licitação (Origem)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Priorizar dados reais da licitação, com fallback pro overlay */}
                  {(() => {
                    const titulo = (overlay as any).titulo || licitacao?.titulo || licitacao?.numero_edital || '-';
                    const numeroEdital = (overlay as any).numero_edital || licitacao?.numero_edital || licitacao?.licitacao_codigo || '-';
                    const orgao = (overlay as any).orgao || licitacao?.orgao || '-';
                    const tipoSubtipo = [(overlay as any).tipo_modalidade || licitacao?.tipo_modalidade, (overlay as any).subtipo_modalidade || licitacao?.subtipo_modalidade].filter(Boolean).join(' / ') || '-';
                    const municipioUf = (overlay as any).municipio_uf || licitacao?.municipio_uf || '-';
                    const valorEstimado = (overlay as any).valor_estimado || licitacao?.valor_estimado;
                    const dataDisputa = (overlay as any).data_disputa || licitacao?.data_disputa;
                    return (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Título</label>
                          <p className="text-sm">{titulo}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Nº Edital</label>
                          <p className="text-sm">{numeroEdital}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Órgão</label>
                          <p className="text-sm">{orgao}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Tipo/Subtipo</label>
                          <p className="text-sm">{tipoSubtipo}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Município/UF</label>
                            <p className="text-sm">{municipioUf}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Valor Estimado</label>
                            <p className="text-sm">
                              {valorEstimado
                                ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorEstimado)
                                : '-'}
                            </p>
                          </div>
                        </div>
                        {dataDisputa && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Data Disputa</label>
                              <p className="text-sm">
                                {format(new Date(dataDisputa), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {objetoTexto && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Objeto</label>
                      <p className="text-sm whitespace-pre-wrap">{objetoTexto}</p>
                    </div>
                  )}

                  {overlay.etiquetas && overlay.etiquetas.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Etiquetas</label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {overlay.etiquetas.map((tag: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {licitacao && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`/licitacoes?id=${licitacao.id}`, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Ver Licitação Original
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Serviços Definidos */}
              {Array.isArray(servicos) && servicos.length > 0 && (
                <Card className="border-primary/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Serviços Definidos
                      <Badge variant="default" className="ml-2">
                        {servicos.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {servicos.map((servico: any, idx: number) => (
                        <div
                          key={servico.id || idx}
                          className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                        >
                          <span className="text-sm font-medium">{servico.nome || `Serviço ${idx + 1}`}</span>
                          <span className="text-sm font-semibold text-primary">
                            {formatCurrency(servico.valor)}
                          </span>
                        </div>
                      ))}
                      <Separator className="my-2" />
                      <div className="flex items-center justify-between p-3 bg-primary/10 rounded-md">
                        <span className="font-semibold">Total dos Serviços:</span>
                        <span className="font-bold text-primary text-lg">
                          {formatCurrency(totalServicos)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Anexos do Card da Licitação */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Paperclip className="h-4 w-4" />
                    Anexos da Licitação
                    {anexos && anexos.length > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {anexos.length}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {anexos && anexos.length > 0 ? (
                    <div className="space-y-2">
                      {anexos.map((anexo) => (
                        <div
                          key={anexo.id}
                          className="flex items-center justify-between p-2 rounded-md border hover:bg-muted/50 cursor-pointer"
                          onClick={() => handleOpenAnexo(anexo)}
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{anexo.arquivo_nome}</span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {anexo.origem}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum anexo encontrado</p>
                  )}
                </CardContent>
              </Card>

              {/* Info */}
              <Card className="bg-muted/30">
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground">
                    Este é um <strong>contrato rascunho</strong> (pré-contrato). Ele guarda o contexto da 
                    licitação arrematada e seus anexos, mas não possui as validações obrigatórias de um 
                    contrato real. Para transformá-lo em um contrato oficial, clique em "Consolidar Contrato".
                  </p>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>

          <Separator className="my-4" />

          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 mr-2" />
              Fechar
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setVincularOpen(true)}>
                <Link2 className="h-4 w-4 mr-2" />
                Vincular a Contrato Existente
              </Button>
              <Button onClick={() => setConsolidarOpen(true)}>
                <ArrowRight className="h-4 w-4 mr-2" />
                Consolidar Contrato
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConsolidarContratoDialog
        open={consolidarOpen}
        onOpenChange={setConsolidarOpen}
        rascunhoId={rascunhoId}
        overlay={overlay}
        licitacaoId={rascunho?.licitacao_id as string | undefined}
        onSuccess={(contratoId) => {
          setConsolidarOpen(false);
          onOpenChange(false);
          onConsolidado?.(contratoId);
        }}
        onAvancarParaContrato={(dadosLicitacao) => {
          // Converter servicos_json em itens de contrato
          const servicosJson = (rascunho as any)?.servicos_json || [];
          const itensContrato = Array.isArray(servicosJson)
            ? servicosJson.map((s: any) => ({
                id: s.id || crypto.randomUUID(),
                item: s.nome || s.descricao || `Serviço`,
                valor_item: s.valor || 0,
                quantidade: s.quantidade || 1,
              }))
            : [];

          // Setar preenchimento — o useEffect vai abrir o ContratoDialogWithClient
          // no próximo ciclo de render, garantindo que os dados já estejam no state
          setPreenchimentoLicitacao({
            ...dadosLicitacao,
            cnpj: dadosLicitacao.cnpj_orgao?.replace(/\D/g, ''),
            objeto_contrato: dadosLicitacao.objeto_contrato,
            valor_estimado: dadosLicitacao.valor_estimado ? parseFloat(dadosLicitacao.valor_estimado) : undefined,
            tipo_contratacao: 'licitacao',
            licitacao_origem_id: rascunho?.licitacao_id,
            itens_contrato: itensContrato,
          });
        }}
      />

      <VincularContratoExistenteDialog
        open={vincularOpen}
        onOpenChange={setVincularOpen}
        rascunhoId={rascunhoId}
        licitacaoId={rascunho?.licitacao_id as string | undefined}
        onSuccess={(contratoId) => {
          setVincularOpen(false);
          onOpenChange(false);
          onConsolidado?.(contratoId);
        }}
      />

      <ContratoDialogWithClient
        open={novoContratoOpen}
        onOpenChange={(isOpen) => {
          setNovoContratoOpen(isOpen);
          if (!isOpen) setPreenchimentoLicitacao(null);
        }}
        dialogTitle="Consolidar Licitação em Contrato"
        rascunhoId={rascunhoId}
        preenchimento={preenchimentoLicitacao ?? undefined}
        onConsolidado={(contratoId) => {
          setNovoContratoOpen(false);
          setPreenchimentoLicitacao(null);
          onOpenChange(false);
          onConsolidado?.(contratoId);
        }}
      />
    </>
  );
}
