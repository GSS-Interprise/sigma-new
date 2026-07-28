import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

interface OfficialTemplate {
  id: string;
  content_sid: string;
  friendly_name: string;
  language: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION" | null;
  content_type: string;
  body: string | null;
  variables: Record<string, string>;
  approval_status: string;
  rejection_reason: string | null;
  updated_at: string;
}

type StatusFilter = "all" | "approved" | "review" | "draft" | "rejected";

const STATUS: Record<string, { label: string; className: string; help: string }> = {
  approved: {
    label: "Aprovado",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    help: "Pronto para uso em campanhas oficiais.",
  },
  pending: {
    label: "Em análise",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    help: "Aguardando decisão da Meta.",
  },
  received: {
    label: "Em análise",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    help: "Recebido pela Meta e aguardando análise.",
  },
  rejected: {
    label: "Rejeitado",
    className: "border-red-200 bg-red-50 text-red-700",
    help: "Precisa ser corrigido antes de uma nova submissão.",
  },
  unsubmitted: {
    label: "Rascunho",
    className: "border-slate-200 bg-slate-50 text-slate-700",
    help: "Ainda não foi enviado para aprovação.",
  },
};

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "approved", label: "Aprovados" },
  { value: "review", label: "Em análise" },
  { value: "draft", label: "Rascunhos" },
  { value: "rejected", label: "Rejeitados" },
];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Erro inesperado");
}

function matchesFilter(template: OfficialTemplate, filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "review") return ["pending", "received"].includes(template.approval_status);
  if (filter === "draft") return template.approval_status === "unsubmitted";
  return template.approval_status === filter;
}

function TemplatePhonePreview({ template }: { template: OfficialTemplate }) {
  const renderedBody = useMemo(() => {
    let result = template.body || "Conteúdo rico. Os elementos interativos serão exibidos aqui.";
    for (const [key, value] of Object.entries(template.variables || {})) {
      result = result.replaceAll(`{{${key}}}`, value || `{{${key}}}`);
    }
    return result;
  }, [template]);

  return (
    <div className="mx-auto w-full max-w-[330px] rounded-[2rem] border-[6px] border-slate-800 bg-[#efeae2] p-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2 rounded-t-[1.3rem] bg-[#075e54] px-3 py-2 text-white">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Contato do WhatsApp</p>
          <p className="text-[11px] text-white/75">mensagem oficial</p>
        </div>
      </div>
      <div className="min-h-48 rounded-lg bg-[#d9fdd3] p-3 text-sm leading-relaxed text-slate-800 shadow-sm">
        <p className="whitespace-pre-wrap break-words">{renderedBody}</p>
        <p className="mt-2 text-right text-[10px] text-slate-500">10:30 ✓✓</p>
      </div>
    </div>
  );
}

export default function WhatsAppTemplates() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<OfficialTemplate | null>(null);
  const [submitTemplate, setSubmitTemplate] = useState<OfficialTemplate | null>(null);
  const [submitCategory, setSubmitCategory] = useState<"UTILITY" | "MARKETING">("MARKETING");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [body, setBody] = useState(
    "Olá, Dr(a). {{1}}. Temos uma oportunidade para {{2}} em {{3}}. Posso compartilhar os detalhes?",
  );
  const [samples, setSamples] = useState<Record<string, string>>({
    "1": "Marina",
    "2": "Pediatria",
    "3": "Chapecó/SC",
  });

  const variableKeys = useMemo(() => {
    const found = Array.from(body.matchAll(/\{\{(\d+)\}\}/g), (match) => match[1]);
    return [...new Set(found)].sort((a, b) => Number(a) - Number(b));
  }, [body]);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["whatsapp-official-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_official_templates" as never)
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as OfficialTemplate[];
    },
  });

  const counts = useMemo(
    () => ({
      all: templates.length,
      approved: templates.filter((item) => item.approval_status === "approved").length,
      review: templates.filter((item) => ["pending", "received"].includes(item.approval_status)).length,
      draft: templates.filter((item) => item.approval_status === "unsubmitted").length,
      rejected: templates.filter((item) => item.approval_status === "rejected").length,
    }),
    [templates],
  );

  const filteredTemplates = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    return templates.filter((template) => {
      const matchesSearch =
        !normalizedSearch ||
        template.friendly_name.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
        template.body?.toLocaleLowerCase("pt-BR").includes(normalizedSearch);
      return matchesSearch && matchesFilter(template, filter);
    });
  }, [filter, search, templates]);

  const invoke = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke("twilio-content-templates", { body: payload });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Falha na integração com a Twilio");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-official-templates"] }),
    onError: (error) => toast.error(errorMessage(error)),
  });

  async function syncTemplates() {
    await invoke.mutateAsync({ action: "sync" });
    toast.success("Templates sincronizados com a Twilio");
  }

  async function createTemplate() {
    if (!name.trim() || !body.trim()) return toast.error("Preencha o nome e a mensagem");
    const sequential = variableKeys.every((key, index) => Number(key) === index + 1);
    if (!sequential) return toast.error("As variáveis devem ser sequenciais: {{1}}, {{2}}, {{3}}");
    const variables = Object.fromEntries(variableKeys.map((key) => [key, samples[key] || `exemplo_${key}`]));
    await invoke.mutateAsync({
      action: "create",
      friendly_name: name.trim(),
      language: "pt_BR",
      body: body.trim(),
      variables,
    });
    setCreateOpen(false);
    setName("");
    toast.success("Rascunho criado na Twilio");
  }

  async function submitForApproval() {
    if (!submitTemplate) return;
    await invoke.mutateAsync({
      action: "submit",
      content_sid: submitTemplate.content_sid,
      name: submitTemplate.friendly_name,
      category: submitCategory,
    });
    setSubmitTemplate(null);
    toast.success("Template enviado para aprovação do WhatsApp");
  }

  return (
    <AppLayout>
      <main className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
              <FileText className="h-6 w-6 shrink-0 text-primary" />
              Templates WhatsApp oficial
            </h1>
            <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
              Crie, submeta e acompanhe templates oficiais sem sair do Sigma.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 xs:grid-cols-2 sm:flex">
            <Button variant="outline" className="min-h-11" onClick={syncTemplates} disabled={invoke.isPending}>
              <RefreshCw className={`mr-2 h-4 w-4 ${invoke.isPending ? "animate-spin" : ""}`} />
              Sincronizar
            </Button>
            <Button className="min-h-11" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo template
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Aprovados</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{counts.approved}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Em análise</p>
              <p className="mt-1 text-2xl font-bold text-amber-700">{counts.review}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Rascunhos</p>
              <p className="mt-1 text-2xl font-bold">{counts.draft}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Rejeitados</p>
              <p className="mt-1 text-2xl font-bold text-red-700">{counts.rejected}</p>
            </CardContent>
          </Card>
        </section>

        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Primeira abordagem de prospecção é <strong>Marketing</strong>. Use <strong>Utility</strong> somente
            quando o médico já possui uma solicitação, cadastro ou atendimento em andamento.
          </p>
        </div>

        <section className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <Tabs value={filter} onValueChange={(value) => setFilter(value as StatusFilter)}>
                <TabsList className="h-auto w-max">
                  {FILTERS.map((item) => (
                    <TabsTrigger key={item.value} value={item.value} className="min-h-10 gap-1.5">
                      {item.label}
                      <span className="rounded-full bg-background/80 px-1.5 text-[11px]">{counts[item.value]}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            <div className="relative w-full lg:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome ou conteúdo"
                className="min-h-11 pl-9"
              />
            </div>
          </div>

          {isLoading ? (
            <p className="py-12 text-center text-muted-foreground">Carregando templates...</p>
          ) : filteredTemplates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhum template encontrado neste filtro.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {filteredTemplates.map((template) => {
                const meta = STATUS[template.approval_status] || STATUS.unsubmitted;
                return (
                  <Card key={template.id} className="overflow-hidden">
                    <CardContent className="space-y-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-semibold">{template.friendly_name}</h2>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {template.language} · {template.category || "Sem categoria"}
                          </p>
                        </div>
                        <Badge variant="outline" className={`shrink-0 ${meta.className}`}>
                          {meta.label}
                        </Badge>
                      </div>

                      <p className="line-clamp-4 whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
                        {template.body || "Conteúdo rico. Abra a prévia para visualizar os elementos."}
                      </p>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {template.approval_status === "approved" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                        {["pending", "received"].includes(template.approval_status) && <Clock3 className="h-4 w-4 text-amber-600" />}
                        {template.approval_status === "rejected" && <XCircle className="h-4 w-4 text-red-600" />}
                        <span>{meta.help}</span>
                      </div>

                      {template.rejection_reason && (
                        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                          <strong>Motivo da rejeição:</strong> {template.rejection_reason}
                        </div>
                      )}

                      <div className="flex flex-col gap-2 xs:flex-row">
                        <Button
                          variant="outline"
                          className="min-h-11 flex-1"
                          onClick={() => setSelectedTemplate(template)}
                        >
                          Visualizar
                        </Button>
                        {template.approval_status === "unsubmitted" && (
                          <Button
                            className="min-h-11 flex-1"
                            onClick={() => {
                              setSubmitTemplate(template);
                              setSubmitCategory("MARKETING");
                            }}
                          >
                            <Send className="mr-2 h-4 w-4" />
                            Enviar para aprovação
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <Dialog open={!!selectedTemplate} onOpenChange={(open) => !open && setSelectedTemplate(null)}>
        <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedTemplate?.friendly_name}</DialogTitle>
            <DialogDescription>
              Prévia com os valores de exemplo cadastrados no template.
            </DialogDescription>
          </DialogHeader>
          {selectedTemplate && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_330px]">
              <div className="space-y-4">
                <div>
                  <Label>Status da aprovação</Label>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={(STATUS[selectedTemplate.approval_status] || STATUS.unsubmitted).className}
                    >
                      {(STATUS[selectedTemplate.approval_status] || STATUS.unsubmitted).label}
                    </Badge>
                    {selectedTemplate.category && <Badge variant="secondary">{selectedTemplate.category}</Badge>}
                  </div>
                </div>
                <div>
                  <Label>Variáveis de exemplo</Label>
                  <div className="mt-2 space-y-2">
                    {Object.entries(selectedTemplate.variables || {}).length === 0 ? (
                      <p className="text-sm text-muted-foreground">Este template não possui variáveis.</p>
                    ) : (
                      Object.entries(selectedTemplate.variables || {}).map(([key, value]) => (
                        <div key={key} className="flex gap-2 rounded-md border p-2 text-sm">
                          <code className="shrink-0 text-primary">{`{{${key}}}`}</code>
                          <span className="break-words">{value}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <Label>Identificador Twilio</Label>
                  <code className="mt-2 block break-all rounded-md bg-muted p-2 text-xs">
                    {selectedTemplate.content_sid}
                  </code>
                </div>
              </div>
              <TemplatePhonePreview template={selectedTemplate} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setSelectedTemplate(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo template oficial</DialogTitle>
            <DialogDescription>
              O template é criado como rascunho. O envio para a Meta é uma ação separada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="template-name">Nome interno</Label>
              <Input
                id="template-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="oportunidade_pediatria_sc"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="template-body">Mensagem</Label>
              <Textarea id="template-body" rows={7} value={body} onChange={(event) => setBody(event.target.value)} />
              <p className="text-xs text-muted-foreground">
                Use variáveis sequenciais: {"{{1}}"}, {"{{2}}"}, {"{{3}}"}.
              </p>
            </div>
            {variableKeys.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {variableKeys.map((key) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`sample-${key}`}>Exemplo para {`{{${key}}}`}</Label>
                    <Input
                      id={`sample-${key}`}
                      value={samples[key] || ""}
                      onChange={(event) => setSamples((current) => ({ ...current, [key]: event.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button className="min-h-11" onClick={createTemplate} disabled={invoke.isPending}>
              Criar rascunho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!submitTemplate} onOpenChange={(open) => !open && setSubmitTemplate(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar para aprovação</DialogTitle>
            <DialogDescription>
              A categoria é avaliada pela Meta e não deve ser escolhida apenas pelo tom do texto.
            </DialogDescription>
          </DialogHeader>
          <Select
            value={submitCategory}
            onValueChange={(value) => setSubmitCategory(value as "UTILITY" | "MARKETING")}
          >
            <SelectTrigger className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MARKETING">Marketing — primeira abordagem/prospecção</SelectItem>
              <SelectItem value="UTILITY">Utility — atendimento ou relação existente</SelectItem>
            </SelectContent>
          </Select>
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            {submitCategory === "MARKETING" ? (
              <span className="flex gap-2">
                <Clock3 className="h-4 w-4 shrink-0" />
                Indicado para apresentar oportunidades a novos contatos.
              </span>
            ) : (
              <span className="flex gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                Use somente para atualização solicitada ou atendimento em andamento.
              </span>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setSubmitTemplate(null)}>
              Cancelar
            </Button>
            <Button className="min-h-11" onClick={submitForApproval} disabled={invoke.isPending}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Confirmar envio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
