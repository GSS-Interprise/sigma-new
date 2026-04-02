import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ArrowRight, Loader2, CheckCircle2, XCircle, AlertCircle, Building2, FileCheck } from "lucide-react";
import { format, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { useContratosRascunho } from "@/hooks/useContratoRascunho";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const formSchema = z.object({
  codigo_contrato: z.string().optional(),
  cliente_id: z.string().min(1, "Selecione um cliente"),
  unidade_id: z.string().optional(),
  data_inicio: z.date(),
  prazo_meses: z.number().min(1, "Prazo deve ser maior que 0"),
  data_fim: z.date(),
  valor_estimado: z.number().optional(),
  objeto_contrato: z.string().optional(),
  especialidade_contrato: z.string().optional(),
  tipo_contratacao: z.string().optional(),
  condicao_pagamento: z.string().optional(),
  assinado: z.enum(['Sim', 'Pendente']),
  motivo_pendente: z.string().optional(),
});

interface ConsolidarContratoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rascunhoId: string;
  overlay: any;
  licitacaoId?: string;
  onSuccess?: (contratoId: string) => void;
  /** Chamado ao avançar da etapa de validação — passa dados da licitação resolvidos para abrir o dialog de contrato */
  onAvancarParaContrato?: (dadosLicitacao: Record<string, string>) => void;
}

// Campos obrigatórios da licitação para consolidação
interface CampoValidacao {
  key: string;
  label: string;
  obrigatorio: boolean;
  valor: string | null | undefined;
  editavel: boolean;
}

export function ConsolidarContratoDialog({
  open,
  onOpenChange,
  rascunhoId,
  overlay,
  licitacaoId,
  onSuccess,
  onAvancarParaContrato,
}: ConsolidarContratoDialogProps) {
  const { consolidarAsync, isConsolidating } = useContratosRascunho();
  const [step, setStep] = useState<'validacao' | 'form'>('validacao');
  const [camposEditados, setCamposEditados] = useState<Record<string, string>>({});

  // Buscar dados completos da licitação para validação
  const { data: licitacao } = useQuery({
    queryKey: ['licitacao-consolidar', licitacaoId || overlay?.licitacao_id],
    queryFn: async () => {
      const id = licitacaoId || overlay?.licitacao_id;
      if (!id) return null;
      const { data } = await supabase.from('licitacoes').select('*').eq('id', id).maybeSingle();
      return data;
    },
    enabled: open && !!(licitacaoId || overlay?.licitacao_id),
  });

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setStep('validacao');
      setCamposEditados({});
    }
  }, [open]);

  // Montar campos de validação
  const getCampos = (): CampoValidacao[] => {
    const src = licitacao || overlay || {};
    const cnpjCustom = (licitacao as any)?.dados_customizados?.custom_cnpj || overlay?.dados_customizados?.custom_cnpj || null;
    return [
      {
        key: 'orgao',
        label: 'Órgão',
        obrigatorio: true,
        valor: camposEditados['orgao'] ?? (src.orgao || overlay?.orgao || null),
        editavel: true,
      },
      {
        key: 'cnpj_orgao',
        label: 'CNPJ',
        obrigatorio: true,
        valor: camposEditados['cnpj_orgao'] ?? ((src as any).cnpj_orgao || overlay?.cnpj_orgao || cnpjCustom || null),
        editavel: true,
      },
      {
        key: 'municipio_uf',
        label: 'Município/UF',
        obrigatorio: true,
        valor: camposEditados['municipio_uf'] ?? (src.municipio_uf || overlay?.municipio_uf || null),
        editavel: true,
      },
      {
        key: 'numero_edital',
        label: 'Número do Edital',
        obrigatorio: true,
        valor: camposEditados['numero_edital'] ?? (src.numero_edital || overlay?.numero_edital || null),
        editavel: true,
      },
      {
        key: 'email_orgao',
        label: 'E-mail do Órgão',
        obrigatorio: false,
        valor: camposEditados['email_orgao'] ?? ((src as any).email_orgao || overlay?.email_orgao || null),
        editavel: true,
      },
    ];
  };

  const campos = getCampos();
  const camposObrigatoriosFaltando = campos.filter(c => c.obrigatorio && !c.valor?.trim());
  const todosObrigatoriosPreenchidos = camposObrigatoriosFaltando.length === 0;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      codigo_contrato: '',
      cliente_id: '',
      data_inicio: new Date(),
      prazo_meses: 12,
      data_fim: addMonths(new Date(), 12),
      valor_estimado: overlay?.valor_estimado || undefined,
      objeto_contrato: overlay?.objeto || '',
      assinado: 'Pendente',
    },
  });

  const dataInicioWatch = form.watch('data_inicio');
  const prazoMesesWatch = form.watch('prazo_meses');
  const assinadoWatch = form.watch('assinado');
  const clienteIdWatch = form.watch('cliente_id');

  useEffect(() => {
    if (dataInicioWatch && prazoMesesWatch && prazoMesesWatch > 0) {
      const dataFimCalculada = addMonths(dataInicioWatch, prazoMesesWatch);
      form.setValue('data_fim', dataFimCalculada);
    }
  }, [dataInicioWatch, prazoMesesWatch, form]);

  useEffect(() => {
    if (overlay) {
      form.setValue('objeto_contrato', overlay.objeto || '');
      form.setValue('valor_estimado', overlay.valor_estimado || undefined);
    }
  }, [overlay, form]);

  const { data: clientes } = useQuery({
    queryKey: ['clientes-select-consolidar'],
    queryFn: async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, nome_fantasia, nome_empresa')
        .order('nome_fantasia');
      return data || [];
    },
  });

  const { data: unidades } = useQuery({
    queryKey: ['unidades-select-consolidar', clienteIdWatch],
    queryFn: async () => {
      if (!clienteIdWatch) return [];
      const { data } = await supabase
        .from('unidades')
        .select('id, nome')
        .eq('cliente_id', clienteIdWatch)
        .order('nome');
      return data || [];
    },
    enabled: !!clienteIdWatch,
  });

  const { data: especialidades } = useQuery({
    queryKey: ['especialidades-consolidar'],
    queryFn: async () => {
      const { data } = await supabase
        .from('config_lista_items')
        .select('valor')
        .eq('campo_nome', 'especialidade_contrato');
      return data?.map(e => e.valor) || [];
    },
  });

  const handleAvancar = async () => {
    // Salvar campos editados de volta na licitação se houver alterações
    const camposAlterados = Object.keys(camposEditados);
    if (camposAlterados.length > 0 && licitacaoId) {
      const updates: Record<string, string> = {};
      camposAlterados.forEach(key => {
        if (camposEditados[key]) updates[key] = camposEditados[key];
      });
      await supabase.from('licitacoes').update(updates).eq('id', licitacaoId);
    }

    // Montar dados resolvidos da licitação
    const src = licitacao || overlay || {};
    const cnpjCustomResolved = (licitacao as any)?.dados_customizados?.custom_cnpj || (overlay as any)?.dados_customizados?.custom_cnpj || null;
    const dadosResolvidos: Record<string, string> = {
      orgao: camposEditados['orgao'] || src.orgao || '',
      cnpj_orgao: camposEditados['cnpj_orgao'] || (src as any).cnpj_orgao || cnpjCustomResolved || '',
      municipio_uf: camposEditados['municipio_uf'] || src.municipio_uf || '',
      numero_edital: camposEditados['numero_edital'] || src.numero_edital || '',
      email_orgao: camposEditados['email_orgao'] || (src as any).email_orgao || '',
      objeto_contrato: (src as any).objeto_contrato || src.objeto || '',
      valor_estimado: String(src.valor_estimado || ''),
      titulo: src.titulo || src.numero_edital || '',
    };

    if (onAvancarParaContrato) {
      // Não fechar este dialog aqui — o pai (ContratoRascunhoDialog) abrirá
      // o ContratoDialogWithClient e fechará ambos após o sucesso
      onOpenChange(false);
      onAvancarParaContrato(dadosResolvidos);
    } else {
      setStep('form');
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      // Mesclar campos editados no overlay
      const overlayAtualizado = {
        ...overlay,
        orgao: camposEditados['orgao'] || licitacao?.orgao || overlay?.orgao,
        cnpj_orgao: camposEditados['cnpj_orgao'] || (licitacao as any)?.cnpj_orgao || overlay?.cnpj_orgao || (licitacao as any)?.dados_customizados?.custom_cnpj || (overlay as any)?.dados_customizados?.custom_cnpj,
        municipio_uf: camposEditados['municipio_uf'] || licitacao?.municipio_uf || overlay?.municipio_uf,
        numero_edital: camposEditados['numero_edital'] || licitacao?.numero_edital || overlay?.numero_edital,
        email_orgao: camposEditados['email_orgao'] || (licitacao as any)?.email_orgao || overlay?.email_orgao,
      };

      const contratoData = {
        codigo_contrato: values.codigo_contrato || null,
        cliente_id: values.cliente_id,
        unidade_id: values.unidade_id || null,
        data_inicio: format(values.data_inicio, 'yyyy-MM-dd'),
        data_fim: format(values.data_fim, 'yyyy-MM-dd'),
        prazo_meses: values.prazo_meses,
        valor_estimado: values.valor_estimado || null,
        objeto_contrato: values.objeto_contrato || null,
        especialidade_contrato: values.especialidade_contrato || null,
        tipo_contratacao: values.tipo_contratacao || null,
        condicao_pagamento: values.condicao_pagamento || null,
        assinado: values.assinado,
        motivo_pendente: values.assinado === 'Pendente' ? values.motivo_pendente : null,
        status_contrato: 'ativo',
        _overlayAtualizado: overlayAtualizado,
      };

      const novoContrato = await consolidarAsync({ rascunhoId, contratoData });
      onSuccess?.(novoContrato.id);
    } catch (error) {
      console.error('Erro ao consolidar:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            {step === 'validacao' ? 'Verificar Dados da Licitação' : 'Consolidar Contrato'}
          </DialogTitle>
          <DialogDescription>
            {step === 'validacao'
              ? 'Verifique os campos obrigatórios antes de consolidar o contrato.'
              : 'Preencha os campos obrigatórios para transformar o rascunho em um contrato oficial.'}
          </DialogDescription>
        </DialogHeader>

        {/* STEP 1: Validação de campos da licitação */}
        {step === 'validacao' && (
          <div className="space-y-4">
            {/* Header info */}
            {overlay && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Origem</Badge>
                  <span className="text-sm font-medium">{overlay.titulo || overlay.numero_edital}</span>
                </div>
              </div>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Campos Obrigatórios
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {campos.filter(c => c.obrigatorio).map((campo) => {
                  const preenchido = !!campo.valor?.trim();
                  return (
                    <div
                      key={campo.key}
                      className={cn(
                        "rounded-lg border p-3 transition-colors",
                        preenchido ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20" : "border-destructive/40 bg-destructive/5"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {preenchido ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                        )}
                        <Label className={cn("text-xs font-semibold", preenchido ? "text-green-700 dark:text-green-400" : "text-destructive")}>
                          {campo.label}:
                        </Label>
                        {!preenchido && (
                          <span className={cn("text-xs", "text-destructive/70")}>Não informado</span>
                        )}
                        {preenchido && !camposEditados[campo.key] && (
                          <span className="text-xs text-green-700 dark:text-green-400 font-medium truncate max-w-[200px]">{campo.valor}</span>
                        )}
                      </div>
                      {(!preenchido || camposEditados[campo.key] !== undefined) && (
                        <Input
                          className="h-8 text-sm mt-1"
                          placeholder={`Informar ${campo.label.toLowerCase()}...`}
                          value={camposEditados[campo.key] ?? (campo.valor || '')}
                          onChange={(e) => setCamposEditados(prev => ({ ...prev, [campo.key]: e.target.value }))}
                        />
                      )}
                      {preenchido && camposEditados[campo.key] === undefined && (
                        <button
                          className="text-xs text-muted-foreground underline mt-1"
                          onClick={() => setCamposEditados(prev => ({ ...prev, [campo.key]: campo.valor || '' }))}
                        >
                          Editar
                        </button>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Campos opcionais */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  Campos Opcionais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {campos.filter(c => !c.obrigatorio).map((campo) => {
                  const preenchido = !!campo.valor?.trim();
                  return (
                    <div
                      key={campo.key}
                      className={cn(
                        "rounded-lg border p-3 transition-colors",
                        preenchido ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20" : "border-border bg-muted/30"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {preenchido ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        )}
                        <Label className="text-xs font-semibold text-muted-foreground">
                          {campo.label}:
                        </Label>
                        {preenchido && !camposEditados[campo.key] && (
                          <span className="text-xs text-foreground font-medium truncate max-w-[200px]">{campo.valor}</span>
                        )}
                      </div>
                      {(!preenchido || camposEditados[campo.key] !== undefined) && (
                        <Input
                          className="h-8 text-sm mt-1"
                          placeholder={`Informar ${campo.label.toLowerCase()}...`}
                          value={camposEditados[campo.key] ?? (campo.valor || '')}
                          onChange={(e) => setCamposEditados(prev => ({ ...prev, [campo.key]: e.target.value }))}
                        />
                      )}
                      {preenchido && camposEditados[campo.key] === undefined && (
                        <button
                          className="text-xs text-muted-foreground underline mt-1"
                          onClick={() => setCamposEditados(prev => ({ ...prev, [campo.key]: campo.valor || '' }))}
                        >
                          Editar
                        </button>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Status geral */}
            {!todosObrigatoriosPreenchidos && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Preencha todos os campos obrigatórios acima antes de continuar.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleAvancar} disabled={!todosObrigatoriosPreenchidos}>
                <ArrowRight className="h-4 w-4 mr-2" />
                Avançar para Consolidação
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: Formulário de consolidação */}
        {step === 'form' && (
          <>
            {overlay && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Origem</Badge>
                  <span className="text-sm font-medium">{overlay.titulo || overlay.numero_edital}</span>
                </div>
                {(camposEditados['orgao'] || overlay.orgao) && (
                  <p className="text-xs text-muted-foreground">{camposEditados['orgao'] || overlay.orgao}</p>
                )}
              </div>
            )}

            <Separator />

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="codigo_contrato"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Código do Contrato (opcional)</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Gerado automaticamente se vazio" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cliente_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cliente *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione um cliente" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {clientes?.map((cliente) => (
                              <SelectItem key={cliente.id} value={cliente.id}>
                                {cliente.nome_fantasia || cliente.nome_empresa}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {clienteIdWatch && unidades && unidades.length > 0 && (
                  <FormField
                    control={form.control}
                    name="unidade_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unidade</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione uma unidade" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {unidades.map((unidade) => (
                              <SelectItem key={unidade.id} value={unidade.id}>
                                {unidade.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="data_inicio"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Data Início *</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? format(field.value, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              initialFocus
                              className="pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="prazo_meses"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prazo (meses) *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="1"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="data_fim"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Data Fim</FormLabel>
                        <FormControl>
                          <Button
                            variant="outline"
                            className="pl-3 text-left font-normal"
                            disabled
                          >
                            {field.value ? format(field.value, "dd/MM/yyyy", { locale: ptBR }) : "-"}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="valor_estimado"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Valor Estimado</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="especialidade_contrato"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Especialidade</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {especialidades?.map((esp) => (
                              <SelectItem key={esp} value={esp}>
                                {esp}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="objeto_contrato"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Objeto do Contrato</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="tipo_contratacao"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Contratação</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="licitacao">Licitação</SelectItem>
                            <SelectItem value="dispensa">Dispensa</SelectItem>
                            <SelectItem value="inexigibilidade">Inexigibilidade</SelectItem>
                            <SelectItem value="privado">Privado</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="assinado"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status de Assinatura</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Sim">Assinado</SelectItem>
                            <SelectItem value="Pendente">Pendente</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {assinadoWatch === 'Pendente' && (
                  <FormField
                    control={form.control}
                    name="motivo_pendente"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Motivo Pendente</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={2} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="flex justify-between gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setStep('validacao')}>
                    ← Voltar
                  </Button>
                  <Button type="submit" disabled={isConsolidating}>
                    {isConsolidating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Consolidando...
                      </>
                    ) : (
                      <>
                        <ArrowRight className="h-4 w-4 mr-2" />
                        Consolidar Contrato
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
