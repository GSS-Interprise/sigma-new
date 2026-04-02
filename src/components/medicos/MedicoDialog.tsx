import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CalendarIcon, FileText, User, Upload, AlertTriangle, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { validateCPF } from "@/lib/validators";
import { normalizeToE164 } from "@/lib/phoneUtils";
import { EspecialidadeMultiSelect } from "./EspecialidadeMultiSelect";
import { UnidadeMultiSelect } from "./UnidadeMultiSelect";
import { ProntuarioTab } from "./ProntuarioTab";
import { DocumentacaoTab } from "./DocumentacaoTab";

const ESTADOS_BRASIL = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

const formSchema = z.object({
  nome_completo: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
  crm: z.string().min(4, "CRM inválido"),
  especialidade: z.array(z.string()).min(1, "Selecione pelo menos uma especialidade"),
  rqe_numeros: z.string().optional(),
  email: z.string().email("Email inválido"),
  telefone: z.string().min(10, "Telefone inválido"),
  cpf: z.string().optional().refine(
    (val) => !val || val.length === 0 || validateCPF(val),
    { message: "CPF inválido" }
  ),
  data_nascimento: z.date().optional(),
  estado: z.string().length(2, "Estado deve ter 2 letras (UF)").regex(/^[A-Z]{2}$/, "Use apenas siglas maiúsculas (ex: SP, RJ)").optional(),
  status_medico: z.enum(['Ativo', 'Inativo', 'Suspenso']),
  status_contrato: z.enum(['ativo', 'inativo', 'pendente', 'cancelado']).optional(),
  unidades_vinculadas: z.array(z.string()).optional(),
});

interface MedicoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medico?: any;
  onOpenProntuario?: (leadId: string) => void;
}


export function MedicoDialog({ open, onOpenChange, medico, onOpenProntuario }: MedicoDialogProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("dados");
  
  // Check if this medico has been migrated to a lead (read-only mode)
  const isMigrated = !!medico?.lead_id;
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome_completo: '',
      crm: '',
      especialidade: [],
      rqe_numeros: '',
      email: '',
      telefone: '',
      cpf: '',
      data_nascimento: undefined,
      estado: '',
      status_medico: 'Ativo',
      status_contrato: undefined,
      unidades_vinculadas: [],
    },
  });

  const { data: vinculosExistentes } = useQuery({
    queryKey: ['medico-vinculos', medico?.id],
    queryFn: async () => {
      if (!medico?.id) return [];
      
      const { data } = await supabase
        .from('medico_vinculo_unidade')
        .select('unidade_id, status')
        .eq('medico_id', medico.id)
        .eq('status', 'ativo');
      
      return data?.map(v => v.unidade_id) || [];
    },
    enabled: !!medico?.id,
  });

  useEffect(() => {
    if (medico) {
      const rqeString = medico.rqe_numeros && Array.isArray(medico.rqe_numeros) 
        ? medico.rqe_numeros.join(', ') 
        : '';
      
      const especialidadesArray = Array.isArray(medico.especialidade) 
        ? medico.especialidade 
        : medico.especialidade 
        ? [medico.especialidade] 
        : [];
      
      form.reset({
        nome_completo: medico.nome_completo || '',
        crm: medico.crm || '',
        especialidade: especialidadesArray,
        rqe_numeros: rqeString,
        email: medico.email || '',
        telefone: medico.telefone || '',
        cpf: medico.cpf || '',
        data_nascimento: medico.data_nascimento ? new Date(medico.data_nascimento) : undefined,
        estado: medico.estado || '',
        status_medico: medico.status_medico || 'Ativo',
        status_contrato: medico.status_contrato || undefined,
        unidades_vinculadas: vinculosExistentes || [],
      });
    } else {
      form.reset({
        nome_completo: '',
        crm: '',
        especialidade: [],
        rqe_numeros: '',
        email: '',
        telefone: '',
        cpf: '',
        data_nascimento: undefined,
        estado: '',
        status_medico: 'Ativo',
        status_contrato: undefined,
        unidades_vinculadas: [],
      });
    }
  }, [medico, form, vinculosExistentes]);

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const phoneE164 = values.telefone ? normalizeToE164(values.telefone) : null;
      
      // Processar RQEs (separar por vírgula e limpar espaços)
      const rqeArray = values.rqe_numeros
        ? values.rqe_numeros.split(',').map(rqe => rqe.trim()).filter(rqe => rqe)
        : null;
      
      const payload = {
        nome_completo: values.nome_completo,
        crm: values.crm,
        especialidade: values.especialidade,
        rqe_numeros: rqeArray,
        email: values.email,
        telefone: values.telefone,
        phone_e164: phoneE164,
        cpf: values.cpf ? values.cpf.replace(/[^\d]/g, '') : null,
        data_nascimento: values.data_nascimento ? format(values.data_nascimento, 'yyyy-MM-dd') : null,
        estado: values.estado || null,
        status_medico: values.status_medico,
        status_contrato: values.status_contrato || null,
        alocado_cliente_id: null, // Não usar mais este campo
      };

      let medicoId = medico?.id;

      if (medico) {
        const { error } = await supabase
          .from('medicos')
          .update(payload)
          .eq('id', medico.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('medicos')
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        medicoId = data.id;
      }

      // Gerenciar vínculos de unidades
      if (medicoId && values.unidades_vinculadas) {
        // Buscar vínculos existentes
        const { data: vinculosAtuais } = await supabase
          .from('medico_vinculo_unidade')
          .select('id, unidade_id')
          .eq('medico_id', medicoId);

        const unidadesAtuais = vinculosAtuais?.map(v => v.unidade_id) || [];
        const unidadesNovas = values.unidades_vinculadas;

        // Desativar vínculos removidos
        const vinculosParaDesativar = vinculosAtuais?.filter(
          v => !unidadesNovas.includes(v.unidade_id)
        ) || [];

        for (const vinculo of vinculosParaDesativar) {
          await supabase
            .from('medico_vinculo_unidade')
            .update({ status: 'inativo' })
            .eq('id', vinculo.id);
        }

        // Adicionar novos vínculos
        const unidadesParaAdicionar = unidadesNovas.filter(
          unidadeId => !unidadesAtuais.includes(unidadeId)
        );

        for (const unidadeId of unidadesParaAdicionar) {
          // Buscar cliente_id da unidade
          const { data: unidadeData } = await supabase
            .from('unidades')
            .select('cliente_id')
            .eq('id', unidadeId)
            .single();

          if (unidadeData) {
            await supabase
              .from('medico_vinculo_unidade')
              .insert({
                medico_id: medicoId,
                cliente_id: unidadeData.cliente_id,
                unidade_id: unidadeId,
                status: 'ativo',
              });
          }
        }

        // Reativar vínculos existentes que foram marcados novamente
        const vinculosParaReativar = vinculosAtuais?.filter(
          v => unidadesNovas.includes(v.unidade_id)
        ) || [];

        for (const vinculo of vinculosParaReativar) {
          await supabase
            .from('medico_vinculo_unidade')
            .update({ status: 'ativo' })
            .eq('id', vinculo.id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['corpo-clinico'] });
      queryClient.invalidateQueries({ queryKey: ['medicos'] });
      queryClient.invalidateQueries({ queryKey: ['medicos-aniversarios'] });
      queryClient.invalidateQueries({ queryKey: ['relacionamentos-home'] });
      queryClient.invalidateQueries({ queryKey: ['medico-vinculos'] });
      toast.success(medico ? 'Médico atualizado' : 'Médico criado');
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      console.error('Erro ao salvar médico:', error);
      const userMessage = error.code === '42501' 
        ? 'Você não tem permissão para esta ação'
        : error.code === '23505'
        ? 'Já existe um médico com estes dados'
        : 'Erro ao salvar médico. Tente novamente ou contate o suporte.';
      toast.error(userMessage);
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    mutation.mutate(values);
  };

  const handleOpenProntuario = () => {
    if (medico?.lead_id && onOpenProntuario) {
      onOpenChange(false);
      onOpenProntuario(medico.lead_id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isMigrated ? 'Visualizar Médico (Somente Leitura)' : medico ? 'Editar Médico' : 'Novo Médico'}
          </DialogTitle>
        </DialogHeader>
        
        {/* Banner for migrated medicos */}
        {isMigrated && (
          <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-200">
              Cadastro Migrado
            </AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              Este médico foi migrado para o novo Prontuário Médico (Lead). 
              Os dados abaixo são somente leitura.
              <Button 
                variant="outline" 
                size="sm" 
                className="ml-2 border-amber-500 text-amber-700 hover:bg-amber-100"
                onClick={handleOpenProntuario}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                Ver Prontuário Completo
              </Button>
            </AlertDescription>
          </Alert>
        )}
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dados" className="gap-2">
              <User className="h-4 w-4" />
              Dados Cadastrais
            </TabsTrigger>
            <TabsTrigger value="documentacao" className="gap-2" disabled={!medico}>
              <Upload className="h-4 w-4" />
              Documentação
            </TabsTrigger>
            <TabsTrigger value="prontuario" className="gap-2" disabled={!medico}>
              <FileText className="h-4 w-4" />
              Prontuário
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <fieldset disabled={isMigrated} className="space-y-4">
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
                      disabled={mutation.isPending}
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
                  <FormDescription>
                    Campo opcional. Para múltiplos RQEs, separe por vírgula.
                  </FormDescription>
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cpf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF</FormLabel>
                    <FormControl>
                      <Input placeholder="000.000.000-00" {...field} />
                    </FormControl>
                    <FormDescription>Apenas CPF válido será aceito</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="data_nascimento"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data de Nascimento</FormLabel>
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
                            {field.value ? (
                              format(field.value, "dd/MM/yyyy", { locale: ptBR })
                            ) : (
                              <span>dd/mm/aaaa</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <div className="p-3 space-y-2">
                          <Input
                            type="date"
                            value={field.value ? format(field.value, "yyyy-MM-dd") : ""}
                            onChange={(e) => {
                              if (e.target.value) {
                                field.onChange(new Date(e.target.value));
                              }
                            }}
                            max={format(new Date(), "yyyy-MM-dd")}
                            min="1900-01-01"
                            className="w-full"
                          />
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date > new Date() || date < new Date("1900-01-01")
                            }
                            captionLayout="dropdown-buttons"
                            fromYear={1900}
                            toYear={new Date().getFullYear()}
                            initialFocus
                            className={cn("pointer-events-auto")}
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                    <FormDescription>Digite ou selecione no calendário</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="estado"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado (UF)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o estado" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-background z-50">
                      {ESTADOS_BRASIL.map((estado) => (
                        <SelectItem key={estado} value={estado}>
                          {estado}
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
                name="status_medico"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status do Médico</FormLabel>
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
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status_contrato"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status do Contrato</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="unidades_vinculadas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unidades Vinculadas</FormLabel>
                  <FormControl>
                    <UnidadeMultiSelect
                      value={field.value || []}
                      onChange={field.onChange}
                      disabled={mutation.isPending}
                    />
                  </FormControl>
                  <FormDescription>Selecione as unidades onde o médico atende</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    {isMigrated ? 'Fechar' : 'Cancelar'}
                  </Button>
                  {!isMigrated && (
                    <Button type="submit" disabled={mutation.isPending}>
                      {mutation.isPending ? 'Salvando...' : 'Salvar'}
                    </Button>
                  )}
                  {isMigrated && onOpenProntuario && (
                    <Button type="button" onClick={handleOpenProntuario}>
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Ver Prontuário
                    </Button>
                  )}
                </div>
              </fieldset>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="documentacao" className="space-y-4 mt-6">
            <DocumentacaoTab medicoId={medico?.id || ''} />
          </TabsContent>

          <TabsContent value="prontuario" className="space-y-4 mt-6">
            <ProntuarioTab medicoId={medico?.id || ''} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
