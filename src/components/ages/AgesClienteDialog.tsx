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
import { Textarea } from "@/components/ui/textarea";

const formSchema = z.object({
  nome_empresa: z.string().min(1, "Nome é obrigatório").max(200),
  nome_fantasia: z.string().optional(),
  razao_social: z.string().optional(),
  cnpj: z.string().optional(),
  endereco: z.string().optional(),
  uf: z.string().optional(),
  cidade: z.string().optional(),
  email_contato: z.string().email("Email inválido").optional().or(z.literal("")),
  telefone_contato: z.string().optional(),
  contato_principal: z.string().optional(),
  status_cliente: z.string().default("Ativo"),
  especialidade_cliente: z.string().optional(),
  observacoes: z.string().optional(),
});

interface AgesClienteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cliente?: any;
}

const formatCNPJ = (value: string) => {
  if (!value) return '';
  const numbers = value.replace(/\D/g, '');
  return numbers
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18);
};

const formatTelefone = (value: string) => {
  if (!value) return '';
  const numbers = value.replace(/\D/g, '');
  
  if (numbers.length <= 10) {
    return numbers
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .slice(0, 14);
  } else {
    return numbers
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .slice(0, 15);
  }
};

const UF_OPTIONS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

export function AgesClienteDialog({ open, onOpenChange, cliente }: AgesClienteDialogProps) {
  const queryClient = useQueryClient();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome_empresa: '',
      nome_fantasia: '',
      razao_social: '',
      cnpj: '',
      endereco: '',
      uf: '',
      cidade: '',
      email_contato: '',
      telefone_contato: '',
      contato_principal: '',
      status_cliente: 'Ativo',
      especialidade_cliente: '',
      observacoes: '',
    },
  });

  useEffect(() => {
    if (cliente) {
      form.reset({
        nome_empresa: cliente.nome_empresa || '',
        nome_fantasia: cliente.nome_fantasia || '',
        razao_social: cliente.razao_social || '',
        cnpj: formatCNPJ(cliente.cnpj || ''),
        endereco: cliente.endereco || '',
        uf: cliente.uf || '',
        cidade: cliente.cidade || '',
        email_contato: cliente.email_contato || '',
        telefone_contato: cliente.telefone_contato || '',
        contato_principal: cliente.contato_principal || '',
        status_cliente: cliente.status_cliente || 'Ativo',
        especialidade_cliente: cliente.especialidade_cliente || '',
        observacoes: cliente.observacoes || '',
      });
    } else {
      form.reset({
        nome_empresa: '',
        nome_fantasia: '',
        razao_social: '',
        cnpj: '',
        endereco: '',
        uf: '',
        cidade: '',
        email_contato: '',
        telefone_contato: '',
        contato_principal: '',
        status_cliente: 'Ativo',
        especialidade_cliente: '',
        observacoes: '',
      });
    }
  }, [cliente, form, open]);

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const cleanCNPJ = values.cnpj?.replace(/\D/g, '') || null;
      
      const payload = {
        nome_empresa: values.nome_empresa,
        nome_fantasia: values.nome_fantasia || null,
        razao_social: values.razao_social || null,
        cnpj: cleanCNPJ,
        endereco: values.endereco || null,
        uf: values.uf || null,
        cidade: values.cidade || null,
        email_contato: values.email_contato || null,
        telefone_contato: values.telefone_contato || null,
        contato_principal: values.contato_principal || null,
        status_cliente: values.status_cliente,
        especialidade_cliente: values.especialidade_cliente || null,
        observacoes: values.observacoes || null,
      };

      if (cliente) {
        const { error } = await supabase
          .from('ages_clientes')
          .update(payload)
          .eq('id', cliente.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ages_clientes')
          .insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ages-clientes'] });
      toast.success(cliente ? 'Cliente atualizado' : 'Cliente criado');
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao salvar cliente');
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
            {cliente ? 'Editar Cliente AGES' : 'Novo Cliente AGES'}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="nome_empresa"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da Empresa *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nome_fantasia"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Fantasia</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="razao_social"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Razão Social</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cnpj"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNPJ</FormLabel>
                    <FormControl>
                      <Input 
                        value={field.value}
                        placeholder="00.000.000/0000-00"
                        maxLength={18}
                        onChange={(e) => {
                          const formatted = formatCNPJ(e.target.value);
                          field.onChange(formatted);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status_cliente"
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
                        <SelectItem value="Ativo">Ativo</SelectItem>
                        <SelectItem value="Inativo">Inativo</SelectItem>
                        <SelectItem value="Suspenso">Suspenso</SelectItem>
                        <SelectItem value="Cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="especialidade_cliente"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Especialidade</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Hospital">Hospital</SelectItem>
                        <SelectItem value="Clínica">Clínica</SelectItem>
                        <SelectItem value="UBS">UBS</SelectItem>
                        <SelectItem value="Prefeitura">Prefeitura</SelectItem>
                        <SelectItem value="Outros">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                          <SelectValue placeholder="Selecione" />
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email_contato"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="telefone_contato"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input 
                        value={field.value}
                        placeholder="(00) 00000-0000"
                        maxLength={15}
                        onChange={(e) => {
                          const formatted = formatTelefone(e.target.value);
                          field.onChange(formatted);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="contato_principal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contato Principal</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
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

export default AgesClienteDialog;
