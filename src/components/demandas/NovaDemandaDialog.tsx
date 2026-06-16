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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  Save,
  Plus,
  ListChecks,
  GripVertical,
  Check,
  Tag as TagIcon,
  MessageSquare,
  Activity,
  Link as LinkIcon,
  ExternalLink,
  FileText,
  Briefcase,
  User as UserIcon,
  MessageCircle,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { Repeat, Clock as ClockIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useUserSetor } from "@/hooks/useUserSetor";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useCriarDemanda,
  useUploadAnexoDemanda,
  useAtualizarDemanda,
  useAdicionarComentarioDemanda,
  useDemandaDetalhe,
  useDemandaComentarios,
  useDemandaAtividades,
  useDemandaConfirmacoes,
  useToggleConfirmacaoDemanda,
  useDemandaAnexos,
  useDeleteAnexoDemanda,
  useAtualizarStatusDemanda,
  getDemandaAnexoSignedUrl,
} from "@/hooks/useDemandas";
import { useCriarRecorrencia } from "@/hooks/useDemandas";
import { URGENCIA_LABEL } from "@/lib/setoresAccess";
import { supabase } from "@/integrations/supabase/client";
import { PessoasCombobox } from "./PessoasCombobox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { extractMensagemLink } from "@/lib/mensagemLink";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultDate?: Date | null;
  /** Se informado, abre o modal em modo edição da tarefa. */
  tarefaId?: string | null;
  /** Pré-popula título ao criar (ignorado em modo edição). */
  prefillTitulo?: string;
  /** Pré-popula descrição (HTML) ao criar (ignorado em modo edição). */
  prefillDescricao?: string;
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function NovaDemandaDialog({ open, onOpenChange, defaultDate, tarefaId = null, prefillTitulo, prefillDescricao }: Props) {
  const { setorId } = useUserSetor();
  const { user } = useAuth();
  const { isAdmin } = usePermissions();
  const navigate = useNavigate();
  const criar = useCriarDemanda();
  const atualizar = useAtualizarDemanda();
  const comentar = useAdicionarComentarioDemanda();
  const upload = useUploadAnexoDemanda();
  const removerAnexo = useDeleteAnexoDemanda();
  const atualizarStatus = useAtualizarStatusDemanda();
  const criarRecorrencia = useCriarRecorrencia();

  const tarefaIdValido = !!tarefaId && UUID_RE.test(tarefaId);
  const isEditing = tarefaIdValido;
  const queryId = open && tarefaIdValido ? tarefaId : null;
  const { data: tarefaExistente, isLoading: loadingTarefa } = useDemandaDetalhe(queryId);
  const { data: comentariosExistentes = [] } = useDemandaComentarios(queryId);
  const { data: atividadesExistentes = [] } = useDemandaAtividades(queryId);
  const { data: confirmacoes = [] } = useDemandaConfirmacoes(queryId);
  const { data: anexosExistentes = [] } = useDemandaAnexos(queryId);
  const toggleConfirmacao = useToggleConfirmacaoDemanda();
  const tarefaCorreta = !!tarefaExistente && tarefaExistente.id === tarefaId;

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [pessoas, setPessoas] = useState<string[]>([]);
  const [responsaveisIds, setResponsaveisIds] = useState<string[]>([]);
  const [urgencia, setUrgencia] = useState<Urgencia>("media");
  const [dataLimite, setDataLimite] = useState<Date | undefined>(
    defaultDate ?? undefined,
  );
  const [horaLimite, setHoraLimite] = useState<string>("");
  const [duracaoMin, setDuracaoMin] = useState<string>("");
  // Recorrência
  const [recorrenteAtivo, setRecorrenteAtivo] = useState(false);
  const [recFrequencia, setRecFrequencia] = useState<"diaria" | "semanal" | "mensal">("semanal");
  const [recDiasSemana, setRecDiasSemana] = useState<number[]>([]);
  const [recDiaMes, setRecDiaMes] = useState<string>("");
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
  const [pastedImages, setPastedImages] = useState<File[]>([]);
  const [pastedPreviews, setPastedPreviews] = useState<string[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Object URLs para preview local; libera ao desmontar/alterar
  useEffect(() => {
    const urls = pastedImages.map((f) => URL.createObjectURL(f));
    setPastedPreviews(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [pastedImages]);

  useEffect(() => {
    if (!open) return;
    if (!isEditing) {
      setTitulo(prefillTitulo ?? "");
      setDescricao(prefillDescricao ?? "");
      setPessoas([]);
      setResponsaveisIds([]);
      setUrgencia("media");
      setDataLimite(defaultDate ?? undefined);
      setHoraLimite("");
      setDuracaoMin("");
      setRecorrenteAtivo(false);
      setRecFrequencia("semanal");
      setRecDiasSemana([]);
      setRecDiaMes("");
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
      setPastedImages([]);
    }
  }, [open, defaultDate, isEditing, prefillTitulo, prefillDescricao]);

  // Pré-popular ao editar
  useEffect(() => {
    if (!open || !isEditing || !tarefaCorreta || !tarefaExistente) return;
    setTitulo(tarefaExistente.titulo ?? "");
    setDescricao(tarefaExistente.descricao ?? "");
    setUrgencia((tarefaExistente.urgencia as Urgencia) ?? "media");
    setDataLimite(
      tarefaExistente.data_limite ? new Date(tarefaExistente.data_limite + "T00:00:00") : undefined,
    );
    setHoraLimite(
      (tarefaExistente as any).data_limite_hora
        ? String((tarefaExistente as any).data_limite_hora).slice(0, 5)
        : "",
    );
    setDuracaoMin(
      (tarefaExistente as any).duracao_min != null
        ? String((tarefaExistente as any).duracao_min)
        : "",
    );
    const mencIds = (tarefaExistente.mencionados ?? []).map((m) => m.user_id);
    const responsavel = tarefaExistente.responsavel_id;
    const criador = tarefaExistente.created_by;
    const pessoasIniciais = Array.from(
      new Set([responsavel, ...mencIds, criador].filter((id): id is string => !!id)),
    );
    // Se for tarefa pessoal (somente o próprio usuário), deixar vazio
    if (
      pessoasIniciais.length === 1 &&
      pessoasIniciais[0] === user?.id &&
      tarefaExistente.escopo === "setor"
    ) {
      setPessoas([]);
      setResponsaveisIds([]);
    } else {
      setPessoas(pessoasIniciais);
      const finIds = (tarefaExistente.finalizadores ?? [])
        .map((f: any) => f.user_id)
        .filter(Boolean);
      const resps = Array.from(
        new Set(
          [responsavel, ...finIds].filter((id): id is string => !!id),
        ),
      );
      setResponsaveisIds(resps.length ? resps : (responsavel ? [responsavel] : []));
    }
    const cl = (tarefaExistente as any).checklist;
    setChecklist(Array.isArray(cl) ? cl : []);
    const tg = (tarefaExistente as any).tags;
    setTags(Array.isArray(tg) ? tg : []);
    setComentarioInicial("");
    setComentarioPessoas([]);
    setComentarioCaret(0);
    setLinks([]);
    setNovoLinkTitulo("");
    setNovoLinkUrl("");
    setPendingFiles([]);
    setNovoItem("");
    setNovaTag("");
    setPastedImages([]);
  }, [open, isEditing, tarefaCorreta, tarefaExistente, user?.id]);

  // Buscar resumos das referências vinculadas
  const { data: referencias } = useQuery({
    queryKey: [
      "demanda-referencias",
      tarefaExistente?.licitacao_id,
      tarefaExistente?.contrato_id,
      tarefaExistente?.lead_id,
      tarefaExistente?.sigzap_conversation_id,
    ],
    enabled:
      isEditing &&
      tarefaCorreta &&
      !!(
        tarefaExistente?.licitacao_id ||
        tarefaExistente?.contrato_id ||
        tarefaExistente?.lead_id ||
        tarefaExistente?.sigzap_conversation_id
      ),
    queryFn: async () => {
      const out: {
        licitacao?: { id: string; label: string };
        contrato?: { id: string; label: string };
        lead?: { id: string; label: string };
        conversa?: { id: string; label: string };
      } = {};
      if (tarefaExistente?.licitacao_id) {
        const { data } = await supabase
          .from("licitacoes")
          .select("id, numero_edital, orgao, objeto")
          .eq("id", tarefaExistente.licitacao_id)
          .maybeSingle();
        if (data) {
          out.licitacao = {
            id: data.id,
            label:
              data.numero_edital
                ? `${data.numero_edital}${data.orgao ? ` · ${data.orgao}` : ""}`
                : data.orgao || (data.objeto?.slice(0, 60) ?? "Licitação"),
          };
        }
      }
      if (tarefaExistente?.contrato_id) {
        const { data } = await supabase
          .from("contratos")
          .select("id, codigo_contrato, codigo_interno, objeto_contrato")
          .eq("id", tarefaExistente.contrato_id)
          .maybeSingle();
        if (data) {
          out.contrato = {
            id: data.id,
            label:
              (data.codigo_contrato ? String(data.codigo_contrato) : "") ||
              (data.codigo_interno ? String(data.codigo_interno) : "") ||
              (data.objeto_contrato?.slice(0, 60) ?? "Contrato"),
          };
        }
      }
      if (tarefaExistente?.lead_id) {
        const { data } = await supabase
          .from("captacao_leads")
          .select("id, nome")
          .eq("id", tarefaExistente.lead_id)
          .maybeSingle();
        if (data) {
          out.lead = { id: data.id, label: data.nome || "Lead" };
        } else {
          out.lead = { id: tarefaExistente.lead_id, label: "Lead" };
        }
      }
      if (tarefaExistente?.sigzap_conversation_id) {
        const { data } = await supabase
          .from("sigzap_conversations")
          .select("id, contact_id")
          .eq("id", tarefaExistente.sigzap_conversation_id)
          .maybeSingle();
        let label = "Conversa";
        if (data?.contact_id) {
          const { data: c } = await supabase
            .from("sigzap_contacts")
            .select("contact_name, contact_phone")
            .eq("id", data.contact_id)
            .maybeSingle();
          if (c) label = c.contact_name || c.contact_phone || label;
        }
        out.conversa = { id: tarefaExistente.sigzap_conversation_id, label };
      }
      return out;
    },
  });

  const temReferencias = !!(
    referencias?.licitacao ||
    referencias?.contrato ||
    referencias?.lead ||
    referencias?.conversa
  );

  const irPara = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

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

  // Em modo edição faz upload imediato; em modo criação acumula em pendingFiles
  // para subir depois que a tarefa for criada.
  const enviarArquivos = async (files: File[]) => {
    if (!files.length) return;
    if (isEditing && tarefaId) {
      for (const f of files) {
        try {
          await upload.mutateAsync({ tarefaId, file: f, nome: f.name });
        } catch (e: any) {
          console.error("Erro upload anexo demanda:", e);
          toast.error(e?.message || `Falha ao anexar ${f.name}`);
        }
      }
      toast.success(files.length > 1 ? "Anexos enviados" : "Anexo enviado");
    } else {
      setPendingFiles((p) => [...p, ...files]);
    }
  };

  const handleImagePaste = (file: File) => {
    void enviarArquivos([file]);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) void enviarArquivos(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const abrirAnexoExistente = async (storage_path: string) => {
    try {
      const url = await getDemandaAnexoSignedUrl(storage_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível abrir o anexo");
    }
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
    // Apenas pessoas envolvidas no card (criador + responsável + mencionados) + o próprio usuário
    const envolvidosIds = new Set<string>(pessoas);
    if (user?.id) envolvidosIds.add(user.id);
    return pessoasSistema
      .filter((p) => envolvidosIds.has(p.id))
      .filter((p) => (p.nome_completo || "").toLowerCase().includes(mentionQuery))
      .filter((p) => !comentarioPessoas.includes(p.id))
      .slice(0, 6);
  }, [comentarioPessoas, mentionQuery, mentionStart, pessoasSistema, pessoas, user?.id]);

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
    // Criador e responsável podem reescrever as listas de mencionados/finalizadores
    // (a RLS libera ambos). Outros envolvidos editam só campos simples.
    const podeEditarListas =
      !!user?.id &&
      !!tarefaExistente &&
      (tarefaExistente.created_by === user.id ||
        tarefaExistente.responsavel_id === user.id);

    try {
      let tarefaIdFinal: string;
      const horaPayload = horaLimite && /^\d{2}:\d{2}$/.test(horaLimite)
        ? `${horaLimite}:00`
        : null;
      const duracaoPayload = duracaoMin && /^\d+$/.test(duracaoMin)
        ? parseInt(duracaoMin, 10)
        : null;

      // Se for recorrência nova (somente na criação), cria template e materializa
      if (!isEditing && recorrenteAtivo) {
        if (!horaPayload) {
          toast.error("Informe a hora para a recorrência");
          return;
        }
        if (recFrequencia === "semanal" && recDiasSemana.length === 0) {
          toast.error("Selecione ao menos um dia da semana");
          return;
        }
        if (recFrequencia === "mensal" && (!recDiaMes || isNaN(parseInt(recDiaMes, 10)))) {
          toast.error("Informe o dia do mês");
          return;
        }
        await criarRecorrencia.mutateAsync({
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          tipo: "tarefa",
          urgencia,
          setor_destino_id: null,
          escopo: ehPessoal ? "setor" : "geral",
          frequencia: recFrequencia,
          dias_semana: recFrequencia === "semanal" ? recDiasSemana : null,
          dia_mes: recFrequencia === "mensal" ? parseInt(recDiaMes, 10) : null,
          data_inicio: dataLimite ? format(dataLimite, "yyyy-MM-dd") : null,
          hora: horaPayload,
          duracao_min: duracaoPayload ?? 60,
          participantes: mencionadosFinal,
          checklist_template: checklist.filter((c) => c.texto.trim()),
        });
        onOpenChange(false);
        return;
      }

      if (isEditing && tarefaId) {
        await atualizar.mutateAsync({
          id: tarefaId,
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          urgencia,
          responsavel_id: responsavelFinal,
          ...(podeEditarListas
            ? {
                mencionados: mencionadosFinal,
                finalizadores: [],
              }
            : {}),
          data_limite: dataLimite ? format(dataLimite, "yyyy-MM-dd") : null,
          data_limite_hora: horaPayload,
          duracao_min: duracaoPayload,
          checklist: checklist.filter((c) => c.texto.trim()),
          tags,
        });
        tarefaIdFinal = tarefaId;
        // Se houver comentário novo no campo, adiciona
        if (comentarioInicial.trim()) {
          await comentar.mutateAsync({
            tarefaId,
            conteudo: comentarioInicial.trim(),
            mencionados: comentarioPessoas,
            links,
          });
        }
      } else {
        tarefaIdFinal = await criar.mutateAsync({
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        setor_destino_id: null,
        setor_origem_id: setorId ?? null,
        escopo: ehPessoal ? "setor" : "geral",
        tipo: "tarefa",
        urgencia,
        responsavel_id: responsavelFinal,
        mencionados: mencionadosFinal,
        finalizadores: [],
        data_limite: dataLimite ? format(dataLimite, "yyyy-MM-dd") : null,
        data_limite_hora: horaPayload,
        duracao_min: duracaoPayload,
        checklist: checklist.filter((c) => c.texto.trim()),
        tags,
        comentario_inicial: comentarioInicial.trim() || null,
        comentario_mencionados: comentarioPessoas,
        comentario_links: links,
        });
      }
      for (const f of pendingFiles) {
        try {
          await upload.mutateAsync({ tarefaId: tarefaIdFinal, file: f, nome: f.name });
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
  const responsavelPrincipalId = ehPessoal ? user?.id ?? null : pessoas[0] ?? null;
  const moverResponsavelPrincipal = (pid: string) => {
    setPessoas((prev) => [pid, ...prev.filter((id) => id !== pid)]);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-[1400px] h-[92vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="space-y-0 shrink-0">
          <div className="px-4 pt-3 pb-2 pr-12 space-y-2 border-b">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground shrink-0">
                {isEditing ? "Editar" : "Nova"}
              </span>
              <DialogTitle className="sr-only">
                {isEditing ? "Editar demanda" : "Nova demanda"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {isEditing
                  ? "Atualize a demanda."
                  : "Crie uma nova demanda."}
              </DialogDescription>
              <Input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Título da demanda…"
                autoFocus
                className="h-8 border-0 bg-transparent px-1 text-base font-semibold shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {isEditing && loadingTarefa && (
                <span className="text-[11px] text-muted-foreground shrink-0">carregando…</span>
              )}
              {isEditing && tarefaExistente?.created_at && (
                <span
                  className="text-[11px] text-muted-foreground shrink-0 inline-flex items-center gap-1"
                  title={format(new Date(tarefaExistente.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                >
                  <CalendarIcon className="h-3 w-3" />
                  Iniciada em {format(new Date(tarefaExistente.created_at), "dd MMM yyyy", { locale: ptBR })}
                </span>
              )}
            </div>
            {(() => {
              const mensagemLink = extractMensagemLink(descricao);
              const mostrar = isEditing && (temReferencias || !!mensagemLink);
              if (!mostrar) return null;
              return (
              <div className="flex flex-wrap items-center gap-1.5">
                {mensagemLink && (
                  <button
                    type="button"
                    onClick={() => irPara(mensagemLink.href)}
                    className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 text-primary px-2 py-0.5 text-[11px] hover:bg-primary/20 transition-colors"
                    title="Abrir mensagem original no canal"
                  >
                    <MessageCircle className="h-3 w-3" />
                    <span>Ir para mensagem</span>
                    <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                  </button>
                )}
                {referencias?.licitacao && (
                  <button
                    type="button"
                    onClick={() => irPara(`/licitacoes?open=${referencias.licitacao!.id}`)}
                    className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-[11px] hover:bg-muted transition-colors"
                  >
                    <FileText className="h-3 w-3" />
                    <span className="truncate max-w-[18rem]">{referencias.licitacao.label}</span>
                    <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                  </button>
                )}
                {referencias?.contrato && (
                  <button
                    type="button"
                    onClick={() => irPara(`/contratos?open=${referencias.contrato!.id}`)}
                    className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-[11px] hover:bg-muted transition-colors"
                  >
                    <Briefcase className="h-3 w-3" />
                    <span className="truncate max-w-[18rem]">{referencias.contrato.label}</span>
                    <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                  </button>
                )}
                {referencias?.lead && (
                  <button
                    type="button"
                    onClick={() => irPara(`/disparos/acompanhamento?lead=${referencias.lead!.id}`)}
                    className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-[11px] hover:bg-muted transition-colors"
                  >
                    <UserIcon className="h-3 w-3" />
                    <span className="truncate max-w-[18rem]">{referencias.lead.label}</span>
                    <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                  </button>
                )}
                {referencias?.conversa && (
                  <button
                    type="button"
                    onClick={() => irPara(`/disparos/sigzap?conversa=${referencias.conversa!.id}`)}
                    className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-[11px] hover:bg-muted transition-colors"
                  >
                    <MessageCircle className="h-3 w-3" />
                    <span className="truncate max-w-[18rem]">{referencias.conversa.label}</span>
                    <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                  </button>
                )}
              </div>
              );
            })()}
          </div>
        </DialogHeader>

        <div className="grid flex-1 min-h-0 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid gap-3 overflow-y-auto p-5 content-start">
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
            {isEditing && anexosExistentes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {anexosExistentes.map((a) => (
                  <Badge
                    key={a.id}
                    variant="outline"
                    className="gap-1 pr-1 max-w-full"
                  >
                    {a.mime_type?.startsWith("image/") ? (
                      <ImageIcon className="h-3 w-3 shrink-0" />
                    ) : (
                      <Paperclip className="h-3 w-3 shrink-0" />
                    )}
                    <button
                      type="button"
                      onClick={() => abrirAnexoExistente(a.storage_path)}
                      className="truncate max-w-[180px] text-left hover:underline"
                      title={a.nome || a.storage_path}
                    >
                      {a.nome || a.storage_path.split("/").pop()}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("Remover este anexo?")) {
                          removerAnexo.mutate({ id: a.id, storage_path: a.storage_path });
                        }
                      }}
                      className="hover:text-destructive ml-0.5"
                      aria-label="Remover anexo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
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
              responsibleId={responsavelPrincipalId}
              onResponsibleChange={moverResponsavelPrincipal}
              modulo={null}
              placeholder="Marcar pessoas (opcional)…"
            />
            <p className="text-[11px] text-muted-foreground">
              {ehPessoal
                ? "Sem ninguém marcado — esta tarefa é só pra você."
                : "Clique no nome para definir o responsável. Use o X para remover."}
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
                      ? `${format(dataLimite, "dd/MM/yyyy")}${horaLimite ? ` · ${horaLimite}` : ""}`
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
                  <div className="p-3 border-t space-y-2">
                    <Label className="text-xs flex items-center gap-1.5">
                      <ClockIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      Hora (opcional)
                    </Label>
                    <Input
                      type="time"
                      value={horaLimite}
                      onChange={(e) => setHoraLimite(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  {dataLimite && (
                    <div className="p-2 border-t">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full text-xs"
                        onClick={() => {
                          setDataLimite(undefined);
                          setHoraLimite("");
                        }}
                      >
                        Remover prazo
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <ClockIcon className="h-3.5 w-3.5 text-muted-foreground" />
                Hora (opcional)
              </Label>
              <Input
                type="time"
                value={horaLimite}
                onChange={(e) => setHoraLimite(e.target.value)}
                className="h-9"
              />
            </div>
            {horaLimite && (
              <div className="grid gap-1.5">
                <Label className="text-xs">Duração (min)</Label>
                <Input
                  type="number"
                  min={0}
                  step={15}
                  placeholder="60"
                  value={duracaoMin}
                  onChange={(e) => setDuracaoMin(e.target.value)}
                  className="h-9"
                />
              </div>
            )}
          </div>

          {!isEditing && (
            <div className="grid gap-2 rounded-md border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5 cursor-pointer">
                  <Repeat className="h-3.5 w-3.5 text-primary" />
                  Tarefa recorrente
                </Label>
                <Switch
                  checked={recorrenteAtivo}
                  onCheckedChange={setRecorrenteAtivo}
                />
              </div>
              {recorrenteAtivo && (
                <div className="grid gap-2">
                  <div className="grid gap-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      Frequência
                    </Label>
                    <Select
                      value={recFrequencia}
                      onValueChange={(v) =>
                        setRecFrequencia(v as "diaria" | "semanal" | "mensal")
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="diaria">Diária</SelectItem>
                        <SelectItem value="semanal">Semanal</SelectItem>
                        <SelectItem value="mensal">Mensal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {recFrequencia === "semanal" && (
                    <div className="grid gap-1.5">
                      <Label className="text-[11px] text-muted-foreground">
                        Dias da semana
                      </Label>
                      <div className="flex flex-wrap gap-1">
                        {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map(
                          (lbl, idx) => {
                            const ativo = recDiasSemana.includes(idx);
                            return (
                              <button
                                key={lbl}
                                type="button"
                                onClick={() =>
                                  setRecDiasSemana((prev) =>
                                    prev.includes(idx)
                                      ? prev.filter((x) => x !== idx)
                                      : [...prev, idx].sort(),
                                  )
                                }
                                className={cn(
                                  "inline-flex items-center justify-center w-9 h-8 rounded-md border text-[11px] font-semibold transition-colors",
                                  ativo
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background border-border hover:bg-muted",
                                )}
                              >
                                {lbl}
                              </button>
                            );
                          },
                        )}
                      </div>
                    </div>
                  )}

                  {recFrequencia === "mensal" && (
                    <div className="grid gap-1.5">
                      <Label className="text-[11px] text-muted-foreground">
                        Dia do mês (1–31)
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        value={recDiaMes}
                        onChange={(e) => setRecDiaMes(e.target.value)}
                        className="h-8"
                      />
                    </div>
                  )}

                  <p className="text-[11px] text-muted-foreground">
                    Usa a <strong>hora</strong> e <strong>duração</strong> definidas acima. Pessoas marcadas serão mencionadas em cada ocorrência.
                    A recorrência permanece ativa e o calendário carrega as ocorrências conforme o mês visualizado.
                  </p>
                </div>
              )}
            </div>
          )}

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

              <TabsContent value="comentarios" className="mt-0 flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden">
                <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2">
                  {isEditing && comentariosExistentes.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      Nenhum comentário ainda.
                    </p>
                  )}
                  {isEditing && comentariosExistentes.length > 0 && (
                    <>
                      {comentariosExistentes.map((c) => (
                        <div
                          key={c.id}
                          className="rounded-md border bg-background p-3 text-sm shadow-sm"
                        >
                          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <Avatar className="h-5 w-5">
                              <AvatarFallback className="text-[9px]">
                                {initials(c.autor_nome)}
                              </AvatarFallback>
                            </Avatar>
                            <span>{c.autor_nome ?? "Usuário"}</span>
                            <span className="ml-auto">
                              {format(new Date(c.created_at), "dd/MM HH:mm")}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap text-xs leading-relaxed">
                            {c.conteudo}
                          </p>
                          {!!c.links?.length && (
                            <div className="mt-2 space-y-1">
                              {c.links.some((l: any) => l?.tipo === "image") && (
                                <div className="flex flex-wrap gap-2 mb-1">
                                  {c.links
                                    .filter((l: any) => l?.tipo === "image")
                                    .map((l: any, i: number) => (
                                      <CommentImageThumb
                                        key={`img-${i}`}
                                        storagePath={l.url}
                                        nome={l.titulo}
                                        onOpen={(u) => setLightboxUrl(u)}
                                      />
                                    ))}
                                </div>
                              )}
                              {c.links
                                .filter((l: any) => l?.tipo !== "image")
                                .map((l: any, i: number) => (
                                  <a
                                    key={`lnk-${i}`}
                                    href={l.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                                  >
                                    <LinkIcon className="h-3 w-3" />
                                    {l.titulo || l.url}
                                  </a>
                                ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {/* Composer fixo no rodapé */}
                <div className="shrink-0 border-t bg-background p-3 space-y-2">
                  <div className="relative">
                      <Textarea
                        value={comentarioInicial}
                        onChange={(e) => {
                          setComentarioInicial(e.target.value);
                          setComentarioCaret(e.target.selectionStart ?? e.target.value.length);
                        }}
                        onClick={(e) => setComentarioCaret(e.currentTarget.selectionStart ?? 0)}
                        onKeyUp={(e) => setComentarioCaret(e.currentTarget.selectionStart ?? 0)}
                        onPaste={(e) => {
                          const items = e.clipboardData?.items;
                          if (!items) return;
                          const files: File[] = [];
                          for (const item of Array.from(items)) {
                            if (item.kind === "file") {
                              const f = item.getAsFile();
                              if (f) {
                                const ext = f.type.split("/")[1] || "png";
                                const named =
                                  f.name && f.name !== "image.png"
                                    ? f
                                    : new File(
                                        [f],
                                        `colado-${Date.now()}.${ext}`,
                                        { type: f.type },
                                      );
                                files.push(named);
                              }
                            }
                          }
                          if (files.length) {
                            e.preventDefault();
                            setPastedImages((prev) => [...prev, ...files]);
                          }
                        }}
                        placeholder={isEditing ? "Adicionar comentário… (@ para mencionar)" : "Comentário inicial… (@ para mencionar)"}
                        className="min-h-20 resize-none text-sm"
                      />
                      {sugestoesMention.length > 0 && (
                        <div className="absolute left-0 right-0 bottom-full z-50 mb-1 overflow-hidden rounded-md border bg-popover shadow-lg">
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
                  {links.length > 0 && (
                    <div className="space-y-1">
                      {links.map((link, idx) => (
                        <div key={`${link.url}-${idx}`} className="flex items-center gap-2 rounded border bg-muted/30 px-2 py-1 text-xs">
                          <LinkIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{link.titulo}</span>
                          <button
                            type="button"
                            onClick={() => setLinks((p) => p.filter((_, i) => i !== idx))}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Remover link"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {pastedImages.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {pastedImages.map((f, idx) => (
                        <div
                          key={`${f.name}-${idx}`}
                          className="relative group h-16 w-16 rounded-md overflow-hidden border bg-muted"
                        >
                          {pastedPreviews[idx] && (
                            <img
                              src={pastedPreviews[idx]}
                              alt={f.name}
                              className="h-full w-full object-cover cursor-zoom-in"
                              onClick={() => setLightboxUrl(pastedPreviews[idx])}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setPastedImages((p) => p.filter((_, i) => i !== idx))
                            }
                            className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5 opacity-0 group-hover:opacity-100 transition"
                            aria-label="Remover imagem"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {comentarioPessoas.length > 0
                        ? `${comentarioPessoas.length} marcação(ões)`
                        : "@ para mencionar envolvidos"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {isEditing && (
                        <>
                          <input
                            id="anexo-comentario-input"
                            type="file"
                            multiple
                            hidden
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              if (files.length) void enviarArquivos(files);
                              e.currentTarget.value = "";
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            onClick={() =>
                              document
                                .getElementById("anexo-comentario-input")
                                ?.click()
                            }
                            title="Anexar arquivo"
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                            Anexar
                          </Button>
                        </>
                      )}
                    {isEditing ? (
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 gap-1.5"
                        disabled={
                          (!comentarioInicial.trim() && pastedImages.length === 0) ||
                          comentar.isPending ||
                          upload.isPending
                        }
                        onClick={async () => {
                          if (!tarefaId) return;
                          if (!comentarioInicial.trim() && pastedImages.length === 0) return;
                          try {
                            const imageLinks: { titulo: string; url: string; tipo?: string }[] = [];
                            for (const f of pastedImages) {
                              const path = await upload.mutateAsync({
                                tarefaId,
                                file: f,
                                nome: f.name,
                              });
                              imageLinks.push({ titulo: f.name, url: path, tipo: "image" });
                            }
                            await comentar.mutateAsync({
                              tarefaId,
                              conteudo: comentarioInicial.trim() || "(imagem)",
                              mencionados: comentarioPessoas,
                              links: [...links, ...imageLinks],
                            });
                            setComentarioInicial("");
                            setComentarioPessoas([]);
                            setComentarioCaret(0);
                            setLinks([]);
                            setPastedImages([]);
                          } catch {
                            /* toast no hook */
                          }
                        }}
                      >
                        <Send className="h-3.5 w-3.5" />
                        Enviar
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">
                        Será enviado ao criar a demanda
                      </span>
                    )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="atividades" className="mt-0 flex-1 min-h-0 overflow-y-auto px-3 py-2 data-[state=inactive]:hidden">
                <div className="space-y-2 text-xs">
                  {isEditing ? (
                    atividadesExistentes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Sem atividades registradas.
                      </p>
                    ) : (
                      atividadesExistentes.map((a) => (
                        <div
                          key={a.id}
                          className="rounded-md border bg-background p-3 text-xs shadow-sm"
                        >
                          <div className="font-medium">{a.resumo}</div>
                          <div className="mt-1 text-muted-foreground">
                            {a.autor_nome ?? "Usuário"} ·{" "}
                            {format(new Date(a.created_at), "dd/MM HH:mm")}
                          </div>
                        </div>
                      ))
                    )
                  ) : (
                    <>
                      <div className="rounded-md border bg-background p-3 shadow-sm">
                        <div className="font-medium">Demanda será criada</div>
                        <div className="mt-1 text-muted-foreground">
                          Título, descrição, checklist e prazo entram no histórico inicial.
                        </div>
                      </div>
                      <div className="rounded-md border bg-background p-3 shadow-sm">
                        <div className="font-medium">Pessoas</div>
                        <div className="mt-1 text-muted-foreground">
                          {pessoas.length
                            ? `${pessoas.length} pessoa(s) envolvida(s)`
                            : "Sem pessoas envolvidas"}
                          {comentarioPessoas.length
                            ? ` · ${comentarioPessoas.length} menção(ões)`
                            : ""}
                        </div>
                      </div>
                      <div className="rounded-md border bg-background p-3 shadow-sm">
                        <div className="font-medium">Organização</div>
                        <div className="mt-1 text-muted-foreground">
                          {tags.length ? `${tags.length} tag(s)` : "Sem tags"} ·{" "}
                          {links.length ? `${links.length} link(s)` : "Sem links"}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </aside>
        </div>

        <DialogFooter className="shrink-0 border-t bg-background px-5 py-3 sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            {isEditing && tarefaExistente ? (() => {
              // Fechamento simples: o responsável encerra a demanda.
              // Se não houver responsável, o criador faz o papel.
              // Os "finalizadores" extras (chips marcados) também podem confirmar,
              // mas NÃO são obrigatórios para o fechamento.
              const responsavelOuCriador =
                tarefaExistente.responsavel_id || tarefaExistente.created_by;
              const finalizadoresIds = responsavelOuCriador ? [responsavelOuCriador] : [];
              const extras = (tarefaExistente.finalizadores ?? [])
                .map((f) => f.user_id)
                .filter((id) => id && id !== responsavelOuCriador);
              const confirmadosSet = new Set(confirmacoes.map((c) => c.user_id));
              const total = finalizadoresIds.length;
              const feitas = finalizadoresIds.filter((id) => confirmadosSet.has(id)).length;
              const podeConfirmar =
                !!user?.id &&
                (finalizadoresIds.includes(user.id) || extras.includes(user.id));
              const jaConfirmou = !!user?.id && confirmadosSet.has(user.id);
              const jaConcluida = tarefaExistente.status === "concluida";
              if (!podeConfirmar && total > 0) {
                return (
                  <span className="text-[11px] text-muted-foreground">
                    Aguardando o responsável finalizar
                  </span>
                );
              }
              if (!podeConfirmar) return <span />;
              return (
                <>
                  <Button
                    type="button"
                    variant={jaConfirmou ? "outline" : "default"}
                    size="sm"
                    disabled={toggleConfirmacao.isPending || jaConcluida}
                    onClick={() =>
                      toggleConfirmacao.mutate({
                        tarefaId: tarefaExistente.id,
                        confirmar: !jaConfirmou,
                        finalizadoresIds,
                      })
                    }
                    className={cn("gap-1", jaConfirmou && "text-green-600 border-green-600/40")}
                    title={
                      jaConfirmou
                        ? "Você confirmou a conclusão. Clique para desfazer."
                        : "Confirmar finalização da demanda"
                    }
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {jaConfirmou ? "Você finalizou" : "Finalizar demanda"}
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    {jaConcluida ? "Concluída" : "Encerra ao confirmar"}
                  </span>
                </>
              );
            })() : <span />}
            {isEditing && tarefaExistente && isAdmin && tarefaExistente.status !== "concluida" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="gap-1"
                    disabled={atualizarStatus.isPending}
                    title="Encerrar tarefa (admin)"
                  >
                    <Lock className="h-4 w-4" />
                    Encerrar tarefa
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Encerrar esta tarefa?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação marca a tarefa como concluída imediatamente, sem esperar confirmações.
                      Apenas administradores podem realizar essa operação.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        atualizarStatus.mutate(
                          { id: tarefaExistente.id, status: "concluida" },
                          {
                            onSuccess: () => {
                              toast.success("Tarefa encerrada pelo administrador");
                            },
                          }
                        );
                      }}
                    >
                      Encerrar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {isEditing && tarefaExistente && isAdmin && tarefaExistente.status === "concluida" && (
              <span className="text-[11px] text-muted-foreground">
                Encerrada · apenas admin pode reabrir
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={submit}
              disabled={criar.isPending || atualizar.isPending || comentar.isPending}
              className="gap-1"
            >
              {isEditing ? (
                <>
                  <Save className="h-4 w-4" /> Salvar alterações
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Enviar demanda
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog
      open={!!lightboxUrl}
      onOpenChange={(o) => !o && setLightboxUrl(null)}
    >
      <DialogContent className="max-w-5xl p-2 bg-background">
        <DialogHeader className="sr-only">
          <DialogTitle>Visualizar imagem</DialogTitle>
        </DialogHeader>
        {lightboxUrl && (
          <img
            src={lightboxUrl}
            alt="Imagem"
            className="w-full max-h-[85vh] object-contain rounded"
          />
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

function CommentImageThumb({
  storagePath,
  nome,
  onOpen,
}: {
  storagePath: string;
  nome?: string;
  onOpen: (url: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancel = false;
    getDemandaAnexoSignedUrl(storagePath)
      .then((u) => {
        if (!cancel) setUrl(u);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [storagePath]);
  if (!url) {
    return (
      <div className="h-20 w-20 rounded border bg-muted animate-pulse" />
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(url)}
      className="h-20 w-20 rounded border overflow-hidden bg-muted hover:ring-2 hover:ring-primary/40 transition"
      title={nome || "Imagem"}
    >
      <img src={url} alt={nome || "Imagem"} className="h-full w-full object-cover" />
    </button>
  );
}
