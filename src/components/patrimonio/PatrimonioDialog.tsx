import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SetorSelect } from "@/components/shared/SetorSelect";

const formSchema = z.object({
  codigo_bem: z.string().optional(),
  nome: z.string().min(1, "Nome é obrigatório"),
  descricao: z.string().optional(),
  categoria: z.enum(["equipamento", "equipamento_hospitalar", "mobiliario", "veiculo", "informatica", "outros"]),
  localizacao: z.string().optional(),
  setor_id: z.string().optional(),
  responsavel: z.string().optional(),
  data_aquisicao: z.string().min(1, "Data de aquisição é obrigatória"),
  valor_aquisicao: z.string().min(1, "Valor de aquisição é obrigatório"),
  vida_util_anos: z.string().optional(),
  estado_conservacao: z.enum(["novo", "usado", "danificado", "inservivel"]),
  status: z.enum(["ativo", "transferido", "baixado"]),
  numero_serie: z.string().optional(),
  fornecedor: z.string().optional(),
  nota_fiscal: z.string().optional(),
  observacoes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface PatrimonioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: any;
  onSuccess: () => void;
}

export function PatrimonioDialog({ open, onOpenChange, item, onSuccess }: PatrimonioDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      codigo_bem: "",
      nome: "",
      descricao: "",
      categoria: "equipamento",
      localizacao: "",
      setor_id: "",
      responsavel: "",
      data_aquisicao: "",
      valor_aquisicao: "",
      vida_util_anos: "",
      estado_conservacao: "novo",
      status: "ativo",
      numero_serie: "",
      fornecedor: "",
      nota_fiscal: "",
      observacoes: "",
    },
  });

  useEffect(() => {
    if (item) {
      form.reset({
        codigo_bem: item.codigo_bem || "",
        nome: item.nome || "",
        descricao: item.descricao || "",
        categoria: item.categoria || "equipamento",
        localizacao: item.localizacao || "",
        setor_id: item.setor_id || "",
        responsavel: item.responsavel || "",
        data_aquisicao: item.data_aquisicao || "",
        valor_aquisicao: item.valor_aquisicao?.toString() || "",
        vida_util_anos: item.vida_util_anos?.toString() || "",
        estado_conservacao: item.estado_conservacao || "novo",
        status: item.status || "ativo",
        numero_serie: item.numero_serie || "",
        fornecedor: item.fornecedor || "",
        nota_fiscal: item.nota_fiscal || "",
        observacoes: item.observacoes || "",
      });
    } else {
      form.reset();
    }
  }, [item, form]);

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);

    try {
      const payload: any = {
        nome: data.nome,
        descricao: data.descricao || null,
        categoria: data.categoria,
        localizacao: data.localizacao || null,
        setor_id: data.setor_id || null,
        responsavel: data.responsavel || null,
        data_aquisicao: data.data_aquisicao,
        valor_aquisicao: parseFloat(data.valor_aquisicao),
        vida_util_anos: data.vida_util_anos ? parseInt(data.vida_util_anos) : null,
        estado_conservacao: data.estado_conservacao,
        status: data.status,
        numero_serie: data.numero_serie || null,
        fornecedor: data.fornecedor || null,
        nota_fiscal: data.nota_fiscal || null,
        observacoes: data.observacoes || null,
        codigo_bem: item?.codigo_bem || "", // Will be auto-generated if empty
      };

      if (item) {
        const { error } = await supabase
          .from("patrimonio")
          .update(payload)
          .eq("id", item.id);

        if (error) throw error;
        toast.success("Bem atualizado com sucesso!");
      } else {
        const { error } = await supabase
          .from("patrimonio")
          .insert([payload]);

        if (error) throw error;
        toast.success("Bem cadastrado com sucesso!");
      }

      onSuccess();
      onOpenChange(false);
      form.reset();
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar bem");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Editar Bem" : "Cadastrar Novo Bem"}</DialogTitle>
          <DialogDescription>
            Preencha os dados do bem patrimonial
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="codigo_bem"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código do Bem</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        disabled 
                        value={item?.codigo_bem || ""}
                        placeholder={item ? "" : "Será gerado automaticamente"}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome / Descrição *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="categoria"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="equipamento">Equipamento</SelectItem>
                        <SelectItem value="equipamento_hospitalar">Equipamento Hospitalar</SelectItem>
                        <SelectItem value="mobiliario">Mobiliário</SelectItem>
                        <SelectItem value="veiculo">Veículo</SelectItem>
                        <SelectItem value="informatica">Informática</SelectItem>
                        <SelectItem value="outros">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="localizacao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Localização</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="setor_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Setor</FormLabel>
                    <FormControl>
                      <SetorSelect 
                        value={field.value}
                        onValueChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="responsavel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsável / Usuário</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="data_aquisicao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Aquisição *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="valor_aquisicao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor de Aquisição (R$) *</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="vida_util_anos"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vida Útil (anos)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="estado_conservacao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado de Conservação *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="novo">Novo</SelectItem>
                        <SelectItem value="usado">Usado</SelectItem>
                        <SelectItem value="danificado">Danificado</SelectItem>
                        <SelectItem value="inservivel">Inservível</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="transferido">Transferido</SelectItem>
                        <SelectItem value="baixado">Baixado</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="numero_serie"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número de Série</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fornecedor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fornecedor</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nota_fiscal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nota Fiscal</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição Detalhada</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} />
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
                  <FormLabel>Observações Gerais</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
