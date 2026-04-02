import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, Edit, Trash2, DollarSign, Target, MousePointer } from "lucide-react";
import { toast } from "sonner";

const STATUS_CONFIG = {
  planejada: { label: "Planejada", variant: "secondary" as const },
  ativa: { label: "Ativa", variant: "default" as const },
  pausada: { label: "Pausada", variant: "outline" as const },
  finalizada: { label: "Finalizada", variant: "secondary" as const },
};

const PLATAFORMA_CONFIG = { meta_ads: "Meta Ads", google_ads: "Google Ads", linkedin_ads: "LinkedIn Ads", tiktok_ads: "TikTok Ads" };

const defaultForm = { nome: "", objetivo: "", orcamento: "", publico: "", plataforma: "meta_ads", data_inicio: "", data_fim: "", status: "planejada" };

export function TrafegoPagoSimplificadoTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultForm);
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useQuery({
    queryKey: ["marketing-trafego-pago"],
    queryFn: async () => {
      const { data, error } = await supabase.from("marketing_trafego_pago").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("marketing_trafego_pago").insert({
        nome: data.nome, objetivo: data.objetivo || null, orcamento: data.orcamento ? Number(data.orcamento) : null, publico: data.publico || null,
        plataforma: data.plataforma, data_inicio: data.data_inicio || null, data_fim: data.data_fim || null, status: data.status,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["marketing-trafego-pago"] }); toast.success("Campanha criada!"); resetForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase.from("marketing_trafego_pago").update({
        nome: data.nome, objetivo: data.objetivo || null, orcamento: data.orcamento ? Number(data.orcamento) : null, publico: data.publico || null,
        plataforma: data.plataforma, data_inicio: data.data_inicio || null, data_fim: data.data_fim || null, status: data.status,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["marketing-trafego-pago"] }); toast.success("Campanha atualizada!"); resetForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("marketing_trafego_pago").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["marketing-trafego-pago"] }); toast.success("Campanha excluída!"); },
  });

  const resetForm = () => { setFormData(defaultForm); setEditingId(null); setIsDialogOpen(false); };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    setFormData({ nome: item.nome, objetivo: item.objetivo || "", orcamento: item.orcamento?.toString() || "", publico: item.publico || "", plataforma: item.plataforma, data_inicio: item.data_inicio || "", data_fim: item.data_fim || "", status: item.status });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => { if (!formData.nome) { toast.error("Preencha o nome"); return; } editingId ? updateMutation.mutate({ id: editingId, data: formData }) : createMutation.mutate(formData); };

  const filteredItems = items?.filter((item) => {
    const matchSearch = item.nome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = filterStatus === "all" || item.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totals = items?.reduce((acc, item) => ({ orcamento: acc.orcamento + (item.orcamento || 0) }), { orcamento: 0 }) || { orcamento: 0 };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div><h2 className="text-xl font-semibold">Tráfego Pago</h2><p className="text-sm text-muted-foreground">Campanhas de anúncios</p></div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild><Button onClick={() => { setEditingId(null); setFormData(defaultForm); }}><Plus className="h-4 w-4 mr-2" />Nova Campanha</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editingId ? "Editar Campanha" : "Nova Campanha"}</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Nome *</Label><Input value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} /></div>
                <div className="space-y-2"><Label>Plataforma</Label><Select value={formData.plataforma} onValueChange={(v) => setFormData({ ...formData, plataforma: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PLATAFORMA_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="space-y-2"><Label>Objetivo</Label><Input value={formData.objetivo} onChange={(e) => setFormData({ ...formData, objetivo: e.target.value })} /></div>
              <div className="space-y-2"><Label>Público-alvo</Label><Textarea value={formData.publico} onChange={(e) => setFormData({ ...formData, publico: e.target.value })} rows={2} /></div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2"><Label>Orçamento</Label><Input type="number" value={formData.orcamento} onChange={(e) => setFormData({ ...formData, orcamento: e.target.value })} /></div>
                <div className="space-y-2"><Label>Início</Label><Input type="date" value={formData.data_inicio} onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })} /></div>
                <div className="space-y-2"><Label>Fim</Label><Input type="date" value={formData.data_fim} onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Status</Label><Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS_CONFIG).map(([k, { label }]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}</SelectContent></Select></div>
              <Button onClick={handleSubmit} className="w-full">{editingId ? "Salvar" : "Criar"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4"><div className="flex items-center gap-2"><DollarSign className="h-4 w-4" /><span className="text-sm">Orçamento Total:</span><span className="font-bold">R$ {totals.orcamento.toLocaleString("pt-BR")}</span></div></Card>

      <div className="flex gap-3">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" /></div>
        <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{Object.entries(STATUS_CONFIG).map(([k, { label }]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}</SelectContent></Select>
      </div>

      {isLoading ? <div className="text-center py-8 text-muted-foreground">Carregando...</div> : filteredItems?.length === 0 ? <div className="text-center py-8 text-muted-foreground">Nenhuma campanha</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems?.map((item) => (
            <Card key={item.id} className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div><h3 className="font-medium">{item.nome}</h3><Badge variant="outline" className="mt-1">{PLATAFORMA_CONFIG[item.plataforma as keyof typeof PLATAFORMA_CONFIG] || item.plataforma}</Badge></div>
                <Badge variant={STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG]?.variant || "secondary"}>{STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG]?.label || item.status}</Badge>
              </div>
              {item.objetivo && <p className="text-sm text-muted-foreground">{item.objetivo}</p>}
              {item.orcamento && <p className="text-sm">Orçamento: R$ {item.orcamento.toLocaleString("pt-BR")}</p>}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(item)}><Edit className="h-3 w-3 mr-1" />Editar</Button>
                <Button variant="destructive" size="sm" onClick={() => { if (confirm("Excluir?")) deleteMutation.mutate(item.id); }}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
