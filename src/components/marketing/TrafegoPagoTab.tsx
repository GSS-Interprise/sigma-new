import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Search, Target, DollarSign, MousePointer, Eye, TrendingUp, Edit, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_CONFIG = {
  planejada: { label: "Planejada", variant: "secondary" as const },
  ativa: { label: "Ativa", variant: "default" as const },
  pausada: { label: "Pausada", variant: "outline" as const },
  finalizada: { label: "Finalizada", variant: "secondary" as const },
};

const PLATAFORMA_CONFIG = {
  meta_ads: { label: "Meta Ads", color: "bg-blue-500" },
  google_ads: { label: "Google Ads", color: "bg-red-500" },
  linkedin_ads: { label: "LinkedIn Ads", color: "bg-sky-500" },
  tiktok_ads: { label: "TikTok Ads", color: "bg-pink-500" },
  outro: { label: "Outro", color: "bg-gray-500" },
};

interface TrafegoPago {
  id: string;
  nome: string;
  objetivo: string | null;
  orcamento: number | null;
  publico: string | null;
  plataforma: string;
  data_inicio: string | null;
  data_fim: string | null;
  status: string;
  resultados: {
    cpc?: number | null;
    cpm?: number | null;
    ctr?: number | null;
    impressoes?: number | null;
    cliques?: number | null;
    conversoes?: number | null;
    gasto_total?: number | null;
  } | null;
  created_at: string;
}

export function TrafegoPagoTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPlataforma, setFilterPlataforma] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TrafegoPago | null>(null);
  
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    nome: "",
    objetivo: "",
    orcamento: "",
    publico: "",
    plataforma: "meta_ads",
    data_inicio: "",
    data_fim: "",
    status: "planejada",
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["marketing-trafego-pago"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_trafego_pago")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as TrafegoPago[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("marketing_trafego_pago").insert({
        nome: data.nome,
        objetivo: data.objetivo || null,
        orcamento: data.orcamento ? parseFloat(data.orcamento) : null,
        publico: data.publico || null,
        plataforma: data.plataforma,
        data_inicio: data.data_inicio || null,
        data_fim: data.data_fim || null,
        status: data.status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-trafego-pago"] });
      toast.success("Campanha de tráfego criada!");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: () => toast.error("Erro ao criar campanha"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from("marketing_trafego_pago")
        .update({
          nome: data.nome,
          objetivo: data.objetivo || null,
          orcamento: data.orcamento ? parseFloat(data.orcamento) : null,
          publico: data.publico || null,
          plataforma: data.plataforma,
          data_inicio: data.data_inicio || null,
          data_fim: data.data_fim || null,
          status: data.status,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-trafego-pago"] });
      toast.success("Campanha atualizada!");
      setIsDialogOpen(false);
      setEditingItem(null);
      resetForm();
    },
    onError: () => toast.error("Erro ao atualizar campanha"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_trafego_pago").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-trafego-pago"] });
      toast.success("Campanha excluída!");
    },
    onError: () => toast.error("Erro ao excluir campanha"),
  });

  const resetForm = () => {
    setFormData({
      nome: "",
      objetivo: "",
      orcamento: "",
      publico: "",
      plataforma: "meta_ads",
      data_inicio: "",
      data_fim: "",
      status: "planejada",
    });
  };

  const handleEdit = (item: TrafegoPago) => {
    setEditingItem(item);
    setFormData({
      nome: item.nome,
      objetivo: item.objetivo || "",
      orcamento: item.orcamento?.toString() || "",
      publico: item.publico || "",
      plataforma: item.plataforma,
      data_inicio: item.data_inicio || "",
      data_fim: item.data_fim || "",
      status: item.status,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.nome) {
      toast.error("Informe o nome da campanha");
      return;
    }
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.nome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || item.status === filterStatus;
    const matchesPlataforma = filterPlataforma === "all" || item.plataforma === filterPlataforma;
    return matchesSearch && matchesStatus && matchesPlataforma;
  });

  const totalOrcamento = filteredItems.reduce((acc, item) => acc + (item.orcamento || 0), 0);
  const totalGasto = filteredItems.reduce((acc, item) => acc + (item.resultados?.gasto_total || 0), 0);
  const totalCliques = filteredItems.reduce((acc, item) => acc + (item.resultados?.cliques || 0), 0);
  const totalConversoes = filteredItems.reduce((acc, item) => acc + (item.resultados?.conversoes || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Tráfego Pago</h2>
          <p className="text-sm text-muted-foreground">Gerencie campanhas de anúncios pagos</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingItem(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Nova Campanha
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingItem ? "Editar Campanha" : "Nova Campanha de Tráfego"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input
                    placeholder="Nome da campanha"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Plataforma</Label>
                  <Select value={formData.plataforma} onValueChange={(v) => setFormData({ ...formData, plataforma: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PLATAFORMA_CONFIG).map(([key, cfg]) => (
                        <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Orçamento (R$)</Label>
                  <Input
                    type="number"
                    placeholder="0,00"
                    value={formData.orcamento}
                    onChange={(e) => setFormData({ ...formData, orcamento: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                        <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data Início</Label>
                  <Input
                    type="date"
                    value={formData.data_inicio}
                    onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data Fim</Label>
                  <Input
                    type="date"
                    value={formData.data_fim}
                    onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Público-alvo</Label>
                <Input
                  placeholder="Ex: Médicos 25-45 anos, região Sul"
                  value={formData.publico}
                  onChange={(e) => setFormData({ ...formData, publico: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Objetivo</Label>
                <Textarea
                  placeholder="Descreva o objetivo da campanha..."
                  value={formData.objetivo}
                  onChange={(e) => setFormData({ ...formData, objetivo: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmit}>
                {editingItem ? "Salvar" : "Criar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Orçamento Total</span>
            </div>
            <p className="text-2xl font-bold mt-1">
              R$ {totalOrcamento.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Gasto Total</span>
            </div>
            <p className="text-2xl font-bold mt-1">
              R$ {totalGasto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <MousePointer className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Cliques</span>
            </div>
            <p className="text-2xl font-bold mt-1">{totalCliques.toLocaleString("pt-BR")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Conversões</span>
            </div>
            <p className="text-2xl font-bold mt-1">{totalConversoes.toLocaleString("pt-BR")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar campanhas..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPlataforma} onValueChange={setFilterPlataforma}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Plataforma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Plataformas</SelectItem>
            {Object.entries(PLATAFORMA_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Campaign List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Nenhuma campanha encontrada
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => {
            const plataformaConfig = PLATAFORMA_CONFIG[item.plataforma as keyof typeof PLATAFORMA_CONFIG] || PLATAFORMA_CONFIG.outro;
            const statusConfig = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.planejada;

            return (
              <Card key={item.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${plataformaConfig.color}`} />
                      <CardTitle className="text-sm font-medium">{item.nome}</CardTitle>
                    </div>
                    <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{plataformaConfig.label}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {item.orcamento && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Orçamento:</span>{" "}
                      <span className="font-medium">R$ {item.orcamento.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    </p>
                  )}
                  {item.data_inicio && (
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(item.data_inicio), "dd/MM/yyyy", { locale: ptBR })}
                      {item.data_fim && ` - ${format(new Date(item.data_fim), "dd/MM/yyyy", { locale: ptBR })}`}
                    </p>
                  )}
                  {item.resultados && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {item.resultados.impressoes && (
                        <div className="flex items-center gap-1">
                          <Eye className="h-3 w-3" /> {item.resultados.impressoes.toLocaleString("pt-BR")}
                        </div>
                      )}
                      {item.resultados.cliques && (
                        <div className="flex items-center gap-1">
                          <MousePointer className="h-3 w-3" /> {item.resultados.cliques.toLocaleString("pt-BR")}
                        </div>
                      )}
                      {item.resultados.ctr && (
                        <div>CTR: {item.resultados.ctr.toFixed(2)}%</div>
                      )}
                      {item.resultados.conversoes && (
                        <div className="flex items-center gap-1">
                          <Target className="h-3 w-3" /> {item.resultados.conversoes}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(item)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm("Excluir esta campanha?")) {
                          deleteMutation.mutate(item.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
