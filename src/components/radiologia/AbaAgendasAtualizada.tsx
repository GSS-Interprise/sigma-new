import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Loader2, X, Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Turno {
  inicio: string;
  fim: string;
  virada_turno: boolean;
}

interface DiaAgenda {
  data: string;
  turnos: Turno[];
  observacoes?: string;
}

interface AbaAgendasAtualizadaProps {
  clienteIdFilter?: string;
}

export function AbaAgendasAtualizada({ clienteIdFilter }: AbaAgendasAtualizadaProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [mesAtual, setMesAtual] = useState<Date>(new Date());
  const [diasSelecionados, setDiasSelecionados] = useState<string[]>([]);
  const [diasAgenda, setDiasAgenda] = useState<DiaAgenda[]>([]);
  const [novaData, setNovaData] = useState('');
  const [formData, setFormData] = useState({
    cliente_id: '',
    medico_id: '',
    exame_servico: '',
    observacoes: '',
  });

  const queryClient = useQueryClient();

  // Buscar todas as escalas do mês filtrado
  const { data: escalasDoMes, isLoading } = useQuery({
    queryKey: ['radiologia-escalas-mes', format(mesAtual, 'yyyy-MM')],
    queryFn: async () => {
      const dataInicio = startOfMonth(mesAtual);
      const dataFim = endOfMonth(mesAtual);
      
      const { data, error } = await supabase
        .from('radiologia_agendas_escalas')
        .select(`
          *,
          agenda:radiologia_agendas(
            id,
            exame_servico,
            observacoes,
            cliente:clientes(id, nome_fantasia, nome_empresa),
            medico:medicos(id, nome_completo)
          )
        `)
        .gte('data', format(dataInicio, 'yyyy-MM-dd'))
        .lte('data', format(dataFim, 'yyyy-MM-dd'))
        .order('data');
      
      if (error) throw error;
      return data;
    },
  });

  const { data: clientes } = useQuery({
    queryKey: ['clientes-ativos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome_fantasia, nome_empresa')
        .eq('status_cliente', 'Ativo')
        .order('nome_fantasia');
      
      if (error) throw error;
      return data;
    },
  });

  // Buscar médicos vinculados ao cliente selecionado
  const { data: medicos } = useQuery({
    queryKey: ['medicos-vinculados-cliente', formData.cliente_id],
    queryFn: async () => {
      if (!formData.cliente_id) return [];
      
      // Buscar médicos através da tabela de vínculo
      const { data: vinculos, error: vinculosError } = await supabase
        .from('medico_vinculo_unidade')
        .select('medico_id')
        .eq('cliente_id', formData.cliente_id)
        .eq('status', 'ativo');
      
      if (vinculosError) throw vinculosError;
      
      if (!vinculos || vinculos.length === 0) return [];
      
      const medicoIds = [...new Set(vinculos.map(v => v.medico_id))];
      
      const { data, error } = await supabase
        .from('medicos')
        .select('id, nome_completo')
        .in('id', medicoIds)
        .eq('status_medico', 'Ativo')
        .order('nome_completo');
      
      if (error) throw error;
      return data;
    },
    enabled: !!formData.cliente_id,
  });

  const calcularHorasTurno = (turno: Turno): number => {
    if (!turno.inicio || !turno.fim) return 0;
    const [hI, mI] = turno.inicio.split(':').map(Number);
    const [hF, mF] = turno.fim.split(':').map(Number);
    let minutosInicio = hI * 60 + mI;
    let minutosFim = hF * 60 + mF;
    
    // Se virada de turno está marcada ou se fim < início, considera virada de dia
    if (turno.virada_turno || minutosFim <= minutosInicio) {
      minutosFim += 24 * 60; // Adiciona 24h
    }
    
    const duracaoMinutos = minutosFim - minutosInicio;
    return Math.max(0, duracaoMinutos / 60);
  };

  const calcularTotalHorasDia = (turnos: Turno[]): number => {
    return turnos.reduce((total, turno) => total + calcularHorasTurno(turno), 0);
  };

  const calcularTotalHorasGeral = (): number => {
    return diasAgenda.reduce((total, dia) => total + calcularTotalHorasDia(dia.turnos), 0);
  };

  const validarIntervalos30min = (hora: string): boolean => {
    const [h, m] = hora.split(':').map(Number);
    return m === 0 || m === 30;
  };

  const validarTurnosDia = (turnos: Turno[]): boolean => {
    for (const turno of turnos) {
      if (!turno.inicio || !turno.fim) {
        toast.error('Todos os turnos devem ter horário de início e fim');
        return false;
      }

      if (!validarIntervalos30min(turno.inicio) || !validarIntervalos30min(turno.fim)) {
        toast.error('Horários devem ser em intervalos de 30 minutos (ex: 08:00, 08:30)');
        return false;
      }

      const horas = calcularHorasTurno(turno);
      if (horas <= 0) {
        toast.error('Duração do turno inválida. Verifique os horários ou marque "Virada de Turno"');
        return false;
      }
    }

    // Verificar sobreposição (apenas se não houver virada de turno)
    for (let i = 0; i < turnos.length; i++) {
      for (let j = i + 1; j < turnos.length; j++) {
        const t1 = turnos[i];
        const t2 = turnos[j];
        
        if (!t1.virada_turno && !t2.virada_turno) {
          const [h1I, m1I] = t1.inicio.split(':').map(Number);
          const [h1F, m1F] = t1.fim.split(':').map(Number);
          const [h2I, m2I] = t2.inicio.split(':').map(Number);
          const [h2F, m2F] = t2.fim.split(':').map(Number);
          
          const min1I = h1I * 60 + m1I;
          const min1F = h1F * 60 + m1F;
          const min2I = h2I * 60 + m2I;
          const min2F = h2F * 60 + m2F;
          
          const sobreposicao = 
            (min1I >= min2I && min1I < min2F) ||
            (min1F > min2I && min1F <= min2F) ||
            (min1I <= min2I && min1F >= min2F);
          
          if (sobreposicao) {
            toast.error('Os turnos não podem ter horários sobrepostos');
            return false;
          }
        }
      }
    }
    return true;
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!formData.cliente_id || !formData.medico_id || !formData.exame_servico) {
        throw new Error('Preencha todos os campos obrigatórios');
      }

      if (diasAgenda.length === 0) {
        throw new Error('Adicione pelo menos um dia de agenda');
      }

      // Validar todos os dias
      for (const dia of diasAgenda) {
        if (dia.turnos.length === 0) {
          throw new Error(`O dia ${format(parseISO(dia.data), 'dd/MM/yyyy', { locale: ptBR })} não tem turnos`);
        }
        if (!validarTurnosDia(dia.turnos)) {
          throw new Error('Validação de turnos falhou');
        }
      }

      // Criar agenda principal
      const primeiraData = diasAgenda[0].data;
      const ultimaData = diasAgenda[diasAgenda.length - 1].data;
      const totalHorasGeral = calcularTotalHorasGeral();

      const { data: agendaData, error } = await supabase
        .from('radiologia_agendas')
        .insert([{
          cliente_id: formData.cliente_id,
          medico_id: formData.medico_id,
          data_agenda: primeiraData,
          data_inicio: primeiraData,
          data_fim: ultimaData,
          exame_servico: formData.exame_servico,
          total_horas_dia: totalHorasGeral,
          observacoes: formData.observacoes,
        }])
        .select()
        .single();
      
      if (error) throw error;

      // Criar escalas para cada dia
      const escalasData = diasAgenda.map(dia => ({
        agenda_id: agendaData.id,
        data: dia.data,
        total_horas: calcularTotalHorasDia(dia.turnos),
        turnos: JSON.stringify(dia.turnos),
        status: 'pendente',
        concluido: false,
        observacoes: dia.observacoes || null,
      }));

      const { error: escalasError } = await supabase
        .from('radiologia_agendas_escalas')
        .insert(escalasData);
      
      if (escalasError) throw escalasError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['radiologia-escalas-mes'] });
      toast.success('Agenda criada com sucesso!');
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao criar agenda');
      console.error(error);
    },
  });

  const updateEscalaMutation = useMutation({
    mutationFn: async ({ id, concluido }: { id: string; concluido: boolean }) => {
      const { error } = await supabase
        .from('radiologia_agendas_escalas')
        .update({
          concluido,
          status: concluido ? 'feito' : 'pendente',
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['radiologia-escalas-mes'] });
      toast.success('Escala atualizada!');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('radiologia_agendas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['radiologia-escalas-mes'] });
      toast.success('Agenda excluída com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir agenda');
      console.error(error);
    },
  });

  const resetForm = () => {
    setFormData({
      cliente_id: '',
      medico_id: '',
      exame_servico: '',
      observacoes: '',
    });
    setDiasAgenda([]);
    setDiasSelecionados([]);
    setNovaData('');
    setIsDialogOpen(false);
  };

  const adicionarDia = () => {
    if (!novaData) {
      toast.error('Selecione uma data');
      return;
    }

    if (diasAgenda.some(d => d.data === novaData)) {
      toast.error('Este dia já foi adicionado');
      return;
    }

    const novoDia: DiaAgenda = {
      data: novaData,
      turnos: [{ inicio: '08:00', fim: '17:00', virada_turno: false }],
      observacoes: '',
    };

    setDiasAgenda([...diasAgenda, novoDia].sort((a, b) => a.data.localeCompare(b.data)));
    setNovaData('');
  };

  const removerDia = (data: string) => {
    setDiasAgenda(diasAgenda.filter(d => d.data !== data));
  };

  const adicionarTurno = (data: string) => {
    setDiasAgenda(diasAgenda.map(dia => {
      if (dia.data === data) {
        const ultimoTurno = dia.turnos[dia.turnos.length - 1];
        const novoInicio = ultimoTurno.fim || '08:00';
        return {
          ...dia,
          turnos: [...dia.turnos, { inicio: novoInicio, fim: '17:00', virada_turno: false }],
        };
      }
      return dia;
    }));
  };

  const removerTurno = (data: string, turnoIndex: number) => {
    setDiasAgenda(diasAgenda.map(dia => {
      if (dia.data === data && dia.turnos.length > 1) {
        return {
          ...dia,
          turnos: dia.turnos.filter((_, i) => i !== turnoIndex),
        };
      }
      return dia;
    }));
  };

  const atualizarTurno = (data: string, turnoIndex: number, campo: keyof Turno, valor: string | boolean) => {
    setDiasAgenda(diasAgenda.map(dia => {
      if (dia.data === data) {
        const novosTurnos = [...dia.turnos];
        novosTurnos[turnoIndex] = { ...novosTurnos[turnoIndex], [campo]: valor };
        return { ...dia, turnos: novosTurnos };
      }
      return dia;
    }));
  };

  const atualizarObservacoesDia = (data: string, observacoes: string) => {
    setDiasAgenda(diasAgenda.map(dia => {
      if (dia.data === data) {
        return { ...dia, observacoes };
      }
      return dia;
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  const handleEscalaCheck = (escalaId: string, currentValue: boolean) => {
    updateEscalaMutation.mutate({ id: escalaId, concluido: !currentValue });
  };

  // Agrupar escalas por data
  const escalasAgrupadasPorDia = escalasDoMes?.reduce((acc, escala: any) => {
    const data = escala.data;
    if (!acc[data]) {
      acc[data] = [];
    }
    acc[data].push(escala);
    return acc;
  }, {} as Record<string, any[]>) || {};

  const diasOrdenados = Object.keys(escalasAgrupadasPorDia).sort();

  const getRandomBorderColor = (index: number) => {
    const colors = [
      'border-l-blue-500',
      'border-l-green-500',
      'border-l-purple-500',
      'border-l-orange-500',
      'border-l-pink-500',
      'border-l-cyan-500',
      'border-l-yellow-500',
      'border-l-red-500',
      'border-l-indigo-500',
      'border-l-teal-500',
    ];
    return colors[index % colors.length];
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h2 className="text-2xl font-bold">Agendas por Dia</h2>
            <div className="flex items-center gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full sm:w-[280px] justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(mesAtual, "MMMM 'de' yyyy", { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={mesAtual}
                    onSelect={(date) => date && setMesAtual(date)}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Agenda
              </Button>
            </div>
          </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : diasOrdenados.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma agenda encontrada para este mês
          </div>
        ) : (
          <div className="space-y-4">
            {diasOrdenados.map((dia, index) => {
              const escalasNoDia = escalasAgrupadasPorDia[dia];
              const dataFormatada = format(parseISO(dia), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
              
              return (
                <Collapsible key={dia} defaultOpen>
                  <Card className={`border-l-4 ${getRandomBorderColor(index)}`}>
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <ChevronDown className="h-5 w-5 transition-transform ui-expanded:rotate-180" />
                          <div className="text-left">
                            <h3 className="font-semibold text-lg capitalize">{dataFormatada}</h3>
                            <p className="text-sm text-muted-foreground">
                              {escalasNoDia.length} {escalasNoDia.length === 1 ? 'médico agendado' : 'médicos agendados'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <div className="border-t">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Médico</TableHead>
                              <TableHead>Cliente</TableHead>
                              <TableHead>Exame/Serviço</TableHead>
                              <TableHead>Turnos</TableHead>
                              <TableHead>Total Horas</TableHead>
                              <TableHead className="text-center">Status</TableHead>
                              <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {escalasNoDia.map((escala) => {
                              const turnosData = escala.turnos ? 
                                (typeof escala.turnos === 'string' ? JSON.parse(escala.turnos) : escala.turnos) 
                                : [];
                              
                              return (
                                <TableRow key={escala.id}>
                                  <TableCell className="font-medium">
                                    {escala.agenda?.medico?.nome_completo}
                                  </TableCell>
                                  <TableCell>
                                    {escala.agenda?.cliente?.nome_fantasia || escala.agenda?.cliente?.nome_empresa}
                                  </TableCell>
                                  <TableCell>{escala.agenda?.exame_servico || '-'}</TableCell>
                                  <TableCell>
                                    {turnosData.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {turnosData.map((turno: Turno, idx: number) => (
                                          <span key={idx} className="inline-flex items-center px-2 py-1 rounded-md bg-primary/10 text-xs font-medium">
                                            {turno.inicio} - {turno.fim}
                                          </span>
                                        ))}
                                      </div>
                                    ) : '-'}
                                  </TableCell>
                                  <TableCell>{escala.total_horas}h</TableCell>
                                  <TableCell className="text-center">
                                    <Checkbox
                                      checked={escala.concluido}
                                      onCheckedChange={() => handleEscalaCheck(escala.id, escala.concluido)}
                                    />
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => deleteMutation.mutate(escala.agenda.id)}
                                      title="Excluir agenda completa"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })}
          </div>
        )}
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Nova Agenda Médica</DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="max-h-[calc(90vh-120px)] pr-4">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Seleção Cliente e Médico */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cliente_id">Cliente (Hospital) *</Label>
                  <Select
                    value={formData.cliente_id}
                    onValueChange={(value) => setFormData({ ...formData, cliente_id: value, medico_id: '' })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientes?.map((cliente) => (
                        <SelectItem key={cliente.id} value={cliente.id}>
                          {cliente.nome_fantasia || cliente.nome_empresa}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="medico_id">Médico *</Label>
                  <Select
                    value={formData.medico_id}
                    onValueChange={(value) => setFormData({ ...formData, medico_id: value })}
                    required
                    disabled={!formData.cliente_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={formData.cliente_id ? "Selecione o médico" : "Selecione um cliente primeiro"} />
                    </SelectTrigger>
                    <SelectContent>
                      {medicos && medicos.length > 0 ? (
                        medicos.map((medico) => (
                          <SelectItem key={medico.id} value={medico.id}>
                            {medico.nome_completo}
                          </SelectItem>
                        ))
                      ) : (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          Nenhum médico vinculado a este cliente
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="exame_servico">Exame/Serviço *</Label>
                <Input
                  id="exame_servico"
                  value={formData.exame_servico}
                  onChange={(e) => setFormData({ ...formData, exame_servico: e.target.value })}
                  placeholder="Ex: Ultrassom, Raio-X, Plantão"
                  required
                />
              </div>

              {/* Adicionar Dias */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>Selecionar Dias da Agenda</span>
                    <Badge variant="secondary">{diasAgenda.length} {diasAgenda.length === 1 ? 'dia' : 'dias'}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={novaData}
                      onChange={(e) => setNovaData(e.target.value)}
                      className="flex-1"
                    />
                    <Button type="button" onClick={adicionarDia} variant="outline">
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar Dia
                    </Button>
                  </div>

                  {diasAgenda.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Adicione pelo menos um dia para criar a agenda
                    </p>
                  )}

                  {/* Lista de Dias com Turnos */}
                  <div className="space-y-4">
                    {diasAgenda.map((dia) => (
                      <Card key={dia.data} className="border-2">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <CardTitle className="text-sm font-semibold">
                                {format(parseISO(dia.data), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                              </CardTitle>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="secondary" className="text-xs">
                                  Total: {calcularTotalHorasDia(dia.turnos).toFixed(1)}h
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {dia.turnos.length} {dia.turnos.length === 1 ? 'turno' : 'turnos'}
                                </span>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => adicionarTurno(dia.data)}
                              >
                                <Plus className="mr-1 h-3 w-3" />
                                Turno
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => removerDia(dia.data)}
                                className="text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {dia.turnos.map((turno, turnoIndex) => (
                            <div key={turnoIndex} className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                              <div className="flex items-center gap-2 flex-1">
                                <div className="space-y-1 w-28">
                                  <Label className="text-xs">Início</Label>
                                  <Input
                                    type="time"
                                    step="1800"
                                    value={turno.inicio}
                                    onChange={(e) => atualizarTurno(dia.data, turnoIndex, 'inicio', e.target.value)}
                                    required
                                    className="h-9"
                                  />
                                </div>
                                
                                <span className="text-muted-foreground pt-5">→</span>
                                
                                <div className="space-y-1 w-28">
                                  <Label className="text-xs">Fim</Label>
                                  <Input
                                    type="time"
                                    step="1800"
                                    value={turno.fim}
                                    onChange={(e) => atualizarTurno(dia.data, turnoIndex, 'fim', e.target.value)}
                                    required
                                    className="h-9"
                                  />
                                </div>

                                <div className="flex items-center gap-2 pt-5">
                                  <Checkbox
                                    id={`virada_${dia.data}_${turnoIndex}`}
                                    checked={turno.virada_turno}
                                    onCheckedChange={(checked) => 
                                      atualizarTurno(dia.data, turnoIndex, 'virada_turno', checked as boolean)
                                    }
                                  />
                                  <Label 
                                    htmlFor={`virada_${dia.data}_${turnoIndex}`}
                                    className="text-xs whitespace-nowrap cursor-pointer"
                                  >
                                    Virada de Turno
                                  </Label>
                                </div>

                                <Badge variant="outline" className="ml-2">
                                  {calcularHorasTurno(turno).toFixed(1)}h
                                </Badge>
                              </div>
                              
                              {dia.turnos.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removerTurno(dia.data, turnoIndex)}
                                  className="h-9 w-9 text-destructive hover:bg-destructive/10"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                          
                          <div className="space-y-2 pt-2">
                            <Label htmlFor={`obs_${dia.data}`} className="text-xs font-medium">
                              Observações do dia
                            </Label>
                            <Textarea
                              id={`obs_${dia.data}`}
                              value={dia.observacoes || ''}
                              onChange={(e) => atualizarObservacoesDia(dia.data, e.target.value)}
                              placeholder="Observações específicas para este dia..."
                              rows={2}
                              className="text-sm"
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {diasAgenda.length > 0 && (
                    <div className="flex items-center justify-end gap-3 pt-3 border-t">
                      <span className="text-sm font-medium">Total Geral:</span>
                      <Badge className="text-base px-3 py-1">
                        {calcularTotalHorasGeral().toFixed(1)}h
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  rows={3}
                  placeholder="Informações adicionais sobre a agenda"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending || diasAgenda.length === 0}>
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar Agenda'
                  )}
                </Button>
              </div>
            </form>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}