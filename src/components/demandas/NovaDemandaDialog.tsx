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
import {
  CalendarIcon,
  Image as ImageIcon,
  Paperclip,
  X,
  Send,
  Gavel,
  FileText,
  UserSearch,
  MessageCircle,
  User as UserIcon,
  Search,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useUserSetor } from "@/hooks/useUserSetor";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCriarDemanda,
  useUploadAnexoDemanda,
} from "@/hooks/useDemandas";
import { RefSelection } from "./ReferenciaPicker";
import { URGENCIA_LABEL, TIPO_LABEL } from "@/lib/setoresAccess";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultDate?: Date | null;
}

// Modo de marcação: define o universo de pessoas que posso marcar e o que vincular
type MarcacaoModo = "pessoal" | "livre" | "licitacao" | "contrato" | "lead" | "sigzap";

const MODO_META: Record<
  MarcacaoModo,
  { label: string; icon: any; modulo: string | null; descricao: string }
> = {
  pessoal: {
    label: "Pra mim",
    icon: UserIcon,
    modulo: null,
    descricao: "Tarefa pessoal — só você verá.",
  },
  livre: {
    label: "Tarefa livre",
    icon: Send,
    modulo: null,
    descricao: "Sem vínculo. Pode marcar qualquer pessoa.",
  },
  licitacao: {
    label: "Licitação",
    icon: Gavel,
    modulo: "licitacoes",
    descricao: "Só quem tem acesso a Licitações pode ser marcado.",
  },
  contrato: {
    label: "Contrato",
    icon: FileText,
    modulo: "contratos",
    descricao: "Só quem tem acesso a Contratos pode ser marcado.",
  },
  lead: {
    label: "Lead",
    icon: UserSearch,
    modulo: "disparos",
    descricao: "Só quem tem acesso a Leads/Disparos pode ser marcado.",
  },
  sigzap: {
    label: "Conversa SigZap",
    icon: MessageCircle,
    modulo: "sigzap",
    descricao: "Só quem tem acesso ao SigZap pode ser marcado.",
  },
};

export function NovaDemandaDialog({ open, onOpenChange, defaultDate }: Props) {
  const { setorId } = useUserSetor();
  const { isAdmin } = usePermissions();
  const { user } = useAuth();
  const criar = useCriarDemanda();
  const upload = useUploadAnexoDemanda();

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [modo, setModo] = useState<MarcacaoModo>("livre");
  const [setorFiltro, setSetorFiltro] = useState<string>("__todos");
  const [tipo, setTipo] = useState<"tarefa" | "arquivo" | "esclarecimento">("tarefa");
  const [urgencia, setUrgencia] = useState<"baixa" | "media" | "alta" | "critica">("media");
  const [mencionados, setMencionados] = useState<string[]>([]);
  const [pessoaSearch, setPessoaSearch] = useState("");
  const [vinculoId, setVinculoId] = useState<string | null>(null);
  const [vinculoLabel, setVinculoLabel] = useState<string>("");
  const [vinculoSearch, setVinculoSearch] = useState("");
  const [vinculoOpen, setVinculoOpen] = useState(false);
  const [dataLimite, setDataLimite] = useState<Date | undefined>(
    defaultDate ?? undefined,
  );
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitulo("");
      setDescricao("");
      setModo("livre");
      setSetorFiltro("__todos");
      setTipo("tarefa");
      setUrgencia("media");
      setMencionados([]);
      setPessoaSearch("");
      setVinculoId(null);
      setVinculoLabel("");
      setVinculoSearch("");
      setVinculoOpen(false);
      setDataLimite(defaultDate ?? undefined);
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

  // Universo de pessoas marcáveis baseado no modo
  const moduloAtivo = MODO_META[modo].modulo;
  const { data: pessoasElegiveis = [] } = useQuery({
    queryKey: ["demanda-pessoas-elegiveis", moduloAtivo],
    enabled: open && modo !== "pessoal",
    queryFn: async () => {
      // Sem módulo (livre): todos os profiles
      if (!moduloAtivo) {
        const { data } = await supabase
          .from("profiles")
          .select("id, nome_completo, setor_id")
          .order("nome_completo");
        return (data || []).filter((p: any) => p.id !== user?.id);
      }
      // Com módulo: admins + perfis com permissão `visualizar` naquele módulo
      const { data: perms } = await supabase
        .from("permissoes")
        .select("perfil")
        .eq("modulo", moduloAtivo)
        .eq("acao", "visualizar")
        .eq("ativo", true);
      const perfisOk = Array.from(new Set((perms || []).map((p: any) => p.perfil)));
      // Sempre incluir admin
      if (!perfisOk.includes("admin")) perfisOk.push("admin");
      if (!perfisOk.length) return [];
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", perfisOk as any);
      const userIds = Array.from(
        new Set((roleRows || []).map((r: any) => r.user_id)),
      ).filter((id) => id !== user?.id);
      if (!userIds.length) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, nome_completo, setor_id")
        .in("id", userIds)
        .order("nome_completo");
      return profs || [];
    },
  });

  // Filtra por setor + busca
  const pessoasFiltradas = (pessoasElegiveis as any[]).filter((p) => {
    if (setorFiltro !== "__todos" && p.setor_id !== setorFiltro) return false;
    if (pessoaSearch && !(p.nome_completo || "").toLowerCase().includes(pessoaSearch.toLowerCase()))
      return false;
    return true;
  });

  // Busca de vínculo (licitação/contrato/lead/sigzap)
  const { data: vinculoResults = [] } = useQuery({
    queryKey: ["demanda-vinculo-search", modo, vinculoSearch],
    enabled: vinculoOpen && ["licitacao", "contrato", "lead", "sigzap"].includes(modo),
    queryFn: async () => {
      const s = vinculoSearch || "";
      if (modo === "licitacao") {
        const { data } = await supabase
          .from("licitacoes")
          .select("id, titulo, numero_edital, orgao")
          .or(
            `titulo.ilike.%${s}%,numero_edital.ilike.%${s}%,orgao.ilike.%${s}%`,
          )
          .limit(10);
        return (data || []).map((d: any) => ({
          id: d.id,
          label: d.titulo || d.numero_edital || "Licitação",
          sub: d.orgao,
        }));
      }
      if (modo === "contrato") {
        const { data } = await supabase
          .from("contratos")
          .select("id, codigo_contrato, objeto_contrato")
          .or(
            `codigo_contrato.ilike.%${s}%,objeto_contrato.ilike.%${s}%`,
          )
          .limit(10);
        return (data || []).map((d: any) => ({
          id: d.id,
          label: d.codigo_contrato || "Contrato",
          sub: d.objeto_contrato,
        }));
      }
      if (modo === "lead") {
        const { data } = await supabase
          .from("captacao_leads")
          .select("id, nome, especialidade, uf")
          .ilike("nome", `%${s}%`)
          .limit(10);
        return (data || []).map((d: any) => ({
          id: d.id,
          label: d.nome || "Lead",
          sub: [d.especialidade, d.uf].filter(Boolean).join(" • "),
        }));
      }
      if (modo === "sigzap") {
        const { data: contatos } = await supabase
          .from("sigzap_contacts")
          .select("id, contact_name, contact_phone")
          .or(`contact_name.ilike.%${s}%,contact_phone.ilike.%${s}%`)
          .limit(10);
        const ids = (contatos || []).map((c: any) => c.id);
        if (!ids.length) return [];
        const { data: convs } = await supabase
          .from("sigzap_conversations")
          .select("id, contact_id")
          .in("contact_id", ids);
        const byContact = new Map((contatos || []).map((c: any) => [c.id, c]));
        return (convs || []).map((d: any) => {
          const c: any = byContact.get(d.contact_id);
          return {
            id: d.id,
            label: c?.contact_name || c?.contact_phone || "Conversa",
            sub: c?.contact_phone,
          };
        });
      }
      return [];
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
    if (
      ["licitacao", "contrato", "lead", "sigzap"].includes(modo) &&
      !vinculoId
    ) {
      toast.error(`Selecione ${MODO_META[modo].label.toLowerCase()} para vincular`);
      return;
    }
    const refs: RefSelection = {};
    if (modo === "licitacao") refs.licitacao_id = vinculoId;
    if (modo === "contrato") refs.contrato_id = vinculoId;
    if (modo === "lead") refs.lead_id = vinculoId;
    if (modo === "sigzap") refs.sigzap_conversation_id = vinculoId;

    const mencionadosFinal =
      modo === "pessoal" ? [user?.id ?? ""].filter(Boolean) : mencionados;
    const responsavelFinal =
      modo === "pessoal" ? user?.id ?? null : mencionados[0] ?? null;

    try {
      const tarefaId = await criar.mutateAsync({
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        setor_destino_id: null,
        setor_origem_id: setorId ?? null,
        escopo: modo === "pessoal" ? "setor" : "geral",
        tipo,
        urgencia,
        responsavel_id: responsavelFinal,
        mencionados: mencionadosFinal,
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

  const ModoIcon = MODO_META[modo].icon;
  const precisaVinculo = ["licitacao", "contrato", "lead", "sigzap"].includes(modo);

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

          {/* Tipo de demanda — direciona quem pode ser marcado */}
          <div className="grid gap-1.5">
            <Label>O que é essa demanda?</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(MODO_META) as MarcacaoModo[]).map((m) => {
                const meta = MODO_META[m];
                const Icon = meta.icon;
                const ativo = modo === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setModo(m);
                      setMencionados([]);
                      setVinculoId(null);
                      setVinculoLabel("");
                    }}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-2 rounded-md border text-xs transition",
                      ativo
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-background hover:bg-muted border-border",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              <ModoIcon className="inline h-3 w-3 mr-1" />
              {MODO_META[modo].descricao}
            </p>
          </div>

          {/* Vínculo obrigatório quando aplicável */}
          {precisaVinculo && (
            <div className="grid gap-1.5">
              <Label>Vincular {MODO_META[modo].label.toLowerCase()} *</Label>
              <Popover open={vinculoOpen} onOpenChange={setVinculoOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start font-normal"
                  >
                    <Search className="h-3.5 w-3.5 mr-2" />
                    {vinculoLabel || `Buscar ${MODO_META[modo].label.toLowerCase()}…`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[420px] p-2" align="start">
                  <Input
                    autoFocus
                    placeholder="Digite para buscar…"
                    value={vinculoSearch}
                    onChange={(e) => setVinculoSearch(e.target.value)}
                    className="h-8 mb-2"
                  />
                  <div className="max-h-60 overflow-auto space-y-1">
                    {(vinculoResults as any[]).length === 0 && (
                      <div className="text-xs text-muted-foreground p-2">
                        {vinculoSearch ? "Nada encontrado" : "Digite para buscar…"}
                      </div>
                    )}
                    {(vinculoResults as any[]).map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className="w-full text-left p-2 rounded hover:bg-muted text-xs"
                        onClick={() => {
                          setVinculoId(r.id);
                          setVinculoLabel(r.label);
                          setVinculoOpen(false);
                          setVinculoSearch("");
                        }}
                      >
                        <div className="font-medium">{r.label}</div>
                        {r.sub && (
                          <div className="text-muted-foreground text-[11px]">
                            {r.sub}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              {vinculoId && (
                <button
                  type="button"
                  onClick={() => {
                    setVinculoId(null);
                    setVinculoLabel("");
                  }}
                  className="text-[11px] text-muted-foreground hover:text-destructive self-start"
                >
                  Remover vínculo
                </button>
              )}
            </div>
          )}

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

          {/* Marcação de pessoas — só quando não é pessoal */}
          {modo !== "pessoal" && (
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>
                  Marcar pessoas{" "}
                  <span className="text-muted-foreground font-normal">
                    ({mencionados.length} selecionada{mencionados.length === 1 ? "" : "s"})
                  </span>
                </Label>
                <div className="flex items-center gap-1.5">
                  <Select value={setorFiltro} onValueChange={setSetorFiltro}>
                    <SelectTrigger className="h-7 text-xs w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__todos">Todos os setores</SelectItem>
                      {setores.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Buscar pessoa…"
                    value={pessoaSearch}
                    onChange={(e) => setPessoaSearch(e.target.value)}
                    className="h-7 text-xs w-[160px]"
                  />
                </div>
              </div>

              {mencionados.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {mencionados.map((id) => {
                    const p = (pessoasElegiveis as any[]).find((x) => x.id === id);
                    return (
                      <Badge key={id} variant="default" className="gap-1 pr-1">
                        {p?.nome_completo || "…"}
                        <button
                          type="button"
                          onClick={() =>
                            setMencionados((prev) => prev.filter((x) => x !== id))
                          }
                          className="hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap gap-1 p-2 border rounded-md min-h-[44px] max-h-[160px] overflow-auto">
                {pessoasFiltradas.length === 0 && (
                  <p className="text-[11px] text-muted-foreground italic px-1 py-1">
                    {pessoasElegiveis.length === 0
                      ? "Nenhuma pessoa elegível para esse tipo de demanda."
                      : "Nenhuma pessoa nesse filtro."}
                  </p>
                )}
                {pessoasFiltradas.map((p: any) => {
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
              <p className="text-[11px] text-muted-foreground">
                A primeira pessoa marcada é considerada o responsável principal. Marque várias para envolver o time.
              </p>
            </div>
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
