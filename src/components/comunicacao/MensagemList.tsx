import { useState, useEffect, useRef, useCallback } from "react";
import { format, differenceInSeconds } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Check, CheckCheck, Paperclip, Reply, Pencil, X, Check as CheckIcon, FileText, Download, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ComunicacaoFileViewerDialog } from "./ComunicacaoFileViewerDialog";
import { supabase } from "@/integrations/supabase/client";

const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"];
const VIDEO_EXTS = ["mp4", "webm", "ogg", "mov"];
const AUDIO_EXTS = ["mp3", "wav", "ogg", "m4a", "aac"];

function getFileExt(path: string): string {
  return (path.split(".").pop() || "").toLowerCase();
}

function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from("comunicacao-anexos").getPublicUrl(path);
  return data.publicUrl;
}

interface Mensagem {
  id: string;
  user_id: string;
  user_nome: string;
  mensagem: string;
  anexos: string[] | null;
  data_envio: string;
  updated_at?: string;
  reply_to_id?: string | null;
  comunicacao_leituras?: Array<{ user_id: string; data_leitura: string }>;
}

interface MensagemListProps {
  mensagens: Mensagem[];
  currentUserId?: string;
  onReply?: (mensagem: Mensagem) => void;
  onEdit?: (mensagemId: string, novoTexto: string) => void;
  onUserNameClick?: (userId: string) => void;
}

const EDIT_TIME_LIMIT_SECONDS = 300; // 5 minutos

export function MensagemList({ mensagens, currentUserId, onReply, onEdit, onUserNameClick }: MensagemListProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileViewerOpen, setFileViewerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [, setTick] = useState(0); // Force re-render for time check
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Re-render every second to update edit button visibility
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenAnexo = (path: string) => {
    setSelectedFile(path);
    setFileViewerOpen(true);
  };

  // Função para encontrar a mensagem original do reply
  const getReplyMessage = (replyToId: string | null | undefined) => {
    if (!replyToId) return null;
    return mensagens.find(m => m.id === replyToId);
  };

  // Scroll até a mensagem original e destacá-la
  const scrollToMessage = useCallback((messageId: string) => {
    const element = messageRefs.current.get(messageId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedId(messageId);
      // Remover destaque após 2 segundos
      setTimeout(() => setHighlightedId(null), 2000);
    }
  }, []);

  // Callback ref para armazenar referências aos elementos
  const setMessageRef = useCallback((id: string, element: HTMLDivElement | null) => {
    if (element) {
      messageRefs.current.set(id, element);
    } else {
      messageRefs.current.delete(id);
    }
  }, []);

  // Verificar se a mensagem pode ser editada (dentro de 5 min)
  const canEdit = (mensagem: Mensagem) => {
    const isOwner = mensagem.user_id === currentUserId;
    const secondsSinceSent = differenceInSeconds(new Date(), new Date(mensagem.data_envio));
    const withinTimeLimit = secondsSinceSent <= EDIT_TIME_LIMIT_SECONDS;
    
    console.log("📝 canEdit check:", { 
      msgUserId: mensagem.user_id, 
      currentUserId, 
      isOwner, 
      secondsSinceSent,
      withinTimeLimit
    });
    
    if (!isOwner) return false;
    return withinTimeLimit;
  };

  // Verificar se a mensagem foi editada
  const wasEdited = (mensagem: Mensagem) => {
    if (!mensagem.updated_at) return false;
    // Se updated_at > data_envio + 1 segundo, foi editada
    const envioTime = new Date(mensagem.data_envio).getTime();
    const updateTime = new Date(mensagem.updated_at).getTime();
    return updateTime - envioTime > 1000; // mais de 1 segundo de diferença
  };

  const handleStartEdit = (mensagem: Mensagem) => {
    setEditingId(mensagem.id);
    setEditText(mensagem.mensagem);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const handleConfirmEdit = () => {
    if (editingId && editText.trim() && onEdit) {
      onEdit(editingId, editText.trim());
      setEditingId(null);
      setEditText("");
    }
  };

  // Função para destacar menções no texto
  const renderMensagemComMencoes = (texto: string | null | undefined, isOwn: boolean) => {
    if (!texto) return null;
    // Regex para encontrar @NomeSobrenome (palavras após @)
    const parts = texto.split(/(@\S+)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        return (
          <span 
            key={index} 
            className={cn("font-bold", isOwn ? "text-white" : "text-primary")}
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <>
      <div className="space-y-4">
        {mensagens.map((mensagem) => {
          const isOwn = mensagem.user_id === currentUserId;
          const leituras = mensagem.comunicacao_leituras || [];
          const foiLida = leituras.length > 0;
          const replyMessage = getReplyMessage(mensagem.reply_to_id);
          const isEditing = editingId === mensagem.id;
          const canEditMsg = canEdit(mensagem);
          const isEdited = wasEdited(mensagem);

          return (
            <div
              key={mensagem.id}
              ref={(el) => setMessageRef(mensagem.id, el)}
              className={cn(
                "flex items-start gap-0.5 max-w-[75%] group transition-all duration-500",
                isOwn ? "ml-auto flex-row-reverse" : "mr-auto",
                highlightedId === mensagem.id && "ring-2 ring-primary ring-offset-2 rounded-lg"
              )}
            >
              {/* Action Buttons - visible on hover */}
              <div className={cn(
                "mt-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0",
                isOwn ? "flex-row-reverse" : ""
              )}>
                {onReply && !isEditing && (
                  <button
                    onClick={() => onReply(mensagem)}
                    className="p-1.5 rounded hover:bg-muted"
                    title="Responder"
                  >
                    <Reply className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
                {canEditMsg && !isEditing && onEdit && (
                  <button
                    onClick={() => handleStartEdit(mensagem)}
                    className="p-1.5 rounded hover:bg-muted"
                    title="Editar (disponível por 30s)"
                  >
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
              </div>

              <div className="flex flex-col min-w-0">
                {!isOwn && (
                  <button
                    onClick={() => onUserNameClick?.(mensagem.user_id)}
                    className="text-xs font-medium text-primary hover:underline mb-1 text-left cursor-pointer"
                    title="Abrir conversa privada"
                  >
                    {mensagem.user_nome}
                  </button>
                )}
                
                <div
                  className={cn(
                    "rounded-lg px-4 py-2",
                    isOwn
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  {/* Reply Preview - Clickable */}
                  {replyMessage && (
                    <div 
                      className={cn(
                        "mb-2 px-2 py-1 rounded border-l-2 text-xs cursor-pointer hover:opacity-80 transition-opacity",
                        isOwn 
                          ? "bg-primary-foreground/10 border-primary-foreground/50" 
                          : "bg-background/50 border-primary"
                      )}
                      onClick={() => scrollToMessage(replyMessage.id)}
                      title="Ir para mensagem original"
                    >
                      <p className={cn(
                        "font-medium",
                        isOwn ? "text-primary-foreground/80" : "text-primary"
                      )}>
                        {replyMessage.user_nome}
                      </p>
                      <p className={cn(
                        "truncate",
                        isOwn ? "text-primary-foreground/60" : "text-muted-foreground"
                      )}>
                        {(replyMessage.mensagem ?? "").substring(0, 50)}
                        {(replyMessage.mensagem ?? "").length > 50 ? "..." : ""}
                      </p>
                    </div>
                  )}

                  {isEditing ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className={cn(
                          "min-h-[60px] resize-none text-sm",
                          isOwn ? "bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30" : ""
                        )}
                        autoFocus
                      />
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleCancelEdit}
                          className={cn(
                            "h-7 px-2",
                            isOwn && "text-primary-foreground hover:text-primary-foreground hover:bg-primary-foreground/20"
                          )}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleConfirmEdit}
                          className={cn(
                            "h-7 px-2",
                            isOwn && "bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                          )}
                        >
                          <CheckIcon className="h-3 w-3 mr-1" />
                          Salvar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">
                      {renderMensagemComMencoes(mensagem.mensagem, isOwn)}
                    </p>
                  )}
                  
                  {mensagem.anexos && mensagem.anexos.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {mensagem.anexos.map((anexo, idx) => {
                        const fullFileName = anexo.split("/").pop() || `Anexo ${idx + 1}`;
                        const displayName = fullFileName.replace(/^\d+_/, '');
                        const ext = getFileExt(anexo);
                        const publicUrl = getPublicUrl(anexo);

                        // Image preview
                        if (IMAGE_EXTS.includes(ext)) {
                          return (
                            <div key={idx} className="cursor-pointer" onClick={() => handleOpenAnexo(anexo)}>
                              <img
                                src={publicUrl}
                                alt={displayName}
                                className="max-w-[280px] max-h-[200px] rounded-md object-cover border border-border/30"
                                loading="lazy"
                              />
                              <p className={cn("text-[10px] mt-0.5 truncate", isOwn ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                {displayName}
                              </p>
                            </div>
                          );
                        }

                        // Video preview
                        if (VIDEO_EXTS.includes(ext)) {
                          return (
                            <div key={idx}>
                              <video
                                src={publicUrl}
                                controls
                                preload="metadata"
                                className="max-w-[280px] max-h-[200px] rounded-md border border-border/30"
                              />
                              <p className={cn("text-[10px] mt-0.5 truncate", isOwn ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                {displayName}
                              </p>
                            </div>
                          );
                        }

                        // Audio preview
                        if (AUDIO_EXTS.includes(ext)) {
                          return (
                            <div key={idx} className="space-y-1">
                              <audio src={publicUrl} controls preload="metadata" className="max-w-[260px] h-8" />
                              <p className={cn("text-[10px] truncate", isOwn ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                {displayName}
                              </p>
                            </div>
                          );
                        }

                        // Other files - icon + name
                        return (
                          <button
                            key={idx}
                            onClick={() => handleOpenAnexo(anexo)}
                            className={cn(
                              "flex items-center gap-2 px-3 py-2 rounded-md border transition-colors w-full text-left",
                              isOwn
                                ? "border-primary-foreground/20 hover:bg-primary-foreground/10"
                                : "border-border hover:bg-muted"
                            )}
                          >
                            <FileText className="h-5 w-5 flex-shrink-0 opacity-60" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{displayName}</p>
                              <p className={cn("text-[10px]", isOwn ? "text-primary-foreground/60" : "text-muted-foreground")}>
                                {ext.toUpperCase()}
                              </p>
                            </div>
                            <Download className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className={cn(
                  "flex items-center gap-1 mt-1 text-xs text-muted-foreground",
                  isOwn && "justify-end"
                )}>
                  <span>
                    {format(new Date(mensagem.data_envio), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </span>
                  {isEdited && (
                    <span className="italic">(editado)</span>
                  )}
                  {isOwn && (
                    <span className="ml-1">
                      {foiLida ? (
                        <CheckCheck className="h-3 w-3 text-blue-500" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <ComunicacaoFileViewerDialog
        filePath={selectedFile}
        open={fileViewerOpen}
        onOpenChange={setFileViewerOpen}
      />
    </>
  );
}
