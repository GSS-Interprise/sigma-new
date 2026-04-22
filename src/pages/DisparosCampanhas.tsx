import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { CaptacaoProtectedRoute } from "@/components/auth/CaptacaoProtectedRoute";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Megaphone, Plus, Search, Calendar, Check, ChevronsUpDown, X, FileText } from "lucide-react";
import { CheckCircle2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CampanhaPropostasVinculadas } from "@/components/disparos/CampanhaPropostasVinculadas";
import { useVincularProposta } from "@/hooks/useCampanhaPropostas";
import { usePermissions } from "@/hooks/usePermissions";

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
  const [nome, setNome] = useState("");
  const [propostaIds, setPropostaIds] = useState<string[]>([]);
  const [propostaPickerOpen, setPropostaPickerOpen] = useState(false);
  const qc = useQueryClient();
  const vincular = useVincularProposta();
  const navigate = useNavigate();
  const { isAdmin } = usePermissions();
  const [confirmAcao, setConfirmAcao] = useState<{ id: string; nome: string; tipo: "finalizar" | "deletar" } | null>(null);

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

  const { data: propostas = [] } = useQuery({
    queryKey: ["propostas-para-campanha"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposta")
        .select("id, id_proposta, descricao, status")
        .order("criado_em", { ascending: false });
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
          nome,
          canal: "whatsapp" as any,
          status: "rascunho" as any,
          criado_por: user.user?.id,
        }])
        .select()
        .single();
      if (error) throw error;
      for (const pid of propostaIds) {
        await vincular.mutateAsync({
          campanha_id: data.id,
          proposta_id: pid,
          lista_id: null,
        });
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campanhas-multicanal"] });
      toast.success("Campanha criada");
      setDialogOpen(false);
      setNome("");
      setPropostaIds([]);
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const finalizarCampanha = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("campanhas")
        .update({ status: "finalizada" as any, data_termino: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campanhas-multicanal"] });
      toast.success("Campanha finalizada");
      setConfirmAcao(null);
    },
    onError: (e: any) => toast.error("Erro ao finalizar: " + e.message),
  });

  const deletarCampanha = useMutation({
    mutationFn: async (id: string) => {
      // Limpa dependências antes de deletar
      const { data: cps } = await supabase
        .from("campanha_propostas")
        .select("id")
        .eq("campanha_id", id);
      const cpIds = (cps || []).map((c) => c.id);
      if (cpIds.length) {
        await supabase.from("campanha_proposta_canais").delete().in("campanha_proposta_id", cpIds);
        await supabase.from("campanha_proposta_lead_canais").delete().in("campanha_proposta_id", cpIds);
        await supabase.from("campanha_propostas").delete().eq("campanha_id", id);
      }
      await supabase.from("campanhas_envios").delete().eq("campanha_id", id);
      const { data: cls } = await supabase.from("campanha_leads").select("id").eq("campanha_id", id);
      const clIds = (cls || []).map((c) => c.id);
      if (clIds.length) {
        await supabase.from("campanha_lead_touches").delete().in("campanha_lead_id", clIds);
        await supabase.from("campanha_leads").delete().eq("campanha_id", id);
      }
      const { error } = await supabase.from("campanhas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campanhas-multicanal"] });
      toast.success("Campanha deletada");
      setConfirmAcao(null);
    },
    onError: (e: any) => toast.error("Erro ao deletar: " + e.message),
  });

  const togglePropostaId = (id: string) => {
    setPropostaIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const propostaLabel = (p: any) =>
    p.id_proposta ||
    p.descricao?.replace(/^Proposta de Captação\s*-\s*/i, "") ||
    `Proposta ${p.id.slice(0, 8)}`;

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
                      <Label>Nome da campanha *</Label>
                      <Input
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        placeholder="Ex: Captação Pediatria SC"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Propostas vinculadas *</Label>
                      <Popover open={propostaPickerOpen} onOpenChange={setPropostaPickerOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between font-normal h-auto min-h-10 py-2"
                          >
                            <div className="flex flex-wrap gap-1 flex-1 text-left">
                              {propostaIds.length === 0 ? (
                                <span className="text-muted-foreground">
                                  Selecione uma ou mais propostas
                                </span>
                              ) : (
                                propostas
                                  .filter((p: any) => propostaIds.includes(p.id))
                                  .map((p: any) => (
                                    <Badge
                                      key={p.id}
                                      variant="secondary"
                                      className="gap-1 pr-1"
                                    >
                                      <FileText className="h-3 w-3" />
                                      <span className="max-w-[180px] truncate">
                                        {propostaLabel(p)}
                                      </span>
                                      <span
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          togglePropostaId(p.id);
                                        }}
                                        className="ml-0.5 rounded hover:bg-muted-foreground/20 p-0.5"
                                      >
                                        <X className="h-3 w-3" />
                                      </span>
                                    </Badge>
                                  ))
                              )}
                            </div>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Buscar proposta..." />
                            <CommandList>
                              <CommandEmpty>Nenhuma proposta encontrada.</CommandEmpty>
                              <CommandGroup>
                                <ScrollArea className="h-64">
                                  {propostas.map((p: any) => {
                                    const checked = propostaIds.includes(p.id);
                                    return (
                                      <CommandItem
                                        key={p.id}
                                        value={`${p.id_proposta ?? ""} ${p.descricao ?? ""} ${p.id}`}
                                        onSelect={() => togglePropostaId(p.id)}
                                        className="cursor-pointer"
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            checked ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        <div className="flex flex-col min-w-0">
                                          <span className="truncate font-medium">
                                            {propostaLabel(p)}
                                          </span>
                                          {p.descricao && p.id_proposta && (
                                            <span className="text-xs text-muted-foreground truncate">
                                              {p.descricao}
                                            </span>
                                          )}
                                        </div>
                                      </CommandItem>
                                    );
                                  })}
                                </ScrollArea>
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {propostaIds.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {propostaIds.length} proposta{propostaIds.length > 1 ? "s" : ""} selecionada{propostaIds.length > 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => criar.mutate()}
                      disabled={!nome.trim() || propostaIds.length === 0 || criar.isPending}
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
                  onClick={() => navigate(`/disparos/campanhas/${c.id}/propostas`)}
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
                      {c.data_inicio && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(c.data_inicio).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                        {c.status !== "finalizada" && c.status !== "arquivada" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmAcao({ id: c.id, nome: c.nome, tipo: "finalizar" });
                            }}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Finalizar
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmAcao({ id: c.id, nome: c.nome, tipo: "deletar" });
                          }}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Deletar
                        </Button>
                      </div>
                    )}
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

      <AlertDialog open={!!confirmAcao} onOpenChange={(o) => !o && setConfirmAcao(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAcao?.tipo === "finalizar" ? "Finalizar campanha?" : "Deletar campanha?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAcao?.tipo === "finalizar"
                ? `A campanha "${confirmAcao?.nome}" será marcada como finalizada.`
                : `A campanha "${confirmAcao?.nome}" e todos os seus vínculos serão deletados permanentemente.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmAcao) return;
                if (confirmAcao.tipo === "finalizar") finalizarCampanha.mutate(confirmAcao.id);
                else deletarCampanha.mutate(confirmAcao.id);
              }}
              className={confirmAcao?.tipo === "deletar" ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CaptacaoProtectedRoute>
  );
}
