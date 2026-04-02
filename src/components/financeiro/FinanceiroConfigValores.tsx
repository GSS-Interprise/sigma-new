import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ConfigValor {
  id: string;
  descricao: string;
  tipo_plantao: string | null;
  setor: string | null;
  valor_hora: number;
  ativo: boolean;
}

export function FinanceiroConfigValores() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ descricao: "", tipo_plantao: "", setor: "", valor_hora: 0 });

  const { data: valores = [], isLoading } = useQuery({
    queryKey: ["financeiro-config-valores-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financeiro_config_valores")
        .select("*")
        .order("descricao");
      if (error) throw error;
      return data as ConfigValor[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("financeiro_config_valores").insert({
        descricao: form.descricao,
        tipo_plantao: form.tipo_plantao || null,
        setor: form.setor || null,
        valor_hora: form.valor_hora,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração adicionada.");
      queryClient.invalidateQueries({ queryKey: ["financeiro-config-valores-all"] });
      setOpen(false);
      setForm({ descricao: "", tipo_plantao: "", setor: "", valor_hora: 0 });
    },
    onError: () => toast.error("Erro ao adicionar configuração."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financeiro_config_valores").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido.");
      queryClient.invalidateQueries({ queryKey: ["financeiro-config-valores-all"] });
    },
  });

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Configuração de Valores por Hora</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Defina os valores/hora por setor e tipo de plantão. O mais específico será usado na geração.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Adicionar</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Configuração de Valor</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Descrição *</Label>
                <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex: Plantão Noturno UTI" />
              </div>
              <div>
                <Label>Setor (opcional)</Label>
                <Input value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })} placeholder="Ex: UTI, PA, etc." />
              </div>
              <div>
                <Label>Tipo de Plantão (opcional)</Label>
                <Input value={form.tipo_plantao} onChange={(e) => setForm({ ...form, tipo_plantao: e.target.value })} placeholder="Ex: Noturno, Diurno, etc." />
              </div>
              <div>
                <Label>Valor/Hora (R$) *</Label>
                <Input type="number" value={form.valor_hora} onChange={(e) => setForm({ ...form, valor_hora: Number(e.target.value) })} min={0} step={10} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => addMutation.mutate()} disabled={!form.descricao || form.valor_hora <= 0}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-center py-4">Carregando...</p>
        ) : valores.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            Nenhuma configuração cadastrada. Adicione valores para automatizar os cálculos.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead>Tipo Plantão</TableHead>
                <TableHead className="text-right">Valor/Hora</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {valores.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.descricao}</TableCell>
                  <TableCell>{v.setor || "Todos"}</TableCell>
                  <TableCell>{v.tipo_plantao || "Todos"}</TableCell>
                  <TableCell className="text-right">{fmt(Number(v.valor_hora))}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(v.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
