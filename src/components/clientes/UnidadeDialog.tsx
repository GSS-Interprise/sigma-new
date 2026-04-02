import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const formSchema = z.object({
  nome: z.string().min(1, "Nome da unidade é obrigatório"),
  codigo: z.string().optional(),
});

interface UnidadeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string;
  unidade?: any;
}

export function UnidadeDialog({ open, onOpenChange, clienteId, unidade }: UnidadeDialogProps) {
  const queryClient = useQueryClient();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: '',
      codigo: '',
    },
  });

  useEffect(() => {
    if (unidade) {
      form.reset({
        nome: unidade.nome || '',
        codigo: unidade.codigo || '',
      });
    } else {
      form.reset({
        nome: '',
        codigo: '',
      });
    }
  }, [unidade, form]);

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const payload = {
        cliente_id: clienteId,
        nome: values.nome,
        codigo: values.codigo || null,
      };

      if (unidade) {
        const { error } = await supabase
          .from('unidades')
          .update(payload)
          .eq('id', unidade.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('unidades')
          .insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unidades'] });
      queryClient.invalidateQueries({ queryKey: ['unidades', clienteId] });
      toast.success(unidade ? 'Unidade atualizada' : 'Unidade criada');
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao salvar unidade');
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {unidade ? 'Editar Unidade' : 'Nova Unidade'}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Unidade</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex: Pronto-socorro, Radiologia, etc." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="codigo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código (opcional)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex: PS-001, RAD-002" />
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