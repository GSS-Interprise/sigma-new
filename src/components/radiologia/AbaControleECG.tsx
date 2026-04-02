import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

import { toLocalTime } from "@/lib/dateUtils";

interface AbaControleECGProps {
  clienteIdFilter?: string;
}

export function AbaControleECG({ clienteIdFilter }: AbaControleECGProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    cliente_id: "",
    medico_id: "",
    paciente: "",
    data_hora_liberacao: "",
    anexos: [] as string[]
  });

  const { data: ecgs, isLoading } = useQuery({
    queryKey: ["radiologia_ecg"],
    queryFn: async () => {
      const { data, error } = await supabase.from("radiologia_ecg").select(`*, clientes:cliente_id(nome_empresa), medicos:medico_id(nome_completo)`).order("data_hora_liberacao", { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: clientes } = useQuery({
    queryKey: ["clientes_ativos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("id, nome_empresa").eq("status_cliente", "Ativo").order("nome_empresa");
      if (error) throw error;
      return data;
    }
  });

  // Buscar médicos vinculados ao cliente selecionado
  const { data: medicos } = useQuery({
    queryKey: ["medicos_vinculados_cliente_ecg", formData.cliente_id],
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

  // Limpar médico quando cliente mudar
  const handleClienteChange = (clienteId: string) => {
    setFormData(prev => ({ ...prev, cliente_id: clienteId, medico_id: "" }));
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from("radiologia_ecg").insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radiologia_ecg"] });
      toast({ title: "ECG registrado com sucesso" });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      console.error("Erro ao salvar ECG:", error);
      toast({ 
        title: "Erro ao registrar ECG", 
        description: error.message || "Tente novamente",
        variant: "destructive" 
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase.from("radiologia_ecg").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radiologia_ecg"] });
      toast({ title: "ECG atualizado com sucesso" });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      console.error("Erro ao atualizar ECG:", error);
      toast({ 
        title: "Erro ao atualizar ECG", 
        description: error.message || "Tente novamente",
        variant: "destructive" 
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("radiologia_ecg").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radiologia_ecg"] });
      toast({ title: "ECG excluído" });
    }
  });

  const resetForm = () => {
    setFormData({ cliente_id: "", medico_id: "", paciente: "", data_hora_liberacao: "", anexos: [] });
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validação dos campos obrigatórios
    if (!formData.cliente_id) {
      toast({ title: "Selecione um cliente", variant: "destructive" });
      return;
    }
    if (!formData.medico_id) {
      toast({ title: "Selecione um médico", variant: "destructive" });
      return;
    }
    if (!formData.paciente.trim()) {
      toast({ title: "Informe o nome do paciente", variant: "destructive" });
      return;
    }
    if (!formData.data_hora_liberacao) {
      toast({ title: "Informe a data/hora de liberação", variant: "destructive" });
      return;
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Controle de ECG</h3>
            <p className="text-sm text-muted-foreground">Liberações de ECG - Dr. Maikon Madeira</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Novo ECG</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{editingId ? "Editar" : "Novo"} ECG</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Cliente *</Label>
                    <Select value={formData.cliente_id} onValueChange={handleClienteChange} required>
                      <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                      <SelectContent>{clientes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome_empresa}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Médico *</Label>
                    <Select 
                      value={formData.medico_id} 
                      onValueChange={(v) => setFormData({ ...formData, medico_id: v })} 
                      required 
                      disabled={!formData.cliente_id || (medicos?.length === 0)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={!formData.cliente_id ? "Selecione um cliente primeiro" : medicos?.length === 0 ? "Nenhum médico vinculado" : "Selecione o médico"} />
                      </SelectTrigger>
                      <SelectContent>
                        {medicos?.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome_completo}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {formData.cliente_id && medicos?.length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhum médico vinculado a este cliente</p>
                    )}
                  </div>
                </div>
                <div className="space-y-2"><Label>Nome do Paciente *</Label><Input value={formData.paciente} onChange={(e) => setFormData({ ...formData, paciente: e.target.value })} required /></div>
                <div className="space-y-2"><Label>Data/Hora Liberação *</Label><Input type="datetime-local" value={formData.data_hora_liberacao} onChange={(e) => setFormData({ ...formData, data_hora_liberacao: e.target.value })} required /></div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit">{editingId ? "Atualizar" : "Criar"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
          <Table>
            <TableHeader><TableRow><TableHead>Paciente</TableHead><TableHead>Cliente</TableHead><TableHead>Médico</TableHead><TableHead>Data/Hora</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {ecgs?.map((ecg: any) => (
                <TableRow key={ecg.id}>
                  <TableCell>{ecg.paciente}</TableCell>
                  <TableCell>{ecg.clientes?.nome_empresa}</TableCell>
                  <TableCell>{ecg.medicos?.nome_completo}</TableCell>
                  <TableCell>{format(toLocalTime(ecg.data_hora_liberacao), "dd/MM/yyyy HH:mm")}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => { setFormData({ cliente_id: ecg.cliente_id, medico_id: ecg.medico_id, paciente: ecg.paciente, data_hora_liberacao: ecg.data_hora_liberacao.substring(0, 16), anexos: ecg.anexos || [] }); setEditingId(ecg.id); setIsDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => { if (confirm("Tem certeza?")) deleteMutation.mutate(ecg.id); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
