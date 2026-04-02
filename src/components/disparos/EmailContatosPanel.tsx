import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Search, RefreshCw, Mail, Clock, CheckCircle, XCircle, AlertTriangle, Loader2, Trash2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface CampanhaEmail {
  id: string;
  nome: string;
  proposta_id: string | null;
  texto_ia: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  status: string;
  total_contatos: number;
  enviados: number;
  falhas: number;
  respondidos: number;
  created_at: string;
  ativo: boolean;
}

interface ContatoEmail {
  id: string;
  nome: string | null;
  email: string | null;
  especialidade: string | null;
  uf: string | null;
  status: string;
  data_envio: string | null;
  data_resposta: string | null;
  erro: string | null;
  created_at: string;
}

interface EmailContatosPanelProps {
  campanha: CampanhaEmail;
  onBack: () => void;
}

type StatusCfg = {
  label: string;
  className: string;
  icon: React.ReactNode;
};

const statusConfig: Record<string, StatusCfg> = {
  "pendente": { 
    label: "PENDENTE", 
    className: "bg-red-500 text-white border-transparent hover:bg-red-600",
    icon: <Clock className="h-3 w-3" /> 
  },
  "enviando": {
    label: "ENVIANDO",
    className: "bg-blue-500 text-white border-transparent hover:bg-blue-600",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  "enviado": { 
    label: "ENVIADO", 
    className: "bg-green-500 text-white border-transparent hover:bg-green-600",
    icon: <CheckCircle className="h-3 w-3" /> 
  },
  "respondido": {
    label: "RESPONDIDO",
    className: "bg-purple-600 text-white border-transparent hover:bg-purple-700",
    icon: <MessageSquare className="h-3 w-3" />,
  },
  "erro": {
    label: "ERRO",
    className: "bg-pink-500 text-white border-transparent hover:bg-pink-600",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  "falha": { 
    label: "FALHA", 
    className: "bg-red-600 text-white border-transparent hover:bg-red-700",
    icon: <XCircle className="h-3 w-3" /> 
  },
};

export function EmailContatosPanel({ campanha, onBack }: EmailContatosPanelProps) {
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const queryClient = useQueryClient();

  // Buscar contatos
  const { data: contatos = [], isLoading, refetch } = useQuery({
    queryKey: ["email-contatos", campanha.id, filtroStatus],
    queryFn: async () => {
      let query = (supabase
        .from("email_contatos") as any)
        .select("id, nome, email, especialidade, uf, status, data_envio, data_resposta, erro, created_at")
        .eq("campanha_id", campanha.id)
        .order("created_at", { ascending: true });

      if (filtroStatus !== "todos") {
        query = query.eq("status", filtroStatus);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ContatoEmail[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`email_contatos_${campanha.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "email_contatos",
          filter: `campanha_id=eq.${campanha.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["email-contatos", campanha.id] });
          queryClient.invalidateQueries({ queryKey: ["email-campanhas"] });
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
      c.email?.toLowerCase().includes(termo)
    );
  });

  // Função para deletar contato
  const handleDeleteContato = async (contatoId: string, contatoNome: string | null) => {
    if (!confirm(`Tem certeza que deseja deletar o contato "${contatoNome || 'Sem nome'}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("email_contatos" as any)
        .delete()
        .eq("id", contatoId);

      if (error) throw error;

      // Atualizar total de contatos na campanha
      await supabase
        .from("email_campanhas" as any)
        .update({ 
          total_contatos: Math.max(0, (campanha.total_contatos || 0) - 1),
          updated_at: new Date().toISOString()
        })
        .eq("id", campanha.id);

      toast.success("Contato deletado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["email-contatos", campanha.id] });
      queryClient.invalidateQueries({ queryKey: ["email-campanhas"] });
    } catch (error) {
      console.error("Erro ao deletar contato:", error);
      toast.error("Erro ao deletar contato");
    }
  };

  // Métricas
  const metricas = {
    total: contatos.length,
    pendente: contatos.filter((c) => c.status === "pendente").length,
    enviando: contatos.filter((c) => c.status === "enviando").length,
    enviado: contatos.filter((c) => c.status === "enviado").length,
    respondido: contatos.filter((c) => c.status === "respondido").length,
    erro: contatos.filter((c) => c.status === "erro").length,
    falha: contatos.filter((c) => c.status === "falha").length,
  };

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
              {campanha.proposta_id?.slice(0, 8)} | {campanha.responsavel_nome || "Sem responsável"}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold">{metricas.total}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </Card>
        <Card className="p-3 text-center bg-red-500/10 border-red-500/30">
          <p className="text-2xl font-bold text-red-600">{metricas.pendente}</p>
          <p className="text-xs text-muted-foreground">Pendente</p>
        </Card>
        <Card className="p-3 text-center bg-blue-500/10 border-blue-500/30">
          <p className="text-2xl font-bold text-blue-600">{metricas.enviando}</p>
          <p className="text-xs text-muted-foreground">Enviando</p>
        </Card>
        <Card className="p-3 text-center bg-green-500/10 border-green-500/30">
          <p className="text-2xl font-bold text-green-600">{metricas.enviado}</p>
          <p className="text-xs text-muted-foreground">Enviado</p>
        </Card>
        <Card className="p-3 text-center bg-purple-600/10 border-purple-600/30">
          <p className="text-2xl font-bold text-purple-600">{metricas.respondido}</p>
          <p className="text-xs text-muted-foreground">Respondido</p>
        </Card>
        <Card className="p-3 text-center bg-pink-500/10 border-pink-500/30">
          <p className="text-2xl font-bold text-pink-600">{metricas.erro}</p>
          <p className="text-xs text-muted-foreground">Erro</p>
        </Card>
        <Card className="p-3 text-center bg-red-600/10 border-red-600/30">
          <p className="text-2xl font-bold text-red-600">{metricas.falha}</p>
          <p className="text-xs text-muted-foreground">Falha</p>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou email..."
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
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="enviando">Enviando</SelectItem>
            <SelectItem value="enviado">Enviado</SelectItem>
            <SelectItem value="respondido">Respondido</SelectItem>
            <SelectItem value="erro">Erro</SelectItem>
            <SelectItem value="falha">Falha</SelectItem>
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
                <TableHead>Email</TableHead>
                <TableHead>Especialidade</TableHead>
                <TableHead>UF</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data Envio</TableHead>
                <TableHead>Erro</TableHead>
                <TableHead className="w-12">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contatosFiltrados.map((contato, index) => {
                const config = statusConfig[contato.status] || statusConfig["pendente"];
                return (
                  <TableRow key={contato.id}>
                    <TableCell className="text-muted-foreground font-mono text-sm">{index + 1}</TableCell>
                    <TableCell className="font-medium">{contato.nome || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{contato.email || "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{contato.especialidade || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{contato.uf || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("gap-1", config.className)}>
                        {config.icon}
                        {config.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {contato.data_envio
                        ? format(new Date(contato.data_envio), "dd/MM HH:mm", { locale: ptBR })
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{contato.erro || "-"}</span>
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
