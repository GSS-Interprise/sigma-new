import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Download, CheckCircle2 } from "lucide-react";
import { useState, useMemo } from "react";
import { getRoleLabel } from "@/lib/roleLabels";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MODULOS = [
  "dashboard",
  "clientes",
  "contratos",
  "medicos",
  "licitacoes",
  "disparos",
  "ages",
  "relacionamento",
  "escalas",
  "financeiro",
  "radiologia",
  "marketing",
  "suporte",
  "patrimonio",
  "comunicacao",
  "bi",
  "auditoria",
  "configuracoes"
];

type UserWithRoles = {
  id: string;
  nome_completo: string;
  roles: string[];
};

export function MatrizPermissoesTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("all");

  // Buscar usuários com suas roles
  const { data: usuarios, isLoading: loadingUsers } = useQuery({
    queryKey: ["usuarios-matriz"],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, nome_completo, status")
        .eq("status", "ativo");

      if (profilesError) throw profilesError;

      const { data: userRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      const usersWithRoles: UserWithRoles[] = profiles.map(profile => ({
        id: profile.id,
        nome_completo: profile.nome_completo,
        roles: userRoles
          .filter(ur => ur.user_id === profile.id)
          .map(ur => ur.role)
      }));

      return usersWithRoles;
    }
  });

  // Buscar permissões ativas de visualizar
  const { data: permissoes } = useQuery({
    queryKey: ["permissoes-visualizar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permissoes")
        .select("perfil, modulo, ativo")
        .eq("acao", "visualizar")
        .eq("ativo", true);

      if (error) throw error;
      return data;
    }
  });

  // Calcular permissões de cada usuário
  const calculateUserPermissions = (userId: string, roles: string[]) => {
    if (roles.includes("admin")) {
      return MODULOS.reduce((acc, modulo) => {
        acc[modulo] = true;
        return acc;
      }, {} as Record<string, boolean>);
    }

    const userPermissions: Record<string, boolean> = {};
    
    MODULOS.forEach(modulo => {
      const hasPermission = roles.some(role => 
        permissoes?.some(p => p.perfil === role && p.modulo === modulo && p.ativo)
      );
      userPermissions[modulo] = hasPermission;
    });

    return userPermissions;
  };

  // Filtrar usuários
  const filteredUsers = useMemo(() => {
    if (!usuarios) return [];

    return usuarios.filter(user => {
      const matchesSearch = user.nome_completo.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = selectedRole === "all" || user.roles.includes(selectedRole);
      return matchesSearch && matchesRole;
    });
  }, [usuarios, searchTerm, selectedRole]);

  // Exportar para CSV
  const exportToCSV = () => {
    if (!usuarios) return;

    const headers = ["Nome do Usuário", "Roles", ...MODULOS];
    const rows = usuarios.map(user => {
      const permissions = calculateUserPermissions(user.id, user.roles);
      return [
        user.nome_completo,
        user.roles.map(r => getRoleLabel(r)).join("; "),
        ...MODULOS.map(mod => permissions[mod] ? "Sim" : "Não")
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `matriz_permissoes_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Estatísticas
  const stats = useMemo(() => {
    if (!usuarios) return { totalUsers: 0, admins: 0, modulesAccess: {} };

    const modulesAccess: Record<string, number> = {};
    let admins = 0;

    usuarios.forEach(user => {
      if (user.roles.includes("admin")) {
        admins++;
      }
      const permissions = calculateUserPermissions(user.id, user.roles);
      Object.entries(permissions).forEach(([modulo, hasAccess]) => {
        if (hasAccess) {
          modulesAccess[modulo] = (modulesAccess[modulo] || 0) + 1;
        }
      });
    });

    return {
      totalUsers: usuarios.length,
      admins,
      modulesAccess
    };
  }, [usuarios]);

  if (loadingUsers) {
    return <div className="p-8 text-center">Carregando matriz de permissões...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header com título e ações */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Matriz de Permissões</h2>
          <p className="text-sm text-muted-foreground">
            Visualização matricial de permissões por usuário e módulo
          </p>
        </div>
        <Button onClick={exportToCSV} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total de Usuários</div>
          <div className="text-2xl font-bold">{stats.totalUsers}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Administradores</div>
          <div className="text-2xl font-bold">{stats.admins}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Módulos Ativos</div>
          <div className="text-2xl font-bold">{MODULOS.length}</div>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar usuário..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtrar por role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as roles</SelectItem>
              <SelectItem value="admin">Administrador</SelectItem>
              <SelectItem value="gestor_contratos">Gestor de Contratos</SelectItem>
              <SelectItem value="gestor_captacao">Gestor de Captação</SelectItem>
              <SelectItem value="coordenador_escalas">Coordenador de Escalas</SelectItem>
              <SelectItem value="gestor_financeiro">Gestor Financeiro</SelectItem>
              <SelectItem value="diretoria">Diretoria</SelectItem>
              <SelectItem value="gestor_radiologia">Gestor de Radiologia</SelectItem>
              <SelectItem value="gestor_marketing">Gestor de Marketing</SelectItem>
              <SelectItem value="gestor_ages">Gestor AGES</SelectItem>
              <SelectItem value="lideres">Líder de Setor</SelectItem>
              <SelectItem value="externos">Encerramento de Tickets</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Tabela Matriz */}
      <Card className="border-2 overflow-hidden">
        <div className="overflow-auto max-h-[600px]">
          <Table className="border-collapse">
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="border-b-2 bg-muted hover:bg-muted">
                <TableHead className="sticky left-0 z-20 bg-muted w-[200px] font-bold border-r-2 border-b-2 text-xs px-2 py-2">
                  Usuário
                </TableHead>
                {MODULOS.map(modulo => (
                  <TableHead key={modulo} className="text-center w-[70px] font-bold border-r border-b-2 text-[10px] px-1 py-2 capitalize">
                    <div className="truncate" title={modulo}>
                      {modulo.substring(0, 8)}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user, index) => {
                const permissions = calculateUserPermissions(user.id, user.roles);
                const isAdmin = user.roles.includes("admin");

                return (
                  <TableRow 
                    key={user.id}
                    className={`border-b ${isAdmin ? "bg-yellow-50 dark:bg-yellow-950/20 hover:bg-yellow-100 dark:hover:bg-yellow-950/30" : index % 2 === 0 ? "bg-muted/30" : ""}`}
                  >
                    <TableCell className="sticky left-0 z-10 bg-inherit border-r-2 px-2 py-2">
                      <div className="space-y-0.5">
                        <div className="font-medium text-xs truncate" title={user.nome_completo}>
                          {user.nome_completo}
                        </div>
                        <div className="flex flex-wrap gap-0.5">
                          {user.roles.slice(0, 2).map(role => (
                            <Badge 
                              key={role} 
                              variant={role === "admin" ? "default" : "secondary"}
                              className="text-[8px] h-4 px-1"
                              title={getRoleLabel(role)}
                            >
                              {getRoleLabel(role).substring(0, 10)}
                            </Badge>
                          ))}
                          {user.roles.length > 2 && (
                            <Badge variant="outline" className="text-[8px] h-4 px-1">
                              +{user.roles.length - 2}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    {MODULOS.map(modulo => (
                      <TableCell key={modulo} className="text-center border-r py-1 px-1 w-[70px]">
                        {permissions[modulo] && (
                          <div className="flex justify-center">
                            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500" />
                          </div>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Legenda */}
      <Card className="p-4">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span>Tem acesso</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 bg-yellow-100 border border-yellow-300 rounded" />
            <span>Administrador</span>
          </div>
        </div>
      </Card>

      {filteredUsers.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          Nenhum usuário encontrado com os filtros aplicados.
        </div>
      )}
    </div>
  );
}
