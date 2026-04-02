import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger, PopoverAnchor } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { 
  Send, 
  Calendar as CalendarIcon, 
  AlertTriangle, 
  User, 
  Clock,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Profile {
  id: string;
  nome_completo: string;
}

interface Setor {
  id: string;
  nome: string;
}

interface LicitacaoComentarioAvancadoInputProps {
  onEnviar: (dados: {
    mensagem: string;
    mencionados: string[];
    isCritico: boolean;
    respostaEsperadaAte: Date | null;
    responsavelRespostaId: string | null;
    setorResponsavel: string | null;
  }) => void;
  isLoading?: boolean;
  profiles: Profile[];
  setores?: Setor[];
}

const SETORES_PADRAO: Setor[] = [
  { id: "AGES", nome: "AGES" },
  { id: "Contratos", nome: "Contratos" },
  { id: "Direção", nome: "Direção" },
  { id: "Escalas", nome: "Escalas" },
  { id: "Financeiro", nome: "Financeiro" },
  { id: "Licitações", nome: "Licitações" },
  { id: "Marketing", nome: "Marketing" },
  { id: "Prospecção e Captação", nome: "Prospecção e Captação" },
  { id: "Radiologia", nome: "Radiologia" },
  { id: "Tecnologia da Informação", nome: "Tecnologia da Informação" },
];

export function LicitacaoComentarioAvancadoInput({ 
  onEnviar, 
  isLoading, 
  profiles = [],
  setores = SETORES_PADRAO
}: LicitacaoComentarioAvancadoInputProps) {
  const [mensagem, setMensagem] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const [mencionadosIds, setMencionadosIds] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Campos avançados
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isCritico, setIsCritico] = useState(false);
  const [respostaEsperadaAte, setRespostaEsperadaAte] = useState<Date | null>(null);
  const [horaResposta, setHoraResposta] = useState("18:00");
  const [responsavelRespostaId, setResponsavelRespostaId] = useState<string | null>(null);
  const [setorResponsavel, setSetorResponsavel] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const getShortName = (fullName: string | undefined) => {
    if (!fullName) return "";
    const parts = fullName.trim().split(/\s+/);
    return parts.slice(0, 2).join(" ");
  };

  const filteredProfiles = profiles.filter(p =>
    p.nome_completo?.toLowerCase()?.includes(mentionSearch.toLowerCase()) ?? false
  );

  const handleMensagemChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setMensagem(value);
    setCursorPosition(cursorPos);

    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      if (!textAfterAt.includes(" ") && (lastAtIndex === 0 || value[lastAtIndex - 1] === " ")) {
        setMentionSearch(textAfterAt);
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
  };

  const insertMention = useCallback((profile: Profile) => {
    const shortName = getShortName(profile.nome_completo);
    const textBeforeCursor = mensagem.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    const textAfterCursor = mensagem.substring(cursorPosition);
    
    const newText = mensagem.substring(0, lastAtIndex) + `@${shortName} ` + textAfterCursor;
    setMensagem(newText);
    setShowMentions(false);
    
    if (!mencionadosIds.includes(profile.id)) {
      setMencionadosIds(prev => [...prev, profile.id]);
    }
    
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, [mensagem, cursorPosition, mencionadosIds]);

  const handleEnviar = () => {
    if (!mensagem.trim()) return;
    
    // Combinar data com hora
    let dataHoraResposta: Date | null = null;
    if (respostaEsperadaAte) {
      const [hora, minuto] = horaResposta.split(':').map(Number);
      dataHoraResposta = new Date(respostaEsperadaAte);
      dataHoraResposta.setHours(hora, minuto, 0, 0);
    }
    
    onEnviar({
      mensagem,
      mencionados: mencionadosIds,
      isCritico,
      respostaEsperadaAte: dataHoraResposta,
      responsavelRespostaId,
      setorResponsavel,
    });
    
    // Reset
    setMensagem("");
    setMencionadosIds([]);
    setIsCritico(false);
    setRespostaEsperadaAte(null);
    setHoraResposta("18:00");
    setResponsavelRespostaId(null);
    setSetorResponsavel(null);
    setShowAdvanced(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !showMentions) {
      e.preventDefault();
      handleEnviar();
    }
    
    if (e.key === "Escape" && showMentions) {
      setShowMentions(false);
    }
  };

  const responsavelSelecionado = profiles.find(p => p.id === responsavelRespostaId);

  return (
    <div className="p-3 border-t space-y-2">
      {/* Indicador de mensagem crítica */}
      {isCritico && (
        <div className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/30 rounded-md">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span className="text-xs font-medium text-destructive">Mensagem marcada como crítica</span>
        </div>
      )}
      
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
              className={cn(
                "text-sm resize-none",
                isCritico && "border-destructive/50 focus-visible:ring-destructive/30"
              )}
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

      {/* Botão para expandir opções avançadas */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full h-7 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        {showAdvanced ? (
          <>
            <ChevronUp className="h-3 w-3 mr-1" />
            Ocultar opções de rastreamento
          </>
        ) : (
          <>
            <ChevronDown className="h-3 w-3 mr-1" />
            Adicionar prazo de resposta
          </>
        )}
      </Button>

      {/* Opções avançadas */}
      {showAdvanced && (
        <div className="space-y-3 p-3 bg-muted/50 rounded-lg border">
          {/* Marcar como crítico */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className={cn("h-4 w-4", isCritico ? "text-destructive" : "text-muted-foreground")} />
              <Label htmlFor="critico" className="text-xs font-medium cursor-pointer">
                Mensagem crítica
              </Label>
            </div>
            <Switch
              id="critico"
              checked={isCritico}
              onCheckedChange={setIsCritico}
              className="scale-90"
            />
          </div>

          {/* Prazo de resposta */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Resposta esperada até
            </Label>
            <div className="flex gap-2">
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "flex-1 justify-start text-left font-normal h-8 text-xs",
                      !respostaEsperadaAte && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {respostaEsperadaAte 
                      ? format(respostaEsperadaAte, "dd/MM/yyyy", { locale: ptBR })
                      : "Selecionar data"
                    }
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={respostaEsperadaAte || undefined}
                    onSelect={(date) => {
                      setRespostaEsperadaAte(date || null);
                      setCalendarOpen(false);
                    }}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
              
              <Input
                type="time"
                value={horaResposta}
                onChange={(e) => setHoraResposta(e.target.value)}
                className="w-24 h-8 text-xs"
              />
            </div>
          </div>

          {/* Responsável pela resposta */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              Responsável pela resposta
            </Label>
            <Select
              value={responsavelRespostaId || "__none__"}
              onValueChange={(v) => setResponsavelRespostaId(v === "__none__" ? null : v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecionar usuário">
                  {responsavelSelecionado?.nome_completo || "Selecionar usuário"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhum</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome_completo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Setor responsável */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">ou Setor responsável</Label>
            <Select
              value={setorResponsavel || "__none__"}
              onValueChange={(v) => setSetorResponsavel(v === "__none__" ? null : v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecionar setor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhum</SelectItem>
                {setores.map((s) => (
                  <SelectItem key={s.id} value={s.nome}>
                    {s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Resumo da configuração */}
          {(respostaEsperadaAte || responsavelRespostaId || setorResponsavel) && (
            <div className="flex flex-wrap gap-1.5 pt-2 border-t">
              {respostaEsperadaAte && (
                <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                  <Clock className="h-3 w-3 mr-1" />
                  {format(respostaEsperadaAte, "dd/MM", { locale: ptBR })} {horaResposta}
                </Badge>
              )}
              {responsavelSelecionado && (
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                  <User className="h-3 w-3 mr-1" />
                  {getShortName(responsavelSelecionado.nome_completo)}
                </Badge>
              )}
              {setorResponsavel && (
                <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                  {setorResponsavel}
                </Badge>
              )}
            </div>
          )}
        </div>
      )}

      <Button 
        size="sm" 
        className={cn(
          "w-full",
          isCritico && "bg-destructive hover:bg-destructive/90"
        )} 
        onClick={handleEnviar}
        disabled={!mensagem.trim() || isLoading}
      >
        <Send className="mr-1 h-4 w-4" />
        {isCritico ? "Enviar mensagem crítica" : "Enviar"}
      </Button>
    </div>
  );
}
