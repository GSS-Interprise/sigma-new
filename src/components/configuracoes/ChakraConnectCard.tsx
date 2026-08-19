import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, ExternalLink, Loader2, QrCode, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type ChakraPhone = {
  phone_number_id: string;
  phone_e164: string | null;
  display_name: string | null;
  status: string;
  quality_rating: string | null;
  messaging_limit_tier: string | null;
  name_status: string | null;
  provider_payload?: Record<string, any> | null;
  webhook_configured?: boolean;
  last_webhook_event_at?: string | null;
  last_webhook_error?: string | null;
};

function getChakraSendBlock(phone: ChakraPhone) {
  const payload = phone.provider_payload || {};
  const providerPhone = payload.phone || payload;
  const entities = Array.isArray(providerPhone.healthStatus?.entities)
    ? providerPhone.healthStatus.entities as Array<Record<string, any>>
    : [];
  const blocked = entities.find((entity) => String(entity.can_send_message || "").toUpperCase() === "BLOCKED");
  if (!blocked) return null;
  const providerError = Array.isArray(blocked.errors) ? blocked.errors[0] : null;
  return {
    entity: String(blocked.entity_type || "WABA"),
    code: providerError?.error_code ? String(providerError.error_code) : null,
    message: String(providerError?.error_description || "A Meta bloqueou conversas iniciadas pela empresa."),
    action: String(providerError?.possible_solution || "Revise o meio de pagamento e as pendências da WABA no Chakra/Meta."),
  };
}

type PendingConnection = {
  payload: unknown;
  phones: ChakraPhone[];
  selectedPhoneNumberId: string;
};

type ChakraSdk = {
  init: (options: {
    connectToken: string;
    container: string;
    onReady?: () => void;
    onError?: (error: unknown) => void;
    onSuccess?: (data: unknown) => void;
    onMessage?: (event: unknown, data: unknown) => void;
  }) => { destroy?: () => void };
};

declare global {
  interface Window {
    ChakraWhatsappConnect?: ChakraSdk;
  }
}

let chakraSdkPromise: Promise<void> | null = null;
function loadChakraSdk() {
  if (window.ChakraWhatsappConnect) return Promise.resolve();
  if (chakraSdkPromise) return chakraSdkPromise;
  chakraSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-chakra-whatsapp-sdk="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Não foi possível carregar a conexão do Chakra.")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://embed.chakrahq.com/whatsapp-partner-connect/v1_0_1/sdk.js";
    script.async = true;
    script.dataset.chakraWhatsappSdk = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Não foi possível carregar a conexão do Chakra."));
    document.head.appendChild(script);
  });
  return chakraSdkPromise;
}

export function ChakraConnectCard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sdkInstance = useRef<{ destroy?: () => void } | null>(null);
  const [pluginId, setPluginId] = useState("");
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [phones, setPhones] = useState<ChakraPhone[]>([]);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);

  const loadConnections = useCallback(async () => {
    const { data: statusResult, error: statusError } = await supabase.functions.invoke("chakra-connect", {
      body: { action: "refresh_status" },
    });
    if (statusError || !statusResult?.ok) {
      console.warn("NÃ£o foi possÃ­vel atualizar o status do nÃºmero Chakra", statusError || statusResult?.error);
    }
    // Revalida/configura o webhook do plugin ao abrir a tela. Isso cobre
    // números já conectados antes da automação ser publicada, sem reimportar
    // os demais números do mesmo plano Chakra.
    const { data: webhookResult, error: webhookError } = await supabase.functions.invoke("chakra-connect", {
      body: { action: "ensure_webhook" },
    });
    if (webhookError || !webhookResult?.ok) {
      console.warn("Não foi possível validar o webhook do Chakra", webhookError || webhookResult?.error);
    }
    const { data: templateResult, error: templateError } = await supabase.functions.invoke("chakra-connect", {
      body: { action: "sync_templates" },
    });
    if (templateError || !templateResult?.ok) {
      console.warn("Chakra template sync failed", templateError || templateResult?.error);
    }
    const { data, error } = await supabase
      .from("whatsapp_chakra_connections" as never)
      .select("phone_number_id, phone_e164, display_name, status, quality_rating, messaging_limit_tier, name_status, provider_payload, webhook_configured, last_webhook_event_at, last_webhook_error")
      .order("updated_at", { ascending: false });
    if (!error) setPhones((data || []) as unknown as ChakraPhone[]);
  }, []);

  useEffect(() => { void loadConnections(); }, [loadConnections]);

  useEffect(() => () => {
    sdkInstance.current?.destroy?.();
  }, []);

  const saveConnection = async (data: unknown, selectedPhoneNumberId?: string) => {
    setIsSaving(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("chakra-connect", {
        body: { action: "save_connection", data, phoneNumberId: selectedPhoneNumberId || undefined },
      });
      if (error) throw error;
      if (!result?.ok) throw new Error(result?.error || "Não foi possível salvar a conexão.");
      toast.success("WhatsApp conectado ao Sigma.");
      setConnectToken(null);
      sdkInstance.current?.destroy?.();
      sdkInstance.current = null;
      setPendingConnection(null);
      await loadConnections();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Erro ao salvar o WhatsApp conectado.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnectionSuccess = (data: unknown) => {
    const rawPayload = data && typeof data === "object" ? data as Record<string, any> : {};
    const payload = rawPayload._data && typeof rawPayload._data === "object"
      ? rawPayload._data
      : rawPayload.data && typeof rawPayload.data === "object"
        ? rawPayload.data
        : rawPayload;
    const returnedPhones = Array.isArray(payload.whatsappPhoneNumbers)
      ? payload.whatsappPhoneNumbers
      : Array.isArray(payload.phoneNumbers) ? payload.phoneNumbers : [];
    const phonesFromPayload = returnedPhones.map((phone: any) => ({
      phone_number_id: String(phone.phone_number_id || phone.phoneNumberId || phone.whatsappPhoneNumberId || phone.id || ""),
      phone_e164: phone.phone_e164 || phone.phoneNumber || phone.displayPhoneNumber || null,
      display_name: phone.verifiedName || phone.displayName || phone.name || null,
      status: phone.status || "connected",
      quality_rating: phone.qualityRating || phone.quality_rating || null,
      messaging_limit_tier: phone.messagingLimitTier || null,
      name_status: phone.nameStatus || null,
    })).filter((phone: ChakraPhone) => phone.phone_number_id);
    const selectedId = String(payload.phoneNumberId || payload.selectedPhoneNumberId || "");
    if (phonesFromPayload.length > 1 && !selectedId) {
      setPendingConnection({ payload: data, phones: phonesFromPayload, selectedPhoneNumberId: "" });
      return;
    }
    void saveConnection(data, selectedId || phonesFromPayload[0]?.phone_number_id);
  };

  const prepareConnection = async () => {
    setIsPreparing(true);
    try {
      const { data, error } = await supabase.functions.invoke("chakra-connect", {
        body: {
          action: "create_token",
          pluginId: pluginId.trim() || undefined,
          newPluginName: "Sigma GSS - WhatsApp",
          clientName: "GSS",
        },
      });
      if (error) throw error;
      if (!data?.ok || !data.connectToken) throw new Error(data?.error || "Não foi possível preparar a conexão.");
      setConnectToken(data.connectToken);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Erro ao preparar a conexão do Chakra.");
    } finally {
      setIsPreparing(false);
    }
  };

  useEffect(() => {
    if (!connectToken || !containerRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        await loadChakraSdk();
        if (cancelled || !containerRef.current || !window.ChakraWhatsappConnect) return;
        sdkInstance.current?.destroy?.();
        sdkInstance.current = window.ChakraWhatsappConnect.init({
          connectToken,
          container: "#chakra-whatsapp-connect",
          onSuccess: handleConnectionSuccess,
          onError: (error) => {
            console.error("Chakra Embedded Signup", error);
            toast.error("A conexão do WhatsApp não foi concluída.");
          },
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Erro ao abrir a conexão do Chakra.");
      }
    })();
    return () => { cancelled = true; };
  }, [connectToken]);

  return (
    <Card className="border-emerald-200 shadow-sm">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <QrCode className="h-5 w-5 text-emerald-700" />
              WhatsApp oficial — Chakra
            </CardTitle>
            <CardDescription className="mt-1">
              Conecte o WhatsApp Business pelo fluxo oficial de coexistência, com QR Code e histórico no Sigma.
            </CardDescription>
          </div>
          <Badge variant="outline" className="w-fit gap-1 border-emerald-300 text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" /> Coexistência
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <Alert>
          <AlertDescription>
            O número continua no WhatsApp Business do celular e também fica disponível no Sigma. O QR será aberto pelo componente seguro do Chakra; nenhuma chave fica exposta no navegador.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="chakra-plugin-id">Plugin ID existente (opcional)</Label>
            <Input
              id="chakra-plugin-id"
              value={pluginId}
              onChange={(event) => setPluginId(event.target.value)}
              placeholder="Deixe vazio para criar a conexão da GSS"
            />
            <p className="text-xs text-muted-foreground">
              Use somente se este cliente já tiver um plugin Chakra criado.
            </p>
          </div>
          <Button onClick={prepareConnection} disabled={isPreparing || isSaving} className="min-h-11">
            {isPreparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
            Preparar conexão
          </Button>
        </div>

        {connectToken && (
          <>
            <Separator />
            <div>
              <p className="mb-2 text-sm font-medium">Conectar número da GSS</p>
              <div id="chakra-whatsapp-connect" ref={containerRef} className="min-h-[260px] overflow-hidden rounded-lg border bg-muted/20 p-3" />
              {isSaving && <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Salvando os dados no Sigma…</p>}
              <p className="mt-2 text-xs text-muted-foreground">O token expira em 1 hora. Se necessário, gere uma nova conexão.</p>
            </div>
          </>
        )}

        {pendingConnection && (
          <Alert className="border-amber-300 bg-amber-50">
            <Smartphone className="h-4 w-4 text-amber-700" />
            <AlertDescription className="space-y-3">
              <p className="font-medium text-amber-950">Este plugin possui mais de um número.</p>
              <p className="text-sm text-amber-900">
                Escolha somente o número que pertence ao Sigma GSS. Os demais números do Jornada do Paciente não serão importados.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select
                  value={pendingConnection.selectedPhoneNumberId}
                  onValueChange={(value) => setPendingConnection((current) => current ? { ...current, selectedPhoneNumberId: value } : current)}
                >
                  <SelectTrigger className="min-h-11 w-full bg-background sm:max-w-md">
                    <SelectValue placeholder="Selecione o número do Sigma" />
                  </SelectTrigger>
                  <SelectContent>
                    {pendingConnection.phones.map((phone) => (
                      <SelectItem key={phone.phone_number_id} value={phone.phone_number_id}>
                        {phone.display_name || phone.phone_e164 || phone.phone_number_id} {phone.phone_e164 ? `(${phone.phone_e164})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  className="min-h-11"
                  disabled={!pendingConnection.selectedPhoneNumberId || isSaving}
                  onClick={() => void saveConnection(pendingConnection.payload, pendingConnection.selectedPhoneNumberId)}
                >
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Vincular este número
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Separator />
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">Números conectados</h3>
            <Button variant="ghost" size="sm" asChild>
              <a href="https://chakrahq.com/help/chat/partner/embed-whatsapp-connect-for-your-customers" target="_blank" rel="noreferrer">
                Guia do Chakra <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
          {phones.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhum número Chakra conectado ainda.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {phones.map((phone) => {
                const sendBlock = getChakraSendBlock(phone);
                return (
                <div key={phone.phone_number_id} className="rounded-lg border p-3">
                  <div className="flex items-start gap-3">
                    <Smartphone className="mt-0.5 h-4 w-4 text-emerald-700" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{phone.display_name || phone.phone_e164 || phone.phone_number_id}</p>
                      <p className="text-xs text-muted-foreground">{phone.phone_e164 || "Número retornado pelo Chakra"}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="secondary">{phone.status || "conectado"}</Badge>
                        <Badge variant={phone.webhook_configured ? "outline" : "destructive"}>
                          Webhook: {phone.webhook_configured ? "ativo" : "pendente"}
                        </Badge>
                        <Badge variant="outline">
                          Envio: disponível
                        </Badge>
                        {phone.quality_rating && <Badge variant="outline">Qualidade: {phone.quality_rating}</Badge>}
                        {phone.messaging_limit_tier && <Badge variant="outline">Limite: {phone.messaging_limit_tier}</Badge>}
                        {phone.name_status && <Badge variant={String(phone.name_status).toUpperCase() === "APPROVED" ? "outline" : "secondary"}>Nome: {phone.name_status}</Badge>}
                      </div>
                      {sendBlock && (
                        <Alert className="mt-3 border-amber-300 bg-amber-50 py-3">
                          <AlertDescription className="text-xs text-amber-950">
                            <strong>Alerta de saúde do provedor ({sendBlock.entity}{sendBlock.code ? ` · ${sendBlock.code}` : ""}):</strong> {sendBlock.message} {sendBlock.action} O Sigma não bloqueia o envio por este diagnóstico: ele pode estar desatualizado. O resultado real é confirmado pelos eventos de envio e entrega da mensagem.
                          </AlertDescription>
                        </Alert>
                      )}
                      {phone.last_webhook_error && <p className="mt-2 text-xs text-destructive">Webhook: {phone.last_webhook_error}</p>}
                      {phone.webhook_configured && <p className="mt-2 text-xs text-muted-foreground">Último evento: {phone.last_webhook_event_at ? new Date(phone.last_webhook_event_at).toLocaleString("pt-BR") : "aguardando"}</p>}
                    </div>
                    <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-emerald-600" />
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
