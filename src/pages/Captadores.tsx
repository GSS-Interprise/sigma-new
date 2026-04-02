import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useCaptacaoPermissions } from "@/hooks/useCaptacaoPermissions";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Search, Users, ShieldCheck, Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { Navigate } from "react-router-dom";

interface UserWithPermissions {
  id: string;
  nome_completo: string;
  email: string;
  cor: string | null;
  permissions: {
    pode_disparos_email: boolean;
    pode_disparos_zap: boolean;
    pode_acompanhamento: boolean;
    pode_leads: boolean;
    pode_blacklist: boolean;
    pode_seigzaps_config: boolean;
    pode_contratos_servicos: boolean;
  };
}

interface AvailableUser {
  id: string;
  nome_completo: string;
  email: string;
}

const PERMISSION_COLUMNS = [
  { key: 'pode_disparos_email', label: 'Email' },
  { key: 'pode_disparos_zap', label: 'Zap' },
  { key: 'pode_acompanhamento', label: 'Acompanhamento' },
  { key: 'pode_leads', label: 'Leads' },
  { key: 'pode_blacklist', label: 'Black List' },
  { key: 'pode_seigzaps_config', label: 'SIG Zaps' },
  { key: 'pode_contratos_servicos', label: 'Contratos' },
] as const;

// 12 cores distintas que funcionam bem com texto branco
const CAPTADOR_COLORS = [
  { value: 'hsl(210, 100%, 45%)', label: 'Azul' },
  { value: 'hsl(340, 82%, 52%)', label: 'Magenta' },
  { value: 'hsl(160, 84%, 39%)', label: 'Esmeralda' },
  { value: 'hsl(262, 83%, 58%)', label: 'Roxo' },
  { value: 'hsl(25, 95%, 53%)', label: 'Laranja' },
  { value: 'hsl(195, 100%, 40%)', label: 'Ciano' },
  { value: 'hsl(0, 72%, 51%)', label: 'Vermelho' },
  { value: 'hsl(280, 68%, 45%)', label: 'Violeta' },
  { value: 'hsl(45, 93%, 47%)', label: 'Dourado' },
  { value: 'hsl(180, 70%, 35%)', label: 'Teal' },
  { value: 'hsl(330, 80%, 50%)', label: 'Pink' },
  { value: 'hsl(220, 70%, 50%)', label: 'Royal' },
];

const DEFAULT_COLOR = 'hsl(220, 14%, 46%)';

export default function Captadores() {
  const [searchTerm, setSearchTerm] = useState("");
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userToRemove, setUserToRemove] = useState<UserWithPermissions | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  
  const { 
    canManageCaptadores, 
    updatePermissions, 
    isLoading: isLoadingPermissions 
  } = useCaptacaoPermissions();

  // Fetch captação sector ID
  const { data: captacaoSetor } = useQuery({
    queryKey: ['captacao-setor'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setores')
        .select('id, nome')
        .ilike('nome', '%capta%')
        .single();
      
      if (error) {
        console.error('Error fetching captação sector:', error);
        return null;
      }
      return data;
    },
  });

  // Fetch users from captação sector
  const { data: captadores, isLoading: isLoadingUsers, refetch } = useQuery({
    queryKey: ['captadores-list'],
    enabled: canManageCaptadores,
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          id,
          nome_completo,
          email,
          setor_id,
          setores:setor_id (
            id,
            nome
          )
        `)
        .not('setor_id', 'is', null);

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        throw profilesError;
      }

      const captacaoProfiles = profiles?.filter(p => 
        p.setores && 
        typeof p.setores === 'object' && 
        'nome' in p.setores &&
        typeof p.setores.nome === 'string' &&
        p.setores.nome.toLowerCase().includes('capta')
      ) || [];

      const userIds = captacaoProfiles.map(p => p.id);
      
      const { data: permissions, error: permError } = await supabase
        .from('captacao_permissoes_usuario')
        .select('*')
        .in('user_id', userIds);

      if (permError) {
        console.error('Error fetching permissions:', permError);
      }

      const usersWithPermissions: UserWithPermissions[] = captacaoProfiles.map(profile => {
        const userPerm = permissions?.find(p => p.user_id === profile.id);
        return {
          id: profile.id,
          nome_completo: profile.nome_completo || 'Sem nome',
          email: profile.email || '',
          cor: userPerm?.cor || null,
          permissions: {
            pode_disparos_email: userPerm?.pode_disparos_email || false,
            pode_disparos_zap: userPerm?.pode_disparos_zap || false,
            pode_acompanhamento: userPerm?.pode_acompanhamento || false,
            pode_leads: userPerm?.pode_leads || false,
            pode_blacklist: userPerm?.pode_blacklist || false,
            pode_seigzaps_config: userPerm?.pode_seigzaps_config || false,
            pode_contratos_servicos: userPerm?.pode_contratos_servicos || false,
          },
        };
      });

      return usersWithPermissions;
    },
  });

  // Fetch available users (not in captação sector)
  const { data: availableUsers, isLoading: isLoadingAvailable } = useQuery({
    queryKey: ['available-users-for-captacao', captadores],
    enabled: canManageCaptadores && showAddDialog,
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, nome_completo, email')
        .order('nome_completo');

      if (error) {
        console.error('Error fetching available users:', error);
        return [];
      }

      const captadorIds = captadores?.map(c => c.id) || [];
      const filteredUsers = profiles?.filter(p => !captadorIds.includes(p.id)) || [];
      
      return filteredUsers as AvailableUser[];
    },
  });

  const filteredCaptadores = useMemo(() => {
    if (!captadores) return [];
    if (!searchTerm.trim()) return captadores;

    const term = searchTerm.toLowerCase();
    return captadores.filter(
      c => c.nome_completo.toLowerCase().includes(term) || 
           c.email.toLowerCase().includes(term)
    );
  }, [captadores, searchTerm]);

  // Cores já usadas por outros captadores
  const usedColors = useMemo(() => {
    return new Set(captadores?.filter(c => c.cor).map(c => c.cor) || []);
  }, [captadores]);

  // Cores disponíveis para um captador específico (sua própria cor + as não usadas)
  const getAvailableColors = (currentCor: string | null) => {
    return CAPTADOR_COLORS.filter(c => !usedColors.has(c.value) || c.value === currentCor);
  };

  const handleColorChange = async (userId: string, cor: string) => {
    setUpdatingUser(userId);
    try {
      const { error } = await supabase
        .from('captacao_permissoes_usuario')
        .update({ cor })
        .eq('user_id', userId);

      if (error) throw error;
      toast.success("Cor atualizada");
      refetch();
    } catch (error) {
      console.error('Error updating color:', error);
      toast.error("Erro ao atualizar cor");
    } finally {
      setUpdatingUser(null);
    }
  };

  const handlePermissionChange = async (
    userId: string, 
    permissionKey: string, 
    checked: boolean
  ) => {
    setUpdatingUser(userId);
    try {
      updatePermissions(
        { 
          userId, 
          permissions: { [permissionKey]: checked } 
        },
        {
          onSuccess: () => {
            toast.success("Permissão atualizada");
            refetch();
          },
          onError: (error) => {
            console.error('Error updating permission:', error);
            toast.error("Erro ao atualizar permissão");
          },
          onSettled: () => {
            setUpdatingUser(null);
          },
        }
      );
    } catch (error) {
      console.error('Error:', error);
      toast.error("Erro ao atualizar permissão");
      setUpdatingUser(null);
    }
  };

  const handleAddCaptador = async () => {
    if (!selectedUserId || !captacaoSetor?.id) {
      toast.error("Selecione um usuário");
      return;
    }

    setIsAdding(true);
    try {
      // Update user's sector to captação
      const { error } = await supabase
        .from('profiles')
        .update({ setor_id: captacaoSetor.id })
        .eq('id', selectedUserId);

      if (error) throw error;

      // Create initial permissions record
      const { error: permError } = await supabase
        .from('captacao_permissoes_usuario')
        .upsert({
          user_id: selectedUserId,
          pode_disparos_email: false,
          pode_disparos_zap: false,
          pode_acompanhamento: false,
          pode_leads: false,
          pode_blacklist: false,
          pode_seigzaps_config: false,
          pode_contratos_servicos: false,
        }, { onConflict: 'user_id' });

      if (permError) throw permError;

      toast.success("Captador adicionado com sucesso");
      setShowAddDialog(false);
      setSelectedUserId("");
      refetch();
    } catch (error) {
      console.error('Error adding captador:', error);
      toast.error("Erro ao adicionar captador");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveCaptador = async () => {
    if (!userToRemove) return;

    setIsRemoving(true);
    try {
      // Remove user from captação sector (set setor_id to null)
      const { error } = await supabase
        .from('profiles')
        .update({ setor_id: null })
        .eq('id', userToRemove.id);

      if (error) throw error;

      // Delete permissions record
      await supabase
        .from('captacao_permissoes_usuario')
        .delete()
        .eq('user_id', userToRemove.id);

      toast.success("Captador removido com sucesso");
      setShowRemoveDialog(false);
      setUserToRemove(null);
      refetch();
    } catch (error) {
      console.error('Error removing captador:', error);
      toast.error("Erro ao remover captador");
    } finally {
      setIsRemoving(false);
    }
  };

  if (!isLoadingPermissions && !canManageCaptadores) {
    return <Navigate to="/disparos" replace />;
  }

  const headerActions = (
    <div className="flex items-center justify-between w-full">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          Captadores
        </h1>
        <p className="text-sm text-muted-foreground">
          Gerencie os membros e permissões do setor de captação
        </p>
      </div>
      <Button onClick={() => setShowAddDialog(true)} className="gap-2">
        <UserPlus className="h-4 w-4" />
        Adicionar Captador
      </Button>
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-6 space-y-6">
        {/* Search */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            <span>{filteredCaptadores.length} captadores</span>
          </div>
        </div>

        {/* Cards Grid */}
        {isLoadingUsers || isLoadingPermissions ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredCaptadores.length === 0 ? (
          <Card className="p-8">
            <div className="text-center text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">
                {searchTerm 
                  ? "Nenhum captador encontrado"
                  : "Nenhum captador cadastrado"
                }
              </p>
              <p className="text-sm mt-1">
                {searchTerm 
                  ? "Tente outro termo de busca"
                  : "Clique em 'Adicionar Captador' para começar"
                }
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredCaptadores.map((captador) => {
              const bgColor = captador.cor || DEFAULT_COLOR;
              const availableColors = getAvailableColors(captador.cor);
              return (
                <Card 
                  key={captador.id} 
                  className="relative group overflow-hidden"
                  style={{ backgroundColor: bgColor }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate text-white">
                          {captador.nome_completo}
                        </CardTitle>
                        <p className="text-sm text-white/80 truncate mt-1">
                          {captador.email}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Select
                          value={captador.cor || ''}
                          onValueChange={(value) => handleColorChange(captador.id, value)}
                        >
                          <SelectTrigger className="h-7 w-7 p-0 border-white/30 bg-white/20 hover:bg-white/30">
                            <div 
                              className="w-4 h-4 rounded-full border border-white/50"
                              style={{ backgroundColor: captador.cor || 'transparent' }}
                            />
                          </SelectTrigger>
                          <SelectContent className="bg-background z-50">
                            {availableColors.map((color) => (
                              <SelectItem key={color.value} value={color.value}>
                                <div className="flex items-center gap-2">
                                  <div 
                                    className="w-4 h-4 rounded-full border border-border"
                                    style={{ backgroundColor: color.value }}
                                  />
                                  <span>{color.label}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => {
                            setUserToRemove(captador);
                            setShowRemoveDialog(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 gap-2">
                      {PERMISSION_COLUMNS.map(col => (
                        <label
                          key={col.key}
                          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white/10 rounded p-1.5 -mx-1.5 transition-colors"
                        >
                          {updatingUser === captador.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                          ) : (
                            <Checkbox
                              checked={captador.permissions[col.key as keyof typeof captador.permissions]}
                              onCheckedChange={(checked) => 
                                handlePermissionChange(captador.id, col.key, checked as boolean)
                              }
                              className="border-white/50 data-[state=checked]:bg-white data-[state=checked]:text-current data-[state=checked]:border-white"
                            />
                          )}
                          <span className="text-white/90">{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Add Card */}
            <Card 
              className="border-dashed cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors flex items-center justify-center min-h-[180px]"
              onClick={() => setShowAddDialog(true)}
            >
              <div className="text-center text-muted-foreground">
                <Plus className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm font-medium">Adicionar Captador</p>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Adicionar Captador
            </DialogTitle>
            <DialogDescription>
              Selecione um usuário para adicionar ao setor de captação
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um usuário..." />
              </SelectTrigger>
              <SelectContent>
                {isLoadingAvailable ? (
                  <div className="p-4 text-center">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  </div>
                ) : availableUsers?.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    Nenhum usuário disponível
                  </div>
                ) : (
                  availableUsers?.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <div className="flex flex-col">
                        <span>{user.nome_completo || 'Sem nome'}</span>
                        <span className="text-xs text-muted-foreground">{user.email}</span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddCaptador} disabled={!selectedUserId || isAdding}>
              {isAdding && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Remover Captador
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover <strong>{userToRemove?.nome_completo}</strong> do setor de captação? Esta ação irá remover todas as permissões associadas.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoveDialog(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleRemoveCaptador} disabled={isRemoving}>
              {isRemoving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
