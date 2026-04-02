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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const formSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório").max(200),
  codigo: z.string().optional(),
  endereco: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().optional(),
});

interface AgesUnidadeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string;
  unidade?: any;
}

const UF_OPTIONS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

export function AgesUnidadeDialog({ open, onOpenChange, clienteId, unidade }: AgesUnidadeDialogProps) {
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: '',
      codigo: '',
      endereco: '',
      cidade: '',
      uf: '',
    },
  });

  useEffect(() => {
    if (unidade) {
      form.reset({
        nome: unidade.nome || '',
        codigo: unidade.codigo || '',
        endereco: unidade.endereco || '',
        cidade: unidade.cidade || '',
        uf: unidade.uf || '',
      });
    } else {
      form.reset({
        nome: '',
        codigo: '',
        endereco: '',
        cidade: '',
        uf: '',
      });
    }
  }, [unidade, form, open]);

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const payload = {
        cliente_id: clienteId,
        nome: values.nome,
        codigo: values.codigo || null,
        endereco: values.endereco || null,
        cidade: values.cidade || null,
        uf: values.uf || null,
      };

      if (unidade) {
        const { error } = await supabase
          .from('ages_unidades')
          .update(payload)
          .eq('id', unidade.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ages_unidades')
          .insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ages-unidades', clienteId] });
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
      <DialogContent className="max-w-md">
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
                  <FormLabel>Nome *</FormLabel>
                  <FormControl>
                    <Input {...field} />
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
                  <FormLabel>Código</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Código interno" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endereco"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Endereço</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cidade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="uf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>UF</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="UF" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {UF_OPTIONS.map((uf) => (
                          <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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

export default AgesUnidadeDialog;
