import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
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

interface Profile {
  id: string;
  nome_completo: string;
}

interface LicitacaoComentarioInputProps {
  onEnviar: (mensagem: string, mencionados: string[]) => void;
  isLoading?: boolean;
  profiles: Profile[];
}

export function LicitacaoComentarioInput({ 
  onEnviar, 
  isLoading, 
  profiles = []
}: LicitacaoComentarioInputProps) {
  const [mensagem, setMensagem] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const [mencionadosIds, setMencionadosIds] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Função para extrair primeiro e segundo nome
  const getShortName = (fullName: string | undefined) => {
    if (!fullName) return "";
    const parts = fullName.trim().split(/\s+/);
    return parts.slice(0, 2).join(" ");
  };

  // Filtrar participantes pelo termo de busca
  const filteredProfiles = profiles.filter(p =>
    p.nome_completo?.toLowerCase()?.includes(mentionSearch.toLowerCase()) ?? false
  );

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
  const insertMention = useCallback((profile: Profile) => {
    const shortName = getShortName(profile.nome_completo);
    const textBeforeCursor = mensagem.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    const textAfterCursor = mensagem.substring(cursorPosition);
    
    const newText = mensagem.substring(0, lastAtIndex) + `@${shortName} ` + textAfterCursor;
    setMensagem(newText);
    setShowMentions(false);
    
    // Adicionar ID do usuário mencionado à lista
    if (!mencionadosIds.includes(profile.id)) {
      setMencionadosIds(prev => [...prev, profile.id]);
    }
    
    // Focar novamente no textarea
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, [mensagem, cursorPosition, mencionadosIds]);

  const handleEnviar = () => {
    if (!mensagem.trim()) return;
    onEnviar(mensagem, mencionadosIds);
    setMensagem("");
    setMencionadosIds([]);
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
    <div className="p-3 border-t space-y-2">
      <div className="relative">
        <Popover open={showMentions && filteredProfiles.length > 0} onOpenChange={setShowMentions}>
          <PopoverAnchor asChild>
            <Textarea
              ref={textareaRef}
              placeholder="Adicionar comentário... (@ para mencionar)"
              value={mensagem}
              onChange={handleMensagemChange}
              onKeyDown={handleKeyDown}
              rows={2}
              className="text-sm resize-none"
              disabled={isLoading}
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
                <CommandEmpty>Nenhum usuário encontrado</CommandEmpty>
                <CommandGroup>
                  {filteredProfiles.map((p) => (
                    <CommandItem
                      key={p.id}
                      onSelect={() => insertMention(p)}
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
        size="sm" 
        className="w-full" 
        onClick={handleEnviar}
        disabled={!mensagem.trim() || isLoading}
      >
        <Send className="mr-1 h-4 w-4" />
        Enviar
      </Button>
    </div>
  );
}
