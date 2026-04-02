import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format, addMonths, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { AgesContratoUnidadesMultiSelect } from "./AgesContratoUnidadesMultiSelect";

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
  
  if (numbers.startsWith('55') && numbers.length > 11) {
    numbers = numbers.substring(2);
  }
  
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

const ESTADOS_BR = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

interface FormData {
  codigo_contrato: string;
  codigo_interno: number | null;
  profissional_id: string;
  ages_cliente_id: string;
  ages_unidade_id: string; // Mantido para retrocompatibilidade
  ages_unidades_ids: string[]; // Novo campo para múltiplas unidades
  tipo_contrato: string;
  tipo_servico: string[];
  objeto_contrato: string;
  data_inicio: Date | null;
  prazo_meses: number | null;
  data_termino: Date | null;
  status: string;
  assinado: string;
  motivo_pendente: string;
  observacoes: string;
  condicao_pagamento: string;
  valor_estimado: string;
  dias_antecedencia_aviso: number;
  // Dados do cliente
  cnpj: string;
  nome_fantasia: string;
  razao_social: string;
  endereco: string;
  email_contato: string;
  telefone_contato: string;
  email_financeiro: string;
  telefone_financeiro: string;
  uf: string;
  cidade: string;
}

interface AditivoTempo {
  id: string;
  data_inicio: Date;
  prazo_meses: number;
  data_termino: Date;
  observacoes?: string;
}

interface AbaCadastroContratoAgesProps {
  formData: FormData;
  setFormData: (data: FormData) => void;
  profissionais: Array<{ id: string; nome: string }>;
  clientes: Array<{ id: string; nome_empresa: string; cnpj?: string; endereco?: string; email_contato?: string; telefone_contato?: string; uf?: string; cidade?: string }>;
  unidades: Array<{ id: string; nome: string }>;
  isViewMode?: boolean;
  aditivos?: AditivoTempo[];
  onAditivosChange?: (aditivos: AditivoTempo[]) => void;
}

export function AbaCadastroContratoAges({ 
  formData, 
  setFormData, 
  profissionais, 
  clientes, 
  unidades,
  isViewMode = false,
  aditivos = [],
  onAditivosChange 
}: AbaCadastroContratoAgesProps) {
  const { toast } = useToast();
  const [mostrarFormAditivo, setMostrarFormAditivo] = useState(false);
  const [novoAditivo, setNovoAditivo] = useState<{
    data_inicio: Date | null;
    prazo_meses: number;
  }>({ data_inicio: null, prazo_meses: 12 });

  // Toggle tipo de serviço
  const handleTipoServicoChange = (tipo: string, checked: boolean) => {
    const currentValues = formData.tipo_servico || [];
    if (checked) {
      setFormData({ ...formData, tipo_servico: [...currentValues, tipo] });
    } else {
      setFormData({ ...formData, tipo_servico: currentValues.filter((t: string) => t !== tipo) });
    }
  };

  // ========================================
  // CÁLCULO DE DATA DE TÉRMINO DO ADITIVO
  // ========================================
  // Calcula: data_inicio + prazo_meses - 1 dia
  const calcularDataTerminoAditivo = (dataInicio: Date, prazoMeses: number): Date => {
    const dataTermino = new Date(dataInicio);
    dataTermino.setMonth(dataTermino.getMonth() + prazoMeses);
    dataTermino.setDate(dataTermino.getDate() - 1);
    return dataTermino;
  };

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
      
      console.log('📅 AGES - Próxima data de início (baseada no último aditivo):', {
        ultimo_aditivo_termino: ultimoAditivo.data_termino,
        proxima_data: proximaData
      });
      
      return proximaData;
    } else {
      // Primeiro aditivo: usa data_termino do contrato original
      // Se não houver data_termino, calcula baseado em data_inicio + prazo_meses
      let dataTerminoBase = formData.data_termino;
      
      if (!dataTerminoBase && formData.data_inicio && formData.prazo_meses && formData.prazo_meses > 0) {
        // Calcular data_termino se não estiver definida
        dataTerminoBase = calcularDataTerminoAditivo(formData.data_inicio, formData.prazo_meses);
        console.log('📅 AGES - data_termino calculada:', dataTerminoBase);
      }
      
      if (dataTerminoBase) {
        const proximaData = new Date(dataTerminoBase);
        proximaData.setDate(proximaData.getDate() + 1);
        
        console.log('📅 AGES - Próxima data de início (baseada no contrato):', {
          contrato_termino: dataTerminoBase,
          proxima_data: proximaData
        });
        
        return proximaData;
      }
    }
    return null;
  };

  // Adicionar aditivo
  const adicionarAditivo = () => {
    if (!novoAditivo.data_inicio || novoAditivo.prazo_meses <= 0 || !onAditivosChange) {
      toast({ title: "Erro", description: "Preencha data de início e prazo do aditivo", variant: "destructive" });
      return;
    }

    const dataInicioAditivo = new Date(novoAditivo.data_inicio);
    const aditivosOrdenados = [...aditivos].sort(
      (a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime()
    );
    
    // Validação: Aditivo não pode ter data anterior à sequência
    if (aditivosOrdenados.length > 0) {
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
    } else if (formData.data_termino) {
      const dataTermino = new Date(formData.data_termino);
      if (dataInicioAditivo <= dataTermino) {
        toast({ 
          title: "Data inválida", 
          description: `Data de início do aditivo deve ser após ${format(dataTermino, "dd/MM/yyyy", { locale: ptBR })}`,
          variant: "destructive"
        });
        return;
      }
    }

    const dataTermino = calcularDataTerminoAditivo(novoAditivo.data_inicio, novoAditivo.prazo_meses);
    
    const novoAditivoCompleto: AditivoTempo = {
      id: crypto.randomUUID(),
      data_inicio: novoAditivo.data_inicio,
      prazo_meses: novoAditivo.prazo_meses,
      data_termino: dataTermino,
    };

    onAditivosChange([...aditivos, novoAditivoCompleto]);
    setNovoAditivo({ data_inicio: null, prazo_meses: 12 });
    setMostrarFormAditivo(false);
    toast({ title: "Sucesso", description: "Aditivo adicionado." });
  };

  // Remover aditivo
  const removerAditivo = (id: string) => {
    if (!onAditivosChange) return;
    onAditivosChange(aditivos.filter(a => a.id !== id));
  };

  // Ao selecionar um cliente, preenche dados automaticamente
  const handleClienteChange = (clienteId: string) => {
    const cliente = clientes.find(c => c.id === clienteId);
    setFormData({
      ...formData,
      ages_cliente_id: clienteId,
      ages_unidade_id: "",
      cnpj: cliente?.cnpj || "",
      endereco: cliente?.endereco || "",
      email_contato: cliente?.email_contato || "",
      telefone_contato: cliente?.telefone_contato || "",
      uf: cliente?.uf || "",
      cidade: cliente?.cidade || "",
    });
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
            <div>
              <Label>CNPJ</Label>
              <Input
                placeholder="00.000.000/0000-00"
                value={formData.cnpj}
                maxLength={18}
                onChange={(e) => setFormData({ ...formData, cnpj: formatCNPJ(e.target.value) })}
              />
            </div>

            <div>
              <Label>Unidades</Label>
              <AgesContratoUnidadesMultiSelect
                value={formData.ages_unidades_ids || []}
                onChange={(ids) => setFormData({ 
                  ...formData, 
                  ages_unidades_ids: ids,
                  ages_unidade_id: ids.length > 0 ? ids[0] : '' // Retrocompatibilidade
                })}
                unidades={unidades}
                disabled={!formData.ages_cliente_id}
                placeholder={formData.ages_cliente_id ? "Selecionar unidades..." : "Selecione cliente primeiro"}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nome Fantasia</Label>
              <Input
                placeholder="Nome fantasia"
                value={formData.nome_fantasia}
                onChange={(e) => setFormData({ ...formData, nome_fantasia: e.target.value })}
              />
            </div>

            <div>
              <Label>Razão Social</Label>
              <Input
                placeholder="Razão social"
                value={formData.razao_social}
                onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label>Endereço</Label>
            <Input
              placeholder="Endereço completo"
              value={formData.endereco}
              onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Email Contrato</Label>
              <Input
                type="email"
                placeholder="email@exemplo.com"
                value={formData.email_contato}
                onChange={(e) => setFormData({ ...formData, email_contato: e.target.value })}
              />
            </div>

            <div>
              <Label className="text-destructive">Telefone Contrato *</Label>
              <Input
                placeholder="(00) 00000-0000"
                value={formData.telefone_contato}
                maxLength={15}
                onChange={(e) => setFormData({ ...formData, telefone_contato: formatTelefone(e.target.value) })}
                className={!formData.telefone_contato ? 'border-destructive' : ''}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Email Financeiro (Opcional)</Label>
              <Input
                type="email"
                placeholder="financeiro@exemplo.com"
                value={formData.email_financeiro}
                onChange={(e) => setFormData({ ...formData, email_financeiro: e.target.value })}
              />
            </div>

            <div>
              <Label>Telefone Financeiro (Opcional)</Label>
              <Input
                placeholder="(00) 00000-0000"
                value={formData.telefone_financeiro}
                maxLength={15}
                onChange={(e) => setFormData({ ...formData, telefone_financeiro: formatTelefone(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Cliente AGES *</Label>
              <Select
                value={formData.ages_cliente_id}
                onValueChange={handleClienteChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome_empresa}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Estado</Label>
              <Select
                value={formData.uf}
                onValueChange={(v) => setFormData({ ...formData, uf: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o estado" />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS_BR.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
            <div>
              <Label>Código do Contrato</Label>
              <Input
                value={formData.codigo_contrato}
                onChange={(e) => setFormData({ ...formData, codigo_contrato: e.target.value })}
                placeholder="COD-001"
              />
            </div>

            <div>
              <Label>ID (gerado automaticamente)</Label>
              <Input 
                type="text" 
                value={formData.codigo_interno ? String(formData.codigo_interno) : ''}
                placeholder="Gerado ao salvar"
                disabled
                className="bg-muted cursor-not-allowed"
              />
            </div>
          </div>

          {/* Tipo de Contratação */}
          <div>
            <Label>Tipo de Contratação</Label>
            <Select
              value={formData.tipo_contrato || ""}
              onValueChange={(v) => setFormData({ ...formData, tipo_contrato: v })}
              disabled={isViewMode}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo de contratação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="credenciamento">Credenciamento</SelectItem>
                <SelectItem value="licitacao">Licitação</SelectItem>
                <SelectItem value="dispensa">Dispensa</SelectItem>
                <SelectItem value="inexigibilidade">Inexigibilidade</SelectItem>
                <SelectItem value="contrato_direto">Contrato Direto</SelectItem>
                <SelectItem value="contrato_privado">Contrato Privado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de Serviço - Multi-seleção com Checkboxes */}
          <div>
            <Label>Tipo de Serviço (Multi-seleção)</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {TIPOS_SERVICO.map((tipo) => (
                <div key={tipo} className="flex items-center space-x-2">
                  <Checkbox
                    id={`ages-${tipo}`}
                    checked={(formData.tipo_servico || []).includes(tipo)}
                    onCheckedChange={(checked) => handleTipoServicoChange(tipo, checked as boolean)}
                    disabled={isViewMode}
                  />
                  <label
                    htmlFor={`ages-${tipo}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {tipo}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Condição de Pagamento e Valor Estimado */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Condição de Pagamento</Label>
              <Input
                placeholder="Ex: 30/60/90, entrada + 5x..."
                value={formData.condicao_pagamento || ""}
                onChange={(e) => setFormData({ ...formData, condicao_pagamento: e.target.value })}
              />
            </div>

            <div>
              <Label>Valor Estimado</Label>
              <Input
                placeholder="R$ 0,00"
                value={formData.valor_estimado || ""}
                onChange={(e) => {
                  // Formatação para moeda brasileira
                  let value = e.target.value.replace(/\D/g, '');
                  if (value) {
                    const numValue = parseInt(value) / 100;
                    value = numValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                  }
                  setFormData({ ...formData, valor_estimado: value });
                }}
              />
            </div>
          </div>

          {/* Objeto do Contrato */}
          <div>
            <Label>Objeto do Contrato</Label>
            <Textarea 
              placeholder="Descreva o objeto do contrato..." 
              className="min-h-[100px]"
              value={formData.objeto_contrato}
              onChange={(e) => setFormData({ ...formData, objeto_contrato: e.target.value })}
            />
          </div>

          {/* Datas do Contrato */}
          <div className="space-y-3">
            <div className="p-4 border rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-3">
                🔒 <strong>Data de Início:</strong> Editável apenas manualmente | 
                <strong> Prazo:</strong> Define duração em meses | 
                <strong> Data de Término:</strong> Calculada automaticamente (data_inicio + prazo - 1 dia)
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col">
                  <Label className="flex items-center gap-2 mb-2">
                    Data de Início *
                    <span className="text-xs text-muted-foreground">(editável)</span>
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.data_inicio && "text-muted-foreground"
                        )}
                        disabled={isViewMode}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.data_inicio ? format(formData.data_inicio, "dd/MM/yyyy", { locale: ptBR }) : <span>Selecione a data</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.data_inicio || undefined}
                        onSelect={(date) => {
                          // Recalcular data_termino automaticamente quando data_inicio mudar
                          let novaDataTermino = formData.data_termino;
                          if (date && formData.prazo_meses && formData.prazo_meses > 0) {
                            novaDataTermino = calcularDataTerminoAditivo(date, formData.prazo_meses);
                          }
                          setFormData({ ...formData, data_inicio: date || null, data_termino: novaDataTermino });
                        }}
                        initialFocus
                        locale={ptBR}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex flex-col">
                  <Label className="mb-2">Prazo (meses)</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="12"
                    value={formData.prazo_meses || ''}
                    onChange={(e) => {
                      const prazo = e.target.value ? parseInt(e.target.value) : null;
                      // Calcular data_termino automaticamente ao mudar prazo
                      let novaDataTermino = formData.data_termino;
                      if (formData.data_inicio && prazo && prazo > 0) {
                        novaDataTermino = calcularDataTerminoAditivo(formData.data_inicio, prazo);
                      }
                      setFormData({ 
                        ...formData, 
                        prazo_meses: prazo,
                        data_termino: novaDataTermino
                      });
                    }}
                    disabled={isViewMode}
                  />
                </div>

                <div className="flex flex-col">
                  <Label className="mb-2">Data de Término (calculada)</Label>
                  <Input
                    disabled
                    className="bg-muted"
                    value={formData.data_termino ? format(formData.data_termino, "dd/MM/yyyy", { locale: ptBR }) : "Defina início e prazo"}
                  />
                </div>
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
                        <Label>Data de Início</Label>
                        <Input
                          type="date"
                          disabled
                          className="bg-muted mt-2"
                          value={novoAditivo.data_inicio ? format(novoAditivo.data_inicio, 'yyyy-MM-dd') : ''}
                        />
                      </div>

                      <div>
                        <Label>Prazo (meses)</Label>
                        <Input
                          type="number"
                          min="1"
                          placeholder="12"
                          className="mt-2"
                          value={novoAditivo.prazo_meses || ''}
                          onChange={(e) => setNovoAditivo(prev => ({ 
                            ...prev, 
                            prazo_meses: e.target.value ? parseInt(e.target.value) : 0 
                          }))}
                        />
                      </div>

                      <div>
                        <Label>Data de Término</Label>
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
                      setNovoAditivo({ data_inicio: null, prazo_meses: 12 });
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

          {/* Status e Assinatura */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Status do Contrato</Label>
              <Select
                value={formData.status}
                onValueChange={(v) => setFormData({ ...formData, status: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ativo">Ativo</SelectItem>
                  <SelectItem value="Inativo">Inativo</SelectItem>
                  <SelectItem value="Suspenso">Suspenso</SelectItem>
                  <SelectItem value="Em Processo de Renovação">Em Processo de Renovação</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Status Assinatura</Label>
              <Select
                value={formData.assinado}
                onValueChange={(v) => setFormData({ ...formData, assinado: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sim">Assinado</SelectItem>
                  <SelectItem value="Pendente">Pendente</SelectItem>
                  <SelectItem value="Em Análise">Em Análise</SelectItem>
                  <SelectItem value="Aguardando Retorno">Aguardando Retorno</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Motivo Pendente - só aparece se assinado != "Sim" */}
          {formData.assinado !== "Sim" && (
            <div>
              <Label>Motivo de Pendência</Label>
              <Textarea 
                placeholder="Descreva o motivo da pendência..." 
                className="min-h-[80px]"
                value={formData.motivo_pendente}
                onChange={(e) => setFormData({ ...formData, motivo_pendente: e.target.value })}
              />
            </div>
          )}

          {/* Dias de Antecedência para Aviso de Vencimento */}
          <div>
            <Label>Dias de Antecedência para Aviso de Vencimento</Label>
            <Input
              type="number"
              min="30"
              max="60"
              placeholder="60"
              value={formData.dias_antecedencia_aviso || 60}
              onChange={(e) => setFormData({ ...formData, dias_antecedencia_aviso: parseInt(e.target.value) || 60 })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Configure quando o sistema deve começar a exibir alertas de vencimento (entre 30 e 60 dias antes). Padrão: 60 dias.
            </p>
          </div>
        </CardContent>
      </Card>
    </fieldset>
  );
}
