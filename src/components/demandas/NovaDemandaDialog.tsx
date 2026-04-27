import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { CalendarIcon, Image as ImageIcon, Paperclip, X, Send } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useUserSetor } from "@/hooks/useUserSetor";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useCriarDemanda,
  useUploadAnexoDemanda,
} from "@/hooks/useDemandas";
import { ReferenciaPicker, RefSelection } from "./ReferenciaPicker";
import { URGENCIA_LABEL, TIPO_LABEL } from "@/lib/setoresAccess";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultDate?: Date | null;
}

export function NovaDemandaDialog({ open, onOpenChange, defaultDate }: Props) {
  const { setorId } = useUserSetor();
  const { isAdmin } = usePermissions();
  const criar = useCriarDemanda();
  const upload = useUploadAnexoDemanda();

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [setorDestino, setSetorDestino] = useState<string>("");
  const [escopo, setEscopo] = useState<"setor" | "geral">("setor");
  const [tipo, setTipo] = useState<"tarefa" | "arquivo" | "esclarecimento">("tarefa");
  const [urgencia, setUrgencia] = useState<"baixa" | "media" | "alta" | "critica">("media");
  const [responsavelId, setResponsavelId] = useState<string>("");
  const [mencionados, setMencionados] = useState<string[]>([]);
  const [dataLimite, setDataLimite] = useState<Date | undefined>(
    defaultDate ?? undefined,
  );
  const [refs, setRefs] = useState<RefSelection>({});
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitulo("");
      setDescricao("");
      setSetorDestino("");
      setEscopo("setor");
      setTipo("tarefa");
      setUrgencia("media");
      setResponsavelId("");
      setMencionados([]);
      setDataLimite(defaultDate ?? undefined);
      setRefs({});
      setPendingFiles([]);
    }
  }, [open, defaultDate]);

  const { data: setores = [] } = useQuery({
    queryKey: ["setores-list"],
    queryFn: async () => {
      const { data } = await supabase.from("setores").select("id, nome").order("nome");
      return data || [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-by-setor", setorDestino],
    enabled: !!setorDestino,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, nome_completo")
        .eq("setor_id", setorDestino)
        .order("nome_completo");
      return data || [];
    },
  });

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
    if (escopo === "setor" && !setorDestino) {
      toast.error("Escolha o setor destino ou marque como Geral");
      return;
    }
    try {
      const tarefaId = await criar.mutateAsync({
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        setor_destino_id: escopo === "geral" ? null : setorDestino,
        setor_origem_id: setorId ?? null,
        escopo,
        tipo,
        urgencia,
        responsavel_id: responsavelId || null,
        mencionados,
        data_limite: dataLimite ? format(dataLimite, "yyyy-MM-dd") : null,
        ...refs,
      });
      // Upload anexos
      for (const f of pendingFiles) {
        try {
          await upload.mutateAsync({ tarefaId, file: f, nome: f.name });
        } catch (e) {
          console.error(e);
        }
      }
      onOpenChange(false);
    } catch (e) {
      // erro já tratado no hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova demanda</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Título *</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Revisar minuta do contrato X"
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Descrição (cole prints aqui com Ctrl+V)</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              onPaste={handlePaste}
              rows={4}
              placeholder="Detalhe a demanda…"
            />
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
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
                className="h-7 text-xs gap-1 mt-1"
              >
                <Paperclip className="h-3 w-3" /> Anexar arquivo
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Escopo</Label>
              <Select value={escopo} onValueChange={(v: any) => setEscopo(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="setor">Para um setor</SelectItem>
                  <SelectItem value="geral">Geral (todos veem)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Setor destino {escopo === "setor" && "*"}</Label>
              <Select
                value={setorDestino}
                onValueChange={(v) => {
                  setSetorDestino(v);
                  setResponsavelId("");
                  setMencionados([]);
                  setRefs({});
                }}
                disabled={escopo === "geral"}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {setores.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v: any) => setTipo(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Urgência</Label>
              <Select value={urgencia} onValueChange={(v: any) => setUrgencia(v)}>
                <SelectTrigger>
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
              <Label>Prazo</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !dataLimite && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dataLimite
                      ? format(dataLimite, "dd/MM/yyyy")
                      : "Sem prazo"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dataLimite}
                    onSelect={setDataLimite}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
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

          {escopo === "setor" && setorDestino && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Responsável principal</Label>
                  <Select
                    value={responsavelId}
                    onValueChange={(v) => setResponsavelId(v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Opcional" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome_completo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Marcar pessoas (opcional)</Label>
                  <div className="flex flex-wrap gap-1 p-2 border rounded-md min-h-[40px]">
                    {profiles.map((p: any) => {
                      const checked = mencionados.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            setMencionados((prev) =>
                              checked
                                ? prev.filter((x) => x !== p.id)
                                : [...prev, p.id],
                            )
                          }
                          className={cn(
                            "text-[11px] px-2 py-0.5 rounded-md border transition",
                            checked
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background hover:bg-muted border-border",
                          )}
                        >
                          {p.nome_completo}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label>Vincular registros</Label>
                <ReferenciaPicker
                  setorDestinoId={setorDestino}
                  isAdmin={isAdmin}
                  value={refs}
                  onChange={setRefs}
                />
              </div>
            </>
          )}
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
