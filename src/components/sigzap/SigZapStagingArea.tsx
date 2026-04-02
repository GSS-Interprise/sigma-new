import { X, FileIcon, Image, Video, Music, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface StagedFile {
  id: string;
  file: File;
  preview?: string;
  type: 'image' | 'video' | 'audio' | 'document';
}

interface SigZapStagingAreaProps {
  files: StagedFile[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function SigZapStagingArea({ files, onRemove, onClear }: SigZapStagingAreaProps) {
  if (files.length === 0) return null;

  const getFileIcon = (type: StagedFile['type']) => {
    switch (type) {
      case 'image': return <Image className="h-6 w-6" />;
      case 'video': return <Video className="h-6 w-6" />;
      case 'audio': return <Music className="h-6 w-6" />;
      default: return <FileText className="h-6 w-6" />;
    }
  };

  return (
    <div className="border-b bg-muted/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground font-medium">
          {files.length} arquivo{files.length > 1 ? 's' : ''} selecionado{files.length > 1 ? 's' : ''}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
          onClick={onClear}
        >
          Limpar todos
        </Button>
      </div>
      
      <div className="flex gap-2 overflow-x-auto pb-2">
        {files.map((stagedFile) => (
          <div
            key={stagedFile.id}
            className="relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border bg-background group"
          >
            {stagedFile.preview && stagedFile.type === 'image' ? (
              <img
                src={stagedFile.preview}
                alt={stagedFile.file.name}
                className="w-full h-full object-cover"
              />
            ) : stagedFile.preview && stagedFile.type === 'video' ? (
              <video
                src={stagedFile.preview}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-2 text-muted-foreground">
                {getFileIcon(stagedFile.type)}
                <span className="text-[9px] mt-1 truncate w-full text-center">
                  {stagedFile.file.name.split('.').pop()?.toUpperCase()}
                </span>
              </div>
            )}
            
            {/* Remove button */}
            <Button
              variant="destructive"
              size="icon"
              className={cn(
                "absolute top-1 right-1 h-5 w-5 rounded-full",
                "opacity-0 group-hover:opacity-100 transition-opacity"
              )}
              onClick={() => onRemove(stagedFile.id)}
            >
              <X className="h-3 w-3" />
            </Button>
            
            {/* File name tooltip on hover */}
            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[8px] p-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
              {stagedFile.file.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Drag overlay component
interface SigZapDropOverlayProps {
  isVisible: boolean;
}

export function SigZapDropOverlay({ isVisible }: SigZapDropOverlayProps) {
  if (!isVisible) return null;

  return (
    <div className="absolute inset-0 z-50 bg-primary/20 backdrop-blur-sm flex items-center justify-center border-2 border-dashed border-primary rounded-lg">
      <div className="text-center">
        <FileIcon className="h-12 w-12 mx-auto mb-2 text-primary" />
        <p className="text-lg font-semibold text-primary">Solte para anexar</p>
        <p className="text-sm text-muted-foreground">Imagens, vídeos, áudios ou documentos</p>
      </div>
    </div>
  );
}

// Helper to determine file type
export function getFileMediaType(file: File): 'image' | 'video' | 'audio' | 'document' {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
}

// Helper to create preview URL
export function createFilePreview(file: File, type: 'image' | 'video' | 'audio' | 'document'): string | undefined {
  if (type === 'image' || type === 'video') {
    return URL.createObjectURL(file);
  }
  return undefined;
}
