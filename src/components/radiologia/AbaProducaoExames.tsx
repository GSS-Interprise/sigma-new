import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, Download } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { toLocalTime } from "@/lib/dateUtils";

const SEGMENTOS = ["RX", "TC", "US", "RM", "MM"] as const;

interface ProducaoExame {
  id: string;
  cliente_id: string;
  medico_id: string;
  segmento: typeof SEGMENTOS[number];
  data: string;
  quantidade: number;
  observacoes: string | null;
  clientes: { nome_empresa: string } | null;
  medicos: { nome_completo: string } | null;
}

export function AbaProducaoExames() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    cliente_id: "",
    medico_id: "",
    segmento: "",
    data_inicio: "",
    data_fim: ""
  });
  const [formData, setFormData] = useState({
    cliente_id: "",
    medico_id: "",
    segmento: "",
    data: "",
    quantidade: "0",
    observacoes: ""
  });

  const { data: producoes, isLoading } = useQuery({
    queryKey: ["radiologia_producao_exames", filters],
    queryFn: async () => {
      let query = supabase
        .from("radiologia_producao_exames")
        .select(`
          *,
          clientes:cliente_id(nome_empresa),
          medicos:medico_id(nome_completo)
        `)
        .order("data", { ascending: false });

      if (filters.cliente_id) query = query.eq("cliente_id", filters.cliente_id);
      if (filters.medico_id) query = query.eq("medico_id", filters.medico_id);
      if (filters.segmento && SEGMENTOS.includes(filters.segmento as any)) {
        query = query.eq("segmento", filters.segmento as typeof SEGMENTOS[number]);
      }
      if (filters.data_inicio) query = query.gte("data", filters.data_inicio);
      if (filters.data_fim) query = query.lte("data", filters.data_fim);

      const { data, error } = await query;
      if (error) throw error;
      return data as ProducaoExame[];
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
    mutationFn: async (data: any) => {
      const { error } = await supabase
        .from("radiologia_producao_exames")
        .insert([{ ...data, quantidade: parseInt(data.quantidade) }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radiologia_producao_exames"] });
      toast({ title: "Produção registrada com sucesso" });
      setIsDialogOpen(false);
      resetForm();
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase
        .from("radiologia_producao_exames")
        .update({ ...data, quantidade: parseInt(data.quantidade) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radiologia_producao_exames"] });
      toast({ title: "Produção atualizada com sucesso" });
      setIsDialogOpen(false);
      resetForm();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("radiologia_producao_exames")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radiologia_producao_exames"] });
      toast({ title: "Produção excluída com sucesso" });
    }
  });

  const resetForm = () => {
    setFormData({
      cliente_id: "",
      medico_id: "",
      segmento: "",
      data: "",
      quantidade: "0",
      observacoes: ""
    });
    setEditingId(null);
  };

  const handleEdit = (producao: ProducaoExame) => {
    setFormData({
      cliente_id: producao.cliente_id,
      medico_id: producao.medico_id,
      segmento: producao.segmento,
      data: producao.data,
      quantidade: producao.quantidade.toString(),
      observacoes: producao.observacoes || ""
    });
    setEditingId(producao.id);
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

  const sumarioPorSegmento = SEGMENTOS.map(seg => ({
    segmento: seg,
    total: producoes?.filter(p => p.segmento === seg).reduce((sum, p) => sum + p.quantidade, 0) || 0
  }));

  const exportToCSV = () => {
    if (!producoes) return;
    
    const headers = ["Data", "Cliente", "Médico", "Segmento", "Quantidade", "Observações"];
    const rows = producoes.map(p => [
      format(toLocalTime(p.data), "dd/MM/yyyy"),
      p.clientes?.nome_empresa || "",
      p.medicos?.nome_completo || "",
      p.segmento,
      p.quantidade.toString(),
      p.observacoes || ""
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `producao_exames_${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="grid grid-cols-5 gap-4">
          <div>
            <Label>Cliente</Label>
            <Select value={filters.cliente_id || "all"} onValueChange={(value) => setFilters({ ...filters, cliente_id: value === "all" ? "" : value })}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {clientes?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome_empresa}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Médico</Label>
            <Select value={filters.medico_id || "all"} onValueChange={(value) => setFilters({ ...filters, medico_id: value === "all" ? "" : value })}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {medicos?.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.nome_completo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Segmento</Label>
            <Select value={filters.segmento || "all"} onValueChange={(value) => setFilters({ ...filters, segmento: value === "all" ? "" : value })}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {SEGMENTOS.map((seg) => (
                  <SelectItem key={seg} value={seg}>{seg}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Data Início</Label>
            <Input type="date" value={filters.data_inicio} onChange={(e) => setFilters({ ...filters, data_inicio: e.target.value })} />
          </div>
          <div>
            <Label>Data Fim</Label>
            <Input type="date" value={filters.data_fim} onChange={(e) => setFilters({ ...filters, data_fim: e.target.value })} />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Produção de Exames</h3>
            <p className="text-sm text-muted-foreground">
              Registro de exames realizados por médico e segmento
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportToCSV}>
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Produção
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{editingId ? "Editar Produção" : "Nova Produção"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Cliente *</Label>
                      <Select value={formData.cliente_id} onValueChange={(value) => setFormData({ ...formData, cliente_id: value })} required>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {clientes?.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.nome_empresa}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Médico *</Label>
                      <Select value={formData.medico_id} onValueChange={(value) => setFormData({ ...formData, medico_id: value })} required>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {medicos?.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.nome_completo}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Segmento *</Label>
                      <Select value={formData.segmento} onValueChange={(value) => setFormData({ ...formData, segmento: value })} required>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {SEGMENTOS.map((seg) => (
                            <SelectItem key={seg} value={seg}>{seg}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Data *</Label>
                      <Input type="date" value={formData.data} onChange={(e) => setFormData({ ...formData, data: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Quantidade *</Label>
                      <Input type="number" min="0" value={formData.quantidade} onChange={(e) => setFormData({ ...formData, quantidade: e.target.value })} required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Observações</Label>
                    <Textarea value={formData.observacoes} onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })} rows={3} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                    <Button type="submit">{editingId ? "Atualizar" : "Criar"}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          {sumarioPorSegmento.map(({ segmento, total }) => (
            <Badge key={segmento} variant="secondary">
              {segmento}: {total}
            </Badge>
          ))}
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
                <TableHead>Segmento</TableHead>
                <TableHead>Quantidade</TableHead>
                <TableHead>Observações</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {producoes?.map((prod) => (
                <TableRow key={prod.id}>
                  <TableCell>{format(toLocalTime(prod.data), "dd/MM/yyyy")}</TableCell>
                  <TableCell>{prod.clientes?.nome_empresa}</TableCell>
                  <TableCell>{prod.medicos?.nome_completo}</TableCell>
                  <TableCell><Badge variant="outline">{prod.segmento}</Badge></TableCell>
                  <TableCell>{prod.quantidade}</TableCell>
                  <TableCell className="max-w-xs truncate">{prod.observacoes}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(prod)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => {
                        if (confirm("Tem certeza?")) deleteMutation.mutate(prod.id);
                      }}>
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
