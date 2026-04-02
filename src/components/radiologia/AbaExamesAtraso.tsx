import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { toLocalTime } from "@/lib/dateUtils";

const SEGMENTOS = ["RX", "TC", "US", "RM", "MM"];

export function AbaExamesAtraso() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    exame: "",
    segmento: "",
    cliente_id: "",
    medico_id: "",
    data_hora_execucao: "",
    observacao: "",
    anexos: [] as string[]
  });

  const { data: exames, isLoading } = useQuery({
    queryKey: ["radiologia_exames_atraso"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("radiologia_exames_atraso")
        .select(`*, clientes:cliente_id(nome_empresa), medicos:medico_id(nome_completo)`)
        .order("data_hora_execucao", { ascending: false });
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

  const { data: medicos } = useQuery({
    queryKey: ["medicos_ativos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("medicos").select("id, nome_completo").eq("status_medico", "Ativo").order("nome_completo");
      if (error) throw error;
      return data;
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from("radiologia_exames_atraso").insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radiologia_exames_atraso"] });
      toast({ title: "Exame em atraso registrado" });
      setIsDialogOpen(false);
      resetForm();
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase.from("radiologia_exames_atraso").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radiologia_exames_atraso"] });
      toast({ title: "Exame atualizado" });
      setIsDialogOpen(false);
      resetForm();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("radiologia_exames_atraso").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radiologia_exames_atraso"] });
      toast({ title: "Exame excluído" });
    }
  });

  const resetForm = () => {
    setFormData({ exame: "", segmento: "", cliente_id: "", medico_id: "", data_hora_execucao: "", observacao: "", anexos: [] });
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
            <h3 className="text-lg font-semibold">Exames em Atraso</h3>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}><Plus className="h-4 w-4 mr-2" />Novo Exame em Atraso</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{editingId ? "Editar" : "Novo"} Exame em Atraso</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Exame *</Label><Input value={formData.exame} onChange={(e) => setFormData({ ...formData, exame: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Segmento *</Label><Select value={formData.segmento} onValueChange={(v) => setFormData({ ...formData, segmento: v })} required><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SEGMENTOS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label>Cliente *</Label><Select value={formData.cliente_id} onValueChange={(v) => setFormData({ ...formData, cliente_id: v })} required><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{clientes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome_empresa}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label>Médico *</Label><Select value={formData.medico_id} onValueChange={(v) => setFormData({ ...formData, medico_id: v })} required><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{medicos?.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome_completo}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="space-y-2"><Label>Data/Hora Execução *</Label><Input type="datetime-local" value={formData.data_hora_execucao} onChange={(e) => setFormData({ ...formData, data_hora_execucao: e.target.value })} required /></div>
                <div className="space-y-2"><Label>Observação</Label><Textarea value={formData.observacao} onChange={(e) => setFormData({ ...formData, observacao: e.target.value })} rows={3} /></div>
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
            <TableHeader><TableRow><TableHead>Exame</TableHead><TableHead>Segmento</TableHead><TableHead>Cliente</TableHead><TableHead>Médico</TableHead><TableHead>Data/Hora</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {exames?.map((ex: any) => (
                <TableRow key={ex.id}>
                  <TableCell>{ex.exame}</TableCell>
                  <TableCell><Badge variant="outline">{ex.segmento}</Badge></TableCell>
                  <TableCell>{ex.clientes?.nome_empresa}</TableCell>
                  <TableCell>{ex.medicos?.nome_completo}</TableCell>
                  <TableCell>{format(toLocalTime(ex.data_hora_execucao), "dd/MM/yyyy HH:mm")}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => { setFormData({ exame: ex.exame, segmento: ex.segmento, cliente_id: ex.cliente_id, medico_id: ex.medico_id, data_hora_execucao: ex.data_hora_execucao.substring(0, 16), observacao: ex.observacao || "", anexos: ex.anexos || [] }); setEditingId(ex.id); setIsDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => { if (confirm("Tem certeza?")) deleteMutation.mutate(ex.id); }}><Trash2 className="h-4 w-4" /></Button>
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
