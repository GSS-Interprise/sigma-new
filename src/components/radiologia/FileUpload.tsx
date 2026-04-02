import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Loader2, FileText, Image as ImageIcon, FileIcon, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  value: string[];
  onChange: (urls: string[]) => void;
  maxFiles?: number;
  acceptedTypes?: string;
  label?: string;
  description?: string;
}

export function FileUpload({ 
  value, 
  onChange, 
  maxFiles = 10,
  acceptedTypes = "*/*",
  label = "Anexos",
  description = "Clique para selecionar, arraste arquivos ou cole (Ctrl+V) do clipboard"
}: FileUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      if (value.length >= maxFiles) {
        toast({ 
          title: "Limite atingido", 
          description: `Máximo de ${maxFiles} arquivos`, 
          variant: "destructive" 
        });
        setUploading(false);
        return;
      }

      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}_${file.name}`;

      const { data, error } = await supabase.storage
        .from("radiologia-anexos")
        .upload(fileName, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from("radiologia-anexos")
        .getPublicUrl(data.path);

      onChange([...value, publicUrl]);
      toast({ title: "Arquivo enviado com sucesso" });
    } catch (error: any) {
      toast({ 
        title: "Erro ao enviar arquivo", 
        description: error.message, 
        variant: "destructive" 
      });
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
        if (item.kind === 'file') {
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
      toast({ title: "Arquivo removido" });
    } catch (error: any) {
      toast({ 
        title: "Erro ao remover arquivo", 
        description: error.message, 
        variant: "destructive" 
      });
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

  const getFileIcon = (url: string) => {
    const extension = url.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension || '')) {
      return <ImageIcon className="h-8 w-8 text-primary" />;
    } else if (['pdf'].includes(extension || '')) {
      return <FileText className="h-8 w-8 text-red-500" />;
    } else if (['doc', 'docx'].includes(extension || '')) {
      return <FileText className="h-8 w-8 text-blue-500" />;
    } else if (['xls', 'xlsx'].includes(extension || '')) {
      return <FileText className="h-8 w-8 text-green-500" />;
    }
    return <FileIcon className="h-8 w-8 text-muted-foreground" />;
  };

  const getFileName = (url: string) => {
    const parts = url.split('/');
    const fullName = parts[parts.length - 1];
    // Remove o timestamp do início do nome
    return fullName.replace(/^\d+_/, '');
  };

  const isImage = (url: string) => {
    const extension = url.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension || '');
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>{label}</Label>
        <p className="text-xs text-muted-foreground mt-1">
          {description}
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
            <Upload className="h-8 w-8 text-muted-foreground" />
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || value.length >= maxFiles}
          >
            <Upload className="h-4 w-4 mr-2" />
            Selecionar Arquivos
          </Button>
          <p className="text-xs text-muted-foreground">
            {value.length}/{maxFiles} arquivos
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedTypes}
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {value.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {value.map((url, index) => (
            <div key={index} className="relative group border rounded-lg p-3 hover:border-primary transition-colors">
              <div className="flex flex-col items-center gap-2">
                {isImage(url) ? (
                  <img
                    src={url}
                    alt={`Anexo ${index + 1}`}
                    className="w-full h-24 object-cover rounded"
                  />
                ) : (
                  <div className="w-full h-24 flex items-center justify-center">
                    {getFileIcon(url)}
                  </div>
                )}
                <p className="text-xs text-center truncate w-full" title={getFileName(url)}>
                  {getFileName(url)}
                </p>
                <div className="flex gap-1 w-full">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 h-7 text-xs"
                    onClick={() => window.open(url, '_blank')}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Abrir
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => handleRemove(url)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
