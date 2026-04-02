import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip, X, Reply } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";

interface Participante {
  user_id: string;
  nome_completo: string;
}

interface ReplyingTo {
  id: string;
  user_nome: string;
  mensagem: string;
}

interface MensagemInputProps {
  onEnviar: (mensagem: string, anexos: string[], replyToId?: string) => void;
  isLoading?: boolean;
  participantes?: Participante[];
  replyingTo?: ReplyingTo | null;
  onCancelReply?: () => void;
  isAdmin?: boolean;
}

export function MensagemInput({ 
  onEnviar, 
  isLoading, 
  participantes = [],
  replyingTo,
  onCancelReply,
  isAdmin = false
}: MensagemInputProps) {
  const [mensagem, setMensagem] = useState("");
  const [anexos, setAnexos] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  // Função para extrair primeiro e segundo nome
  const getShortName = (fullName: string | undefined) => {
    if (!fullName) return "";
    const parts = fullName.trim().split(/\s+/);
    return parts.slice(0, 2).join(" ");
  };

  // Filtrar participantes pelo termo de busca
  const filteredParticipantes = participantes.filter(p =>
    p.nome_completo?.toLowerCase()?.includes(mentionSearch.toLowerCase()) ?? false
  );

  // Verificar se deve mostrar @todos (admin e busca compatível)
  const showTodosOption = isAdmin && "todos".includes(mentionSearch.toLowerCase());

  // Detectar @ para mostrar autocomplete
  const handleMensagemChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setMensagem(value);
    setCursorPosition(cursorPos);

    // Verificar se estamos digitando uma menção
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      // Se não há espaço após o @, mostrar autocomplete
      if (!textAfterAt.includes(" ") && (lastAtIndex === 0 || value[lastAtIndex - 1] === " ")) {
        setMentionSearch(textAfterAt);
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
  };

  // Inserir menção selecionada (usando nome curto)
  const insertMention = useCallback((nomeCompleto: string) => {
    const shortName = getShortName(nomeCompleto);
    const textBeforeCursor = mensagem.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    const textAfterCursor = mensagem.substring(cursorPosition);
    
    const newText = mensagem.substring(0, lastAtIndex) + `@${shortName} ` + textAfterCursor;
    setMensagem(newText);
    setShowMentions(false);
    
    // Focar novamente no textarea
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, [mensagem, cursorPosition]);

  // Inserir @todos - menciona todos os participantes (usando nomes curtos)
  const insertTodos = useCallback(() => {
    const textBeforeCursor = mensagem.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    const textAfterCursor = mensagem.substring(cursorPosition);
    
    // Criar string com todas as menções usando nomes curtos
    const allMentions = participantes
      .filter(p => p.nome_completo)
      .map(p => `@${getShortName(p.nome_completo)}`)
      .join(" ");
    
    const newText = mensagem.substring(0, lastAtIndex) + allMentions + " " + textAfterCursor;
    setMensagem(newText);
    setShowMentions(false);
    
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, [mensagem, cursorPosition, participantes]);

  // Habilitar cola de arquivos com Ctrl+V
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      if (files.length > 0) {
        setAnexos(prev => [...prev, ...files]);
        toast({
          title: "Arquivos colados",
          description: `${files.length} arquivo(s) adicionado(s) com sucesso.`,
        });
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [toast]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAnexos((prev) => [...prev, ...files]);
  };

  const removeAnexo = (index: number) => {
    setAnexos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEnviar = async () => {
    if (!mensagem.trim() && anexos.length === 0) return;

    try {
      setUploadingFiles(true);
      const anexosPaths: string[] = [];

      // Upload de anexos
      if (anexos.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado");

        for (const file of anexos) {
          // Preservar nome original do arquivo, apenas adicionar prefixo para evitar colisões
          const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const fileName = `${user.id}/${Date.now()}_${sanitizedFileName}`;
          
          const { error: uploadError } = await supabase.storage
            .from("comunicacao-anexos")
            .upload(fileName, file);

          if (uploadError) throw uploadError;
          anexosPaths.push(fileName);
        }
      }

      onEnviar(mensagem, anexosPaths, replyingTo?.id);
      setMensagem("");
      setAnexos([]);
    } catch (error: any) {
      toast({
        title: "Erro ao enviar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !showMentions) {
      e.preventDefault();
      handleEnviar();
    }
    
    // Fechar menções com Escape
    if (e.key === "Escape" && showMentions) {
      setShowMentions(false);
    }
  };

  return (
    <div className="border-t p-4">
      {/* Reply Preview */}
      {replyingTo && (
        <div className="mb-2 flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 border-l-4 border-primary">
          <Reply className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-primary">{replyingTo.user_nome}</p>
            <p className="text-xs text-muted-foreground truncate">{replyingTo.mensagem}</p>
          </div>
          <button
            onClick={onCancelReply}
            className="hover:text-destructive p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {anexos.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {anexos.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-2 bg-muted rounded px-3 py-1 text-sm"
            >
              <Paperclip className="h-3 w-3" />
              <span className="max-w-[200px] truncate">{file.name}</span>
              <button
                onClick={() => removeAnexo(index)}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        
        <Button
          variant="outline"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || uploadingFiles}
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        <div className="flex-1 relative">
          <Popover open={showMentions && (filteredParticipantes.length > 0 || showTodosOption)} onOpenChange={setShowMentions}>
            <PopoverAnchor asChild>
              <Textarea
                ref={textareaRef}
                placeholder="Digite sua mensagem... (@ para mencionar, Shift+Enter para nova linha)"
                value={mensagem}
                onChange={handleMensagemChange}
                onKeyDown={handleKeyDown}
                className="min-h-[60px] resize-none"
                disabled={isLoading || uploadingFiles}
              />
            </PopoverAnchor>
            <PopoverContent 
              className="w-[200px] p-0" 
              side="top" 
              align="start"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <Command>
                <CommandList>
                  <CommandEmpty>Nenhum participante encontrado</CommandEmpty>
                  <CommandGroup>
                    {showTodosOption && (
                      <CommandItem
                        onSelect={insertTodos}
                        className="cursor-pointer font-semibold text-primary"
                      >
                        @todos (mencionar todos)
                      </CommandItem>
                    )}
                    {filteredParticipantes.map((p) => (
                      <CommandItem
                        key={p.user_id}
                        onSelect={() => insertMention(p.nome_completo)}
                        className="cursor-pointer"
                      >
                        {p.nome_completo}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <Button
          onClick={handleEnviar}
          disabled={(!mensagem.trim() && anexos.length === 0) || isLoading || uploadingFiles}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
