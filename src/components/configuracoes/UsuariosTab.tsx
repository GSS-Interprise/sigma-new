import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, KeyRound } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FiltroUsuarios } from "./FiltroUsuarios";
import { UsuarioDialog } from "./UsuarioDialog";
import { toast } from "sonner";
import { getRoleLabel } from "@/lib/roleLabels";

export function UsuariosTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUsuario, setSelectedUsuario] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [resettingPassword, setResettingPassword] = useState<string | null>(null);

  const { data: usuarios, isLoading } = useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select(`
          *,
          user_roles(role),
          setores(nome)
        `)
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const handleStatusToggle = (status: string) => {
    setSelectedStatus((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    );
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setSelectedStatus([]);
  };

  const handleEditUsuario = (usuario: any) => {
    setSelectedUsuario(usuario);
    setDialogOpen(true);
  };

  const handleNewUsuario = () => {
    setSelectedUsuario(null);
    setDialogOpen(true);
  };

  const handleResetPassword = async (email: string, userId: string) => {
    setResettingPassword(userId);
    try {
      const { error } = await supabase.functions.invoke('reset-user-password', {
        body: { email }
      });

      if (error) throw error;

      toast.success("Email de redefinição enviado com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao enviar email de redefinição");
    } finally {
      setResettingPassword(null);
    }
  };

  const filteredUsuarios = useMemo(() => {
    if (!usuarios) return [];

    return usuarios.filter((usuario) => {
      const matchesSearch =
        !searchTerm ||
        usuario.nome_completo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        usuario.email?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        selectedStatus.length === 0 || selectedStatus.includes(usuario.status);

      return matchesSearch && matchesStatus;
    });
  }, [usuarios, searchTerm, selectedStatus]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Gerenciar Usuários</h2>
        <Button onClick={handleNewUsuario}>
          <Plus className="mr-2 h-4 w-4" />
          Criar Usuário
        </Button>
      </div>

      <FiltroUsuarios
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        selectedStatus={selectedStatus}
        onStatusToggle={handleStatusToggle}
        onClearFilters={handleClearFilters}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Setor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Permissões</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center">Carregando...</TableCell>
              </TableRow>
            ) : filteredUsuarios.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Nenhum usuário encontrado
                </TableCell>
              </TableRow>
            ) : (
              filteredUsuarios.map((usuario: any) => (
                <TableRow key={usuario.id}>
                  <TableCell>{usuario.nome_completo}</TableCell>
                  <TableCell>{usuario.email}</TableCell>
                  <TableCell>{usuario.telefone || '-'}</TableCell>
                  <TableCell>{usuario.setores?.nome || '-'}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        usuario.status === "ativo"
                          ? "default"
                          : usuario.status === "suspenso"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {usuario.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {usuario.user_roles?.map((ur: any, idx: number) => (
                      <Badge key={idx} variant="outline" className="mr-1">
                        {getRoleLabel(ur.role)}
                      </Badge>
                    ))}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEditUsuario(usuario)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResetPassword(usuario.email, usuario.id)}
                        disabled={resettingPassword === usuario.id}
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <UsuarioDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        usuario={selectedUsuario}
      />
    </div>
  );
}
