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
import { validateCNPJ, validatePhone } from "@/lib/validators";
import { normalizeToE164 } from "@/lib/phoneUtils";
import { handleError } from "@/lib/errorHandler";
const formSchema = z.object({
  nome_fantasia: z.string()
    .min(1, "Nome fantasia é obrigatório")
    .max(200, "Nome fantasia deve ter no máximo 200 caracteres"),
  razao_social: z.string()
    .min(1, "Razão social é obrigatória")
    .max(200, "Razão social deve ter no máximo 200 caracteres"),
  endereco: z.string()
    .min(1, "Endereço é obrigatório")
    .max(500, "Endereço deve ter no máximo 500 caracteres"),
  cnpj: z.string()
    .min(14, "CNPJ deve ter 14 dígitos")
    .max(18, "CNPJ inválido")
    .refine((val) => validateCNPJ(val), {
      message: "CNPJ inválido. Verifique o número e tente novamente.",
    }),
  status_cliente: z.enum(['Ativo', 'Inativo', 'Suspenso', 'Cancelado']),
  especialidade_cliente: z.enum(['Hospital', 'Clínica', 'UBS', 'Outros']),
  email: z.string()
    .email("Email inválido")
    .max(255, "Email deve ter no máximo 255 caracteres"),
  telefone: z.string()
    .min(10, "Telefone inválido")
    .max(15, "Telefone inválido")
    .refine((val) => validatePhone(val), {
      message: "Telefone inválido. Use o formato (XX) XXXXX-XXXX",
    }),
  contato_principal: z.string()
    .min(1, "Contato principal é obrigatório")
    .max(200, "Contato principal deve ter no máximo 200 caracteres"),
});

interface ClienteDialogProps {
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
    // Fixo: (99) 9999-9999
    return numbers
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .slice(0, 14);
  } else {
    // Celular: (99) 99999-9999
    return numbers
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .slice(0, 15);
  }
};

export function ClienteDialog({ open, onOpenChange, cliente }: ClienteDialogProps) {
  const queryClient = useQueryClient();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome_fantasia: '',
      razao_social: '',
      endereco: '',
      cnpj: '',
      status_cliente: 'Ativo',
      especialidade_cliente: 'Hospital',
      email: '',
      telefone: '',
      contato_principal: '',
    },
  });

  useEffect(() => {
    if (cliente) {
      form.reset({
        nome_fantasia: cliente.nome_fantasia || '',
        razao_social: cliente.razao_social || '',
        endereco: cliente.endereco || '',
        cnpj: formatCNPJ(cliente.cnpj || ''),
        status_cliente: cliente.status_cliente || 'Ativo',
        especialidade_cliente: cliente.especialidade_cliente || 'Hospital',
        email: cliente.email_contato || '',
        telefone: cliente.telefone_contato || '',
        contato_principal: cliente.contato_principal || '',
      });
    } else {
      form.reset({
        nome_fantasia: '',
        razao_social: '',
        endereco: '',
        cnpj: '',
        status_cliente: 'Ativo',
        especialidade_cliente: 'Hospital',
        email: '',
        telefone: '',
        contato_principal: '',
      });
    }
  }, [cliente, form]);

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const cleanCNPJ = values.cnpj.replace(/\D/g, '');
      const cleanTelefone = values.telefone.replace(/\D/g, '');
      
      // Validar que o telefone tem pelo menos 10 dígitos
      if (cleanTelefone.length < 10) {
        throw new Error('Telefone deve ter pelo menos 10 dígitos');
      }
      
      const payload = {
        nome_fantasia: values.nome_fantasia,
        razao_social: values.razao_social,
        endereco: values.endereco,
        cnpj: cleanCNPJ,
        status_cliente: values.status_cliente,
        especialidade_cliente: values.especialidade_cliente,
        email_contato: values.email,
        telefone_contato: normalizeToE164(cleanTelefone),
        contato_principal: values.contato_principal,
        nome_empresa: values.nome_fantasia,
      };

      if (cliente) {
        const { error } = await supabase
          .from('clientes')
          .update(payload)
          .eq('id', cliente.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('clientes')
          .insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      toast.success(cliente ? 'Cliente atualizado' : 'Cliente criado');
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      const errorMessage = handleError(error, 'Salvar cliente');
      toast.error(errorMessage);
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
            {cliente ? 'Editar Cliente' : 'Novo Cliente'}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
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
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Hospital">Hospital</SelectItem>
                      <SelectItem value="Clínica">Clínica</SelectItem>
                      <SelectItem value="UBS">UBS</SelectItem>
                      <SelectItem value="Outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
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
              name="telefone"
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
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
