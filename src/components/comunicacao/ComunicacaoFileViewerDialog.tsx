import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ComunicacaoFileViewerDialogProps {
  filePath: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComunicacaoFileViewerDialog({
  filePath,
  open,
  onOpenChange,
}: ComunicacaoFileViewerDialogProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState<string>("");

  useEffect(() => {
    if (open && filePath) {
      loadFile(filePath);
    } else {
      setFileUrl(null);
      setFileType(null);
    }
  }, [filePath, open]);

  const loadFile = async (path: string) => {
    setIsLoading(true);
    try {
      const name = path.split("/").pop() || "arquivo";
      setFileName(name);

      const ext = name.split(".").pop()?.toLowerCase() || "";
      
      // Get public URL for the file
      const { data: urlData } = supabase.storage
        .from("comunicacao-anexos")
        .getPublicUrl(path);

      const publicUrl = urlData.publicUrl;

      // Determine file type
      if (["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"].includes(ext)) {
        setFileType("image");
        setFileUrl(publicUrl);
      } else if (ext === "pdf") {
        setFileType("pdf");
        setFileUrl(publicUrl);
      } else if (["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext)) {
        setFileType("office");
        // Use Google Docs Viewer for Office files
        setFileUrl(`https://docs.google.com/gview?url=${encodeURIComponent(publicUrl)}&embedded=true`);
      } else if (["txt", "json", "xml", "csv", "md"].includes(ext)) {
        setFileType("text");
        setFileUrl(publicUrl);
      } else if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
        setFileType("archive");
        setFileUrl(publicUrl);
      } else {
        setFileType("unsupported");
        setFileUrl(publicUrl);
      }
    } catch (error) {
      console.error("Erro ao carregar arquivo:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!filePath) return;

    try {
      const { data, error } = await supabase.storage
        .from("comunicacao-anexos")
        .download(filePath);

      if (error) {
        console.error("Erro ao baixar arquivo:", error);
        return;
      }

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao baixar:", error);
    }
  };

  const renderFileContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (!fileUrl) {
      return (
        <div className="flex items-center justify-center h-96 text-muted-foreground">
          Arquivo não encontrado
        </div>
      );
    }

    switch (fileType) {
      case "image":
        return (
          <div className="flex items-center justify-center max-h-[70vh] overflow-auto">
            <img
              src={fileUrl}
              alt={fileName}
              className="max-w-full h-auto object-contain"
            />
          </div>
        );

      case "pdf":
        return (
          <iframe
            src={fileUrl}
            className="w-full h-[70vh] border-0 rounded"
            title={fileName}
          />
        );

      case "office":
        return (
          <iframe
            src={fileUrl}
            className="w-full h-[70vh] border-0 rounded"
            title={fileName}
          />
        );

      case "text":
        return (
          <iframe
            src={fileUrl}
            className="w-full h-[70vh] border-0 rounded bg-background"
            title={fileName}
          />
        );

      case "archive":
      case "unsupported":
      default:
        return (
          <div className="flex flex-col items-center justify-center h-96 gap-4">
            <FileText className="h-16 w-16 text-muted-foreground" />
            <p className="text-muted-foreground text-center">
              Este tipo de arquivo não pode ser visualizado diretamente.
              <br />
              Clique no botão abaixo para baixar.
            </p>
            <Button onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Baixar Arquivo
            </Button>
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[90vw] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="truncate pr-4">{fileName}</DialogTitle>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Baixar
          </Button>
        </DialogHeader>
        <div className="flex-1 overflow-auto">{renderFileContent()}</div>
      </DialogContent>
    </Dialog>
  );
}
