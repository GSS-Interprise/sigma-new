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

const MOTIVOS_AUSENCIA = [
  { value: 'ferias', label: 'Férias' },
  { value: 'atestado_medico', label: 'Atestado Médico' },
  { value: 'congresso', label: 'Congresso' },
  { value: 'viagem', label: 'Viagem' },
  { value: 'folga', label: 'Folga' },
  { value: 'outro', label: 'Outro' },
];

export function AusenciaTab() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    medico_id: '',
    motivo: '',
    data_inicio: '',
    data_fim: '',
    medico_substituto_id: '',
    observacoes: '',
  });

  const queryClient = useQueryClient();

  const { data: ausencias, isLoading } = useQuery({
    queryKey: ['medico-ausencias'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('medico_ausencias')
        .select(`
          *,
          medico:medicos!medico_ausencias_medico_id_fkey(id, nome_completo),
          substituto:medicos!medico_ausencias_medico_substituto_id_fkey(id, nome_completo)
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

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('medico_ausencias').insert([{
        ...data,
        motivo: data.motivo as any,
      }]);
      if (error) throw error;

      // Registrar no prontuário
      const medicoNome = medicos?.find(m => m.id === data.medico_id)?.nome_completo;
      const motivoLabel = MOTIVOS_AUSENCIA.find(m => m.value === data.motivo)?.label;
      const { error: prontuarioError } = await supabase.from('medico_prontuario').insert([{
        medico_id: data.medico_id,
        created_by: (await supabase.auth.getUser()).data.user?.id,
        anotacao: `Ausência registrada: ${motivoLabel} de ${format(new Date(data.data_inicio), 'dd/MM/yyyy')} até ${format(new Date(data.data_fim), 'dd/MM/yyyy')}${data.observacoes ? ` - ${data.observacoes}` : ''}`,
      }]);
      if (prontuarioError) console.error('Erro ao registrar no prontuário:', prontuarioError);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medico-ausencias'] });
      queryClient.invalidateQueries({ queryKey: ['medico-prontuario'] });
      toast.success('Ausência cadastrada com sucesso!');
      resetForm();
    },
    onError: (error) => {
      toast.error('Erro ao cadastrar ausência');
      console.error(error);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('medico_ausencias')
        .update({
          ...data,
          motivo: data.motivo as any,
        })
        .eq('id', editingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medico-ausencias'] });
      toast.success('Ausência atualizada com sucesso!');
      resetForm();
    },
    onError: (error) => {
      toast.error('Erro ao atualizar ausência');
      console.error(error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('medico_ausencias').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medico-ausencias'] });
      toast.success('Ausência excluída com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir ausência');
      console.error(error);
    },
  });

  const resetForm = () => {
    setFormData({
      medico_id: '',
      motivo: '',
      data_inicio: '',
      data_fim: '',
      medico_substituto_id: '',
      observacoes: '',
    });
    setEditingId(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (ausencia: any) => {
    setEditingId(ausencia.id);
    setFormData({
      medico_id: ausencia.medico_id,
      motivo: ausencia.motivo,
      data_inicio: ausencia.data_inicio,
      data_fim: ausencia.data_fim,
      medico_substituto_id: ausencia.medico_substituto_id || '',
      observacoes: ausencia.observacoes || '',
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

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Ausências</h2>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Ausência
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
              <TableHead>Motivo</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Substituto</TableHead>
              <TableHead>Observações</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ausencias?.map((ausencia) => (
              <TableRow key={ausencia.id}>
                <TableCell>{ausencia.medico?.nome_completo}</TableCell>
                <TableCell>
                  {MOTIVOS_AUSENCIA.find(m => m.value === ausencia.motivo)?.label}
                </TableCell>
                <TableCell>
                  {format(new Date(ausencia.data_inicio), 'dd/MM/yyyy', { locale: ptBR })} até{' '}
                  {format(new Date(ausencia.data_fim), 'dd/MM/yyyy', { locale: ptBR })}
                </TableCell>
                <TableCell>{ausencia.substituto?.nome_completo || '-'}</TableCell>
                <TableCell>{ausencia.observacoes || '-'}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(ausencia)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(ausencia.id)}
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
            <DialogTitle>{editingId ? 'Editar' : 'Nova'} Ausência</DialogTitle>
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
              <Label htmlFor="motivo">Motivo *</Label>
              <Select
                value={formData.motivo}
                onValueChange={(value) => setFormData({ ...formData, motivo: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {MOTIVOS_AUSENCIA.map((motivo) => (
                    <SelectItem key={motivo.value} value={motivo.value}>
                      {motivo.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                <Label htmlFor="data_fim">Data Fim *</Label>
                <Input
                  id="data_fim"
                  type="date"
                  value={formData.data_fim}
                  onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="medico_substituto_id">Médico Substituto</Label>
              <Select
                value={formData.medico_substituto_id}
                onValueChange={(value) => setFormData({ ...formData, medico_substituto_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o substituto (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {medicos?.filter(m => m.id !== formData.medico_id).map((medico) => (
                    <SelectItem key={medico.id} value={medico.id}>
                      {medico.nome_completo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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