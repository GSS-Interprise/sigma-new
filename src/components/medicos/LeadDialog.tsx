import { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { normalizeToE164 } from "@/lib/phoneUtils";
import { useEspecialidades } from "@/hooks/useEspecialidades";
import { registrarCriacaoLead, registrarEdicaoLead } from "@/lib/leadHistoryLogger";
import { User, Building2, Landmark, FileText, Plus, Trash2, Phone } from "lucide-react";

const ESTADOS_BRASIL = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

const ESTADOS_CIVIS = [
  'Solteiro(a)',
  'Casado(a)',
  'Divorciado(a)',
  'Viúvo(a)',
  'União Estável',
  'Separado(a)'
];

const formSchema = z.object({
  // Dados Pessoais
  nome: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
  especialidade: z.string().optional(),
  crm: z.string().optional(),
  rqe: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  telefone_principal: z.string().min(10, "Telefone inválido"),
  telefones_adicionais: z.array(z.object({ numero: z.string().min(10, "Telefone inválido") })).optional(),
  data_nascimento: z.string().optional(),
  nacionalidade: z.string().optional(),
  naturalidade: z.string().optional(),
  estado_civil: z.string().optional(),
  rg: z.string().optional(),
  cpf: z.string().optional(),
  endereco: z.string().optional(),
  cep: z.string().optional(),
  uf: z.string().length(2, "Selecione um estado").optional(),
  cnpj: z.string().optional(),
  
  // Dados Bancários
  banco: z.string().optional(),
  agencia: z.string().optional(),
  conta_corrente: z.string().optional(),
  chave_pix: z.string().optional(),
  
  // Dados Contratuais
  modalidade_contrato: z.string().optional(),
  local_prestacao_servico: z.string().optional(),
  data_inicio_contrato: z.string().optional(),
  valor_contrato: z.string().optional(),
  especificacoes_contrato: z.string().optional(),
  
  // Meta
  origem: z.string().optional(),
  observacoes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface LeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: any;
}

export function LeadDialog({ open, onOpenChange, lead }: LeadDialogProps) {
  const queryClient = useQueryClient();
  const { data: especialidades = [] } = useEspecialidades();
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: '',
      especialidade: '',
      crm: '',
      rqe: '',
      email: '',
      telefone_principal: '',
      telefones_adicionais: [],
      data_nascimento: '',
      nacionalidade: '',
      naturalidade: '',
      estado_civil: '',
      rg: '',
      cpf: '',
      endereco: '',
      cep: '',
      uf: '',
      cnpj: '',
      banco: '',
      agencia: '',
      conta_corrente: '',
      chave_pix: '',
      modalidade_contrato: '',
      local_prestacao_servico: '',
      data_inicio_contrato: '',
      valor_contrato: '',
      especificacoes_contrato: '',
      origem: 'manual',
      observacoes: '',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "telefones_adicionais",
  });

  useEffect(() => {
    if (lead) {
      // Parse telefones_adicionais from database (array of strings to array of objects)
      const telefonesAdicionais = lead.telefones_adicionais?.map((tel: string) => ({ numero: tel })) || [];
      
      form.reset({
        nome: lead.nome || '',
        especialidade: lead.especialidade || '',
        crm: lead.crm || '',
        rqe: lead.rqe || '',
        email: lead.email || '',
        telefone_principal: lead.phone_e164 || '',
        telefones_adicionais: telefonesAdicionais,
        data_nascimento: lead.data_nascimento || '',
        nacionalidade: lead.nacionalidade || '',
        naturalidade: lead.naturalidade || '',
        estado_civil: lead.estado_civil || '',
        rg: lead.rg || '',
        cpf: lead.cpf || '',
        endereco: lead.endereco || '',
        cep: lead.cep || '',
        uf: lead.uf || '',
        cnpj: lead.cnpj || '',
        banco: lead.banco || '',
        agencia: lead.agencia || '',
        conta_corrente: lead.conta_corrente || '',
        chave_pix: lead.chave_pix || '',
        modalidade_contrato: lead.modalidade_contrato || '',
        local_prestacao_servico: lead.local_prestacao_servico || '',
        data_inicio_contrato: lead.data_inicio_contrato || '',
        valor_contrato: lead.valor_contrato?.toString() || '',
        especificacoes_contrato: lead.especificacoes_contrato || '',
        origem: lead.origem || 'manual',
        observacoes: lead.observacoes || '',
      });
    } else {
      form.reset({
        nome: '',
        especialidade: '',
        crm: '',
        rqe: '',
        email: '',
        telefone_principal: '',
        telefones_adicionais: [],
        data_nascimento: '',
        nacionalidade: '',
        naturalidade: '',
        estado_civil: '',
        rg: '',
        cpf: '',
        endereco: '',
        cep: '',
        uf: '',
        cnpj: '',
        banco: '',
        agencia: '',
        conta_corrente: '',
        chave_pix: '',
        modalidade_contrato: '',
        local_prestacao_servico: '',
        data_inicio_contrato: '',
        valor_contrato: '',
        especificacoes_contrato: '',
        origem: 'manual',
        observacoes: '',
      });
    }
  }, [lead, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const phoneE164 = normalizeToE164(values.telefone_principal);
      
      if (!phoneE164) {
        throw new Error('Telefone principal inválido. Use o formato (DD) 9XXXX-XXXX');
      }

      // Normalize additional phones
      const telefonesAdicionaisE164: string[] = [];
      for (const tel of (values.telefones_adicionais || [])) {
        const normalized = normalizeToE164(tel.numero);
        if (normalized) {
          telefonesAdicionaisE164.push(normalized);
        }
      }

      // Resolver especialidade_id a partir do nome selecionado
      const espSelecionada = especialidades.find(e => e.nome === values.especialidade);

      const payload: any = {
        nome: values.nome,
        especialidade: values.especialidade || null,
        especialidade_id: espSelecionada?.id || null,
        crm: values.crm || null,
        rqe: values.rqe || null,
        phone_e164: phoneE164,
        telefones_adicionais: telefonesAdicionaisE164.length > 0 ? telefonesAdicionaisE164 : null,
        email: values.email || null,
        data_nascimento: values.data_nascimento || null,
        nacionalidade: values.nacionalidade || null,
        naturalidade: values.naturalidade || null,
        estado_civil: values.estado_civil || null,
        rg: values.rg || null,
        cpf: values.cpf || null,
        endereco: values.endereco || null,
        cep: values.cep || null,
        uf: values.uf || null,
        cnpj: values.cnpj || null,
        banco: values.banco || null,
        agencia: values.agencia || null,
        conta_corrente: values.conta_corrente || null,
        chave_pix: values.chave_pix || null,
        modalidade_contrato: values.modalidade_contrato || null,
        local_prestacao_servico: values.local_prestacao_servico || null,
        data_inicio_contrato: values.data_inicio_contrato || null,
        valor_contrato: values.valor_contrato ? parseFloat(values.valor_contrato.replace(/\./g, '').replace(',', '.')) : null,
        especificacoes_contrato: values.especificacoes_contrato || null,
        origem: values.origem || 'manual',
        observacoes: values.observacoes || null,
        status: lead?.status || 'Novo',
      };

      if (lead) {
        const camposAlterados: string[] = [];
        const dadosAntigos: Record<string, any> = {};
        const dadosNovos: Record<string, any> = {};

        Object.keys(payload).forEach((key) => {
          if (JSON.stringify(lead[key]) !== JSON.stringify(payload[key])) {
            camposAlterados.push(key);
            dadosAntigos[key] = lead[key];
            dadosNovos[key] = payload[key];
          }
        });

        const { error } = await supabase
          .from('leads')
          .update(payload)
          .eq('id', lead.id);
        if (error) throw error;

        if (camposAlterados.length > 0) {
          await registrarEdicaoLead(lead.id, dadosAntigos, dadosNovos, camposAlterados);
        }

        // Popular junction table se especialidade mudou
        if (espSelecionada && camposAlterados.includes('especialidade')) {
          await supabase.from('lead_especialidades').upsert(
            { lead_id: lead.id, especialidade_id: espSelecionada.id, fonte: 'manual' },
            { onConflict: 'lead_id,especialidade_id' }
          );
        }
      } else {
        const { data, error } = await supabase
          .from('leads')
          .insert([payload])
          .select('id')
          .single();
        if (error) throw error;

        if (data) {
          await registrarCriacaoLead(data.id, payload);

          // Popular junction table
          if (espSelecionada) {
            await supabase.from('lead_especialidades').upsert(
              { lead_id: data.id, especialidade_id: espSelecionada.id, fonte: 'manual' },
              { onConflict: 'lead_id,especialidade_id' }
            );
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success(lead ? 'Lead atualizado' : 'Lead criado');
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao salvar lead');
    },
  });

  const onSubmit = (values: FormValues) => {
    mutation.mutate(values);
  };

  const canAddPhone = fields.length < 4; // Max 4 additional = 5 total

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {lead ? 'Editar Lead' : 'Novo Lead'}
          </DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <ScrollArea className="flex-1 min-h-0 pr-4">
              <div className="space-y-6 pb-4">
              {/* SEÇÃO: DADOS PESSOAIS */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <User className="h-4 w-4" />
                  <h3 className="font-semibold">Dados Pessoais</h3>
                </div>
                <Separator />
                
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Completo *</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome completo" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="especialidade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Especialidade</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {especialidades.map((esp) => (
                              <SelectItem key={typeof esp === 'string' ? esp : esp.nome} value={typeof esp === 'string' ? esp : esp.nome}>
                                {typeof esp === 'string' ? esp : esp.nome}
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
                    name="crm"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CRM/UF</FormLabel>
                        <FormControl>
                          <Input placeholder="CRM/UF 00000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="rqe"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>RQE/UF</FormLabel>
                        <FormControl>
                          <Input placeholder="RQE/UF 00000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="email@exemplo.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Telefones Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <FormLabel className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Telefones (até 5 contatos)
                    </FormLabel>
                    {canAddPhone && (
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        onClick={() => append({ numero: '' })}
                        className="gap-1"
                      >
                        <Plus className="h-3 w-3" />
                        Adicionar
                      </Button>
                    )}
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="telefone_principal"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input placeholder="(11) 99999-9999 - Principal *" {...field} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {fields.map((field, index) => (
                    <FormField
                      key={field.id}
                      control={form.control}
                      name={`telefones_adicionais.${index}.numero`}
                      render={({ field: inputField }) => (
                        <FormItem>
                          <div className="flex gap-2">
                            <FormControl>
                              <Input 
                                placeholder={`(11) 99999-9999 - Contato ${index + 2}`} 
                                {...inputField} 
                              />
                            </FormControl>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => remove(index)}
                              className="shrink-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <FormField
                    control={form.control}
                    name="data_nascimento"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de Nascimento</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="nacionalidade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nacionalidade</FormLabel>
                        <FormControl>
                          <Input placeholder="Brasileira" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="naturalidade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Naturalidade</FormLabel>
                        <FormControl>
                          <Input placeholder="São Paulo - SP" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="estado_civil"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado Civil</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {ESTADOS_CIVIS.map((ec) => (
                              <SelectItem key={ec} value={ec}>
                                {ec}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="rg"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>RG</FormLabel>
                        <FormControl>
                          <Input placeholder="00.000.000-0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cpf"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CPF</FormLabel>
                        <FormControl>
                          <Input placeholder="000.000.000-00" {...field} />
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
                          <Input placeholder="00.000.000/0000-00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <FormField
                      control={form.control}
                      name="endereco"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Endereço</FormLabel>
                          <FormControl>
                            <Input placeholder="Rua, número, bairro, cidade" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="cep"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CEP</FormLabel>
                          <FormControl>
                            <Input placeholder="00000-000" {...field} />
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
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="UF" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
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
                  </div>
                </div>
              </div>

              {/* SEÇÃO: DADOS BANCÁRIOS DO CNPJ */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <Landmark className="h-4 w-4" />
                  <h3 className="font-semibold">Dados Bancários do CNPJ</h3>
                </div>
                <Separator />
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <FormField
                    control={form.control}
                    name="banco"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Banco</FormLabel>
                        <FormControl>
                          <Input placeholder="Nome do banco" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="agencia"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Agência</FormLabel>
                        <FormControl>
                          <Input placeholder="0000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="conta_corrente"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Conta Corrente</FormLabel>
                        <FormControl>
                          <Input placeholder="00000-0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="chave_pix"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Chave PIX</FormLabel>
                        <FormControl>
                          <Input placeholder="CPF, e-mail, telefone..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* SEÇÃO: DADOS CONTRATUAIS */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <FileText className="h-4 w-4" />
                  <h3 className="font-semibold">Dados Contratuais</h3>
                </div>
                <Separator />
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <FormField
                    control={form.control}
                    name="modalidade_contrato"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Modalidade de Contrato</FormLabel>
                        <FormControl>
                          <Input placeholder="PJ, CLT, etc." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="local_prestacao_servico"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Local de Prestação</FormLabel>
                        <FormControl>
                          <Input placeholder="Local do serviço" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="data_inicio_contrato"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de Início</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="valor_contrato"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Valor</FormLabel>
                        <FormControl>
                          <Input placeholder="R$ 0,00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="especificacoes_contrato"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Especificações de Contrato</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Detalhes e especificações do contrato..." 
                          className="min-h-[80px]"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* SEÇÃO: INFORMAÇÕES ADICIONAIS */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <Building2 className="h-4 w-4" />
                  <h3 className="font-semibold">Informações Adicionais</h3>
                </div>
                <Separator />
                
                <FormField
                  control={form.control}
                  name="origem"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Origem</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: indicação, site, etc" {...field} />
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
                        <Textarea 
                          placeholder="Observações gerais sobre o lead..." 
                          className="min-h-[80px]"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              </div>
            </ScrollArea>

              <div className="flex justify-end space-x-2 pt-4 mt-4 border-t flex-shrink-0">
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
