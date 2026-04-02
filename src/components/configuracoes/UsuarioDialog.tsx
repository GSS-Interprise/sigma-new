import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { SetorSelect } from "@/components/shared/SetorSelect";

type UserStatus = "ativo" | "inativo" | "suspenso";

const AVAILABLE_ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "gestor_contratos", label: "Gestor de Contratos" },
  { value: "gestor_captacao", label: "Gestor de Captação" },
  { value: "coordenador_escalas", label: "Coordenador de Escalas" },
  { value: "gestor_financeiro", label: "Gestor Financeiro" },
  { value: "diretoria", label: "Diretoria" },
  { value: "gestor_radiologia", label: "Gestor de Radiologia" },
  { value: "gestor_marketing", label: "Gestor de Marketing" },
  { value: "gestor_ages", label: "Gestor AGES" },
  { value: "lideres", label: "Líder de Setor" },
  { value: "externos", label: "Encerramento de Tickets" },
];

interface UsuarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuario?: any;
}

export function UsuarioDialog({ open, onOpenChange, usuario }: UsuarioDialogProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [formData, setFormData] = useState<{
    nome_completo: string;
    email: string;
    telefone: string;
    status: UserStatus;
    password: string;
    setor_id: string;
  }>({
    nome_completo: "",
    email: "",
    telefone: "",
    status: "ativo",
    password: "",
    setor_id: "",
  });

  useEffect(() => {
    if (usuario) {
      setFormData({
        nome_completo: usuario.nome_completo || "",
        email: usuario.email || "",
        telefone: usuario.telefone || "",
        status: (usuario.status || "ativo") as UserStatus,
        password: "",
        setor_id: usuario.setor_id || "",
      });
      
      // Load user roles
      const userRoles = usuario.user_roles?.map((ur: any) => ur.role) || [];
      setSelectedRoles(userRoles);
    } else {
      setFormData({
        nome_completo: "",
        email: "",
        telefone: "",
        status: "ativo" as UserStatus,
        password: "",
        setor_id: "",
      });
      setSelectedRoles([]);
    }
  }, [usuario, open]);

  const handleRoleToggle = (role: string) => {
    setSelectedRoles((prev) =>
      prev.includes(role)
        ? prev.filter((r) => r !== role)
        : [...prev, role]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let userId = usuario?.id;

      if (usuario) {
        // Update existing user
        const { error } = await supabase
          .from("profiles")
          .update({
            nome_completo: formData.nome_completo,
            telefone: formData.telefone,
            status: formData.status,
            setor_id: formData.setor_id || null,
          })
          .eq("id", usuario.id);

        if (error) throw error;

        // Update email if changed
        if (formData.email && formData.email !== usuario.email) {
          const { data: session } = await supabase.auth.getSession();
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-user-email`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${session?.session?.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ userId: usuario.id, newEmail: formData.email }),
            }
          );
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Erro ao atualizar email");
        }
      } else {
        // Create new user
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              nome_completo: formData.nome_completo,
            },
          },
        });

        if (authError) throw authError;

        if (authData.user) {
          userId = authData.user.id;
          
          // Update profile with additional data
          const { error: profileError } = await supabase
            .from("profiles")
            .update({
              telefone: formData.telefone,
              status: formData.status,
              setor_id: formData.setor_id || null,
            })
            .eq("id", authData.user.id);

          if (profileError) throw profileError;
        }
      }

      // Update user roles using edge function
      if (userId) {
        const { data: session } = await supabase.auth.getSession();
        
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-user-roles`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session?.session?.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: userId,
              roles: selectedRoles,
            }),
          }
        );

        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Erro ao atualizar permissões');
        }
      }

      toast.success(usuario ? "Usuário atualizado com sucesso!" : "Usuário criado com sucesso!");
      
      // Invalidate and refetch the usuarios query
      await queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      await queryClient.refetchQueries({ queryKey: ["usuarios"] });
      
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar usuário");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {usuario ? "Editar Usuário" : "Criar Novo Usuário"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome Completo</Label>
            <Input
              id="nome"
              value={formData.nome_completo}
              onChange={(e) =>
                setFormData({ ...formData, nome_completo: e.target.value })
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              required
            />
          </div>

          {!usuario && (
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                required
                minLength={6}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="telefone">Telefone</Label>
            <Input
              id="telefone"
              value={formData.telefone}
              onChange={(e) =>
                setFormData({ ...formData, telefone: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="setor">Setor</Label>
            <SetorSelect
              value={formData.setor_id}
              onValueChange={(value) =>
                setFormData({ ...formData, setor_id: value === "none" ? "" : value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value: UserStatus) =>
                setFormData({ ...formData, status: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
                <SelectItem value="suspenso">Suspenso</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Permissões / Funções</Label>
            <div className="border rounded-md p-4 space-y-3">
              {AVAILABLE_ROLES.map((role) => (
                <div key={role.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`role-${role.value}`}
                    checked={selectedRoles.includes(role.value)}
                    onCheckedChange={() => handleRoleToggle(role.value)}
                  />
                  <label
                    htmlFor={`role-${role.value}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {role.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
