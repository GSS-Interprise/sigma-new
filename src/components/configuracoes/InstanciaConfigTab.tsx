import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Smartphone, 
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Cog,
  QrCode,
  Power,
  PowerOff,
  RotateCcw,
  Loader2,
  Wifi,
  WifiOff,
  Link,
  Search
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermissions } from "@/hooks/usePermissions";
import { QRCodeDialog } from "./QRCodeDialog";
import { EvolutionInstanceDialog } from "./EvolutionInstanceDialog";

import { GlobalEvolutionConfigDialog } from "./GlobalEvolutionConfigDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface ChipInstance {
  id: string;
  nome: string;
  numero: string;
  instance_name: string | null;
  instance_id: string | null;
  connection_state: string | null;
  profile_name: string | null;
  profile_picture_url: string | null;
  webhook_url: string | null;
  engine: string | null;
  behavior_config: Record<string, boolean> | null;
  proxy_config: Record<string, string> | null;
  status: string;
  limite_diario: number | null;
  provedor: string | null;
  tipo_instancia: string | null;
  created_at: string | null;
  created_by: string | null;
  created_by_name: string | null;
}

export type TipoInstancia = "disparos" | "trafego_pago";

interface InstanciaConfigTabProps {
  tipo?: TipoInstancia;
}

export function InstanciaConfigTab({ tipo = "disparos" }: InstanciaConfigTabProps) {
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [newInstanceDialogOpen, setNewInstanceDialogOpen] = useState(false);
  const [adminConfigOpen, setAdminConfigOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [instanceToDelete, setInstanceToDelete] = useState<ChipInstance | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [applyingWebhook, setApplyingWebhook] = useState<string | null>(null);
  const [selectedInstanceName, setSelectedInstanceName] = useState<string>("");
  const [searchFilter, setSearchFilter] = useState("");
  
  const queryClient = useQueryClient();
  const { isAdmin, isLoadingRoles } = usePermissions();

  // Fetch local instances - only active ones by default
  const { data: instancias = [], isLoading } = useQuery({
    queryKey: ["instancias-whatsapp"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chips")
        .select("*")
        .eq("status", "ativo")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ChipInstance[];
    },
  });

  // Realtime subscription for chips table
  useEffect(() => {
    const channel = supabase
      .channel('chips-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chips'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["instancias-whatsapp"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Apply global webhook configuration to an instance
  const applyGlobalWebhook = async (instance: ChipInstance) => {
    const instanceName = instance.instance_name || instance.nome;
    setApplyingWebhook(instanceName);
    
    try {
      // Load global webhook config from database
      const { data: configItems } = await supabase
        .from("config_lista_items")
        .select("*")
        .eq("campo_nome", "evolution_webhook_global")
        .single();
      
      if (!configItems?.valor) {
        toast.error("Configure o webhook global primeiro nas configurações (ícone de engrenagem)");
        return;
      }
      
      let webhookConfig;
      try {
        webhookConfig = JSON.parse(configItems.valor);
      } catch {
        toast.error("Configuração de webhook inválida");
        return;
      }
      
      if (!webhookConfig.url) {
        toast.error("URL do webhook não configurada. Acesse as configurações globais.");
        return;
      }
      
      // Apply webhook to instance via Evolution API
      const { error } = await supabase.functions.invoke("evolution-api-proxy", {
        body: {
          action: "setWebhook",
          instanceName,
          data: {
            url: webhookConfig.url,
            enabled: true,
            webhookByEvents: webhookConfig.byEvents || false,
            webhookBase64: webhookConfig.base64 || false,
            events: webhookConfig.events || ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED", "SEND_MESSAGE"],
          },
        },
      });
      
      if (error) throw error;
      
      // Update local database
      await supabase
        .from("chips")
        .update({ 
          webhook_url: webhookConfig.url,
          updated_at: new Date().toISOString()
        })
        .eq("id", instance.id);
      
      toast.success(`Webhook configurado em ${instanceName}`);
      queryClient.invalidateQueries({ queryKey: ["instancias-whatsapp"] });
    } catch (error: any) {
      console.error("Erro ao aplicar webhook:", error);
      toast.error(error.message || "Erro ao configurar webhook");
    } finally {
      setApplyingWebhook(null);
    }
  };

  // Sync with Evolution API
  const syncInstances = async () => {
    setSyncing(true);
    try {
      // 1. Buscar dados frescos do banco (não usar estado React stale)
      const [evoResult, chipsResult, sigzapResult] = await Promise.all([
        supabase.functions.invoke("evolution-api-proxy", { body: { action: "fetchInstances" } }),
        supabase.from("chips").select("*").eq("status", "ativo"),
        supabase.from("sigzap_instances").select("*"),
      ]);

      if (evoResult.error) throw evoResult.error;
      if (chipsResult.error) throw chipsResult.error;

      const freshChips: ChipInstance[] = (chipsResult.data || []) as ChipInstance[];
      const sigzapInstances = sigzapResult.data || [];
      const data = evoResult.data;

      if (Array.isArray(data)) {
        console.log("[Sync] Evolution API full response:", JSON.stringify(data, null, 2));
        
        const evolutionInstanceNames = new Set<string>();
        
        // Update local database with Evolution instances
        for (const evoInstance of data) {
          const instanceName = evoInstance.name || evoInstance.instance?.instanceName || evoInstance.instanceName;
          if (!instanceName) continue;
          evolutionInstanceNames.add(instanceName);
          
          const rawState = 
            (typeof evoInstance.connectionStatus === 'string' ? evoInstance.connectionStatus : null) ||
            evoInstance.connectionStatus?.state ||
            evoInstance.instance?.status ||
            evoInstance.instance?.state || 
            evoInstance.state || 
            "close";
          
          console.log(`[Sync] Instance "${instanceName}": rawState = "${rawState}"`);
          
          const normalizedState = String(rawState).toLowerCase();
          const isConnected = ["open", "connected"].includes(normalizedState);
          const state = isConnected ? "open" : "close";
          
          const profileName = evoInstance.profileName || evoInstance.instance?.profileName || null;
          const profilePictureUrl = evoInstance.profilePicUrl || evoInstance.instance?.profilePictureUrl || null;
          const instanceNumber = evoInstance.number || evoInstance.instance?.number || null;
          const instanceId = evoInstance.id || null;

          console.log(`[Sync] Instance "${instanceName}": state=${state}, number=${instanceNumber}, pic=${profilePictureUrl ? 'yes' : 'no'}`);

          // Lookup usando lista FRESCA do banco (não estado React stale)
          const existingChip = freshChips.find(
            (i) => i.instance_name === instanceName || i.nome === instanceName
          );

          let chipId: string | null = existingChip?.id ?? null;

          // UPSERT pelo instance_name (identificador único real)
          // Evita erro de duplicate key em 'numero' — múltiplas instâncias podem ter o mesmo número
          const { data: upsertedChip, error: upsertChipError } = await supabase
            .from("chips")
            .upsert(
              {
                nome: instanceName,
                numero: instanceNumber || existingChip?.numero || "",
                instance_name: instanceName,
                connection_state: state,
                profile_name: profileName,
                profile_picture_url: profilePictureUrl,
                status: "ativo",
              },
              { onConflict: "instance_name" }
            )
            .select("id")
            .single();

          if (upsertChipError) {
            console.error(`[Sync] Erro ao upsert chip "${instanceName}":`, upsertChipError);
          } else if (upsertedChip) {
            chipId = upsertedChip.id;
            console.log(`[Sync] Chip "${instanceName}" upserted com id=${chipId}`);
          }
          
          // Update sigzap_instances table
          const existingSigzap = sigzapInstances.find(i => i.name === instanceName);
          const sigzapStatus = isConnected ? "connected" : "disconnected";
          
          if (existingSigzap) {
            const { error: updateSigzapError } = await supabase
              .from("sigzap_instances")
              .update({
                status: sigzapStatus,
                phone_number: instanceNumber ?? existingSigzap.phone_number,
                profile_picture_url: profilePictureUrl ?? existingSigzap.profile_picture_url,
                chip_id: chipId ?? existingSigzap.chip_id ?? null,
                instance_uuid: existingSigzap.instance_uuid ?? instanceId ?? null,
              })
              .eq("id", existingSigzap.id);
            if (updateSigzapError) {
              console.error(`[Sync] Erro ao atualizar sigzap_instance "${instanceName}":`, updateSigzapError);
            }
          } else {
            const { error: insertSigzapError } = await supabase
              .from("sigzap_instances")
              .insert({
                name: instanceName,
                status: sigzapStatus,
                phone_number: instanceNumber,
                profile_picture_url: profilePictureUrl,
                instance_uuid: instanceId,
                chip_id: chipId,
              });
            if (insertSigzapError) {
              console.error(`[Sync] Erro ao inserir sigzap_instance "${instanceName}":`, insertSigzapError);
            } else {
              console.log(`[Sync] sigzap_instance "${instanceName}" criada com chip_id=${chipId}`);
            }
          }
        }

        // Mark instances not in Evolution as inactive (usando lista fresca)
        for (const localChip of freshChips) {
          const inEvolution = evolutionInstanceNames.has(localChip.instance_name || '') || 
                             evolutionInstanceNames.has(localChip.nome);
          if (!inEvolution) {
            const { error } = await supabase
              .from("chips")
              .update({ connection_state: "close", status: "inativo" })
              .eq("id", localChip.id);
            if (error) {
              console.error(`[Sync] Erro ao marcar chip "${localChip.nome}" como inativo:`, error);
            } else {
              console.log(`[Sync] Chip "${localChip.instance_name || localChip.nome}" marcado como inativo`);
            }
          }
        }
        
        // Mark sigzap_instances not in Evolution as deleted
        for (const sigzapInstance of sigzapInstances) {
          if (!evolutionInstanceNames.has(sigzapInstance.name) && sigzapInstance.status !== 'deleted') {
            const { error } = await supabase
              .from("sigzap_instances")
              .update({ status: "deleted" })
              .eq("id", sigzapInstance.id);
            if (error) {
              console.error(`[Sync] Erro ao marcar sigzap_instance "${sigzapInstance.name}" como deleted:`, error);
            } else {
              console.log(`[Sync] SigZap instance "${sigzapInstance.name}" marcada como deleted`);
            }
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["instancias-whatsapp"] });
      queryClient.invalidateQueries({ queryKey: ["sigzap-instances"] });
      queryClient.invalidateQueries({ queryKey: ["sigzap-instances-active"] });
      queryClient.invalidateQueries({ queryKey: ["chips-instances"] });
      toast.success("Instâncias sincronizadas com sucesso!");
    } catch (error: any) {
      console.error("Erro ao sincronizar:", error);
      toast.error(error.message || "Erro ao sincronizar instâncias");
    } finally {
      setSyncing(false);
    }
  };

  // Restart instance
  const restartInstance = async (instanceName: string) => {
    try {
      const { error } = await supabase.functions.invoke("evolution-api-proxy", {
        body: { action: "restartInstance", instanceName },
      });
      if (error) throw error;
      toast.success("Instância reiniciada!");
      syncInstances();
    } catch (error: any) {
      toast.error(error.message || "Erro ao reiniciar instância");
    }
  };

  // Logout instance
  const logoutInstance = async (instanceName: string) => {
    try {
      const { error } = await supabase.functions.invoke("evolution-api-proxy", {
        body: { action: "logoutInstance", instanceName },
      });
      if (error) throw error;
      toast.success("Instância desconectada!");
      syncInstances();
    } catch (error: any) {
      toast.error(error.message || "Erro ao desconectar instância");
    }
  };

  // Delete instance
  const deleteInstance = async (instance: ChipInstance) => {
    try {
      const instanceName = instance.instance_name || instance.nome;
      
      // Delete from Evolution API
      const { error: evoError } = await supabase.functions.invoke("evolution-api-proxy", {
        body: { action: "deleteInstance", instanceName },
      });
      
      if (evoError) {
        console.warn("Erro ao deletar da Evolution API:", evoError);
      }

      // Delete from local database
      const { error: dbError } = await supabase.from("chips").delete().eq("id", instance.id);
      if (dbError) throw dbError;

      queryClient.invalidateQueries({ queryKey: ["instancias-whatsapp"] });
      toast.success("Instância removida!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover instância");
    }
  };

  const handleConnect = (instance: ChipInstance) => {
    const instanceName = instance.instance_name || instance.nome;
    setSelectedInstanceName(instanceName);
    setQrDialogOpen(true);
  };

  const handleInstanceCreated = (instanceName: string) => {
    setSelectedInstanceName(instanceName);
    setQrDialogOpen(true);
  };

  const getConnectionBadge = (state: string | null) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode; label: string }> = {
      open: { variant: "default", icon: <Wifi className="h-3 w-3 mr-1" />, label: "Conectado" },
      close: { variant: "secondary", icon: <WifiOff className="h-3 w-3 mr-1" />, label: "Desconectado" },
      connecting: { variant: "outline", icon: <Loader2 className="h-3 w-3 mr-1 animate-spin" />, label: "Conectando" },
    };
    const { variant, icon, label } = variants[state || "close"] || variants.close;
    return (
      <Badge variant={variant} className="flex items-center">
        {icon}
        {label}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    return status === "ativo" ? (
      <Badge variant="outline" className="flex items-center">
        <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />
        Ativo
      </Badge>
    ) : (
      <Badge variant="outline" className="flex items-center">
        <XCircle className="h-3 w-3 mr-1 text-muted-foreground" />
        Inativo
      </Badge>
    );
  };

  // Aguardar carregamento das permissões
  if (isLoadingRoles) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Configuração de Instâncias</h2>
          <p className="text-muted-foreground">Gerencie suas instâncias WhatsApp (Evolution API)</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            onClick={syncInstances}
            disabled={syncing}
          >
            {syncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sincronizar
          </Button>
          {isAdmin && (
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => setAdminConfigOpen(true)}
              title="Configurações Avançadas"
            >
              <Cog className="h-4 w-4" />
            </Button>
          )}
          <Button onClick={() => setNewInstanceDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Instância
          </Button>
        </div>
      </div>

      {/* Lista de Instâncias */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Instâncias Cadastradas
          </CardTitle>
          <CardDescription>
            Gerencie suas instâncias WhatsApp conectadas à Evolution API
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por instância ou captador..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-9"
            />
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : instancias.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Nenhuma instância cadastrada. Clique em "Nova Instância" para começar.
            </p>
          ) : (() => {
            const filtered = instancias.filter((inst) => {
              if (!searchFilter.trim()) return true;
              const term = searchFilter.toLowerCase();
              return (
                inst.nome?.toLowerCase().includes(term) ||
                inst.profile_name?.toLowerCase().includes(term) ||
                inst.created_by_name?.toLowerCase().includes(term) ||
                inst.numero?.toLowerCase().includes(term)
              );
            });
            return filtered.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Nenhuma instância encontrada para "{searchFilter}".
              </p>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Instância</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Engine</TableHead>
                  <TableHead>Conexão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inst) => {
                  const instanceColor = (inst.behavior_config as Record<string, unknown>)?.color as string || "#3b82f6";
                  return (
                  <TableRow key={inst.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {inst.profile_picture_url ? (
                          <img 
                            src={inst.profile_picture_url} 
                            alt={inst.nome} 
                            className="h-8 w-8 rounded-full"
                            style={{ borderColor: instanceColor, borderWidth: 2 }}
                          />
                        ) : (
                          <div 
                            className="h-8 w-8 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: instanceColor }}
                          >
                            <Smartphone className="h-4 w-4 text-white" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{inst.nome}</p>
                          {inst.profile_name && (
                            <p className="text-xs text-muted-foreground">{inst.profile_name}</p>
                          )}
                          {inst.created_by_name && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 mt-0.5 font-normal">
                              {inst.created_by_name}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{inst.numero || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{inst.engine || "baileys"}</Badge>
                    </TableCell>
                    <TableCell>{getConnectionBadge(inst.connection_state)}</TableCell>
                    <TableCell>{getStatusBadge(inst.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {/* Botão de Webhook - aplica config global */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => applyGlobalWebhook(inst)}
                          disabled={applyingWebhook === (inst.instance_name || inst.nome)}
                          title="Configurar Webhook (usa configurações globais)"
                        >
                          {applyingWebhook === (inst.instance_name || inst.nome) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Link className="h-4 w-4" />
                          )}
                        </Button>
                        
                        {inst.connection_state !== "open" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleConnect(inst)}
                            title="Conectar (QR Code)"
                          >
                            <QrCode className="h-4 w-4" />
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => restartInstance(inst.instance_name || inst.nome)}
                              title="Reiniciar"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => logoutInstance(inst.instance_name || inst.nome)}
                              title="Desconectar"
                            >
                              <PowerOff className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setInstanceToDelete(inst);
                            setDeleteDialogOpen(true);
                          }}
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            );
          })()}
        </CardContent>
      </Card>

      {/* QR Code Dialog */}
      <QRCodeDialog
        open={qrDialogOpen}
        onOpenChange={setQrDialogOpen}
        instanceName={selectedInstanceName}
        onConnected={() => {
          syncInstances();
          setQrDialogOpen(false);
        }}
      />

      {/* New Instance Dialog */}
      <EvolutionInstanceDialog
        open={newInstanceDialogOpen}
        onOpenChange={setNewInstanceDialogOpen}
        onCreated={handleInstanceCreated}
      />


      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a instância "{instanceToDelete?.nome}"? 
              Esta ação não pode ser desfeita e a instância será removida da Evolution API.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (instanceToDelete) {
                  deleteInstance(instanceToDelete);
                }
                setDeleteDialogOpen(false);
                setInstanceToDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Admin Config Dialog - Now uses GlobalEvolutionConfigDialog */}
      {isAdmin && (
        <GlobalEvolutionConfigDialog 
          open={adminConfigOpen} 
          onOpenChange={setAdminConfigOpen} 
        />
      )}
    </div>
  );
}
