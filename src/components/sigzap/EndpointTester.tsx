import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Send, Copy, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface EndpointTesterProps {
  onSuccess?: () => void;
}

export function EndpointTester({ onSuccess }: EndpointTesterProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const [formData, setFormData] = useState({
    id_conversa: `conv_${Date.now()}`,
    remetente: "João Silva",
    numero_remetente: "+5511999999999",
    mensagem: "Olá! Esta é uma mensagem de teste.",
    timestamp: new Date().toISOString(),
  });

  const endpointUrl = `https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/receber_mensagem_whatsapp`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(endpointUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "URL copiada!",
      description: "A URL do endpoint foi copiada para a área de transferência.",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('receber_mensagem_whatsapp', {
        body: formData,
      });

      if (error) throw error;

      toast({
        title: "Sucesso!",
        description: "Mensagem enviada com sucesso para o endpoint.",
      });

      // Generate new conversation ID for next test
      setFormData(prev => ({
        ...prev,
        id_conversa: `conv_${Date.now()}`,
        timestamp: new Date().toISOString(),
      }));

      onSuccess?.();
    } catch (error: any) {
      console.error('Error:', error);
      toast({
        title: "Erro",
        description: error.message || "Falha ao enviar mensagem.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Testar Endpoint</CardTitle>
        <CardDescription>
          Envie uma mensagem de teste para o endpoint receber_mensagem_whatsapp
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>URL do Endpoint</Label>
          <div className="flex gap-2">
            <Input value={endpointUrl} readOnly className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleCopyUrl}
            >
              {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="id_conversa">ID da Conversa</Label>
            <Input
              id="id_conversa"
              value={formData.id_conversa}
              onChange={(e) => setFormData({ ...formData, id_conversa: e.target.value })}
              placeholder="conv_123"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="remetente">Nome do Remetente</Label>
            <Input
              id="remetente"
              value={formData.remetente}
              onChange={(e) => setFormData({ ...formData, remetente: e.target.value })}
              placeholder="João Silva"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="numero_remetente">Número do Remetente</Label>
            <Input
              id="numero_remetente"
              value={formData.numero_remetente}
              onChange={(e) => setFormData({ ...formData, numero_remetente: e.target.value })}
              placeholder="+5511999999999"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mensagem">Mensagem</Label>
            <Textarea
              id="mensagem"
              value={formData.mensagem}
              onChange={(e) => setFormData({ ...formData, mensagem: e.target.value })}
              placeholder="Digite a mensagem de teste..."
              rows={4}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            <Send className="h-4 w-4 mr-2" />
            {loading ? "Enviando..." : "Enviar Mensagem de Teste"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
