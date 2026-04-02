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
import { Textarea } from "@/components/ui/textarea";

const SUBTIPOS_RECLAMACAO = [
  'Pagamento',
  'Escala',
  'Comunicação',
  'Estrutura Física',
  'Relacionamento Pessoal',
  'Cliente - Hospital'
];

const SUBTIPOS_ACAO = [
  'Parceria / Networking profissional',
  'Feedback Positivo',
  'Alinhamento Escalas',
  'Reunião de Rotina',
  'Suporte Diverso',
  'Documentação',
  'Ação Comemorativa',
  'Curso Neonatal',
  'Visita institucional',
  'Ação administrativa/operacional'
];

const formSchema = z.object({
  tipo_principal: z.enum(['Reclamação', 'Ação']),
  tipo: z.string().min(1, "Subtipo é obrigatório"),
  descricao: z.string().min(1, "Descrição é obrigatória"),
  status: z.enum(['aberta', 'em_analise', 'concluida']),
  gravidade: z.enum(['baixa', 'media', 'alta', 'critica']).optional(),
  cliente_vinculado_id: z.string().optional(),
  medico_vinculado_id: z.string().optional(),
});

interface RelacionamentoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  relacionamento?: any;
}

export function RelacionamentoDialog({ open, onOpenChange, relacionamento }: RelacionamentoDialogProps) {
  const queryClient = useQueryClient();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tipo_principal: 'Ação',
      tipo: '',
      descricao: '',
      status: 'aberta',
      gravidade: undefined,
      cliente_vinculado_id: undefined,
      medico_vinculado_id: undefined,
    },
  });

  const tipoPrincipal = form.watch('tipo_principal');

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
    if (relacionamento) {
      form.reset({
        tipo_principal: relacionamento.tipo_principal || 'Ação',
        tipo: relacionamento.tipo,
        descricao: relacionamento.descricao,
        status: relacionamento.status || 'aberta',
        gravidade: relacionamento.gravidade || undefined,
        cliente_vinculado_id: relacionamento.cliente_vinculado_id || undefined,
        medico_vinculado_id: relacionamento.medico_vinculado_id || undefined,
      });
    } else {
      form.reset({
        tipo_principal: 'Ação',
        tipo: '',
        descricao: '',
        status: 'aberta',
        gravidade: undefined,
        cliente_vinculado_id: undefined,
        medico_vinculado_id: undefined,
      });
    }
  }, [relacionamento, form]);

  // Reset subtipo when tipo_principal changes
  useEffect(() => {
    form.setValue('tipo', '');
  }, [tipoPrincipal, form]);

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const payload = {
        tipo_principal: values.tipo_principal,
        tipo: values.tipo,
        descricao: values.descricao,
        status: values.status,
        gravidade: values.tipo_principal === 'Reclamação' ? values.gravidade : null,
        cliente_vinculado_id: values.cliente_vinculado_id || null,
        medico_vinculado_id: values.medico_vinculado_id || null,
      };

      if (relacionamento) {
        const { error } = await supabase
          .from('relacionamento_medico')
          .update(payload)
          .eq('id', relacionamento.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('relacionamento_medico')
          .insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relacionamentos'] });
      queryClient.invalidateQueries({ queryKey: ['relacionamentos-home'] });
      toast.success(relacionamento ? 'Registro atualizado' : 'Registro criado');
      onOpenChange(false);
      form.reset();
    },
    onError: () => {
      toast.error('Erro ao salvar registro');
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {relacionamento ? 'Editar Registro' : 'Novo Registro'}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="tipo_principal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo Principal</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-background z-50">
                      <SelectItem value="Reclamação">Reclamação</SelectItem>
                      <SelectItem value="Ação">Ação</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subtipo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o subtipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-background z-50">
                      {(tipoPrincipal === 'Reclamação' ? SUBTIPOS_RECLAMACAO : SUBTIPOS_ACAO).map((subtipo) => (
                        <SelectItem key={subtipo} value={subtipo}>
                          {subtipo}
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
              name="descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={4} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-background z-50">
                      <SelectItem value="aberta">Aberta</SelectItem>
                      <SelectItem value="em_analise">Em Análise</SelectItem>
                      <SelectItem value="concluida">Concluída</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {tipoPrincipal === 'Reclamação' && (
              <FormField
                control={form.control}
                name="gravidade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gravidade</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a gravidade" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-background z-50">
                        <SelectItem value="baixa">Baixa</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="critica">Crítica</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="cliente_vinculado_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente Vinculado (opcional)</FormLabel>
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

            <FormField
              control={form.control}
              name="medico_vinculado_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Médico Vinculado (opcional)</FormLabel>
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
