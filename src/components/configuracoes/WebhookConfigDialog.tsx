import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Link, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface WebhookConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceName: string;
  instanceId: string;
}

const AVAILABLE_EVENTS = [
  { id: "MESSAGES_UPSERT", label: "Mensagens Recebidas/Enviadas", default: true },
  { id: "MESSAGES_UPDATE", label: "Atualização de Mensagens", default: true },
  { id: "MESSAGES_DELETE", label: "Mensagens Deletadas", default: false },
  { id: "SEND_MESSAGE", label: "Envio de Mensagem", default: true },
  { id: "CONNECTION_UPDATE", label: "Atualização de Conexão", default: true },
  { id: "QRCODE_UPDATED", label: "QR Code Atualizado", default: true },
  { id: "PRESENCE_UPDATE", label: "Atualização de Presença", default: false },
  { id: "CHATS_UPDATE", label: "Atualização de Chats", default: false },
  { id: "CHATS_UPSERT", label: "Chats Criados/Atualizados", default: false },
  { id: "CONTACTS_UPDATE", label: "Atualização de Contatos", default: false },
  { id: "CONTACTS_UPSERT", label: "Contatos Criados/Atualizados", default: false },
  { id: "GROUPS_UPSERT", label: "Grupos Criados/Atualizados", default: false },
  { id: "GROUPS_UPDATE", label: "Atualização de Grupos", default: false },
  { id: "CALL", label: "Chamadas", default: false },
  { id: "TYPEBOT_START", label: "Typebot Iniciado", default: false },
  { id: "TYPEBOT_CHANGE_STATUS", label: "Typebot Mudança de Status", default: false },
];

export function WebhookConfigDialog({
  open,
  onOpenChange,
  instanceName,
  instanceId,
}: WebhookConfigDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [webhookByEvents, setWebhookByEvents] = useState(false);
  const [webhookBase64, setWebhookBase64] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState<string[]>(
    AVAILABLE_EVENTS.filter((e) => e.default).map((e) => e.id)
  );

  useEffect(() => {
    if (open && instanceName) {
      loadWebhookConfig();
    }
  }, [open, instanceName]);

  const loadWebhookConfig = async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error("Não autenticado");
      }

      const { data, error } = await supabase.functions.invoke("evolution-api-proxy", {
        body: {
          action: "findWebhook",
          instanceName,
        },
      });

      if (error) throw error;

      // Parse response - Evolution API returns webhook config
      if (data && data.webhook) {
        const webhook = data.webhook;
        setWebhookUrl(webhook.url || "");
        setEnabled(webhook.enabled !== false);
        setWebhookByEvents(webhook.webhookByEvents || false);
        setWebhookBase64(webhook.webhookBase64 || false);
        if (webhook.events && Array.isArray(webhook.events)) {
          setSelectedEvents(webhook.events);
        }
      } else if (data && data.url) {
        // Alternative response format
        setWebhookUrl(data.url || "");
        setEnabled(data.enabled !== false);
        setWebhookByEvents(data.webhookByEvents || false);
        setWebhookBase64(data.webhookBase64 || false);
        if (data.events && Array.isArray(data.events)) {
          setSelectedEvents(data.events);
        }
      }
    } catch (error) {
      console.error("Erro ao carregar webhook:", error);
      // Keep defaults if no config found
    } finally {
      setLoading(false);
    }
  };

  const handleEventToggle = (eventId: string) => {
    setSelectedEvents((prev) =>
      prev.includes(eventId)
        ? prev.filter((e) => e !== eventId)
        : [...prev, eventId]
    );
  };

  const handleSelectAll = () => {
    setSelectedEvents(AVAILABLE_EVENTS.map((e) => e.id));
  };

  const handleSelectDefaults = () => {
    setSelectedEvents(AVAILABLE_EVENTS.filter((e) => e.default).map((e) => e.id));
  };

  const handleSave = async () => {
    if (!webhookUrl.trim()) {
      toast({
        title: "URL obrigatória",
        description: "Informe a URL do webhook",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error("Não autenticado");
      }

      const webhookConfig = {
        url: webhookUrl.trim(),
        enabled,
        webhookByEvents,
        webhookBase64,
        events: selectedEvents,
      };

      const { error } = await supabase.functions.invoke("evolution-api-proxy", {
        body: {
          action: "setWebhook",
          instanceName,
          data: webhookConfig,
        },
      });

      if (error) throw error;

      // Save to local database for reference
      await supabase
        .from("chips")
        .update({ 
          webhook_url: webhookUrl.trim(),
          updated_at: new Date().toISOString()
        })
        .eq("id", instanceId);

      toast({
        title: "Webhook configurado",
        description: "Configuração salva com sucesso na Evolution API",
      });

      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao salvar webhook:", error);
      toast({
        title: "Erro ao configurar webhook",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Configurar Webhook - {instanceName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Configure o webhook para receber mensagens no n8n. O n8n processará
                as mensagens e enviará para o SIGMA via HTTP.
              </AlertDescription>
            </Alert>

            {/* URL do Webhook */}
            <div className="space-y-2">
              <Label htmlFor="webhook-url">URL do Webhook (n8n)</Label>
              <Input
                id="webhook-url"
                placeholder="https://seu-n8n.com/webhook/evolution"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                URL do webhook no n8n que receberá os eventos
              </p>
            </div>

            {/* Switches de configuração */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="enabled" className="text-sm">Habilitado</Label>
                <Switch
                  id="enabled"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="by-events" className="text-sm">Por Eventos</Label>
                <Switch
                  id="by-events"
                  checked={webhookByEvents}
                  onCheckedChange={setWebhookByEvents}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="base64" className="text-sm">Base64 Mídia</Label>
                <Switch
                  id="base64"
                  checked={webhookBase64}
                  onCheckedChange={setWebhookBase64}
                />
              </div>
            </div>

            {/* Eventos */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Eventos</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSelectDefaults}
                  >
                    Padrão
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                  >
                    Todos
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto rounded-lg border p-3">
                {AVAILABLE_EVENTS.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center space-x-2 py-1"
                  >
                    <Checkbox
                      id={event.id}
                      checked={selectedEvents.includes(event.id)}
                      onCheckedChange={() => handleEventToggle(event.id)}
                    />
                    <label
                      htmlFor={event.id}
                      className="text-sm cursor-pointer flex-1"
                    >
                      {event.label}
                      {event.default && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (recomendado)
                        </span>
                      )}
                    </label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedEvents.length} evento(s) selecionado(s)
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Webhook
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
