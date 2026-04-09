import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Search, RefreshCw, Phone, Clock, CheckCircle, XCircle, AlertTriangle, Loader2, Trash2, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Campanha {
  id: string;
  nome: string;
  proposta_id: string | null;
  texto_ia: string | null;
  instancia: string | null;
  status: string;
  total_contatos: number;
  enviados: number;
  falhas: number;
  nozap: number;
  reenviar: number;
}

interface Contato {
  id: string;
  nome: string | null;
  telefone_original: string | null;
  telefone_e164: string | null;
  status: string;
  data_envio: string | null;
  tipo_erro: string | null;
  mensagem_enviada: string | null;
  tentativas: number;
  created_at: string;
}

interface DisparosContatosPanelProps {
  campanha: Campanha;
  onBack: () => void;
}

type StatusCfg = {
  label: string;
  className: string;
  icon: React.ReactNode;
};

const statusConfig: Record<string, StatusCfg> = {
  "1-ENVIAR": { 
    label: "1-ENVIAR", 
    className: "bg-red-500 text-white border-transparent hover:bg-red-600",
    icon: <Clock className="h-3 w-3" /> 
  },
  "2-REENVIAR": {
    label: "2-REENVIAR",
    className: "bg-yellow-500 text-white border-transparent hover:bg-yellow-600",
    icon: <RefreshCw className="h-3 w-3" />,
  },
  "3-TRATANDO": {
    label: "3-TRATANDO",
    className: "bg-blue-500 text-white border-transparent hover:bg-blue-600",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  "4-ENVIADO": { 
    label: "4-ENVIADO", 
    className: "bg-green-500 text-white border-transparent hover:bg-green-600",
    icon: <CheckCircle className="h-3 w-3" /> 
  },
  "5-NOZAP": {
    label: "5-NOZAP",
    className: "bg-pink-500 text-white border-transparent hover:bg-pink-600",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  "6-BLOQUEADORA": { 
    label: "6-BLOQUEADORA", 
    className: "bg-purple-600 text-white border-transparent hover:bg-purple-700",
    icon: <XCircle className="h-3 w-3" /> 
  },
  "7-BLACKLIST": {
    label: "7-BLACKLIST",
    className: "bg-gray-800 text-white border-transparent hover:bg-gray-900",
    icon: <XCircle className="h-3 w-3" />
  },
};

export function DisparosContatosPanel({ campanha, onBack }: DisparosContatosPanelProps) {
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const queryClient = useQueryClient();
  const { isAdmin } = usePermissions();

  // Buscar contatos
  const { data: contatos = [], isLoading, refetch } = useQuery({
    queryKey: ["disparos-contatos", campanha.id, filtroStatus],
    queryFn: async () => {
      let query = supabase
        .from("disparos_contatos")
        .select("*")
        .eq("campanha_id", campanha.id)
        .order("created_at", { ascending: true });

      if (filtroStatus !== "todos") {
        query = query.eq("status", filtroStatus);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Contato[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`disparos_contatos_${campanha.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "disparos_contatos",
          filter: `campanha_id=eq.${campanha.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["disparos-contatos", campanha.id] });
          queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campanha.id, queryClient]);

  const contatosFiltrados = contatos.filter((c) => {
    if (!busca) return true;
    const termo = busca.toLowerCase();
    return (
      c.nome?.toLowerCase().includes(termo) ||
      c.telefone_original?.includes(termo) ||
      c.telefone_e164?.includes(termo)
    );
  });

  // Função para deletar contato
  const handleDeleteContato = async (contatoId: string, contatoNome: string | null) => {
    if (!confirm(`Tem certeza que deseja deletar o contato "${contatoNome || 'Sem nome'}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("disparos_contatos")
        .delete()
        .eq("id", contatoId);

      if (error) throw error;

      // Atualizar total de contatos na campanha
      await supabase
        .from("disparos_campanhas")
        .update({ 
          total_contatos: Math.max(0, (campanha.total_contatos || 0) - 1),
          updated_at: new Date().toISOString()
        })
        .eq("id", campanha.id);

      toast.success("Contato deletado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["disparos-contatos", campanha.id] });
      queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
    } catch (error) {
      console.error("Erro ao deletar contato:", error);
      toast.error("Erro ao deletar contato");
    }
  };

  // Admin: alterar status do contato
  const handleChangeStatus = async (contatoId: string, novoStatus: string) => {
    try {
      const { error } = await supabase
        .from("disparos_contatos")
        .update({ status: novoStatus, updated_at: new Date().toISOString() })
        .eq("id", contatoId);
      if (error) throw error;
      toast.success(`Status alterado para ${novoStatus}`);
      queryClient.invalidateQueries({ queryKey: ["disparos-contatos", campanha.id] });
      queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
    } catch (error) {
      console.error("Erro ao alterar status:", error);
      toast.error("Erro ao alterar status");
    }
  };

  // Mutation para concluir disparo e liberar leads pendentes
  const concluirDisparoMutation = useMutation({
    mutationFn: async () => {
      // 1. Primeiro, mudar status "3-TRATANDO" para "1-ENVIAR"
      const leadsTratando = contatos.filter((c) => c.status === "3-TRATANDO");
      if (leadsTratando.length > 0) {
        const { error: updateStatusError } = await supabase
          .from("disparos_contatos")
          .update({ status: "1-ENVIAR" })
          .eq("campanha_id", campanha.id)
          .eq("status", "3-TRATANDO");

        if (updateStatusError) throw updateStatusError;
      }

      // 2. Contar quantos leads pendentes serão removidos
      const leadsPendentes = contatos.filter(
        (c) => c.status === "1-ENVIAR" || c.status === "2-REENVIAR" || c.status === "3-TRATANDO"
      );
      const qtdRemovidos = leadsPendentes.length;

      // 3. Deletar apenas os contatos pendentes (1-ENVIAR e 2-REENVIAR)
      if (qtdRemovidos > 0) {
        const { error: deleteError } = await supabase
          .from("disparos_contatos")
          .delete()
          .eq("campanha_id", campanha.id)
          .in("status", ["1-ENVIAR", "2-REENVIAR"]);

        if (deleteError) throw deleteError;
      }

      // 3. Atualizar campanha: status = concluido, ativo = false, limpar instancia
      const novoTotalContatos = (campanha.total_contatos || 0) - qtdRemovidos;
      const { error: updateError } = await supabase
        .from("disparos_campanhas")
        .update({
          status: "concluido",
          ativo: false,
          instancia: null,
          chip_id: null,
          total_contatos: Math.max(0, novoTotalContatos),
          updated_at: new Date().toISOString(),
        })
        .eq("id", campanha.id);

      if (updateError) throw updateError;

      return { qtdRemovidos };
    },
    onSuccess: ({ qtdRemovidos }) => {
      if (qtdRemovidos > 0) {
        toast.success(`Disparo concluído! ${qtdRemovidos} lead(s) liberado(s) para novos disparos.`);
      } else {
        toast.success("Disparo concluído!");
      }
      queryClient.invalidateQueries({ queryKey: ["disparos-contatos", campanha.id] });
      queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
      queryClient.invalidateQueries({ queryKey: ["disparos-instancias-em-uso"] });
      onBack();
    },
    onError: (error) => {
      console.error("Erro ao concluir disparo:", error);
      toast.error("Erro ao concluir disparo");
    },
  });

  // [ADMIN] Mutation: resetar 3-TRATANDO → 1-ENVIAR
  const resetTratandoMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("disparos_contatos")
        .update({ status: "1-ENVIAR" })
        .eq("campanha_id", campanha.id)
        .eq("status", "3-TRATANDO")
        .select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: (qtd) => {
      toast.success(`${qtd} lead(s) resetados para 1-ENVIAR!`);
      queryClient.invalidateQueries({ queryKey: ["disparos-contatos", campanha.id] });
      queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
    },
    onError: (error: any) => {
      toast.error("Erro ao resetar: " + error.message);
    },
  });

  // Métricas
  const metricas = {
    total: contatos.length,
    enviar: contatos.filter((c) => c.status === "1-ENVIAR").length,
    tratando: contatos.filter((c) => c.status === "3-TRATANDO").length,
    enviado: contatos.filter((c) => c.status === "4-ENVIADO").length,
    nozap: contatos.filter((c) => c.status === "5-NOZAP").length,
    reenviar: contatos.filter((c) => c.status === "2-REENVIAR").length,
    bloqueadora: contatos.filter((c) => c.status === "6-BLOQUEADORA").length,
  };

  const temPendentes = metricas.enviar + metricas.reenviar > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h2 className="text-xl font-semibold">{campanha.nome}</h2>
            <p className="text-sm text-muted-foreground">
              {campanha.proposta_id} | {campanha.instancia}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>

          {/* Botão: resetar nozap → enviar */}
          {metricas.nozap > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="border-pink-500 text-pink-600 hover:bg-pink-50">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Resetar {metricas.nozap} NoZap → Enviar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Resetar leads 5-NOZAP para 1-ENVIAR?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Isso irá alterar {metricas.nozap} lead(s) com status <strong>5-NOZAP</strong> para <strong>1-ENVIAR</strong>, colocando-os novamente na fila de disparos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      try {
                        const { data, error } = await supabase
                          .from("disparos_contatos")
                          .update({ status: "1-ENVIAR" })
                          .eq("campanha_id", campanha.id)
                          .eq("status", "5-NOZAP")
                          .select("id");
                        if (error) throw error;
                        toast.success(`${data?.length ?? 0} lead(s) resetados para 1-ENVIAR!`);
                        queryClient.invalidateQueries({ queryKey: ["disparos-contatos", campanha.id] });
                        queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
                      } catch (err: any) {
                        toast.error("Erro ao resetar: " + err.message);
                      }
                    }}
                    className="bg-pink-600 hover:bg-pink-700"
                  >
                    Confirmar Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Botão: resetar tratando */}
          {metricas.tratando > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="border-blue-500 text-blue-600 hover:bg-blue-50">
                  <Loader2 className="h-4 w-4 mr-2" />
                  Resetar {metricas.tratando} Tratando
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Resetar leads 3-TRATANDO?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Isso irá alterar {metricas.tratando} lead(s) com status <strong>3-TRATANDO</strong> de volta para <strong>1-ENVIAR</strong>, desbloqueando a fila de disparos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => resetTratandoMutation.mutate()}
                    disabled={resetTratandoMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {resetTratandoMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Resetando...</>
                    ) : "Confirmar Reset"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="default" 
                size="sm" 
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCheck className="h-4 w-4 mr-2" />
                Concluir Disparos
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Concluir Disparos?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2">
                    <p>Esta ação irá:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>Marcar a campanha como concluída</li>
                      {temPendentes && (
                        <li className="text-amber-600 font-medium">
                          Remover {metricas.enviar + metricas.reenviar} contato(s) pendente(s) e liberá-los para novos disparos
                        </li>
                      )}
                      <li>Liberar a instância "{campanha.instancia}" para outras campanhas</li>
                    </ul>
                    <p className="text-sm text-muted-foreground mt-2">
                      Contatos já enviados serão mantidos no histórico.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => concluirDisparoMutation.mutate()}
                  disabled={concluirDisparoMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {concluirDisparoMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Concluindo...
                    </>
                  ) : (
                    "Confirmar"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold">{metricas.total}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </Card>
        <Card className="p-3 text-center bg-red-500/10 border-red-500/30">
          <p className="text-2xl font-bold text-red-600">{metricas.enviar}</p>
          <p className="text-xs text-muted-foreground">1-ENVIAR</p>
        </Card>
        <Card className="p-3 text-center bg-yellow-500/10 border-yellow-500/30">
          <p className="text-2xl font-bold text-yellow-600">{metricas.reenviar}</p>
          <p className="text-xs text-muted-foreground">2-REENVIAR</p>
        </Card>
        <Card className="p-3 text-center bg-blue-500/10 border-blue-500/30">
          <p className="text-2xl font-bold text-blue-600">{metricas.tratando}</p>
          <p className="text-xs text-muted-foreground">3-TRATANDO</p>
        </Card>
        <Card className="p-3 text-center bg-green-500/10 border-green-500/30">
          <p className="text-2xl font-bold text-green-600">{metricas.enviado}</p>
          <p className="text-xs text-muted-foreground">4-ENVIADO</p>
        </Card>
        <Card className="p-3 text-center bg-pink-500/10 border-pink-500/30">
          <p className="text-2xl font-bold text-pink-600">{metricas.nozap}</p>
          <p className="text-xs text-muted-foreground">5-NOZAP</p>
        </Card>
        <Card className="p-3 text-center bg-purple-600/10 border-purple-600/30">
          <p className="text-2xl font-bold text-purple-600">{metricas.bloqueadora}</p>
          <p className="text-xs text-muted-foreground">6-BLOQUEADORA</p>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="1-ENVIAR">1-ENVIAR</SelectItem>
            <SelectItem value="2-REENVIAR">2-REENVIAR</SelectItem>
            <SelectItem value="3-TRATANDO">3-TRATANDO</SelectItem>
            <SelectItem value="4-ENVIADO">4-ENVIADO</SelectItem>
            <SelectItem value="5-NOZAP">5-NOZAP</SelectItem>
            <SelectItem value="6-BLOQUEADORA">6-BLOQUEADORA</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando contatos...</div>
        ) : contatosFiltrados.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">Nenhum contato encontrado.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data Envio</TableHead>
                <TableHead>Erro</TableHead>
                <TableHead>Tentativas</TableHead>
                <TableHead className="w-12">Ações</TableHead>
              </TableRow>
            </TableHeader>
              <TableBody>
                {contatosFiltrados.map((contato, index) => {
                  const config = statusConfig[contato.status] || statusConfig["1-ENVIAR"];
                  return (
                    <TableRow key={contato.id}>
                      <TableCell className="text-muted-foreground font-mono text-sm">{index + 1}</TableCell>
                      <TableCell className="font-medium">{contato.nome || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{contato.telefone_original || contato.telefone_e164}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <Select value={contato.status} onValueChange={(v) => handleChangeStatus(contato.id, v)}>
                            <SelectTrigger className="h-7 w-auto min-w-[140px]">
                              <Badge className={cn("gap-1", config.className)}>
                                {config.icon}
                                {config.label}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(statusConfig).map(([key, cfg]) => (
                                <SelectItem key={key} value={key}>
                                  <span className="flex items-center gap-1">{cfg.icon} {cfg.label}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge className={cn("gap-1", config.className)}>
                            {config.icon}
                            {config.label}
                          </Badge>
                        )}
                      </TableCell>
                    <TableCell>
                      {contato.data_envio
                        ? format(new Date(contato.data_envio), "dd/MM HH:mm", { locale: ptBR })
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{contato.tipo_erro || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{contato.tentativas}</span>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteContato(contato.id, contato.nome)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
