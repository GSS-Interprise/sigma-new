import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Upload, AlertTriangle, Loader2, Pencil, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import * as XLSX from 'xlsx';
import { useRef } from "react";

interface AbaProducaoExamesAtualizadaProps {
  clienteIdFilter?: string;
}

export function AbaProducaoExamesAtualizada({ clienteIdFilter }: AbaProducaoExamesAtualizadaProps) {
  const [isComparacaoOpen, setIsComparacaoOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    cliente_id: '',
    periodo_inicio: '',
    periodo_fim: '',
    exames_hospital: '',
    exames_gss: '',
    observacoes: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();

  const { data: comparacoes, isLoading } = useQuery({
    queryKey: ['radiologia-producao-comparacao'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('radiologia_producao_comparacao')
        .select(`
          *,
          cliente:clientes(nome_fantasia, nome_empresa)
        `)
        .order('created_at', { ascending: false });
      
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
      if (editingId) {
        const { error } = await supabase
          .from('radiologia_producao_comparacao')
          .update({
            ...data,
            exames_hospital: parseInt(data.exames_hospital),
            exames_gss: parseInt(data.exames_gss),
          })
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('radiologia_producao_comparacao')
          .insert([{
            ...data,
            exames_hospital: parseInt(data.exames_hospital),
            exames_gss: parseInt(data.exames_gss),
          }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['radiologia-producao-comparacao'] });
      toast.success(editingId ? 'Comparação atualizada com sucesso!' : 'Comparação registrada com sucesso!');
      resetForm();
    },
    onError: (error) => {
      toast.error(editingId ? 'Erro ao atualizar comparação' : 'Erro ao registrar comparação');
      console.error(error);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('radiologia_producao_comparacao')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['radiologia-producao-comparacao'] });
      toast.success('Status atualizado!');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('radiologia_producao_comparacao')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['radiologia-producao-comparacao'] });
      toast.success('Registro excluído com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir registro');
      console.error(error);
    },
  });

  const resetForm = () => {
    setFormData({
      cliente_id: '',
      periodo_inicio: '',
      periodo_fim: '',
      exames_hospital: '',
      exames_gss: '',
      observacoes: '',
    });
    setEditingId(null);
    setIsComparacaoOpen(false);
  };

  const handleEdit = (comparacao: any) => {
    setEditingId(comparacao.id);
    setFormData({
      cliente_id: comparacao.cliente_id,
      periodo_inicio: comparacao.periodo_inicio,
      periodo_fim: comparacao.periodo_fim,
      exames_hospital: comparacao.exames_hospital.toString(),
      exames_gss: comparacao.exames_gss.toString(),
      observacoes: comparacao.observacoes || '',
    });
    setIsComparacaoOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const getDiferencaBadge = (diferenca: number) => {
    if (diferenca === 0) {
      return <Badge variant="outline">Sem diferença</Badge>;
    } else if (diferenca > 0) {
      return <Badge variant="default" className="bg-green-600">+{diferenca} (GSS)</Badge>;
    } else {
      return <Badge variant="destructive">{diferenca} (Hospital)</Badge>;
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        toast.error('Arquivo Excel vazio');
        return;
      }

      let sucessos = 0;
      let erros = 0;

      for (const row of jsonData as any[]) {
        try {
          const clienteNome = row['Cliente'] || row['cliente'];
          const periodoInicio = row['Período Início'] || row['periodo_inicio'];
          const periodoFim = row['Período Fim'] || row['periodo_fim'];
          const examesHospital = parseInt(row['Exames Hospital'] || row['exames_hospital']);
          const examesGss = parseInt(row['Exames GSS'] || row['exames_gss']);
          const observacoes = row['Observações'] || row['observacoes'] || '';

          if (!clienteNome || !periodoInicio || !periodoFim) {
            erros++;
            continue;
          }

          const { data: cliente } = await supabase
            .from('clientes')
            .select('id')
            .or(`nome_fantasia.ilike.%${clienteNome}%,nome_empresa.ilike.%${clienteNome}%`)
            .single();

          if (!cliente) {
            erros++;
            continue;
          }

          const { error } = await supabase
            .from('radiologia_producao_comparacao')
            .insert({
              cliente_id: cliente.id,
              periodo_inicio: new Date(periodoInicio).toISOString().split('T')[0],
              periodo_fim: new Date(periodoFim).toISOString().split('T')[0],
              exames_hospital: examesHospital,
              exames_gss: examesGss,
              observacoes,
            });

          if (error) {
            erros++;
          } else {
            sucessos++;
          }
        } catch {
          erros++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['radiologia-producao-comparacao'] });
      
      if (sucessos > 0) {
        toast.success(`${sucessos} comparações importadas com sucesso${erros > 0 ? `, ${erros} falharam` : ''}`);
      } else {
        toast.error('Nenhuma comparação foi importada');
      }
    } catch (error) {
      console.error('Erro ao importar Excel:', error);
      toast.error('Erro ao processar arquivo Excel');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Produção de Exames</h2>
            <p className="text-sm text-muted-foreground">Compare relatórios do hospital vs GSS</p>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImportExcel}
              className="hidden"
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Importar Excel
            </Button>
            <Button onClick={() => setIsComparacaoOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Comparação
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Exames Hospital</TableHead>
                <TableHead>Exames GSS</TableHead>
                <TableHead>Diferença</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparacoes?.map((comparacao) => (
                <TableRow key={comparacao.id}>
                  <TableCell>{comparacao.cliente?.nome_fantasia || comparacao.cliente?.nome_empresa}</TableCell>
                  <TableCell>
                    {comparacao.periodo_inicio.split('-').reverse().join('/')} até{' '}
                    {comparacao.periodo_fim.split('-').reverse().join('/')}
                  </TableCell>
                  <TableCell>{comparacao.exames_hospital}</TableCell>
                  <TableCell>{comparacao.exames_gss}</TableCell>
                  <TableCell>{getDiferencaBadge(comparacao.diferenca)}</TableCell>
                  <TableCell>
                    <Badge variant={comparacao.status === 'confirmado' ? 'default' : 'secondary'}>
                      {comparacao.status === 'pendente' ? 'Pendente' : 'Confirmado'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(comparacao)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm('Tem certeza que deseja excluir este registro?')) {
                            deleteMutation.mutate(comparacao.id);
                          }
                        }}
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                      {comparacao.status === 'pendente' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateStatusMutation.mutate({ id: comparacao.id, status: 'confirmado' })}
                          title="Confirmar"
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {comparacoes?.some(c => c.status === 'pendente' && c.diferenca !== 0) && (
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-yellow-900">Pendências Encontradas</h4>
              <p className="text-sm text-yellow-700">
                Existem diferenças entre os relatórios que precisam ser confirmadas pelo hospital.
              </p>
            </div>
          </div>
        )}
      </Card>

      <Dialog open={isComparacaoOpen} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Comparação de Produção' : 'Nova Comparação de Produção'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="periodo_inicio">Período Início *</Label>
                <Input
                  id="periodo_inicio"
                  type="date"
                  value={formData.periodo_inicio}
                  onChange={(e) => setFormData({ ...formData, periodo_inicio: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="periodo_fim">Período Fim *</Label>
                <Input
                  id="periodo_fim"
                  type="date"
                  value={formData.periodo_fim}
                  onChange={(e) => setFormData({ ...formData, periodo_fim: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="exames_hospital">Exames Hospital *</Label>
                <Input
                  id="exames_hospital"
                  type="number"
                  min="0"
                  value={formData.exames_hospital}
                  onChange={(e) => setFormData({ ...formData, exames_hospital: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exames_gss">Exames GSS *</Label>
                <Input
                  id="exames_gss"
                  type="number"
                  min="0"
                  value={formData.exames_gss}
                  onChange={(e) => setFormData({ ...formData, exames_gss: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {editingId ? 'Atualizar Comparação' : 'Registrar Comparação'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}