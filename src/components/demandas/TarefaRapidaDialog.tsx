import { useState, useEffect, useRef } from "react";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarIcon,
  Send,
  Paperclip,
  Image as ImageIcon,
  X,
  Gavel,
  FileText,
  UserSearch,
  MessageCircle,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useUserSetor } from "@/hooks/useUserSetor";
import { useCriarDemanda, useUploadAnexoDemanda } from "@/hooks/useDemandas";
import { URGENCIA_LABEL } from "@/lib/setoresAccess";
import { PessoasCombobox, type ModuloChave } from "./PessoasCombobox";

export type VinculoTipo = "licitacao" | "contrato" | "lead" | "sigzap";

interface VinculoCtx {
  tipo: VinculoTipo;
  id: string;
  /** Texto curto que descreve o recurso (ex: "Licitação 123/2025 — Pref. SP") */
  label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vinculo: VinculoCtx;
}

const TIPO_META: Record<
  VinculoTipo,
  { label: string; icon: any; modulo: ModuloChave; prefix: string }
> = {
  licitacao: {
    label: "Licitação",
    icon: Gavel,
    modulo: "licitacoes",
    prefix: "Licitação",
  },
  contrato: {
    label: "Contrato",
    icon: FileText,
    modulo: "contratos",
    prefix: "Contrato",
  },
  lead: {
    label: "Lead",
    icon: UserSearch,
    modulo: "disparos",
    prefix: "Lead",
  },
  sigzap: {
    label: "Conversa SigZap",
    icon: MessageCircle,
    modulo: "sigzap",
    prefix: "SigZap",
  },
};

export function TarefaRapidaDialog({ open, onOpenChange, vinculo }: Props) {
  const { user } = useAuth();
  const { setorId } = useUserSetor();
  const criar = useCriarDemanda();
  const upload = useUploadAnexoDemanda();

  const meta = TIPO_META[vinculo.tipo];
  const Icon = meta.icon;

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [pessoas, setPessoas] = useState<string[]>([]);
  const [urgencia, setUrgencia] = useState<"baixa" | "media" | "alta" | "critica">("media");
  const [dataLimite, setDataLimite] = useState<Date | undefined>(undefined);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitulo("");
      setDescricao("");
      setPessoas([]);
      setUrgencia("media");
      setDataLimite(undefined);
      setPendingFiles([]);
    }
  }, [open, vinculo.id]);

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
    const refs: any = {};
    if (vinculo.tipo === "licitacao") refs.licitacao_id = vinculo.id;
    if (vinculo.tipo === "contrato") refs.contrato_id = vinculo.id;
    if (vinculo.tipo === "lead") refs.lead_id = vinculo.id;
    if (vinculo.tipo === "sigzap") refs.sigzap_conversation_id = vinculo.id;

    // Sem pessoas marcadas → tarefa pra mim mesmo
    const mencionadosFinal = pessoas.length ? pessoas : [user?.id ?? ""].filter(Boolean);
    const responsavelFinal = pessoas[0] ?? user?.id ?? null;

    try {
      const tarefaId = await criar.mutateAsync({
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        setor_destino_id: null,
        setor_origem_id: setorId ?? null,
        escopo: "geral",
        tipo: "tarefa",
        urgencia,
        responsavel_id: responsavelFinal,
        mencionados: mencionadosFinal,
        data_limite: dataLimite ? format(dataLimite, "yyyy-MM-dd") : null,
        ...refs,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            Nova tarefa
          </DialogTitle>
        </DialogHeader>

        {/* Vínculo (read-only, vem do card) */}
        <div className="rounded-md border bg-muted/40 px-3 py-2 flex items-center gap-2">
          <Badge variant="outline" className="gap-1 shrink-0">
            <Icon className="h-3 w-3" />
            {meta.prefix}
          </Badge>
          <span className="text-xs truncate">{vinculo.label}</span>
        </div>

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
              placeholder="Detalhe a tarefa…"
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
            <Label className="text-xs">
              Marcar pessoas com acesso a {meta.label}
            </Label>
            <PessoasCombobox
              value={pessoas}
              onChange={setPessoas}
              modulo={meta.modulo}
              placeholder="Buscar pessoa com acesso…"
            />
            <p className="text-[11px] text-muted-foreground">
              {pessoas.length === 0
                ? "Sem ninguém marcado, a tarefa fica pra você."
                : "A primeira pessoa é o responsável principal."}
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
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={criar.isPending} className="gap-1">
            <Send className="h-4 w-4" /> Criar tarefa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
