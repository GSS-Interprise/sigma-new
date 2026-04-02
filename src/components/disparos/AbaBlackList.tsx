import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Ban, Trash2, UserX, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatPhoneForDisplay } from "@/lib/phoneUtils";

export function AbaBlackList() {
  const [searchTerm, setSearchTerm] = useState("");
  const [medicoId, setMedicoId] = useState("");
  const [reason, setReason] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { isAdmin } = usePermissions();

  // Buscar médicos disponíveis (não na black list)
  const { data: medicosDisponiveis = [] } = useQuery({
    queryKey: ["medicos-disponiveis"],
    queryFn: async () => {
      const { data: blackListData } = await supabase
        .from("blacklist")
        .select("phone_e164");
      
      const blackListPhones = blackListData?.map(b => b.phone_e164) || [];

      let query = supabase
        .from("medicos")
        .select("id, nome_completo, phone_e164, especialidade")
        .not('phone_e164', 'is', null)
        .order("nome_completo");

      const { data, error } = await query;
      if (error) throw error;
      
      // Filtrar os que já estão na blacklist
      return (data || []).filter(m => !blackListPhones.includes(m.phone_e164));
    },
  });

  // Buscar black list
  const { data: blackList = [], isLoading } = useQuery({
    queryKey: ["black-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blacklist")
        .select('*')
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const adicionarMutation = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Usuário não autenticado");
      
      const medico = medicosDisponiveis.find(m => m.id === medicoId);
      if (!medico) throw new Error("Médico não encontrado");

      const { error } = await supabase.from("blacklist").insert({
        phone_e164: medico.phone_e164,
        nome: medico.nome_completo,
        origem: 'clinico',
        reason,
        created_by: user.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["black-list"] });
      queryClient.invalidateQueries({ queryKey: ["medicos-disponiveis"] });
      toast.success("Médico adicionado à black list");
      setMedicoId("");
      setReason("");
      setDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao adicionar à black list");
    },
  });

  const removerMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blacklist").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["black-list"] });
      queryClient.invalidateQueries({ queryKey: ["medicos-disponiveis"] });
      toast.success("Médico removido da black list");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao remover da black list");
    },
  });

  const filteredBlackList = blackList.filter((item) => {
    if (!searchTerm) return true;
    return (
      item.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.phone_e164?.includes(searchTerm)
    );
  });

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Ban className="h-5 w-5" />
              Black List de Médicos
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Médicos que não desejam receber disparos
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserX className="mr-2 h-4 w-4" />
                Adicionar à Black List
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Médico à Black List</DialogTitle>
                <DialogDescription>
                  Este médico não receberá mais disparos automáticos
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="medico">Médico *</Label>
                  <Select value={medicoId} onValueChange={setMedicoId}>
                    <SelectTrigger id="medico">
                      <SelectValue placeholder="Selecione um médico" />
                    </SelectTrigger>
                    <SelectContent>
                      {medicosDisponiveis.map((medico) => (
                        <SelectItem key={medico.id} value={medico.id}>
                          {medico.nome_completo} - {medico.especialidade}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reason">Motivo</Label>
                  <Textarea
                    id="reason"
                    placeholder="Ex: Solicitou não receber mais mensagens..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => adicionarMutation.mutate()}
                  disabled={!medicoId || adicionarMutation.isPending}
                >
                  {adicionarMutation.isPending ? "Adicionando..." : "Adicionar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Carregando...
          </div>
        ) : filteredBlackList.length === 0 ? (
          <div className="text-center py-12">
            <Ban className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              {searchTerm
                ? "Nenhum médico encontrado"
                : "Nenhum médico na black list"}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBlackList.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.nome || '-'}
                  </TableCell>
                  <TableCell>
                    {formatPhoneForDisplay(item.phone_e164)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.origem === 'lead' ? 'secondary' : 'default'}>
                      {item.origem}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {item.reason || "-"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {format(new Date(item.created_at), "dd/MM/yyyy", {
                      locale: ptBR,
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removerMutation.mutate(item.id)}
                        disabled={removerMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
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
