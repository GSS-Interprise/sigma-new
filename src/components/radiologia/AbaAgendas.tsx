import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, AlertCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { toLocalTime } from "@/lib/dateUtils";

interface Agenda {
  id: string;
  cliente_id: string;
  medico_id: string;
  data_agenda: string;
  observacoes: string | null;
  created_at: string;
  clientes: { nome_empresa: string } | null;
  medicos: { nome_completo: string } | null;
}

export function AbaAgendas() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    cliente_id: "",
    medico_id: "",
    data_agenda: "",
    observacoes: ""
  });

  const { data: agendas, isLoading } = useQuery({
    queryKey: ["radiologia_agendas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("radiologia_agendas")
        .select(`
          *,
          clientes:cliente_id(nome_empresa),
          medicos:medico_id(nome_completo)
        `)
        .order("data_agenda", { ascending: false });
      
      if (error) throw error;
      return data as Agenda[];
    }
  });

  const { data: clientes } = useQuery({
    queryKey: ["clientes_ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome_empresa")
        .eq("status_cliente", "Ativo")
        .order("nome_empresa");
      if (error) throw error;
      return data;
    }
  });

  const { data: medicos } = useQuery({
    queryKey: ["medicos_ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medicos")
        .select("id, nome_completo")
        .eq("status_medico", "Ativo")
        .order("nome_completo");
      if (error) throw error;
      return data;
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from("radiologia_agendas")
        .insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radiologia_agendas"] });
      toast({ title: "Agenda criada com sucesso" });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar agenda", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from("radiologia_agendas")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radiologia_agendas"] });
      toast({ title: "Agenda atualizada com sucesso" });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar agenda", description: error.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("radiologia_agendas")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radiologia_agendas"] });
      toast({ title: "Agenda excluída com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir agenda", description: error.message, variant: "destructive" });
    }
  });

  const resetForm = () => {
    setFormData({
      cliente_id: "",
      medico_id: "",
      data_agenda: "",
      observacoes: ""
    });
    setEditingId(null);
  };

  const handleEdit = (agenda: Agenda) => {
    setFormData({
      cliente_id: agenda.cliente_id,
      medico_id: agenda.medico_id,
      data_agenda: agenda.data_agenda,
      observacoes: agenda.observacoes || ""
    });
    setEditingId(agenda.id);
    setIsDialogOpen(true);
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
            <h3 className="text-lg font-semibold">Agendas</h3>
            <p className="text-sm text-muted-foreground">
              Gerenciamento de agendas de radiologia
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Agenda
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar Agenda" : "Nova Agenda"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cliente">Cliente *</Label>
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
                            {cliente.nome_empresa}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="medico">Médico *</Label>
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="data_agenda">Data da Agenda *</Label>
                  <Input
                    id="data_agenda"
                    type="date"
                    value={formData.data_agenda}
                    onChange={(e) => setFormData({ ...formData, data_agenda: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="observacoes">Observações</Label>
                  <Textarea
                    id="observacoes"
                    value={formData.observacoes}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                    rows={4}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {editingId ? "Atualizar" : "Criar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-muted/50 border rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium text-sm">Integração Dr. Escala</p>
              <p className="text-sm text-muted-foreground">
                A sincronização com o sistema Dr. Escala será configurada posteriormente.
              </p>
              <Button disabled variant="outline" size="sm" className="mt-2">
                Sincronizar com Dr. Escala
              </Button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Médico</TableHead>
                <TableHead>Observações</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agendas?.map((agenda) => (
                <TableRow key={agenda.id}>
                  <TableCell>{format(toLocalTime(agenda.data_agenda), "dd/MM/yyyy")}</TableCell>
                  <TableCell>{agenda.clientes?.nome_empresa}</TableCell>
                  <TableCell>{agenda.medicos?.nome_completo}</TableCell>
                  <TableCell className="max-w-xs truncate">{agenda.observacoes}</TableCell>
                  <TableCell>{format(toLocalTime(agenda.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(agenda)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm("Tem certeza que deseja excluir esta agenda?")) {
                            deleteMutation.mutate(agenda.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
