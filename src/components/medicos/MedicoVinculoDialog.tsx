import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { UnidadeSelect } from "@/components/clientes/UnidadeSelect";

const formSchema = z.object({
  medico_id: z.string().min(1, "Médico é obrigatório"),
  cliente_id: z.string().min(1, "Cliente é obrigatório"),
  unidade_id: z.string().min(1, "Unidade é obrigatória"),
  contrato_id: z.string().optional(),
  data_inicio: z.date().optional(),
  data_fim: z.date().optional(),
  status: z.enum(['ativo', 'inativo', 'suspenso']),
  observacoes: z.string().optional(),
});

interface MedicoVinculoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vinculo?: any;
  medicoId?: string;
}

export function MedicoVinculoDialog({ open, onOpenChange, vinculo, medicoId }: MedicoVinculoDialogProps) {
  const queryClient = useQueryClient();
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null);
  const [selectedUnidadeId, setSelectedUnidadeId] = useState<string | null>(null);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      medico_id: medicoId || '',
      cliente_id: '',
      unidade_id: '',
      contrato_id: '',
      data_inicio: undefined,
      data_fim: undefined,
      status: 'ativo',
      observacoes: '',
    },
  });

  const { data: medicos } = useQuery({
    queryKey: ['medicos-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('medicos')
        .select('id, nome_completo')
        .order('nome_completo');
      if (error) throw error;
      return data;
    },
  });

  const { data: clientes } = useQuery({
    queryKey: ['clientes-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome_fantasia, cnpj')
        .order('nome_fantasia');
      if (error) throw error;
      return data;
    },
  });

  const { data: contratos } = useQuery({
    queryKey: ['contratos-unidade', selectedUnidadeId],
    queryFn: async () => {
      if (!selectedUnidadeId) return [];
      
      const { data, error } = await supabase
        .from('contratos')
        .select('id, codigo_contrato, tipo_contratacao')
        .eq('unidade_id', selectedUnidadeId)
        .order('codigo_contrato');
      if (error) throw error;
      return data;
    },
    enabled: !!selectedUnidadeId,
  });

  useEffect(() => {
    if (vinculo) {
      setSelectedClienteId(vinculo.cliente_id);
      setSelectedUnidadeId(vinculo.unidade_id);
      form.reset({
        medico_id: vinculo.medico_id,
        cliente_id: vinculo.cliente_id,
        unidade_id: vinculo.unidade_id,
        contrato_id: vinculo.contrato_id || '',
        data_inicio: vinculo.data_inicio ? new Date(vinculo.data_inicio) : undefined,
        data_fim: vinculo.data_fim ? new Date(vinculo.data_fim) : undefined,
        status: vinculo.status || 'ativo',
        observacoes: vinculo.observacoes || '',
      });
    } else {
      form.reset({
        medico_id: medicoId || '',
        cliente_id: '',
        unidade_id: '',
        contrato_id: '',
        data_inicio: undefined,
        data_fim: undefined,
        status: 'ativo',
        observacoes: '',
      });
      setSelectedClienteId(null);
      setSelectedUnidadeId(null);
    }
  }, [vinculo, medicoId, form]);

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      // Validate that contract belongs to selected unit if provided
      if (values.contrato_id) {
        const { data: contrato } = await supabase
          .from('contratos')
          .select('unidade_id')
          .eq('id', values.contrato_id)
          .single();
        
        if (contrato && contrato.unidade_id !== values.unidade_id) {
          throw new Error('Contrato não pertence à unidade selecionada');
        }
      }

      const payload = {
        medico_id: values.medico_id,
        cliente_id: values.cliente_id,
        unidade_id: values.unidade_id,
        contrato_id: values.contrato_id || null,
        data_inicio: values.data_inicio ? values.data_inicio.toISOString().split('T')[0] : null,
        data_fim: values.data_fim ? values.data_fim.toISOString().split('T')[0] : null,
        status: values.status,
        observacoes: values.observacoes || null,
      };

      if (vinculo) {
        const { error } = await supabase
          .from('medico_vinculo_unidade')
          .update(payload)
          .eq('id', vinculo.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('medico_vinculo_unidade')
          .insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medico-vinculos'] });
      queryClient.invalidateQueries({ queryKey: ['medicos'] });
      toast.success(vinculo ? 'Vínculo atualizado' : 'Vínculo criado');
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao salvar vínculo');
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
            {vinculo ? 'Editar Vínculo' : 'Novo Vínculo Médico-Unidade'}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="medico_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Médico *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={!!medicoId}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o médico" />
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

            <FormField
              control={form.control}
              name="cliente_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente (CNPJ) *</FormLabel>
                  <Select 
                    onValueChange={(value) => {
                      field.onChange(value);
                      setSelectedClienteId(value);
                      form.setValue('unidade_id', '');
                      form.setValue('contrato_id', '');
                      setSelectedUnidadeId(null);
                    }} 
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o cliente" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clientes?.map((cliente) => (
                        <SelectItem key={cliente.id} value={cliente.id}>
                          {cliente.nome_fantasia} - {cliente.cnpj}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="unidade_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unidade *</FormLabel>
                  <UnidadeSelect
                    clienteId={selectedClienteId}
                    value={field.value}
                    onChange={(value) => {
                      field.onChange(value);
                      setSelectedUnidadeId(value);
                      form.setValue('contrato_id', '');
                    }}
                    onlyAvailable={!vinculo}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contrato_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contrato (opcional)</FormLabel>
                  <Select onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)} value={field.value || undefined} disabled={!selectedUnidadeId}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={selectedUnidadeId ? "Selecione o contrato" : "Selecione uma unidade primeiro"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhum</SelectItem>
                      {contratos?.map((contrato) => (
                        <SelectItem key={contrato.id} value={contrato.id}>
                          {contrato.codigo_contrato} {contrato.tipo_contratacao && `- ${contrato.tipo_contratacao}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="data_inicio"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data Início</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? format(field.value, "dd/MM/yyyy") : "Selecione"}
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
                        />
                      </PopoverContent>
                    </Popover>
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
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? format(field.value, "dd/MM/yyyy") : "Selecione"}
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
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                      <SelectItem value="suspenso">Suspenso</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} />
                  </FormControl>
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