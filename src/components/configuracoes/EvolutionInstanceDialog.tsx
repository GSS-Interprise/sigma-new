import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

interface EvolutionInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (instanceName: string) => void;
}

const INSTANCE_COLORS = [
  { name: "Verde", value: "#22c55e" },
  { name: "Azul", value: "#3b82f6" },
  { name: "Roxo", value: "#8b5cf6" },
  { name: "Rosa", value: "#ec4899" },
  { name: "Laranja", value: "#f97316" },
  { name: "Amarelo", value: "#eab308" },
  { name: "Vermelho", value: "#ef4444" },
  { name: "Ciano", value: "#06b6d4" },
];

type DialogStep = "form" | "qrcode";

export function EvolutionInstanceDialog({ open, onOpenChange, onCreated }: EvolutionInstanceDialogProps) {
  const [instanceName, setInstanceName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedColor, setSelectedColor] = useState(INSTANCE_COLORS[0].value);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<DialogStep>("form");
  
  // QR Code state
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<string>("close");
  const [polling, setPolling] = useState(false);
  const [createdInstanceName, setCreatedInstanceName] = useState("");
  
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Fetch global config for webhook
  const { data: globalConfig } = useQuery({
    queryKey: ["evolution-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("config_lista_items")
        .select("*")
        .in("campo_nome", ["evolution_webhook_global", "evolution_behavior_config", "evolution_proxy_config"]);
      if (error) throw error;
      return data || [];
    },
  });

  const resetForm = () => {
    setInstanceName("");
    setPhoneNumber("");
    setSelectedColor(INSTANCE_COLORS[0].value);
    setStep("form");
    setQrCode(null);
    setPairingCode(null);
    setConnectionState("close");
    setPolling(false);
    setCreatedInstanceName("");
  };

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const handleCreate = async () => {
    const trimmedName = instanceName.trim();

    if (!trimmedName) {
      toast.error("Nome da instância é obrigatório");
      return;
    }

    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Sessão expirada");
        return;
      }

      // Pre-check: Evolution API exige nome único. Evita erro 403 genérico.
      try {
        const { data: existing, error: existingError } = await supabase.functions.invoke(
          "evolution-api-proxy",
          { body: { action: "fetchInstances" } }
        );

        if (!existingError && Array.isArray(existing)) {
          const alreadyExists = existing.some((evo: any) => {
            const name = evo?.name || evo?.instance?.instanceName || evo?.instanceName;
            return typeof name === "string" && name.toLowerCase() === trimmedName.toLowerCase();
          });

          if (alreadyExists) {
            toast.error(`Já existe uma instância com o nome "${trimmedName}". Use outro nome.`);
            return;
          }
        }
      } catch {
        // Se o pre-check falhar, seguimos com a tentativa de criação.
      }

      // Build payload - simplified
      const payload: Record<string, unknown> = {
        instanceName: trimmedName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      };

      if (phoneNumber) payload.number = phoneNumber;

      console.log("Creating instance with payload:", payload);

      const { data, error } = await supabase.functions.invoke("evolution-api-proxy", {
        body: { action: "createInstance", data: payload },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      // Save to local database with color
      // Use instance name as fallback for numero to avoid unique constraint violation on empty strings
      const instanceId = (data as any)?.instance?.instanceId || (data as any)?.instanceId || null;
      const numeroValue = phoneNumber || `temp_${trimmedName}_${Date.now()}`;
      
      // First, check if instance already exists and update it (in case it was marked as inativo)
      const { data: existingChip } = await supabase
        .from("chips")
        .select("id")
        .eq("instance_name", trimmedName)
        .maybeSingle();
      
      if (existingChip) {
        // Update existing record
        const { error: dbError } = await supabase
          .from("chips")
          .update({
            instance_id: instanceId,
            connection_state: "close",
            engine: "baileys",
            status: "ativo",
            behavior_config: { color: selectedColor },
          })
          .eq("id", existingChip.id);
        
        if (dbError) {
          console.error("Erro ao atualizar no banco:", dbError);
          toast.error("Instância criada na API, mas erro ao salvar localmente: " + dbError.message);
        }
      } else {
        // Insert new record
        // Get user name for created_by_name
        let creatorName: string | null = null;
        if (user?.id) {
          const { data: profile } = await supabase.from("profiles").select("nome_completo").eq("id", user.id).maybeSingle();
          creatorName = profile?.nome_completo || null;
        }

        const { error: dbError } = await supabase.from("chips").insert({
          nome: trimmedName,
          numero: numeroValue,
          instance_name: trimmedName,
          instance_id: instanceId,
          connection_state: "close",
          engine: "baileys",
          status: "ativo",
          behavior_config: { color: selectedColor },
          created_by: user?.id || null,
          created_by_name: creatorName,
        });

        if (dbError) {
          console.error("Erro ao salvar no banco:", dbError);
          toast.error("Instância criada na API, mas erro ao salvar localmente: " + dbError.message);
        }
      }

      toast.success("Instância criada! Escaneie o QR Code para conectar.");
      queryClient.invalidateQueries({ queryKey: ["instancias-whatsapp"] });

      // Move to QR Code step
      setCreatedInstanceName(trimmedName);
      setStep("qrcode");

      // Fetch QR Code
      fetchQRCode(trimmedName);
    } catch (error: any) {
      console.error("Erro ao criar instância:", error);
      toast.error(error.message || "Erro ao criar instância");
    } finally {
      setLoading(false);
    }
  };

  const fetchQRCode = async (name: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("evolution-api-proxy", {
        body: { action: "connectInstance", instanceName: name },
      });

      if (error) throw error;

      if (data?.base64) {
        setQrCode(data.base64);
        setPairingCode(data.pairingCode || null);
        setPolling(true);
      } else if (data?.instance?.state === "open") {
        setConnectionState("open");
        handleConnectionSuccess(name);
      }
    } catch (error: any) {
      console.error("Erro ao buscar QR Code:", error);
      toast.error(error.message || "Erro ao buscar QR Code");
    } finally {
      setLoading(false);
    }
  };

  const configureWebhookAutomatically = async (name: string) => {
    try {
      const webhookItem = globalConfig?.find(i => i.campo_nome === "evolution_webhook_global");
      const webhookValue = webhookItem?.valor;

      if (!webhookValue) {
        console.log("No global webhook configured, skipping auto-config");
        return;
      }

      // Parse webhook config (pode ser JSON ou string simples)
      let webhookConfig: { url: string; byEvents?: boolean; base64?: boolean; events?: string[] };
      try {
        webhookConfig = JSON.parse(webhookValue);
      } catch {
        webhookConfig = { url: webhookValue };
      }

      if (!webhookConfig.url) {
        console.log("No webhook URL configured, skipping auto-config");
        return;
      }

      console.log("Configuring webhook automatically for:", name, webhookConfig);

      const { error } = await supabase.functions.invoke("evolution-api-proxy", {
        body: {
          action: "setWebhook",
          instanceName: name,
          data: {
            url: webhookConfig.url,
            enabled: true,
            webhookByEvents: webhookConfig.byEvents ?? true,
            webhookBase64: webhookConfig.base64 ?? true,
            events: webhookConfig.events || [
              "MESSAGES_UPSERT",
              "MESSAGES_UPDATE", 
              "CONNECTION_UPDATE",
              "QRCODE_UPDATED",
              "SEND_MESSAGE",
            ],
          },
        },
      });

      if (error) {
        console.error("Erro ao configurar webhook:", error);
      } else {
        console.log("Webhook configured successfully");
        
        // Update local database
        await supabase
          .from("chips")
          .update({ webhook_url: webhookConfig.url })
          .eq("instance_name", name);
      }
    } catch (error) {
      console.error("Erro ao configurar webhook automaticamente:", error);
    }
  };

  const handleConnectionSuccess = async (name: string) => {
    toast.success("WhatsApp conectado com sucesso!");
    
    // Configure webhook automatically
    await configureWebhookAutomatically(name);
    
    queryClient.invalidateQueries({ queryKey: ["instancias-whatsapp"] });
    onCreated(name);
    handleClose(false);
  };

  const checkConnectionState = async () => {
    if (!createdInstanceName || !polling) return;

    try {
      const { data, error } = await supabase.functions.invoke("evolution-api-proxy", {
        body: { action: "connectionState", instanceName: createdInstanceName },
      });

      if (error) throw error;

      const state = data?.instance?.state || data?.state || "close";
      setConnectionState(state);

      if (state === "open") {
        setPolling(false);
        handleConnectionSuccess(createdInstanceName);
      }
    } catch (error) {
      console.error("Erro ao verificar estado:", error);
    }
  };

  useEffect(() => {
    if (!polling) return;

    const interval = setInterval(checkConnectionState, 5000);
    return () => clearInterval(interval);
  }, [polling, createdInstanceName]);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "form" ? "Nova Instância WhatsApp" : `Conectar - ${createdInstanceName}`}
          </DialogTitle>
        </DialogHeader>

        {step === "form" ? (
          <>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="instanceName">Nome da Instância *</Label>
                <Input
                  id="instanceName"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  placeholder="minha-instancia"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Número do Telefone</Label>
                <Input
                  id="phoneNumber"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="5511999999999"
                />
              </div>

              <div className="space-y-2">
                <Label>Cor da Instância</Label>
                <div className="flex flex-wrap gap-2">
                  {INSTANCE_COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setSelectedColor(color.value)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        selectedColor === color.value 
                          ? "border-foreground scale-110" 
                          : "border-transparent hover:scale-105"
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Instância
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4 py-4">
            {loading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
              </div>
            ) : connectionState === "open" ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle className="h-16 w-16 text-green-500" />
                <p className="text-lg font-medium">Conectado!</p>
              </div>
            ) : qrCode ? (
              <>
                <div className="bg-white p-4 rounded-lg">
                  <img 
                    src={qrCode} 
                    alt="QR Code WhatsApp" 
                    className="w-64 h-64"
                  />
                </div>
                
                {pairingCode && (
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Código de pareamento:</p>
                    <p className="text-2xl font-mono font-bold tracking-wider">{pairingCode}</p>
                  </div>
                )}

                <p className="text-sm text-muted-foreground text-center">
                  Abra o WhatsApp no seu celular, vá em Dispositivos Conectados e escaneie o QR Code
                </p>

                {polling && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Aguardando conexão...
                  </div>
                )}

                <Button variant="outline" onClick={() => fetchQRCode(createdInstanceName)} disabled={loading}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Gerar novo QR Code
                </Button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <XCircle className="h-16 w-16 text-destructive" />
                <p className="text-sm text-muted-foreground">Não foi possível gerar o QR Code</p>
                <Button variant="outline" onClick={() => fetchQRCode(createdInstanceName)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Tentar novamente
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
