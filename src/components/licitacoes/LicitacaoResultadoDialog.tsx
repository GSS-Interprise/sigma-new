import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Building2, Trophy, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface LicitacaoResultadoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  licitacaoId: string;
  novoStatus: string;
  licitacaoTitulo?: string;
  onConfirm: (resultado: ResultadoLicitacao) => void;
  onCancel: () => void;
}

export interface ResultadoLicitacao {
  empresa_vencedora_nome: string;
  empresa_vencedora_id?: string;
  valor_homologado: number;
  classificacao_gss: 'primeiro_lugar' | 'segundo_lugar' | 'desclassificada' | 'nao_habilitada';
  motivo_perda?: 'preco' | 'documentacao' | 'prazo' | 'habilitacao_tecnica' | 'estrategia' | 'outros';
  observacoes_estrategicas?: string;
}

const CLASSIFICACAO_OPTIONS = [
  { value: 'primeiro_lugar', label: '1º Lugar', icon: Trophy, color: 'text-yellow-500' },
  { value: 'segundo_lugar', label: '2º Lugar', icon: Trophy, color: 'text-gray-400' },
  { value: 'desclassificada', label: 'Desclassificada', icon: AlertTriangle, color: 'text-red-500' },
  { value: 'nao_habilitada', label: 'Não Habilitada', icon: AlertTriangle, color: 'text-orange-500' },
];

const MOTIVO_PERDA_OPTIONS = [
  { value: 'preco', label: 'Preço' },
  { value: 'documentacao', label: 'Documentação' },
  { value: 'prazo', label: 'Prazo' },
  { value: 'habilitacao_tecnica', label: 'Habilitação Técnica' },
  { value: 'estrategia', label: 'Estratégia' },
  { value: 'outros', label: 'Outros' },
];

const STATUS_LABELS: Record<string, string> = {
  arrematados: 'Ganha',
  nao_ganhamos: 'Não Ganhamos',
  descarte_edital: 'Perdida/Encerrada',
};

export function LicitacaoResultadoDialog({
  open,
  onOpenChange,
  licitacaoId,
  novoStatus,
  licitacaoTitulo,
  onConfirm,
  onCancel,
}: LicitacaoResultadoDialogProps) {
  const [empresaVencedoraNome, setEmpresaVencedoraNome] = useState("");
  const [empresaVencedoraId, setEmpresaVencedoraId] = useState<string | undefined>();
  const [valorHomologado, setValorHomologado] = useState("");
  const [classificacaoGss, setClassificacaoGss] = useState<string>("");
  const [motivoPerda, setMotivoPerda] = useState<string>("");
  const [observacoesEstrategicas, setObservacoesEstrategicas] = useState("");
  const [empresaPopoverOpen, setEmpresaPopoverOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Buscar empresas concorrentes existentes
  const { data: empresasConcorrentes = [] } = useQuery({
    queryKey: ['empresas-concorrentes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresas_concorrentes')
        .select('id, nome')
        .order('nome');
      if (error) throw error;
      return data || [];
    },
  });

  // Verificar se já existe resultado para esta licitação
  const { data: resultadoExistente } = useQuery({
    queryKey: ['licitacao-resultado', licitacaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('licitacao_resultados')
        .select('*')
        .eq('licitacao_id', licitacaoId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!licitacaoId,
  });

  // Preencher com dados existentes
  useEffect(() => {
    if (resultadoExistente) {
      setEmpresaVencedoraNome(resultadoExistente.empresa_vencedora_nome || '');
      setEmpresaVencedoraId(resultadoExistente.empresa_vencedora_id || undefined);
      setValorHomologado(resultadoExistente.valor_homologado?.toString() || '');
      setClassificacaoGss(resultadoExistente.classificacao_gss || '');
      setMotivoPerda(resultadoExistente.motivo_perda || '');
      setObservacoesEstrategicas(resultadoExistente.observacoes_estrategicas || '');
    }
  }, [resultadoExistente]);

  // Resetar form quando abrir
  useEffect(() => {
    if (open && !resultadoExistente) {
      setEmpresaVencedoraNome("");
      setEmpresaVencedoraId(undefined);
      setValorHomologado("");
      setClassificacaoGss("");
      setMotivoPerda("");
      setObservacoesEstrategicas("");
    }
  }, [open, resultadoExistente]);

  const handleEmpresaSelect = (empresa: { id: string; nome: string }) => {
    setEmpresaVencedoraNome(empresa.nome);
    setEmpresaVencedoraId(empresa.id);
    setEmpresaPopoverOpen(false);
  };

  const handleEmpresaInputChange = (value: string) => {
    setEmpresaVencedoraNome(value);
    // Se o usuário digitar algo diferente, limpar o ID
    const empresaMatch = empresasConcorrentes.find(
      e => e.nome.toLowerCase() === value.toLowerCase()
    );
    setEmpresaVencedoraId(empresaMatch?.id);
  };

  const isFormValid = () => {
    return (
      empresaVencedoraNome.trim() !== "" &&
      valorHomologado !== "" &&
      parseFloat(valorHomologado) >= 0 &&
      classificacaoGss !== ""
    );
  };

  const requiresMotivo = classificacaoGss && classificacaoGss !== 'primeiro_lugar';

  const handleSubmit = async () => {
    if (!isFormValid()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    if (requiresMotivo && !motivoPerda) {
      toast.error("Selecione o motivo da perda");
      return;
    }

    setIsSubmitting(true);

    try {
      const resultado: ResultadoLicitacao = {
        empresa_vencedora_nome: empresaVencedoraNome.trim(),
        empresa_vencedora_id: empresaVencedoraId,
        valor_homologado: parseFloat(valorHomologado),
        classificacao_gss: classificacaoGss as ResultadoLicitacao['classificacao_gss'],
        motivo_perda: requiresMotivo ? (motivoPerda as ResultadoLicitacao['motivo_perda']) : undefined,
        observacoes_estrategicas: observacoesEstrategicas.trim() || undefined,
      };

      onConfirm(resultado);
    } catch (error) {
      console.error('Erro ao processar resultado:', error);
      toast.error('Erro ao processar resultado');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    onCancel();
    onOpenChange(false);
  };

  const formatCurrency = (value: string) => {
    const numericValue = value.replace(/\D/g, '');
    const number = parseFloat(numericValue) / 100;
    if (isNaN(number)) return '';
    return number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, '');
    setValorHomologado(rawValue ? (parseFloat(rawValue) / 100).toString() : '');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Resultado da Licitação
          </DialogTitle>
          <DialogDescription>
            {licitacaoTitulo && (
              <span className="font-medium text-foreground">{licitacaoTitulo}</span>
            )}
            <br />
            Registre o resultado para alterar o status para{" "}
            <span className="font-semibold text-primary">
              {STATUS_LABELS[novoStatus] || novoStatus}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Empresa Vencedora com Autocomplete */}
          <div className="space-y-2">
            <Label htmlFor="empresa-vencedora" className="flex items-center gap-1">
              Empresa Vencedora <span className="text-destructive">*</span>
            </Label>
            <Popover open={empresaPopoverOpen} onOpenChange={setEmpresaPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={empresaPopoverOpen}
                  className="w-full justify-between font-normal"
                >
                  {empresaVencedoraNome || "Selecione ou digite uma empresa..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[550px] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Buscar ou criar empresa..."
                    value={empresaVencedoraNome}
                    onValueChange={handleEmpresaInputChange}
                  />
                  <CommandList>
                    <CommandEmpty>
                      {empresaVencedoraNome.trim() ? (
                        <div className="p-2 text-sm">
                          <span className="text-muted-foreground">Nova empresa: </span>
                          <span className="font-medium">{empresaVencedoraNome}</span>
                        </div>
                      ) : (
                        "Digite o nome da empresa"
                      )}
                    </CommandEmpty>
                    <CommandGroup heading="Empresas cadastradas">
                      {empresasConcorrentes
                        .filter(e =>
                          e.nome.toLowerCase().includes(empresaVencedoraNome.toLowerCase())
                        )
                        .map((empresa) => (
                          <CommandItem
                            key={empresa.id}
                            value={empresa.nome}
                            onSelect={() => handleEmpresaSelect(empresa)}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                empresaVencedoraId === empresa.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {empresa.nome}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Valor Homologado */}
          <div className="space-y-2">
            <Label htmlFor="valor-homologado" className="flex items-center gap-1">
              Valor Final Homologado (R$) <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                R$
              </span>
              <Input
                id="valor-homologado"
                type="text"
                value={valorHomologado ? formatCurrency((parseFloat(valorHomologado) * 100).toString()) : ''}
                onChange={handleValorChange}
                className="pl-10"
                placeholder="0,00"
              />
            </div>
          </div>

          {/* Classificação GSS */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Classificação da GSS <span className="text-destructive">*</span>
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {CLASSIFICACAO_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant={classificacaoGss === option.value ? "default" : "outline"}
                    className={cn(
                      "justify-start gap-2",
                      classificacaoGss === option.value && "ring-2 ring-primary"
                    )}
                    onClick={() => setClassificacaoGss(option.value)}
                  >
                    <Icon className={cn("h-4 w-4", option.color)} />
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Motivo da Perda - aparece se não for 1º lugar */}
          {requiresMotivo && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Motivo da Perda <span className="text-destructive">*</span>
              </Label>
              <Select value={motivoPerda} onValueChange={setMotivoPerda}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motivo..." />
                </SelectTrigger>
                <SelectContent>
                  {MOTIVO_PERDA_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Observações Estratégicas */}
          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações Estratégicas</Label>
            <Textarea
              id="observacoes"
              value={observacoesEstrategicas}
              onChange={(e) => setObservacoesEstrategicas(e.target.value)}
              placeholder="Insights sobre a disputa, pontos de melhoria, informações sobre o concorrente..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!isFormValid() || isSubmitting}>
            {isSubmitting ? "Salvando..." : "Confirmar e Alterar Status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
