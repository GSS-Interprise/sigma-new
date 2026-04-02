import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function RemuneracaoTab() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    medico_id: '',
    cliente_id: '',
    exame_servico: '',
    valor: '',
    data_inicio: '',
    data_fim: '',
    observacoes: '',
  });

  const queryClient = useQueryClient();

  const { data: remuneracoes, isLoading } = useQuery({
    queryKey: ['medico-remuneracao'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('medico_remuneracao')
        .select(`
          *,
          medico:medicos(id, nome_completo),
          cliente:clientes(id, nome_fantasia, nome_empresa)
        `)
        .order('data_inicio', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const { data: medicos } = useQuery({
    queryKey: ['medicos-ativos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('medicos')
        .select('id, nome_completo')
        .eq('status_medico', 'Ativo')
        .order('nome_completo');
      
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

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('medico_remuneracao').insert([{
        ...data,
        valor: parseFloat(data.valor),
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medico-remuneracao'] });
      toast.success('Remuneração cadastrada com sucesso!');
      resetForm();
    },
    onError: (error) => {
      toast.error('Erro ao cadastrar remuneração');
      console.error(error);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('medico_remuneracao')
        .update({
          ...data,
          valor: parseFloat(data.valor),
        })
        .eq('id', editingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medico-remuneracao'] });
      toast.success('Remuneração atualizada com sucesso!');
      resetForm();
    },
    onError: (error) => {
      toast.error('Erro ao atualizar remuneração');
      console.error(error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('medico_remuneracao').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medico-remuneracao'] });
      toast.success('Remuneração excluída com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir remuneração');
      console.error(error);
    },
  });

  const resetForm = () => {
    setFormData({
      medico_id: '',
      cliente_id: '',
      exame_servico: '',
      valor: '',
      data_inicio: '',
      data_fim: '',
      observacoes: '',
    });
    setEditingId(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (remuneracao: any) => {
    setEditingId(remuneracao.id);
    setFormData({
      medico_id: remuneracao.medico_id,
      cliente_id: remuneracao.cliente_id,
      exame_servico: remuneracao.exame_servico,
      valor: remuneracao.valor.toString(),
      data_inicio: remuneracao.data_inicio,
      data_fim: remuneracao.data_fim || '',
      observacoes: remuneracao.observacoes || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Remuneração</h2>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Remuneração
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Médico</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Exame/Serviço</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Vigência</TableHead>
              <TableHead>Observações</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {remuneracoes?.map((remuneracao) => (
              <TableRow key={remuneracao.id}>
                <TableCell>{remuneracao.medico?.nome_completo}</TableCell>
                <TableCell>{remuneracao.cliente?.nome_fantasia || remuneracao.cliente?.nome_empresa}</TableCell>
                <TableCell>{remuneracao.exame_servico}</TableCell>
                <TableCell>{formatCurrency(remuneracao.valor)}</TableCell>
                <TableCell>
                  {format(new Date(remuneracao.data_inicio), 'dd/MM/yyyy', { locale: ptBR })}
                  {remuneracao.data_fim && (
                    <> até {format(new Date(remuneracao.data_fim), 'dd/MM/yyyy', { locale: ptBR })}</>
                  )}
                </TableCell>
                <TableCell>{remuneracao.observacoes || '-'}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(remuneracao)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(remuneracao.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar' : 'Nova'} Remuneração</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="medico_id">Médico *</Label>
              <Select
                value={formData.medico_id}
                onValueChange={(value) => setFormData({ ...formData, medico_id: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o médico" />
                </SelectTrigger>
                <SelectContent>
                  {medicos?.map((medico) => (
                    <SelectItem key={medico.id} value={medico.id}>
                      {medico.nome_completo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cliente_id">Cliente *</Label>
              <Select
                value={formData.cliente_id}
                onValueChange={(value) => setFormData({ ...formData, cliente_id: value })}
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
              <Label htmlFor="exame_servico">Exame/Serviço *</Label>
              <Input
                id="exame_servico"
                value={formData.exame_servico}
                onChange={(e) => setFormData({ ...formData, exame_servico: e.target.value })}
                placeholder="Ex: Ultrassom, Raio-X, Plantão"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="valor">Valor (R$) *</Label>
              <Input
                id="valor"
                type="number"
                step="0.01"
                min="0"
                value={formData.valor}
                onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                placeholder="0,00"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="data_inicio">Data Início *</Label>
                <Input
                  id="data_inicio"
                  type="date"
                  value={formData.data_inicio}
                  onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="data_fim">Data Fim</Label>
                <Input
                  id="data_fim"
                  type="date"
                  value={formData.data_fim}
                  onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingId ? 'Atualizar' : 'Cadastrar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}