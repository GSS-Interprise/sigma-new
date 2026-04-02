import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Loader2, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  value: string[];
  onChange: (urls: string[]) => void;
  maxFiles?: number;
}

export function ImageUpload({ value, onChange, maxFiles = 10 }: ImageUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const uploadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Arquivo inválido", description: "Apenas imagens são permitidas", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      if (value.length >= maxFiles) {
        toast({ title: "Limite atingido", description: `Máximo de ${maxFiles} imagens`, variant: "destructive" });
        setUploading(false);
        return;
      }

      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from("radiologia-anexos")
        .upload(fileName, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from("radiologia-anexos")
        .getPublicUrl(data.path);

      onChange([...value, publicUrl]);
      toast({ title: "Imagem enviada com sucesso" });
    } catch (error: any) {
      toast({ title: "Erro ao enviar imagem", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [value, onChange, maxFiles, toast]);

  // Handle paste from clipboard
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            await uploadFile(file);
          }
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [uploadFile]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      await uploadFile(file);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemove = async (url: string) => {
    try {
      const path = url.split("/radiologia-anexos/")[1];
      if (path) {
        await supabase.storage.from("radiologia-anexos").remove([path]);
      }
      onChange(value.filter((u) => u !== url));
      toast({ title: "Imagem removida" });
    } catch (error: any) {
      toast({ title: "Erro ao remover imagem", description: error.message, variant: "destructive" });
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    for (const file of Array.from(files)) {
      await uploadFile(file);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Anexos de Imagens</Label>
        <p className="text-xs text-muted-foreground mt-1">
          Clique para selecionar, arraste arquivos ou cole (Ctrl+V) prints do WhatsApp
        </p>
      </div>

      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-6 transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-border",
          uploading && "opacity-50 pointer-events-none"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center gap-2">
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          ) : (
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || value.length >= maxFiles}
          >
            <Upload className="h-4 w-4 mr-2" />
            Selecionar Imagens
          </Button>
          <p className="text-xs text-muted-foreground">
            {value.length}/{maxFiles} imagens
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {value.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          {value.map((url, index) => (
            <div key={index} className="relative group">
              <img
                src={url}
                alt={`Anexo ${index + 1}`}
                className="w-full h-24 object-cover rounded-lg border"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleRemove(url)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
