import { FileIcon, Download, FileText, FileSpreadsheet, File, FileArchive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SigZapDocumentCardProps {
  url: string;
  filename?: string;
  mimeType?: string;
  isFromMe?: boolean;
}

export function SigZapDocumentCard({ url, filename, mimeType, isFromMe }: SigZapDocumentCardProps) {
  // Extract filename from URL if not provided
  const displayFilename = filename || url.split('/').pop() || 'Documento';
  
  // Get file extension
  const extension = displayFilename.split('.').pop()?.toLowerCase() || '';
  
  // Determine icon based on file type
  const getIcon = () => {
    if (['pdf'].includes(extension)) {
      return <FileText className="h-8 w-8" />;
    }
    if (['doc', 'docx'].includes(extension)) {
      return <FileText className="h-8 w-8" />;
    }
    if (['xls', 'xlsx', 'csv'].includes(extension)) {
      return <FileSpreadsheet className="h-8 w-8" />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
      return <FileArchive className="h-8 w-8" />;
    }
    return <File className="h-8 w-8" />;
  };

  // Get file type label
  const getTypeLabel = () => {
    if (['pdf'].includes(extension)) return 'PDF';
    if (['doc', 'docx'].includes(extension)) return 'Word';
    if (['xls', 'xlsx'].includes(extension)) return 'Excel';
    if (['csv'].includes(extension)) return 'CSV';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) return 'Arquivo';
    return extension.toUpperCase() || 'Documento';
  };

  const handleDownload = () => {
    window.open(url, '_blank');
  };

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg min-w-[200px] max-w-[300px]",
      isFromMe ? "bg-white/10" : "bg-muted/50"
    )}>
      {/* Icon */}
      <div className={cn(
        "flex-shrink-0 p-2 rounded-lg",
        isFromMe ? "bg-white/20 text-white" : "bg-primary/20 text-primary"
      )}>
        {getIcon()}
      </div>
      
      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm font-medium truncate",
          isFromMe ? "text-white" : "text-foreground"
        )}>
          {displayFilename}
        </p>
        <p className={cn(
          "text-xs",
          isFromMe ? "text-white/70" : "text-muted-foreground"
        )}>
          {getTypeLabel()}
        </p>
      </div>
      
      {/* Download button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "flex-shrink-0 h-8 w-8",
          isFromMe 
            ? "text-white/70 hover:text-white hover:bg-white/20" 
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={handleDownload}
      >
        <Download className="h-4 w-4" />
      </Button>
    </div>
  );
}
