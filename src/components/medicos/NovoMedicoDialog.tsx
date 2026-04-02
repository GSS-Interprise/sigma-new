import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { EspecialidadeMultiSelect } from "./EspecialidadeMultiSelect";

const medicoSchema = z.object({
  nome_completo: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
  crm: z.string().min(4, "CRM inválido"),
  especialidade: z.array(z.string()).min(1, "Selecione pelo menos uma especialidade"),
  rqe_numeros: z.string().optional(),
  email: z.string().email("Email inválido"),
  telefone: z.string().min(10, "Telefone inválido"),
});

type MedicoFormData = z.infer<typeof medicoSchema>;

export function NovoMedicoDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<MedicoFormData>({
    resolver: zodResolver(medicoSchema),
    defaultValues: {
      nome_completo: "",
      crm: "",
      especialidade: [],
      rqe_numeros: "",
      email: "",
      telefone: "",
    },
  });

  const onSubmit = async (data: MedicoFormData) => {
    try {
      setLoading(true);
      
      // Processar RQEs (separar por vírgula e limpar espaços)
      const rqeArray = data.rqe_numeros
        ? data.rqe_numeros.split(',').map(rqe => rqe.trim()).filter(rqe => rqe)
        : null;
      
      const { error } = await supabase.from("medicos").insert([{
        nome_completo: data.nome_completo,
        crm: data.crm,
        especialidade: data.especialidade,
        rqe_numeros: rqeArray,
        email: data.email,
        telefone: data.telefone,
      }]);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['corpo-clinico'] });
      toast.success("Cadastro realizado com sucesso!");
      form.reset();
      setOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao cadastrar médico");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Novo Médico
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Cadastrar Novo Médico</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="nome_completo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Completo</FormLabel>
                  <FormControl>
                    <Input placeholder="Dr. João Silva" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="crm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CRM</FormLabel>
                  <FormControl>
                    <Input placeholder="12345/SP" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="especialidade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Especialidade Médica *</FormLabel>
                  <FormControl>
                    <EspecialidadeMultiSelect
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rqe_numeros"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nº RQE (opcional)</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Ex: 12345, 67890 (separar por vírgula se múltiplos)" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground">
                    Campo opcional. Para múltiplos RQEs, separe por vírgula.
                  </p>
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
                    <Input type="email" placeholder="joao@exemplo.com" {...field} />
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
                    <Input placeholder="(11) 99999-9999" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Cadastrando..." : "Cadastrar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
