import { useState } from "react";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { TipoContratacaoSelect } from "./TipoContratacaoSelect";
const TIPOS_SERVICO = [
  "Plantão Presencial",
  "Plantão de Sobreaviso",
  "Consulta",
  "Exames",
  "Laudos",
  "Escala Médica",
  "Procedimentos",
  "Cirurgias",
  "Teleconsulta",
  "Teleconsultoria",
];

interface AbaCadastroContratoProps {
  form: any;
  clienteExistente: any;
  isViewMode?: boolean;
  isEditing?: boolean;
  allowCustomTipoContratacao?: boolean; // Allow adding/removing custom contract types
  tipoContratacaoCampoNome?: string; // Campo nome for storing custom types (different per module)
  aditivos?: Array<{
    id: string;
    data_inicio: Date;
    prazo_meses: number;
    data_termino: Date;
    observacoes?: string;
  }>;
  onAditivosChange?: (aditivos: Array<{
    id: string;
    data_inicio: Date;
    prazo_meses: number;
    data_termino: Date;
    observacoes?: string;
  }>) => void;
}

const formatCNPJ = (value: string) => {
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
  let numbers = value.replace(/\D/g, '');
  
  // Remove código do país 55 se existir
  if (numbers.startsWith('55') && numbers.length > 11) {
    numbers = numbers.substring(2);
  }
  
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

const formatCurrency = (value: number | null | undefined): string => {
  if (!value && value !== 0) return '';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
};

const parseCurrency = (value: string): number | null => {
  if (!value) return null;
  // Remove tudo exceto números e vírgula
  const cleaned = value.replace(/[^\d,]/g, '');
  if (!cleaned) return null;
  // Substitui vírgula por ponto para parseFloat
  const numeric = cleaned.replace(',', '.');
  const parsed = parseFloat(numeric);
  return isNaN(parsed) ? null : parsed;
};

export function AbaCadastroContrato({ form, clienteExistente, isViewMode = false, isEditing = false, allowCustomTipoContratacao = false, tipoContratacaoCampoNome = "tipo_contratacao", aditivos = [], onAditivosChange }: AbaCadastroContratoProps) {
  const { toast } = useToast();
  const assinadoWatch = form.watch('assinado');
  const tiposServicoWatch = form.watch('tipo_servico') || [];
  const [valorDisplay, setValorDisplay] = useState('');
  const [mostrarFormAditivo, setMostrarFormAditivo] = useState(false);
  const [novoAditivo, setNovoAditivo] = useState<{
    data_inicio: Date | null;
    prazo_meses: number;
  }>({
    data_inicio: null,
    prazo_meses: 12,
  });

  // ========================================
  // CÁLCULO DE PRÓXIMA DATA DE INÍCIO PARA ADITIVOS
  // ========================================
  // 🔒 REGRA CRÍTICA: Esta função NÃO modifica data_inicio do contrato principal
  // Ela apenas calcula a data de início do PRÓXIMO ADITIVO baseado na sequência:
  // - Se existem aditivos: usa data_termino do último aditivo + 1 dia
  // - Se não existem: usa data_termino do contrato original + 1 dia
  
  const calcularProximaDataInicio = (): Date | null => {
    // Ordena aditivos por data_inicio para garantir sequência correta
    const aditivosOrdenados = [...aditivos].sort(
      (a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime()
    );
    
    if (aditivosOrdenados.length > 0) {
      // Pega a data de término do ÚLTIMO aditivo (não o primeiro!)
      const ultimoAditivo = aditivosOrdenados[aditivosOrdenados.length - 1];
      const proximaData = new Date(ultimoAditivo.data_termino);
      proximaData.setDate(proximaData.getDate() + 1);
      
      console.log('📅 Próxima data de início calculada (baseada no último aditivo):', {
        ultimo_aditivo_termino: ultimoAditivo.data_termino,
        proxima_data: proximaData
      });
      
      return proximaData;
    } else {
      // Primeiro aditivo: usa data_termino do contrato original
      const dataTermino = form.getValues('data_termino');
      if (dataTermino) {
        const proximaData = new Date(dataTermino);
        proximaData.setDate(proximaData.getDate() + 1);
        
        console.log('📅 Próxima data de início calculada (baseada no contrato):', {
          contrato_termino: dataTermino,
          proxima_data: proximaData
        });
        
        return proximaData;
      }
    }
    return null;
  };

  const handleTipoServicoChange = (tipo: string, checked: boolean) => {
    const currentValues = form.getValues('tipo_servico') || [];
    if (checked) {
      form.setValue('tipo_servico', [...currentValues, tipo]);
    } else {
      form.setValue('tipo_servico', currentValues.filter((t: string) => t !== tipo));
    }
  };

  const calcularDataTerminoAditivo = (dataInicio: Date, prazoMeses: number): Date => {
    const dataTermino = new Date(dataInicio);
    dataTermino.setMonth(dataTermino.getMonth() + prazoMeses);
    dataTermino.setDate(dataTermino.getDate() - 1);
    return dataTermino;
  };

  // ========================================
  // ADICIONAR ADITIVO - COM VALIDAÇÕES DE HIERARQUIA
  // ========================================
  // 🔒 REGRA CRÍTICA: Esta função NUNCA modifica data_inicio do contrato principal
  // Ela apenas adiciona um novo aditivo com suas próprias datas
  
  const adicionarAditivo = () => {
    if (!novoAditivo.data_inicio || novoAditivo.prazo_meses <= 0) {
      toast({ title: "Erro", description: "Preencha data de início e prazo do aditivo", variant: "destructive" });
      return;
    }

    const dataInicioAditivo = new Date(novoAditivo.data_inicio);
    
    // Ordena aditivos existentes por data para validação correta
    const aditivosOrdenados = [...aditivos].sort(
      (a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime()
    );
    
    // ⛔ VALIDAÇÃO: Aditivo não pode ter data anterior à sequência
    if (aditivosOrdenados.length > 0) {
      // Se já existem aditivos, novo deve começar APÓS o último
      const ultimoAditivo = aditivosOrdenados[aditivosOrdenados.length - 1];
      const dataTerminoUltimo = new Date(ultimoAditivo.data_termino);
      
      if (dataInicioAditivo <= dataTerminoUltimo) {
        toast({ 
          title: "Data inválida", 
          description: `Data de início do aditivo deve ser após ${format(dataTerminoUltimo, "dd/MM/yyyy", { locale: ptBR })}`,
          variant: "destructive"
        });
        return;
      }
    } else {
      // Se é o primeiro aditivo, deve começar APÓS o término do contrato
      const dataTerminoContrato = form.getValues('data_termino');
      if (dataTerminoContrato) {
        const dataTermino = new Date(dataTerminoContrato);
        if (dataInicioAditivo <= dataTermino) {
          toast({ 
            title: "Data inválida", 
            description: `Data de início do aditivo deve ser após ${format(dataTermino, "dd/MM/yyyy", { locale: ptBR })}`,
            variant: "destructive"
          });
          return;
        }
      }
    }

    // ⛔ VALIDAÇÃO EXTRA: Verificar que não estamos modificando data_inicio do contrato
    const dataInicioContrato = form.getValues('data_inicio');
    console.log('🔒 VERIFICAÇÃO: data_inicio do contrato NÃO será modificada:', {
      data_inicio_contrato_atual: dataInicioContrato,
      data_inicio_aditivo: dataInicioAditivo
    });

    const dataTermino = calcularDataTerminoAditivo(novoAditivo.data_inicio, novoAditivo.prazo_meses);
    
    const aditivo = {
      id: `temp-${Date.now()}`,
      data_inicio: novoAditivo.data_inicio,
      prazo_meses: novoAditivo.prazo_meses,
      data_termino: dataTermino,
    };

    // Adiciona aditivo sem modificar data_inicio do contrato
    onAditivosChange?.([...aditivos, aditivo]);
    
    // Resetar formulário do aditivo
    setNovoAditivo({
      data_inicio: null,
      prazo_meses: 12,
    });
    setMostrarFormAditivo(false);
    toast({ title: "Sucesso", description: "Aditivo adicionado. A data de início do contrato permanece inalterada." });
  };

  const removerAditivo = (id: string) => {
    onAditivosChange?.(aditivos.filter(a => a.id !== id));
  };

  return (
    <fieldset disabled={isViewMode} className="space-y-6">
      {/* Dados do Cliente */}
      <Card>
        <CardHeader>
          <CardTitle>Dados do Cliente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="cnpj"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CNPJ</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="00.000.000/0000-00"
                      value={field.value}
                      maxLength={18}
                      onChange={(e) => field.onChange(formatCNPJ(e.target.value))}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                      disabled={isViewMode}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nome_unidade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unidade</FormLabel>
                  <FormControl>
                    <Input placeholder="Digite o nome da unidade" {...field} disabled={isViewMode} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="nome_fantasia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Fantasia</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome fantasia" {...field} disabled={isViewMode} />
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
                    <Input placeholder="Razão social" {...field} disabled={isViewMode} />
                  </FormControl>
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
                  <Input placeholder="Endereço completo" {...field} disabled={isViewMode} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="email_contato"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Contrato</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="email@exemplo.com" {...field} disabled={isViewMode} />
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
                  <FormLabel className="text-destructive">Telefone Contrato *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="(00) 00000-0000"
                      value={field.value || ''}
                      maxLength={15}
                      onChange={(e) => field.onChange(formatTelefone(e.target.value))}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                      className={!field.value ? 'border-destructive' : ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="email_financeiro"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Financeiro (Opcional)</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="financeiro@exemplo.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="telefone_financeiro"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone Financeiro (Opcional)</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="(00) 00000-0000"
                      value={field.value}
                      maxLength={15}
                      onChange={(e) => field.onChange(formatTelefone(e.target.value))}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="tipo_contratacao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Contratação</FormLabel>
                  <FormControl>
                    <TipoContratacaoSelect 
                      value={field.value} 
                      onChange={field.onChange}
                      disabled={isViewMode}
                      allowCustomTypes={allowCustomTipoContratacao}
                      campoNome={tipoContratacaoCampoNome}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="estado"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o estado" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="AC">Acre</SelectItem>
                      <SelectItem value="AL">Alagoas</SelectItem>
                      <SelectItem value="AP">Amapá</SelectItem>
                      <SelectItem value="AM">Amazonas</SelectItem>
                      <SelectItem value="BA">Bahia</SelectItem>
                      <SelectItem value="CE">Ceará</SelectItem>
                      <SelectItem value="DF">Distrito Federal</SelectItem>
                      <SelectItem value="ES">Espírito Santo</SelectItem>
                      <SelectItem value="GO">Goiás</SelectItem>
                      <SelectItem value="MA">Maranhão</SelectItem>
                      <SelectItem value="MT">Mato Grosso</SelectItem>
                      <SelectItem value="MS">Mato Grosso do Sul</SelectItem>
                      <SelectItem value="MG">Minas Gerais</SelectItem>
                      <SelectItem value="PA">Pará</SelectItem>
                      <SelectItem value="PB">Paraíba</SelectItem>
                      <SelectItem value="PR">Paraná</SelectItem>
                      <SelectItem value="PE">Pernambuco</SelectItem>
                      <SelectItem value="PI">Piauí</SelectItem>
                      <SelectItem value="RJ">Rio de Janeiro</SelectItem>
                      <SelectItem value="RN">Rio Grande do Norte</SelectItem>
                      <SelectItem value="RS">Rio Grande do Sul</SelectItem>
                      <SelectItem value="RO">Rondônia</SelectItem>
                      <SelectItem value="RR">Roraima</SelectItem>
                      <SelectItem value="SC">Santa Catarina</SelectItem>
                      <SelectItem value="SP">São Paulo</SelectItem>
                      <SelectItem value="SE">Sergipe</SelectItem>
                      <SelectItem value="TO">Tocantins</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </CardContent>
      </Card>

      {/* Dados do Contrato */}
      <Card>
        <CardHeader>
          <CardTitle>Dados do Contrato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="codigo_contrato"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código do Contrato</FormLabel>
                  <FormControl>
                    <Input placeholder="COD-001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="codigo_interno"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ID (gerado automaticamente)</FormLabel>
                  <FormControl>
                    <Input 
                      type="text" 
                      value={field.value ? String(field.value) : ''}
                      placeholder="Gerado ao salvar"
                      disabled
                      className="bg-muted cursor-not-allowed"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="tipo_servico"
            render={() => (
              <FormItem>
                <FormLabel>Tipo de Serviço (Multi-seleção)</FormLabel>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {TIPOS_SERVICO.map((tipo) => (
                    <div key={tipo} className="flex items-center space-x-2">
                      <Checkbox
                        id={tipo}
                        checked={tiposServicoWatch.includes(tipo)}
                        onCheckedChange={(checked) => handleTipoServicoChange(tipo, checked as boolean)}
                      />
                      <label
                        htmlFor={tipo}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {tipo}
                      </label>
                    </div>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="objeto_contrato"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Objeto do Contrato</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="Descreva o objeto do contrato..." 
                    className="min-h-[100px]"
                    {...field} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-3">
            <div className="p-4 border rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-3">
                🔒 <strong>Data de Início:</strong> Editável apenas manualmente | 
                <strong> Prazo:</strong> Define duração em meses | 
                <strong> Data de Término:</strong> Calculada automaticamente
              </p>
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="data_inicio"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="flex items-center gap-2">
                        Data de Início *
                        <span className="text-xs text-muted-foreground">(editável)</span>
                      </FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? format(field.value, "dd/MM/yyyy", { locale: ptBR }) : <span>Selecione a data</span>}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="prazo_meses"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Prazo (meses)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          placeholder="12"
                          value={field.value || ''}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="data_termino"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Data de Término (calculada)</FormLabel>
                      <FormControl>
                        <Input
                          disabled
                          className="bg-muted"
                          value={field.value ? format(field.value, "dd/MM/yyyy", { locale: ptBR }) : "Auto"}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Aditivos de Tempo */}
            {!isViewMode && (
              <>
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-2">
                  📋 <strong>Aditivos:</strong> Prorrogam a vigência sem alterar a data de início do contrato principal.
                  Cada aditivo inicia após o término do período anterior.
                </p>
              </div>
              {aditivos.map((aditivo, index) => (
                <div key={aditivo.id} className="p-4 border rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-primary">Aditivo {index + 1}</span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Data de Início</p>
                        <p className="font-medium">{format(aditivo.data_inicio, "dd/MM/yyyy", { locale: ptBR })}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Prazo</p>
                        <p className="font-medium">{aditivo.prazo_meses} meses</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Data de Término</p>
                        <p className="font-medium">{format(aditivo.data_termino, "dd/MM/yyyy", { locale: ptBR })}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removerAditivo(aditivo.id)}
                        title="Excluir aditivo"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18"/>
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                        </svg>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              {mostrarFormAditivo && (
                <div className="p-4 border-2 border-primary/20 rounded-lg bg-primary/5">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <FormLabel>Data de Início</FormLabel>
                      <Input
                        type="date"
                        disabled
                        className="bg-muted mt-2"
                        value={novoAditivo.data_inicio ? format(novoAditivo.data_inicio, 'yyyy-MM-dd') : ''}
                      />
                    </div>

                    <div>
                      <FormLabel>Prazo (meses)</FormLabel>
                      <Input
                        type="number"
                        min="1"
                        placeholder="24"
                        className="mt-2"
                        value={novoAditivo.prazo_meses || ''}
                        onChange={(e) => setNovoAditivo(prev => ({ 
                          ...prev, 
                          prazo_meses: e.target.value ? parseInt(e.target.value) : 0 
                        }))}
                      />
                    </div>

                    <div>
                      <FormLabel>Data de Término</FormLabel>
                      <Input
                        disabled
                        className="bg-muted mt-2"
                        value={
                          novoAditivo.data_inicio && novoAditivo.prazo_meses > 0
                            ? format(calcularDataTerminoAditivo(novoAditivo.data_inicio, novoAditivo.prazo_meses), "dd/MM/yyyy", { locale: ptBR })
                            : ""
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              <Button
                type="button"
                variant={mostrarFormAditivo ? "default" : "outline"}
                className="w-full"
                onClick={() => {
                  if (mostrarFormAditivo && novoAditivo.data_inicio && novoAditivo.prazo_meses > 0) {
                    adicionarAditivo();
                  } else if (!mostrarFormAditivo) {
                    // Ao abrir o formulário, calcular a próxima data de início
                    const proximaData = calcularProximaDataInicio();
                    if (proximaData) {
                      setNovoAditivo(prev => ({ ...prev, data_inicio: proximaData }));
                    }
                    setMostrarFormAditivo(true);
                  } else {
                    setMostrarFormAditivo(false);
                  }
                }}
              >
                {mostrarFormAditivo 
                  ? (novoAditivo.data_inicio && novoAditivo.prazo_meses > 0 ? 'Confirmar aditivo' : 'Cancelar')
                  : '+ Adicionar aditivo'}
              </Button>
            </>
          )}

          {isViewMode && aditivos.length > 0 && (
            <>
              {aditivos.map((aditivo, index) => (
                <div key={aditivo.id} className="p-4 border rounded-lg bg-muted/50">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Data de Início</p>
                      <p className="font-medium">{format(aditivo.data_inicio, "dd/MM/yyyy", { locale: ptBR })}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Prazo</p>
                      <p className="font-medium">{aditivo.prazo_meses} meses</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Data de Término</p>
                      <p className="font-medium">{format(aditivo.data_termino, "dd/MM/yyyy", { locale: ptBR })}</p>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="condicao_pagamento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Condição de Pagamento</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: 30/60/90, entrada + 5x..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="valor_estimado"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor Estimado</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="R$ 0,00"
                      value={valorDisplay || formatCurrency(field.value)}
                      onChange={(e) => {
                        const inputValue = e.target.value;
                        setValorDisplay(inputValue);
                        const parsed = parseCurrency(inputValue);
                        field.onChange(parsed);
                      }}
                      onBlur={() => {
                        setValorDisplay('');
                        field.onBlur();
                      }}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>


          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="status_contrato"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status do Contrato</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Ativo">Ativo</SelectItem>
                      <SelectItem value="Inativo">Inativo</SelectItem>
                      <SelectItem value="Suspenso">Suspenso</SelectItem>
                      <SelectItem value="Em Processo de Renovação">Em Processo de Renovação</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="assinado"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status Assinatura</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Status da assinatura" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Sim">Assinado</SelectItem>
                      <SelectItem value="Pendente">Pendente</SelectItem>
                      <SelectItem value="Em Análise">Em Análise</SelectItem>
                      <SelectItem value="Aguardando Retorno">Aguardando Retorno</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {assinadoWatch === 'Pendente' && (
            <FormField
              control={form.control}
              name="motivo_pendente"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo de Pendência</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Descreva o motivo da pendência..." 
                      className="min-h-[60px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="dias_aviso_vencimento"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Dias de Antecedência para Aviso de Vencimento</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    min="30"
                    max="60"
                    placeholder="60" 
                    {...field}
                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : 60)}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  Configure quando o sistema deve começar a exibir alertas de vencimento (entre 30 e 60 dias antes). Padrão: 60 dias.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>
    </fieldset>
  );
}
