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
import { toast } from "sonner";
import { Link2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const CONFIG_KEY = "licitacao_webhook_url";
const CONFIG_KEY_BY_ID = "licitacao_webhook_by_id_url";

interface LicitacaoWebhookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LicitacaoWebhookDialog({ open, onOpenChange }: LicitacaoWebhookDialogProps) {
  const [url, setUrl] = useState("");
  const [urlById, setUrlById] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      supabase
        .from("supabase_config")
        .select("chave, valor")
        .in("chave", [CONFIG_KEY, CONFIG_KEY_BY_ID])
        .then(({ data }) => {
          const map = Object.fromEntries((data || []).map((r) => [r.chave, r.valor]));
          setUrl(map[CONFIG_KEY] || "");
          setUrlById(map[CONFIG_KEY_BY_ID] || "");
        });
    }
  }, [open]);

  const upsertConfig = async (chave: string, valor: string) => {
    const { data: existing } = await supabase
      .from("supabase_config")
      .select("id")
      .eq("chave", chave)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("supabase_config")
        .update({ valor })
        .eq("chave", chave);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("supabase_config")
        .insert({ chave, valor });
      if (error) throw error;
    }
  };

  const handleSave = async () => {
    if (!url.trim()) {
      toast.error("Informe a URL do webhook de anexos");
      return;
    }
    try { new URL(url.trim()); } catch { toast.error("URL do webhook de anexos inválida"); return; }

    if (urlById.trim()) {
      try { new URL(urlById.trim()); } catch { toast.error("URL do webhook por ID inválida"); return; }
    }

    setLoading(true);
    try {
      await upsertConfig(CONFIG_KEY, url.trim());
      if (urlById.trim()) {
        await upsertConfig(CONFIG_KEY_BY_ID, urlById.trim());
      }
      toast.success("Webhooks salvos com sucesso!");
      onOpenChange(false);
    } catch (err: any) {
      console.error("Erro ao salvar webhook:", err);
      toast.error("Erro ao salvar webhook: " + (err.message || ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Configurar Webhook
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="webhook-url">URL do Webhook — Anexos</Label>
            <Input
              id="webhook-url"
              placeholder="https://example.com/webhook/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Os arquivos anexados serão enviados para este endpoint via POST.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook-url-by-id">URL do Webhook — Busca por ID</Label>
            <Input
              id="webhook-url-by-id"
              placeholder="https://example.com/webhook/by-id/..."
              value={urlById}
              onChange={(e) => setUrlById(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Receberá apenas o ID da licitação via POST para disparar uma busca específica.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export async function fetchWebhookUrl(): Promise<string | null> {
  const { data } = await supabase
    .from("supabase_config")
    .select("valor")
    .eq("chave", CONFIG_KEY)
    .maybeSingle();
  return data?.valor || null;
}

export async function fetchWebhookByIdUrl(): Promise<string | null> {
  const { data } = await supabase
    .from("supabase_config")
    .select("valor")
    .eq("chave", CONFIG_KEY_BY_ID)
    .maybeSingle();
  return data?.valor || null;
}
