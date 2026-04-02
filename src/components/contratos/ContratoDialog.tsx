import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format, addMonths, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

const formSchema = z.object({
  codigo_contrato: z.string().min(1, "Código do contrato é obrigatório"),
  tipo: z.enum(['cliente', 'medico']),
  cliente_id: z.string().optional(),
  medico_id: z.string().optional(),
  data_inicio: z.date(),
  vigencia_meses: z.number().min(1, "Vigência deve ser maior que 0").optional(),
  data_fim: z.date(),
  assinado: z.enum(['Sim', 'Pendente']),
  motivo_pendente: z.string().optional(),
  documento: z.instanceof(File).optional(),
}).refine((data) => {
  if (data.tipo === 'cliente') return !!data.cliente_id;
  if (data.tipo === 'medico') return !!data.medico_id;
  return false;
}, {
  message: "Selecione um cliente ou médico",
  path: ["cliente_id"],
});

interface ContratoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contrato?: any;
}

export function ContratoDialog({ open, onOpenChange, contrato }: ContratoDialogProps) {
  const queryClient = useQueryClient();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      codigo_contrato: '',
      tipo: 'cliente',
      data_inicio: new Date(),
      data_fim: new Date(),
      assinado: 'Pendente',
    },
  });

  // Habilitar cola de documentos com Ctrl+V
  useEffect(() => {
    if (!open) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const acceptedTypes = ['application/pdf', 'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp',
        'image/webp', 'image/svg+xml', 'text/plain', 'text/csv',
        'application/zip', 'application/x-rar-compressed'];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file && acceptedTypes.includes(file.type)) {
            form.setValue('documento', file);
            toast.success(`Documento colado: ${file.name}`);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [open, form]);

  const tipoWatch = form.watch('tipo');
  const assinadoWatch = form.watch('assinado');
  const dataInicioWatch = form.watch('data_inicio');
  const vigenciaMesesWatch = form.watch('vigencia_meses');

  // Calcular data_fim automaticamente quando data_inicio ou vigencia mudar
  useEffect(() => {
    if (dataInicioWatch && vigenciaMesesWatch && vigenciaMesesWatch > 0) {
      const dataFimCalculada = addMonths(dataInicioWatch, vigenciaMesesWatch);
      form.setValue('data_fim', dataFimCalculada);
    }
  }, [dataInicioWatch, vigenciaMesesWatch, form]);

  const { data: clientes } = useQuery({
    queryKey: ['clientes-select'],
    queryFn: async () => {
      const { data } = await supabase.from('clientes').select('id, nome_fantasia').order('nome_fantasia');
      return data || [];
    },
  });

  const { data: medicos } = useQuery({
    queryKey: ['medicos-select'],
    queryFn: async () => {
      const { data } = await supabase.from('medicos').select('id, nome_completo').order('nome_completo');
      return data || [];
    },
  });

  useEffect(() => {
    if (contrato) {
      form.reset({
        codigo_contrato: contrato.codigo_contrato || '',
        tipo: contrato.cliente_id ? 'cliente' : 'medico',
        cliente_id: contrato.cliente_id || undefined,
        medico_id: contrato.medico_id || undefined,
        data_inicio: new Date(contrato.data_inicio),
        data_fim: new Date(contrato.data_fim),
        assinado: contrato.assinado,
        motivo_pendente: contrato.motivo_pendente || undefined,
      });
    } else {
      form.reset({
        codigo_contrato: '',
        tipo: 'cliente',
        data_inicio: new Date(),
        data_fim: new Date(),
        assinado: 'Pendente',
      });
    }
  }, [contrato, form]);

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      let documentoUrl = contrato?.documento_url || null;

      // Upload do documento se houver
      if (values.documento) {
        // Sanitizar nome do arquivo removendo caracteres especiais
        const sanitizedName = values.documento.name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove acentos
          .replace(/[^a-zA-Z0-9.-]/g, '_'); // Substitui caracteres especiais por underscore
        
        const fileExt = sanitizedName.split('.').pop()?.toLowerCase() || '';
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('contratos-documentos')
          .upload(filePath, values.documento, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Erro no upload:', uploadError);
          throw new Error(`Erro ao fazer upload de ${values.documento.name}: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('contratos-documentos')
          .getPublicUrl(filePath);

        documentoUrl = filePath;
      }

      const payload = {
        codigo_contrato: values.codigo_contrato,
        cliente_id: values.tipo === 'cliente' ? values.cliente_id : null,
        medico_id: values.tipo === 'medico' ? values.medico_id : null,
        data_inicio: format(values.data_inicio, 'yyyy-MM-dd'),
        data_fim: format(values.data_fim, 'yyyy-MM-dd'),
        assinado: values.assinado,
        motivo_pendente: values.assinado === 'Pendente' ? values.motivo_pendente : null,
        documento_url: documentoUrl,
      };

      if (contrato) {
        const { error } = await supabase
          .from('contratos')
          .update(payload)
          .eq('id', contrato.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('contratos')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contratos'] });
      toast.success(contrato ? 'Contrato atualizado' : 'Contrato criado');
      onOpenChange(false);
      form.reset();
    },
    onError: () => {
      toast.error('Erro ao salvar contrato');
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {contrato ? 'Editar Contrato' : 'Novo Contrato'}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="codigo_contrato"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código do Contrato</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex: CONT-2025-001" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Contrato</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="cliente">Cliente</SelectItem>
                      <SelectItem value="medico">Médico</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {tipoWatch === 'cliente' && (
              <FormField
                control={form.control}
                name="cliente_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um cliente" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clientes?.map((cliente) => (
                          <SelectItem key={cliente.id} value={cliente.id}>
                            {cliente.nome_fantasia}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {tipoWatch === 'medico' && (
              <FormField
                control={form.control}
                name="medico_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Médico</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um médico" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {medicos?.map((medico) => (
                          <SelectItem key={medico.id} value={medico.id}>
                            {medico.nome_completo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="data_inicio"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data Início</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) return;
                          const [y, m, d] = v.split('-').map(Number);
                          const dt = new Date(y, (m || 1) - 1, d || 1);
                          field.onChange(dt);
                        }}
                      />
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="icon" aria-label="Abrir calendário">
                            <CalendarIcon className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="vigencia_meses"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vigência (meses)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      placeholder="Ex: 12"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
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

            {assinadoWatch === 'Pendente' && (
              <FormField
                control={form.control}
                name="motivo_pendente"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Motivo Pendente</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="documento"
              render={({ field: { value, onChange, ...field } }) => (
                <FormItem>
                  <FormLabel>Anexar Documento</FormLabel>
                  <FormControl>
                    <Input
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg,.txt,.csv,.zip,.rar"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          // Validar tamanho
                          if (file.size > 50 * 1024 * 1024) {
                            toast.error(`${file.name} excede o tamanho máximo de 50MB`);
                            return;
                          }
                          onChange(file);
                        }
                      }}
                      {...field}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Formatos aceitos: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, imagens, TXT, CSV, ZIP, RAR (máx. 50MB)
                  </p>
                  {contrato?.documento_url && (
                    <p className="text-xs text-primary">
                      ✓ Documento já anexado
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
