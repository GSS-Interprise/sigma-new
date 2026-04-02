import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Webhook, Save, Copy, Check, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function WebhookDisparosTab() {
  const [copied, setCopied] = useState<string | null>(null);
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState("");
  const queryClient = useQueryClient();

  // Buscar configuração atual do webhook n8n
  const { data: config, isLoading } = useQuery({
    queryKey: ["disparos-n8n-webhook-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("config_lista_items")
        .select("*")
        .eq("campo_nome", "n8n_disparos_webhook_url")
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });

  useEffect(() => {
    if (config?.valor) {
      setN8nWebhookUrl(config.valor);
    }
  }, [config]);

  // Salvar webhook n8n
  const salvarMutation = useMutation({
    mutationFn: async () => {
      if (config) {
        // Atualizar
        const { error } = await supabase
          .from("config_lista_items")
          .update({ valor: n8nWebhookUrl })
          .eq("id", config.id);
        if (error) throw error;
      } else {
        // Inserir
        const { error } = await supabase
          .from("config_lista_items")
          .insert({ campo_nome: "n8n_disparos_webhook_url", valor: n8nWebhookUrl });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["disparos-n8n-webhook-config"] });
      toast.success("Webhook n8n salvo com sucesso!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // URL base do projeto
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const callbackUrl = `${supabaseUrl}/functions/v1/disparos-callback`;

  const copyToClipboard = async (url: string, id: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(id);
    toast.success("URL copiada!");
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Card principal - Webhook n8n */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-primary" />
            Webhook n8n (Recebe a lista do Sigma)
          </CardTitle>
          <CardDescription>
            Configure a URL do webhook do n8n que receberá a lista de contatos quando uma campanha for iniciada
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>URL do Webhook n8n</Label>
            <div className="flex gap-2">
              <Input
                value={n8nWebhookUrl}
                onChange={(e) => setN8nWebhookUrl(e.target.value)}
                placeholder="https://seu-n8n.com/webhook/..."
                className="font-mono text-sm"
              />
              <Button
                onClick={() => salvarMutation.mutate()}
                disabled={salvarMutation.isPending || !n8nWebhookUrl}
              >
                {salvarMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Salvar
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              O Sigma enviará os contatos da campanha para este endpoint quando você clicar em "Iniciar"
            </p>
          </div>

          <div className="bg-primary/5 border border-primary/20 p-3 rounded-lg">
            <p className="text-xs font-medium mb-2 text-primary">Payload enviado pelo Sigma:</p>
            <pre className="text-xs overflow-x-auto">
{`{
  "campanha_id": "uuid-da-campanha",
  "contatos": [
    {
      "id": "uuid-contato",
      "NOME": "Dr. João Silva",
      "TELEFONE": "5547999998888",
      "TELEFONE_ORIGINAL": "47999998888",
      "ID_PROPOSTA": "uuid-proposta",
      "TEXTO_IA": "Mensagem a ser enviada...",
      "INSTANCIA": "nome-instancia",
      "RESPONSAVEL": "Nome do responsável",
      "tentativas": 0
    }
  ],
  "total_pendentes": 50
}`}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Card Callback */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Callback (n8n → Sigma)
          </CardTitle>
          <CardDescription>
            O n8n deve chamar este endpoint após processar cada contato para atualizar o status
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input 
              value={callbackUrl} 
              readOnly 
              className="font-mono text-sm bg-muted"
            />
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => copyToClipboard(callbackUrl, "callback")}
            >
              {copied === "callback" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="bg-muted/50 p-3 rounded-lg">
            <p className="text-xs font-medium mb-2">Payload de exemplo:</p>
            <pre className="text-xs overflow-x-auto">
{`{
  "contato_id": "uuid-do-contato",
  "status": "4-ENVIADO" // ou "5-NOZAP", "2-REENVIAR", "6-BLOQUEADORA"
}

// Ou em lote:
{
  "updates": [
    { "contato_id": "uuid-1", "status": "4-ENVIADO" },
    { "contato_id": "uuid-2", "status": "5-NOZAP" }
  ]
}`}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Status possíveis */}
      <Card>
        <CardHeader>
          <CardTitle>Status de Contatos</CardTitle>
          <CardDescription>Lista de status que o n8n pode retornar no callback</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
              <Badge className="bg-red-500 text-white border-transparent">1-ENVIAR</Badge>
              <span className="text-xs text-muted-foreground">Aguardando envio</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
              <Badge className="bg-yellow-500 text-white border-transparent">2-REENVIAR</Badge>
              <span className="text-xs text-muted-foreground">Reenvio pendente</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
              <Badge className="bg-blue-500 text-white border-transparent">3-TRATANDO</Badge>
              <span className="text-xs text-muted-foreground">Em processamento</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
              <Badge className="bg-green-500 text-white border-transparent">4-ENVIADO</Badge>
              <span className="text-xs text-muted-foreground">Enviado com sucesso</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
              <Badge className="bg-pink-500 text-white border-transparent">5-NOZAP</Badge>
              <span className="text-xs text-muted-foreground">Sem WhatsApp</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
              <Badge className="bg-purple-600 text-white border-transparent">6-BLOQUEADORA</Badge>
              <span className="text-xs text-muted-foreground">Bloqueado</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
