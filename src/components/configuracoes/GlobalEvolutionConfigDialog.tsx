import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Cog, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface GlobalEvolutionConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface BehaviorConfig {
  rejectCall: boolean;
  msgCall: string;
  groupsIgnore: boolean;
  alwaysOnline: boolean;
  readMessages: boolean;
  readStatus: boolean;
  syncFullHistory: boolean;
}

interface ProxyConfig {
  host: string;
  port: string;
  protocol: string;
  username: string;
  password: string;
}

interface WebhookConfig {
  url: string;
  byEvents: boolean;
  base64: boolean;
  events: string[];
}

const defaultBehavior: BehaviorConfig = {
  rejectCall: false,
  msgCall: "",
  groupsIgnore: false,
  alwaysOnline: false,
  readMessages: false,
  readStatus: false,
  syncFullHistory: false,
};

const defaultProxy: ProxyConfig = {
  host: "",
  port: "",
  protocol: "http",
  username: "",
  password: "",
};

const defaultWebhook: WebhookConfig = {
  url: "",
  byEvents: false,
  base64: true,
  events: [
    "CALL",
    "CHATS_UPDATE",
    "CHATS_UPSERT",
    "CONNECTION_UPDATE",
    "CONTACTS_UPDATE",
    "CONTACTS_UPSERT",
    "GROUPS_UPSERT",
    "MESSAGES_DELETE",
    "MESSAGES_UPDATE",
    "MESSAGES_UPSERT",
    "PRESENCE_UPDATE",
    "QRCODE_UPDATED",
    "SEND_MESSAGE",
    "TYPEBOT_CHANGE_STATUS",
    "TYPEBOT_START",
  ],
};

const AVAILABLE_WEBHOOK_EVENTS = [
  { id: "APPLICATION_STARTUP", label: "Startup da Aplicação", description: "Início da instância" },
  { id: "CALL", label: "Chamadas", description: "Chamadas recebidas" },
  { id: "CHATS_DELETE", label: "Chats Deletados", description: "Conversas apagadas" },
  { id: "CHATS_SET", label: "Chats Definidos", description: "Definição inicial de chats" },
  { id: "CHATS_UPDATE", label: "Chats Atualizados", description: "Alterações em conversas" },
  { id: "CHATS_UPSERT", label: "Novas Conversas", description: "Novas conversas iniciadas" },
  { id: "CONNECTION_UPDATE", label: "Status da Conexão", description: "Conectado/desconectado" },
  { id: "CONTACTS_SET", label: "Contatos Definidos", description: "Definição inicial de contatos" },
  { id: "CONTACTS_UPDATE", label: "Contatos Atualizados", description: "Alterações em contatos" },
  { id: "CONTACTS_UPSERT", label: "Novos Contatos", description: "Contatos adicionados" },
  { id: "GROUP_PARTICIPANTS_UPDATE", label: "Participantes Grupo", description: "Alteração de membros" },
  { id: "GROUP_UPDATE", label: "Grupos Atualizados", description: "Alterações em grupos" },
  { id: "GROUPS_UPSERT", label: "Grupos Criados", description: "Criação de grupos" },
  { id: "LABELS_ASSOCIATION", label: "Etiquetas Associadas", description: "Associação de etiquetas" },
  { id: "LABELS_EDIT", label: "Etiquetas Editadas", description: "Edição de etiquetas" },
  { id: "LOGOUT_INSTANCE", label: "Logout da Instância", description: "Desconexão da instância" },
  { id: "MESSAGES_DELETE", label: "Mensagens Deletadas", description: "Mensagens apagadas" },
  { id: "MESSAGES_SET", label: "Mensagens Definidas", description: "Definição inicial de mensagens" },
  { id: "MESSAGES_UPDATE", label: "Status de Mensagens", description: "Lida, entregue, etc." },
  { id: "MESSAGES_UPSERT", label: "Mensagens Recebidas", description: "Novas mensagens ou atualizações" },
  { id: "PRESENCE_UPDATE", label: "Presença Online", description: "Status online/offline" },
  { id: "QRCODE_UPDATED", label: "QR Code Atualizado", description: "Novo QR Code gerado" },
  { id: "REMOVE_INSTANCE", label: "Instância Removida", description: "Remoção de instância" },
  { id: "SEND_MESSAGE", label: "Mensagens Enviadas", description: "Confirmação de envio" },
  { id: "TYPEBOT_CHANGE_STATUS", label: "Typebot Status", description: "Mudança de status Typebot" },
  { id: "TYPEBOT_START", label: "Typebot Iniciado", description: "Início de fluxo Typebot" },
];

export function GlobalEvolutionConfigDialog({ open, onOpenChange }: GlobalEvolutionConfigDialogProps) {
  const [evolutionUrl, setEvolutionUrl] = useState("");
  const [evolutionKey, setEvolutionKey] = useState("");
  const [behavior, setBehavior] = useState<BehaviorConfig>(defaultBehavior);
  const [proxy, setProxy] = useState<ProxyConfig>(defaultProxy);
  const [webhook, setWebhook] = useState<WebhookConfig>(defaultWebhook);
  const [saving, setSaving] = useState(false);
  
  const queryClient = useQueryClient();

  // Load existing config
  const { data: configItems } = useQuery({
    queryKey: ["evolution-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("config_lista_items")
        .select("*")
        .in("campo_nome", [
          "evolution_api_url", 
          "evolution_api_key", 
          "evolution_webhook_global",
          "evolution_behavior_config",
          "evolution_proxy_config",
        ]);
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  useEffect(() => {
    if (configItems) {
      const urlItem = configItems.find(i => i.campo_nome === "evolution_api_url");
      const keyItem = configItems.find(i => i.campo_nome === "evolution_api_key");
      const webhookItem = configItems.find(i => i.campo_nome === "evolution_webhook_global");
      const behaviorItem = configItems.find(i => i.campo_nome === "evolution_behavior_config");
      const proxyItem = configItems.find(i => i.campo_nome === "evolution_proxy_config");
      
      setEvolutionUrl(urlItem?.valor || "");
      setEvolutionKey(keyItem?.valor || "");
      
      if (webhookItem?.valor) {
        try {
          const webhookData = JSON.parse(webhookItem.valor);
          setWebhook({ ...defaultWebhook, ...webhookData });
        } catch {
          setWebhook({ ...defaultWebhook, url: webhookItem.valor });
        }
      }
      
      if (behaviorItem?.valor) {
        try {
          const behaviorData = JSON.parse(behaviorItem.valor);
          setBehavior({ ...defaultBehavior, ...behaviorData });
        } catch {
          setBehavior(defaultBehavior);
        }
      }
      
      if (proxyItem?.valor) {
        try {
          const proxyData = JSON.parse(proxyItem.valor);
          setProxy({ ...defaultProxy, ...proxyData });
        } catch {
          setProxy(defaultProxy);
        }
      }
    }
  }, [configItems]);

  const handleBehaviorChange = (field: keyof BehaviorConfig, value: boolean | string) => {
    setBehavior(prev => ({ ...prev, [field]: value }));
  };

  const handleProxyChange = (field: keyof ProxyConfig, value: string) => {
    setProxy(prev => ({ ...prev, [field]: value }));
  };

  const handleWebhookChange = (field: keyof WebhookConfig, value: boolean | string) => {
    setWebhook(prev => ({ ...prev, [field]: value }));
  };

  const saveConfig = async (campo_nome: string, valor: string) => {
    const existing = configItems?.find(i => i.campo_nome === campo_nome);
    
    if (existing) {
      await supabase
        .from("config_lista_items")
        .update({ valor })
        .eq("id", existing.id);
    } else if (valor) {
      await supabase
        .from("config_lista_items")
        .insert({ campo_nome, valor });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save API config
      await saveConfig("evolution_api_url", evolutionUrl);
      await saveConfig("evolution_api_key", evolutionKey);
      
      // Save webhook config
      await saveConfig("evolution_webhook_global", JSON.stringify(webhook));
      
      // Save behavior config
      await saveConfig("evolution_behavior_config", JSON.stringify(behavior));
      
      // Save proxy config
      if (proxy.host && proxy.port) {
        await saveConfig("evolution_proxy_config", JSON.stringify(proxy));
      }

      queryClient.invalidateQueries({ queryKey: ["evolution-config"] });
      toast.success("Configurações salvas!");
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cog className="h-5 w-5" />
            Configurações Globais - Evolution API
          </DialogTitle>
          <DialogDescription>
            Configure as credenciais e comportamento padrão para novas instâncias
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="api" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="api">API</TabsTrigger>
            <TabsTrigger value="webhook">Webhook</TabsTrigger>
          </TabsList>

          <TabsContent value="api" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="evolution_url">URL da Evolution API</Label>
              <Input
                id="evolution_url"
                value={evolutionUrl}
                onChange={(e) => setEvolutionUrl(e.target.value)}
                placeholder="https://evolution.seuservidor.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="evolution_key">API Key</Label>
              <Input
                id="evolution_key"
                type="password"
                value={evolutionKey}
                onChange={(e) => setEvolutionKey(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </TabsContent>

          <TabsContent value="webhook" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Configure o webhook global que será aplicado automaticamente a novas instâncias após conexão.
            </p>
            
            <div className="space-y-2">
              <Label htmlFor="webhookUrl">Webhook URL</Label>
              <Input
                id="webhookUrl"
                value={webhook.url}
                onChange={(e) => handleWebhookChange("url", e.target.value)}
                placeholder="https://seu-servidor.com/webhook"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Webhook por Eventos</Label>
                <p className="text-sm text-muted-foreground">Separa webhooks por tipo de evento</p>
              </div>
              <Switch
                checked={webhook.byEvents}
                onCheckedChange={(v) => handleWebhookChange("byEvents", v)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Enviar mídia em Base64</Label>
                <p className="text-sm text-muted-foreground">Inclui arquivos de mídia codificados</p>
              </div>
              <Switch
                checked={webhook.base64}
                onCheckedChange={(v) => handleWebhookChange("base64", v)}
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Eventos do Webhook</Label>
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => setWebhook(prev => ({ ...prev, events: AVAILABLE_WEBHOOK_EVENTS.map(e => e.id) }))}
                  >
                    Todos
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => setWebhook(prev => ({ ...prev, events: [] }))}
                  >
                    Nenhum
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Selecione quais eventos serão enviados para o webhook.
              </p>
              
              <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto pr-2">
                {AVAILABLE_WEBHOOK_EVENTS.map((event) => (
                  <div 
                    key={event.id} 
                    className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <Label className="font-medium cursor-pointer">{event.label}</Label>
                      <p className="text-xs text-muted-foreground">{event.description}</p>
                    </div>
                    <Switch
                      checked={webhook.events?.includes(event.id) || false}
                      onCheckedChange={(checked) => {
                        setWebhook(prev => ({
                          ...prev,
                          events: checked 
                            ? [...(prev.events || []), event.id]
                            : (prev.events || []).filter(e => e !== event.id)
                        }));
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>


        </Tabs>

        <Separator className="my-4" />

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Configurações
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
