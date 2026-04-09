import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { 
  Reply, 
  Trash2, 
  SmilePlus,
  Copy,
  MoreVertical,
  Paperclip,
  Pencil
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SigZapMessageContextMenuProps {
  children: React.ReactNode;
  messageId: string;
  waMessageId: string | null;
  fromMe: boolean;
  messageText: string | null;
  messageType: string;
  mediaUrl: string | null;
  mediaFilename: string | null;
  onReply: (messageId: string, messageText: string | null) => void;
  onReact: (waMessageId: string, fromMe: boolean, emoji: string) => void;
  onDelete: (waMessageId: string, fromMe: boolean) => void;
  onEdit?: (messageId: string, waMessageId: string, currentText: string) => void;
  onAttachToLead?: (messageId: string, mediaUrl: string, filename: string) => void;
  canDelete: boolean;
  hasLinkedLead: boolean;
}

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏', '🎉', '💯'];

const ATTACHABLE_TYPES = ['document', 'pdf', 'application'];

function isAttachableMessage(messageType: string, mediaUrl: string | null, filename: string | null): boolean {
  if (!mediaUrl) return false;
  if (ATTACHABLE_TYPES.includes(messageType)) return true;
  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext && ['pdf', 'doc', 'docx'].includes(ext)) return true;
  }
  return false;
}

export function SigZapMessageContextMenu({
  children,
  messageId,
  waMessageId,
  fromMe,
  messageText,
  messageType,
  mediaUrl,
  mediaFilename,
  onReply,
  onReact,
  onDelete,
  onEdit,
  onAttachToLead,
  canDelete,
  hasLinkedLead,
}: SigZapMessageContextMenuProps) {
  const handleCopy = () => {
    if (messageText) {
      navigator.clipboard.writeText(messageText);
    }
  };

  const showAttachOption = isAttachableMessage(messageType, mediaUrl, mediaFilename);
  const canEdit = fromMe && waMessageId && messageType === 'text' && messageText && onEdit;

  return (
    <div 
      className={cn(
        "group max-w-[85%] flex items-start gap-1",
        fromMe ? "ml-auto flex-row" : "mr-auto flex-row-reverse"
      )}
    >
      {/* Message content */}
      <div className="flex-1 min-w-0">
        {children}
      </div>

      {/* 3-dot menu button - flex sibling, sits beside the bubble */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex-shrink-0 mt-1 bg-black/10 hover:bg-black/30 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48" align={fromMe ? "start" : "end"}>
          {/* Reply */}
          <DropdownMenuItem 
            onClick={() => onReply(messageId, messageText)}
            className="gap-2"
          >
            <Reply className="h-4 w-4" />
            Responder
          </DropdownMenuItem>

          {/* Edit - only for own text messages */}
          {canEdit && (
            <DropdownMenuItem 
              onClick={() => onEdit(messageId, waMessageId, messageText)}
              className="gap-2"
            >
              <Pencil className="h-4 w-4" />
              Editar mensagem
            </DropdownMenuItem>
          )}

          {/* React with emoji submenu */}
          {waMessageId && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <SmilePlus className="h-4 w-4" />
                Reagir
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="p-2">
                <div className="grid grid-cols-5 gap-1">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => onReact(waMessageId, fromMe, emoji)}
                      className="h-8 w-8 flex items-center justify-center text-lg hover:bg-muted rounded transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {/* Copy text */}
          {messageText && (
            <DropdownMenuItem onClick={handleCopy} className="gap-2">
              <Copy className="h-4 w-4" />
              Copiar texto
            </DropdownMenuItem>
          )}

          {/* Attach to Lead */}
          {showAttachOption && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => {
                  if (hasLinkedLead && onAttachToLead && mediaUrl) {
                    onAttachToLead(messageId, mediaUrl, mediaFilename || 'documento');
                  }
                }}
                disabled={!hasLinkedLead}
                className="gap-2"
              >
                <Paperclip className="h-4 w-4" />
                {hasLinkedLead ? "Anexar ao Lead" : "Anexar ao Lead (sem lead)"}
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />

          {/* Delete for everyone - only for own messages */}
          {canDelete && fromMe && waMessageId && (
            <DropdownMenuItem 
              onClick={() => onDelete(waMessageId, fromMe)}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Apagar para todos
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Reply preview component
interface ReplyPreviewProps {
  replyingTo: {
    messageId: string;
    messageText: string | null;
  } | null;
  onCancel: () => void;
}

export function SigZapReplyPreview({ replyingTo, onCancel }: ReplyPreviewProps) {
  if (!replyingTo) return null;

  return (
    <div className="px-3 py-2 border-t bg-muted/30 flex items-center gap-2">
      <div className="w-1 h-8 bg-primary rounded-full flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-primary font-medium">Respondendo</p>
        <p className="text-xs text-muted-foreground truncate">
          {replyingTo.messageText || '[Mídia]'}
        </p>
      </div>
      <button
        onClick={onCancel}
        className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
      >
        ×
      </button>
    </div>
  );
}

// Edit preview component
interface EditPreviewProps {
  editingMessage: {
    messageId: string;
    waMessageId: string;
    currentText: string;
  } | null;
  onCancel: () => void;
}

export function SigZapEditPreview({ editingMessage, onCancel }: EditPreviewProps) {
  if (!editingMessage) return null;

  return (
    <div className="px-3 py-2 border-t bg-amber-500/10 flex items-center gap-2">
      <div className="w-1 h-8 bg-amber-500 rounded-full flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-amber-600 font-medium">✏️ Editando mensagem</p>
        <p className="text-xs text-muted-foreground truncate">
          {editingMessage.currentText}
        </p>
      </div>
      <button
        onClick={onCancel}
        className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
      >
        ×
      </button>
    </div>
  );
}
