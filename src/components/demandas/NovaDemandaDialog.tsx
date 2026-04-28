import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Plus,
  ListChecks,
  GripVertical,
  Check,
  Tag as TagIcon,
  MessageSquare,
  Activity,
  Link as LinkIcon,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useUserSetor } from "@/hooks/useUserSetor";
import { useAuth } from "@/contexts/AuthContext";
import { useCriarDemanda, useUploadAnexoDemanda } from "@/hooks/useDemandas";
import { URGENCIA_LABEL } from "@/lib/setoresAccess";
import { supabase } from "@/integrations/supabase/client";
import { PessoasCombobox } from "./PessoasCombobox";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultDate?: Date | null;
}

type Urgencia = "baixa" | "media" | "alta" | "critica";
type PessoaMention = { id: string; nome_completo: string | null };

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
  const [urgencia, setUrgencia] = useState<Urgencia>("media");
  const [dataLimite, setDataLimite] = useState<Date | undefined>(
    defaultDate ?? undefined,
  );
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [checklist, setChecklist] = useState<{ texto: string; ok: boolean }[]>([]);
  const [novoItem, setNovoItem] = useState("");
  const itemRefs = useRef<(HTMLInputElement | null)[]>([]);
  const novoItemRef = useRef<HTMLInputElement>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [novaTag, setNovaTag] = useState("");
  const [comentarioInicial, setComentarioInicial] = useState("");
  const [comentarioPessoas, setComentarioPessoas] = useState<string[]>([]);
  const [comentarioCaret, setComentarioCaret] = useState(0);
  const [links, setLinks] = useState<{ titulo: string; url: string }[]>([]);
  const [novoLinkTitulo, setNovoLinkTitulo] = useState("");
  const [novoLinkUrl, setNovoLinkUrl] = useState("");

  useEffect(() => {
    if (open) {
      setTitulo("");
      setDescricao("");
      setPessoas([]);
      setUrgencia("media");
      setDataLimite(defaultDate ?? undefined);
      setPendingFiles([]);
      setChecklist([]);
      setNovoItem("");
      setTags([]);
      setNovaTag("");
      setComentarioInicial("");
      setComentarioPessoas([]);
      setComentarioCaret(0);
      setLinks([]);
      setNovoLinkTitulo("");
      setNovoLinkUrl("");
    }
  }, [open, defaultDate]);

  const { data: pessoasSistema = [] } = useQuery({
    queryKey: ["demandas-mentions-pessoas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome_completo")
        .order("nome_completo");
      if (error) throw error;
      return (data || []) as PessoaMention[];
    },
    staleTime: 1000 * 60 * 5,
  });

  const handleImagePaste = (file: File) => {
    setPendingFiles((prev) => [...prev, file]);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) setPendingFiles((p) => [...p, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const adicionarLink = () => {
    const url = novoLinkUrl.trim();
    if (!url) return;
    setLinks((p) => [
      ...p,
      { titulo: novoLinkTitulo.trim() || url, url },
    ]);
    setNovoLinkTitulo("");
    setNovoLinkUrl("");
  };

  const mentionMatch = comentarioInicial.slice(0, comentarioCaret).match(/@([^@\s]*)$/);
  const mentionQuery = mentionMatch?.[1]?.toLowerCase() ?? "";
  const mentionStart = mentionMatch
    ? comentarioCaret - mentionMatch[0].length
    : -1;
  const sugestoesMention = useMemo(() => {
    if (mentionStart < 0) return [];
    return pessoasSistema
      .filter((p) => (p.nome_completo || "").toLowerCase().includes(mentionQuery))
      .filter((p) => !comentarioPessoas.includes(p.id))
      .slice(0, 6);
  }, [comentarioPessoas, mentionQuery, mentionStart, pessoasSistema]);

  const selecionarMention = (pessoa: PessoaMention) => {
    if (mentionStart < 0) return;
    const nome = pessoa.nome_completo || "pessoa";
    const antes = comentarioInicial.slice(0, mentionStart);
    const depois = comentarioInicial.slice(comentarioCaret);
    const proximoTexto = `${antes}@${nome} ${depois}`;
    setComentarioInicial(proximoTexto);
    setComentarioPessoas((prev) =>
      prev.includes(pessoa.id) ? prev : [...prev, pessoa.id],
    );
    setComentarioCaret(antes.length + nome.length + 2);
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
        checklist: checklist.filter((c) => c.texto.trim()),
        tags,
        comentario_inicial: comentarioInicial.trim() || null,
        comentario_mencionados: comentarioPessoas,
        comentario_links: links,
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
      <DialogContent className="max-w-[59rem] max-h-[92vh] overflow-hidden p-0">
        <DialogHeader>
          <div className="px-5 pt-5 pr-12">
            <DialogTitle>Nova demanda</DialogTitle>
            <DialogDescription>
              Crie a tarefa com responsáveis, tags, comentários, links e histórico inicial.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="grid max-h-[calc(92vh-8.5rem)] gap-0 overflow-hidden border-y lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="grid gap-3 overflow-y-auto p-5">
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
            <RichTextEditor
              value={descricao}
              onChange={setDescricao}
              placeholder="Detalhe a demanda… use a barra para formatar."
              minHeight="140px"
              onImagePaste={handleImagePaste}
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

          <div className="grid gap-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1.5 text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" /> Checklist
              </Label>
              {checklist.length > 0 && (
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {checklist.filter((c) => c.ok).length}/{checklist.length}
                </span>
              )}
            </div>

            {checklist.length > 0 && (
              <div className="rounded-md bg-muted/30 py-1">
                {checklist.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1.5 group px-1.5 py-0.5 hover:bg-muted/50 rounded transition-colors"
                  >
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 opacity-0 group-hover:opacity-100 cursor-grab shrink-0" />
                    <button
                      type="button"
                      onClick={() =>
                        setChecklist((p) =>
                          p.map((it, i) =>
                            i === idx ? { ...it, ok: !it.ok } : it,
                          ),
                        )
                      }
                      className={cn(
                        "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                        item.ok
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground/40 hover:border-primary",
                      )}
                      aria-label={item.ok ? "Desmarcar" : "Marcar"}
                    >
                      {item.ok && <Check className="h-3 w-3" strokeWidth={3} />}
                    </button>
                    <input
                      ref={(el) => (itemRefs.current[idx] = el)}
                      value={item.texto}
                      onChange={(e) =>
                        setChecklist((p) =>
                          p.map((it, i) =>
                            i === idx ? { ...it, texto: e.target.value } : it,
                          ),
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          setChecklist((p) => {
                            const next = [...p];
                            next.splice(idx + 1, 0, { texto: "", ok: false });
                            return next;
                          });
                          setTimeout(() => itemRefs.current[idx + 1]?.focus(), 0);
                        } else if (
                          e.key === "Backspace" &&
                          item.texto === "" &&
                          checklist.length > 0
                        ) {
                          e.preventDefault();
                          setChecklist((p) => p.filter((_, i) => i !== idx));
                          setTimeout(() => {
                            if (idx > 0) itemRefs.current[idx - 1]?.focus();
                            else novoItemRef.current?.focus();
                          }, 0);
                        } else if (e.key === "ArrowDown") {
                          e.preventDefault();
                          if (idx < checklist.length - 1)
                            itemRefs.current[idx + 1]?.focus();
                          else novoItemRef.current?.focus();
                        } else if (e.key === "ArrowUp" && idx > 0) {
                          e.preventDefault();
                          itemRefs.current[idx - 1]?.focus();
                        }
                      }}
                      className={cn(
                        "flex-1 bg-transparent border-0 outline-none text-sm py-1 px-1",
                        item.ok && "line-through text-muted-foreground",
                      )}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setChecklist((p) => p.filter((_, i) => i !== idx))
                      }
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-destructive transition-opacity shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-muted/30 transition-colors">
              <Plus className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
              <input
                ref={novoItemRef}
                value={novoItem}
                onChange={(e) => setNovoItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && novoItem.trim()) {
                    e.preventDefault();
                    setChecklist((p) => [
                      ...p,
                      { texto: novoItem.trim(), ok: false },
                    ]);
                    setNovoItem("");
                  } else if (
                    e.key === "Backspace" &&
                    novoItem === "" &&
                    checklist.length > 0
                  ) {
                    e.preventDefault();
                    itemRefs.current[checklist.length - 1]?.focus();
                  }
                }}
                placeholder="Adicionar item…"
                className="flex-1 bg-transparent border-0 outline-none text-sm py-1 px-1 placeholder:text-muted-foreground/50"
              />
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

          <div className="grid gap-1.5">
            <Label className="text-xs flex items-center gap-1.5 text-muted-foreground">
              <TagIcon className="h-3.5 w-3.5" /> Tags
            </Label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1.5 min-h-9">
              {tags.map((t, i) => (
                <Badge key={i} variant="secondary" className="gap-1 pr-1">
                  #{t}
                  <button
                    type="button"
                    onClick={() => setTags((p) => p.filter((_, idx) => idx !== i))}
                    className="hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <input
                value={novaTag}
                onChange={(e) => setNovaTag(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === ",") && novaTag.trim()) {
                    e.preventDefault();
                    const t = novaTag.trim().replace(/^#/, "").toLowerCase();
                    if (!tags.includes(t)) setTags((p) => [...p, t]);
                    setNovaTag("");
                  } else if (
                    e.key === "Backspace" &&
                    novaTag === "" &&
                    tags.length > 0
                  ) {
                    setTags((p) => p.slice(0, -1));
                  }
                }}
                placeholder={tags.length ? "" : "Adicionar tag e Enter…"}
                className="flex-1 min-w-[120px] bg-transparent border-0 outline-none text-sm py-0.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Urgência</Label>
              <Select value={urgencia} onValueChange={(v) => setUrgencia(v as Urgencia)}>
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

          <aside className="min-h-0 border-t bg-muted/20 lg:border-l lg:border-t-0">
            <Tabs defaultValue="comentarios" className="flex h-full min-h-[24rem] flex-col">
              <TabsList className="m-3 grid h-9 grid-cols-2">
                <TabsTrigger value="comentarios" className="gap-1 text-xs">
                  <MessageSquare className="h-3.5 w-3.5" /> Comentários
                </TabsTrigger>
                <TabsTrigger value="atividades" className="gap-1 text-xs">
                  <Activity className="h-3.5 w-3.5" /> Atividades
                </TabsTrigger>
              </TabsList>

              <TabsContent value="comentarios" className="mt-0 flex-1 overflow-y-auto px-3 pb-3">
                <div className="space-y-3">
                  <div className="rounded-md border bg-background p-3 shadow-sm">
                    <Label className="text-xs">Comentário inicial</Label>
                    <div className="relative mt-2">
                      <Textarea
                        value={comentarioInicial}
                        onChange={(e) => {
                          setComentarioInicial(e.target.value);
                          setComentarioCaret(e.target.selectionStart ?? e.target.value.length);
                        }}
                        onClick={(e) => setComentarioCaret(e.currentTarget.selectionStart ?? 0)}
                        onKeyUp={(e) => setComentarioCaret(e.currentTarget.selectionStart ?? 0)}
                        placeholder="Digite @ para marcar pessoas…"
                        className="min-h-28 resize-none"
                      />
                      {sugestoesMention.length > 0 && (
                        <div className="absolute left-2 right-2 top-full z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-lg">
                          {sugestoesMention.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => selecionarMention(p)}
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                            >
                              @{p.nome_completo || "Sem nome"}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {comentarioPessoas.length > 0 && (
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        {comentarioPessoas.length} pessoa(s) marcada(s) no comentário
                      </div>
                    )}
                  </div>

                  <div className="rounded-md border bg-background p-3 shadow-sm">
                    <Label className="text-xs flex items-center gap-1.5">
                      <LinkIcon className="h-3.5 w-3.5" /> Links relacionados
                    </Label>
                    <div className="mt-2 grid gap-2">
                      {links.map((link, idx) => (
                        <div key={`${link.url}-${idx}`} className="flex items-center gap-2 rounded border bg-muted/30 px-2 py-1.5 text-xs">
                          <LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{link.titulo}</span>
                          <button
                            type="button"
                            onClick={() => setLinks((p) => p.filter((_, i) => i !== idx))}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Remover link"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <Input
                        value={novoLinkTitulo}
                        onChange={(e) => setNovoLinkTitulo(e.target.value)}
                        placeholder="Nome do link"
                        className="h-8 text-xs"
                      />
                      <div className="flex gap-2">
                        <Input
                          value={novoLinkUrl}
                          onChange={(e) => setNovoLinkUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              adicionarLink();
                            }
                          }}
                          placeholder="https://..."
                          className="h-8 text-xs"
                        />
                        <Button type="button" size="sm" variant="outline" onClick={adicionarLink} className="h-8 px-2">
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="atividades" className="mt-0 flex-1 overflow-y-auto px-3 pb-3">
                <div className="space-y-3 text-xs">
                  <div className="rounded-md border bg-background p-3 shadow-sm">
                    <div className="font-medium">Demanda será criada</div>
                    <div className="mt-1 text-muted-foreground">Título, descrição, checklist e prazo entram no histórico inicial.</div>
                  </div>
                  <div className="rounded-md border bg-background p-3 shadow-sm">
                    <div className="font-medium">Pessoas</div>
                    <div className="mt-1 text-muted-foreground">
                      {pessoas.length ? `${pessoas.length} pessoa(s) envolvida(s)` : "Sem pessoas envolvidas"}
                      {comentarioPessoas.length ? ` · ${comentarioPessoas.length} menção(ões)` : ""}
                    </div>
                  </div>
                  <div className="rounded-md border bg-background p-3 shadow-sm">
                    <div className="font-medium">Organização</div>
                    <div className="mt-1 text-muted-foreground">
                      {tags.length ? `${tags.length} tag(s)` : "Sem tags"} · {links.length ? `${links.length} link(s)` : "Sem links"}
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </aside>
        </div>

        <DialogFooter className="px-5 pb-5 pt-0">
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
