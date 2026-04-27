import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  CalendarIcon,
  Image as ImageIcon,
  Paperclip,
  X,
  Send,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useUserSetor } from "@/hooks/useUserSetor";
import { useAuth } from "@/contexts/AuthContext";
import { useCriarDemanda, useUploadAnexoDemanda } from "@/hooks/useDemandas";
import { URGENCIA_LABEL } from "@/lib/setoresAccess";
import { PessoasCombobox } from "./PessoasCombobox";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultDate?: Date | null;
}

/**
 * Modal "Nova demanda" da tela Home.
 * Comportamento implícito (sem botões de tipo):
 *  - Sem ninguém marcado → tarefa pessoal (pra mim).
 *  - Com pessoas marcadas → tarefa livre.
 * Para vincular Licitação/Contrato/Lead/SigZap → use o menu (3 pontinhos)
 * dentro do card específico de cada módulo.
 */
export function NovaDemandaDialog({ open, onOpenChange, defaultDate }: Props) {
  const { setorId } = useUserSetor();
  const { user } = useAuth();
  const criar = useCriarDemanda();
  const upload = useUploadAnexoDemanda();

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [pessoas, setPessoas] = useState<string[]>([]);
  const [urgencia, setUrgencia] = useState<"baixa" | "media" | "alta" | "critica">("media");
  const [dataLimite, setDataLimite] = useState<Date | undefined>(
    defaultDate ?? undefined,
  );
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitulo("");
      setDescricao("");
      setPessoas([]);
      setUrgencia("media");
      setDataLimite(defaultDate ?? undefined);
      setPendingFiles([]);
    }
  }, [open, defaultDate]);

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const images = items.filter((it) => it.type.startsWith("image/"));
    if (!images.length) return;
    const files = images
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f);
    if (files.length) {
      setPendingFiles((prev) => [...prev, ...files]);
      toast.success(`${files.length} print colado(s)`);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) setPendingFiles((p) => [...p, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = async () => {
    if (!titulo.trim()) {
      toast.error("Informe um título");
      return;
    }
    const ehPessoal = pessoas.length === 0;
    const mencionadosFinal = ehPessoal
      ? [user?.id ?? ""].filter(Boolean)
      : pessoas;
    const responsavelFinal = ehPessoal ? user?.id ?? null : pessoas[0] ?? null;

    try {
      const tarefaId = await criar.mutateAsync({
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        setor_destino_id: null,
        setor_origem_id: setorId ?? null,
        escopo: ehPessoal ? "setor" : "geral",
        tipo: "tarefa",
        urgencia,
        responsavel_id: responsavelFinal,
        mencionados: mencionadosFinal,
        data_limite: dataLimite ? format(dataLimite, "yyyy-MM-dd") : null,
      });
      for (const f of pendingFiles) {
        try {
          await upload.mutateAsync({ tarefaId, file: f, nome: f.name });
        } catch (e) {
          console.error(e);
        }
      }
      onOpenChange(false);
    } catch {
      // toast já no hook
    }
  };

  const ehPessoal = pessoas.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova demanda</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Título *</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="O que precisa ser feito?"
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Descrição (cole prints com Ctrl+V)</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              onPaste={handlePaste}
              rows={3}
              placeholder="Detalhe a demanda…"
            />
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pendingFiles.map((f, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 pr-1">
                    {f.type.startsWith("image/") ? (
                      <ImageIcon className="h-3 w-3" />
                    ) : (
                      <Paperclip className="h-3 w-3" />
                    )}
                    {f.name.length > 22 ? f.name.slice(0, 22) + "…" : f.name}
                    <button
                      type="button"
                      onClick={() =>
                        setPendingFiles((p) => p.filter((_, idx) => idx !== i))
                      }
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={handleFile}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="h-7 text-xs gap-1"
              >
                <Paperclip className="h-3 w-3" /> Anexar arquivo
              </Button>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Pessoas envolvidas</Label>
            <PessoasCombobox
              value={pessoas}
              onChange={setPessoas}
              modulo={null}
              placeholder="Marcar pessoas (opcional)…"
            />
            <p className="text-[11px] text-muted-foreground">
              {ehPessoal
                ? "Sem ninguém marcado — esta tarefa é só pra você."
                : "A primeira pessoa marcada é o responsável principal."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Urgência</Label>
              <Select value={urgencia} onValueChange={(v: any) => setUrgencia(v)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(URGENCIA_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Prazo</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "h-9 justify-start text-left font-normal",
                      !dataLimite && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dataLimite
                      ? format(dataLimite, "dd/MM/yyyy")
                      : "Sem prazo"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dataLimite}
                    onSelect={setDataLimite}
                    initialFocus
                    className="p-3 pointer-events-auto"
                    locale={ptBR}
                  />
                  {dataLimite && (
                    <div className="p-2 border-t">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full text-xs"
                        onClick={() => setDataLimite(undefined)}
                      >
                        Remover prazo
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground border-t pt-2">
            💡 Para vincular a uma <strong>licitação, contrato, lead</strong> ou{" "}
            <strong>conversa SigZap</strong>, abra o card correspondente e use o
            menu <strong>⋯ → Criar tarefa</strong>.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={criar.isPending} className="gap-1">
            <Send className="h-4 w-4" /> Enviar demanda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
