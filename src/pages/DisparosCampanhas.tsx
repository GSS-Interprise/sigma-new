import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { CaptacaoProtectedRoute } from "@/components/auth/CaptacaoProtectedRoute";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Megaphone, Plus, Search, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CampanhaPropostasVinculadas } from "@/components/disparos/CampanhaPropostasVinculadas";

const CANAIS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "instagram", label: "Instagram" },
  { value: "multi", label: "Multi-canal" },
];

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  rascunho: "outline",
  agendada: "secondary",
  em_andamento: "default",
  pausada: "secondary",
  concluida: "outline",
  cancelada: "destructive",
};

export default function DisparosCampanhas() {
  const [busca, setBusca] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: "",
    descricao: "",
    canal: "multi",
    objetivo: "",
  });
  const qc = useQueryClient();

  const { data: campanhas = [], isLoading } = useQuery({
    queryKey: ["campanhas-multicanal", busca],
    queryFn: async () => {
      let q = supabase
        .from("campanhas")
        .select("id, nome, descricao, canal, status, objetivo, data_inicio, data_termino, created_at")
        .order("created_at", { ascending: false });
      if (busca.trim()) q = q.ilike("nome", `%${busca.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("campanhas")
        .insert([{
          nome: form.nome,
          descricao: form.descricao || null,
          canal: form.canal as any,
          objetivo: form.objetivo || null,
          status: "rascunho" as any,
          criado_por: user.user?.id,
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campanhas-multicanal"] });
      toast.success("Campanha criada");
      setDialogOpen(false);
      setForm({ nome: "", descricao: "", canal: "multi", objetivo: "" });
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const headerActions = (
    <div>
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Megaphone className="h-6 w-6" />
        Campanhas
      </h1>
      <p className="text-sm text-muted-foreground">
        Crie campanhas e vincule propostas multi-canal
      </p>
    </div>
  );

  const campanhaSelecionada = campanhas.find((c) => c.id === selecionada);

  return (
    <CaptacaoProtectedRoute permission="disparos_zap">
      <AppLayout headerActions={headerActions}>
        <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
          {/* Toolbar: busca + nova campanha */}
          <Card>
            <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar campanha..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Nova campanha
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nova campanha</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label>Nome *</Label>
                      <Input
                        value={form.nome}
                        onChange={(e) => setForm({ ...form, nome: e.target.value })}
                        placeholder="Ex: Captação Pediatria SC"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Canal</Label>
                      <Select
                        value={form.canal}
                        onValueChange={(v) => setForm({ ...form, canal: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CANAIS.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Objetivo</Label>
                      <Input
                        value={form.objetivo}
                        onChange={(e) => setForm({ ...form, objetivo: e.target.value })}
                        placeholder="Ex: Captar médicos para plantões"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Descrição</Label>
                      <Textarea
                        value={form.descricao}
                        onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                        rows={3}
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => criar.mutate()}
                      disabled={!form.nome.trim() || criar.isPending}
                    >
                      {criar.isPending ? "Criando..." : "Criar campanha"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          {/* Grid de campanhas */}
          {isLoading ? (
            <Card className="p-8 text-center text-muted-foreground">Carregando...</Card>
          ) : campanhas.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              Nenhuma campanha encontrada. Clique em "Nova campanha" para começar.
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {campanhas.map((c) => (
                <Card
                  key={c.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelecionada(c.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold truncate">{c.nome}</h3>
                        {c.objetivo && (
                          <p className="text-xs text-muted-foreground truncate">
                            {c.objetivo}
                          </p>
                        )}
                      </div>
                      <Badge variant={STATUS_VARIANTS[c.status] || "outline"}>
                        {c.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs">
                        {c.canal}
                      </Badge>
                      {c.data_inicio && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(c.data_inicio).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Modal detalhes campanha + propostas vinculadas */}
        <Dialog open={!!selecionada} onOpenChange={(o) => !o && setSelecionada(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{campanhaSelecionada?.nome}</DialogTitle>
            </DialogHeader>
            {campanhaSelecionada && (
              <div className="space-y-4">
                <div className="flex gap-2 flex-wrap">
                  <Badge variant={STATUS_VARIANTS[campanhaSelecionada.status] || "outline"}>
                    {campanhaSelecionada.status}
                  </Badge>
                  <Badge variant="outline">{campanhaSelecionada.canal}</Badge>
                </div>
                {campanhaSelecionada.descricao && (
                  <p className="text-sm text-muted-foreground">
                    {campanhaSelecionada.descricao}
                  </p>
                )}
                <CampanhaPropostasVinculadas campanhaId={campanhaSelecionada.id} />
              </div>
            )}
          </DialogContent>
        </Dialog>
      </AppLayout>
    </CaptacaoProtectedRoute>
  );
}
