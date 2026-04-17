import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Image as ImageIcon, Loader2, Upload, X } from "lucide-react";

interface EditConversaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  historicoId: string;
  leadId: string;
  initialDescricao: string;
  initialImagemUrl: string | null;
  metadados: any;
}

export function EditConversaoDialog({
  open,
  onOpenChange,
  historicoId,
  leadId,
  initialDescricao,
  initialImagemUrl,
  metadados,
}: EditConversaoDialogProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [descricao, setDescricao] = useState(initialDescricao);
  const [novaImagem, setNovaImagem] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialImagemUrl);
  const [removerImagem, setRemoverImagem] = useState(false);

  useEffect(() => {
    if (open) {
      setDescricao(initialDescricao);
      setPreviewUrl(initialImagemUrl);
      setNovaImagem(null);
      setRemoverImagem(false);
    }
  }, [open, initialDescricao, initialImagemUrl]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem");
      return;
    }
    setNovaImagem(file);
    setRemoverImagem(false);
    const reader = new FileReader();
    reader.onload = (ev) => setPreviewUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      let jusUrl: string | null =
        metadados?.dados_conversao?.jus_verificacao_url || null;

      if (removerImagem) {
        jusUrl = null;
      }

      if (novaImagem) {
        const ext = novaImagem.name.split(".").pop() || "png";
        const path = `${leadId}/jus-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("lead-anexos")
          .upload(path, novaImagem, {
            contentType: novaImagem.type,
            upsert: false,
          });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from("lead-anexos").getPublicUrl(path);
        jusUrl = data.publicUrl;
      }

      const novosMetadados = {
        ...(metadados || {}),
        dados_conversao: {
          ...((metadados as any)?.dados_conversao || {}),
          motivo_conversao: descricao,
          jus_verificacao_url: jusUrl,
        },
      };

      const { error } = await supabase
        .from("lead_historico")
        .update({
          descricao_resumida: descricao || "Lead convertido em médico",
          metadados: novosMetadados,
        })
        .eq("id", historicoId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-historico-eventos", leadId] });
      toast.success("Conversão atualizada");
      onOpenChange(false);
    },
    onError: (err: any) => {
      console.error(err);
      toast.error("Erro ao atualizar conversão: " + (err.message || ""));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Conversão</DialogTitle>
          <DialogDescription>
            Atualize a descrição e/ou a imagem de Validação JUS desta conversão.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
              placeholder="Motivo da conversão..."
            />
          </div>

          <div className="space-y-2">
            <Label>Imagem de Validação JUS</Label>
            {previewUrl && !removerImagem ? (
              <div className="relative inline-block">
                <img
                  src={previewUrl}
                  alt="Preview JUS"
                  className="max-h-[200px] rounded-md border object-contain"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6"
                  onClick={() => {
                    setPreviewUrl(null);
                    setNovaImagem(null);
                    setRemoverImagem(true);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic">
                Sem imagem de validação JUS.
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-1" />
                {previewUrl && !removerImagem ? "Trocar imagem" : "Selecionar imagem"}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
