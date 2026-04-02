import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle, CheckCircle2, Clock, RefreshCw, TrendingUp,
  Users, AlertCircle, Play, ChevronDown, ChevronRight, UserPlus,
  GitMerge, Layers, Search, X,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, parseISO, subHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 25;

// ─── Types ───────────────────────────────────────────────────────────────────
interface QueueStats {
  pending: number;
  processing: number;
  resolved: number;
  abandoned: number;
  oldestPending: string | null;
}

interface HourlyLead { hora: string; total: number }

interface QueuePayload {
  nome?: string;
  cpf?: string;
  cidade?: string;
  uf?: string;
  telefones?: string[];
  phone?: string;
  emails?: string[];
  email?: string;
  crm?: string;
  rqe?: string;
  data_nascimento?: string;
  source?: string;
  especialidades_crua?: string;
  endereco?: string;
  [key: string]: unknown;
}

interface FailureItem {
  id: string;
  status: string;
  error_message: string | null;
  abandonment_reason: string | null;
  attempts: number;
  created_at: string;
  next_retry_at: string | null;
  payload: QueuePayload | null;
  lead_id: string | null;
}

interface LeadSearchResult {
  id: string;
  nome: string;
  cpf: string | null;
  phone_e164: string | null;
  especialidade: string | null;
  status: string;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getQueueHealth(s: QueueStats): "ok" | "alerta" | "critico" {
  if (!s.pending) return "ok";
  if (!s.oldestPending) return "alerta";
  const ageMs = Date.now() - new Date(s.oldestPending).getTime();
  return ageMs > 2 * 3600_000 ? "critico" : "alerta";
}

const HEALTH = {
  ok:      { label: "Operacional", color: "text-green-600",     bg: "bg-green-50 border-green-200",    Icon: CheckCircle2 },
  alerta:  { label: "Atenção",     color: "text-yellow-600",    bg: "bg-yellow-50 border-yellow-200",  Icon: AlertTriangle },
  critico: { label: "Crítico",     color: "text-destructive",   bg: "bg-red-50 border-red-200",        Icon: AlertCircle },
};

const STATUS_CLS: Record<string, string> = {
  pending:    "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  resolved:   "bg-green-100 text-green-800",
  abandoned:  "bg-red-100 text-red-800",
};

function parseDateBR(dateStr: string): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function normalizePhone(p: string) {
  const d = String(p).replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) return d;
  if (d.length === 12 && d.startsWith("55")) return d;
  if (d.length === 11) return "55" + d;
  if (d.length === 10) return "55" + d;
  return null;
}

function getPageNumbers(currentPage: number, totalPages: number): (number | "ellipsis")[] {
  const pages: (number | "ellipsis")[] = [];
  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) pages.push(i);
    return pages;
  }
  pages.push(0);
  if (currentPage > 2) pages.push("ellipsis");
  const start = Math.max(1, currentPage - 1);
  const end = Math.min(totalPages - 2, currentPage + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (currentPage < totalPages - 3) pages.push("ellipsis");
  pages.push(totalPages - 1);
  return pages;
}

// ─── FetchByNamePanel ─────────────────────────────────────────────────────────
function FetchByNamePanel() {
  const [nameInput, setNameInput] = useState("");
  const [submitted, setSubmitted] = useState("");

  const { data: results, isFetching, refetch } = useQuery<LeadSearchResult[]>({
    queryKey: ["import-monitor-name-search", submitted],
    queryFn: async () => {
      if (!submitted.trim()) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, cpf, phone_e164, especialidade, status, created_at")
        .ilike("nome", submitted.trim())
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as LeadSearchResult[];
    },
    enabled: !!submitted.trim(),
  });

  const handleSearch = useCallback(() => {
    const term = nameInput.trim();
    if (!term) return;
    setSubmitted(term);
  }, [nameInput]);

  const handleClear = () => {
    setNameInput("");
    setSubmitted("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4" />
          Buscar lead por nome idêntico
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">
          Busca exata (case-insensitive) no CRM — útil para verificar duplicatas antes de criar ou mesclar
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Nome exato do lead, ex: João da Silva"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="max-w-sm"
          />
          <Button size="sm" onClick={handleSearch} disabled={isFetching || !nameInput.trim()}>
            {isFetching ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Buscar
          </Button>
          {submitted && (
            <Button size="sm" variant="ghost" onClick={handleClear}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {submitted && !isFetching && (
          <div>
            {!results?.length ? (
              <p className="text-sm text-muted-foreground">Nenhum lead encontrado com o nome exato <span className="font-medium">"{submitted}"</span>.</p>
            ) : (
              <div className="overflow-x-auto">
                <p className="text-xs text-muted-foreground mb-2">{results.length} resultado(s) para <span className="font-medium">"{submitted}"</span></p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nome</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">CPF</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Telefone</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Especialidade</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Criado em</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((lead) => (
                      <tr key={lead.id} className="border-b hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium">{lead.nome}</td>
                        <td className="px-3 py-2 text-muted-foreground">{lead.cpf ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{lead.phone_e164 ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{lead.especialidade ?? "—"}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                            {lead.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-xs">
                          {format(parseISO(lead.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground font-mono">{lead.id.slice(0, 8)}…</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── PayloadRow ───────────────────────────────────────────────────────────────
function PayloadRow({ item, onDone }: { item: FailureItem; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [existingLeadId, setExistingLeadId] = useState<string | null | undefined>(undefined);
  const queryClient = useQueryClient();

  const p = item.payload ?? {};
  const cpf = (p.cpf as string | undefined) ?? "";
  const cpfClean = cpf.replace(/\D/g, "");

  async function checkExisting() {
    if (!cpfClean || existingLeadId !== undefined) return;
    const cpfFmt = cpfClean.length === 11
      ? `${cpfClean.slice(0,3)}.${cpfClean.slice(3,6)}.${cpfClean.slice(6,9)}-${cpfClean.slice(9,11)}`
      : null;
    const variants = [...new Set([cpf, cpfClean, cpfFmt].filter(Boolean))];
    const orFilter = variants.map(v => `cpf.eq.${v}`).join(",");
    const { data } = await supabase
      .from("leads")
      .select("id")
      .or(orFilter)
      .limit(1)
      .maybeSingle();
    setExistingLeadId(data?.id ?? null);
  }

  const mergeLead = useMutation({
    mutationFn: async () => {
      let targetId = existingLeadId;
      if (!targetId && cpfClean) {
        const cpfFmt = cpfClean.length === 11
          ? `${cpfClean.slice(0,3)}.${cpfClean.slice(3,6)}.${cpfClean.slice(6,9)}-${cpfClean.slice(9,11)}`
          : null;
        const variants = [...new Set([cpf, cpfClean, cpfFmt].filter(Boolean))];
        const orFilter = variants.map(v => `cpf.eq.${v}`).join(",");
        const { data: found } = await supabase
          .from("leads")
          .select("id, phone_e164, telefones_adicionais, tags, observacoes")
          .or(orFilter)
          .limit(1)
          .maybeSingle();
        targetId = found?.id ?? null;
        setExistingLeadId(targetId);
      }
      if (!targetId) throw new Error("Lead não encontrado no CRM para mesclar");

      const { data: current } = await supabase
        .from("leads")
        .select("id, phone_e164, telefones_adicionais, tags, observacoes")
        .eq("id", targetId)
        .single();

      const rawPhones: string[] = [
        ...(Array.isArray(p.telefones) ? p.telefones as string[] : []),
        ...(p.phone ? [p.phone as string] : []),
      ];
      const phonesE164 = rawPhones.map(normalizePhone).filter(Boolean) as string[];

      const existingAdicionais: string[] = current?.telefones_adicionais ?? [];
      const existingDigits = new Set([
        ...(current?.phone_e164 ? [current.phone_e164.replace(/\D/g, "")] : []),
        ...existingAdicionais.map(t => t.replace(/\D/g, "")),
      ]);
      const novosAdicionais = phonesE164.filter(t => !existingDigits.has(t.replace(/\D/g, "")));

      const existingTags: string[] = current?.tags ?? [];
      const payloadTags: string[] = Array.isArray(p.tags) ? p.tags as string[] : [];
      const mergedTags = payloadTags.length > 0 ? [...new Set([...existingTags, ...payloadTags])] : undefined;

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (p.cidade)          patch.cidade = p.cidade;
      if (p.uf)              patch.uf = (p.uf as string).toUpperCase().substring(0, 2);
      if (p.endereco)        patch.endereco = p.endereco;
      if (p.crm)             patch.crm = p.crm;
      if (p.rqe)             patch.rqe = p.rqe;
      if (p.data_nascimento) patch.data_nascimento = parseDateBR(p.data_nascimento as string) ?? p.data_nascimento;
      if (p.source)          patch.origem = p.source;
      if (p.especialidades_crua && !p.rqe) patch.rqe = p.especialidades_crua;
      if (mergedTags)        patch.tags = mergedTags;
      if (novosAdicionais.length > 0) patch.telefones_adicionais = [...existingAdicionais, ...novosAdicionais];
      const payloadEmail = (p.email as string | undefined) ??
        (Array.isArray(p.emails) && (p.emails as string[]).length > 0 ? (p.emails as string[])[0] : undefined);
      if (payloadEmail && !current?.phone_e164) patch.email = payloadEmail;

      const { data: updated, error: updateError } = await supabase
        .from("leads")
        .update(patch)
        .eq("id", targetId)
        .select("id, nome")
        .single();
      if (updateError) throw updateError;

      await supabase
        .from("import_leads_failed_queue")
        .update({ status: "resolved", resolved_at: new Date().toISOString(), lead_id: targetId })
        .eq("id", item.id);

      return updated;
    },
    onSuccess: (data) => {
      toast.success(`Mesclado: ${data?.nome ?? "Lead atualizado"}`);
      queryClient.invalidateQueries({ queryKey: ["import-monitor-failures"] });
      queryClient.invalidateQueries({ queryKey: ["import-monitor-queue-stats"] });
      onDone();
    },
    onError: (e: Error) => toast.error(`Erro no merge: ${e.message}`),
  });

  const createLead = useMutation({
    mutationFn: async () => {
      const nome = ((p.nome ?? "") as string).trim();
      if (!nome) throw new Error("Payload sem nome");

      const rawPhones: string[] = [
        ...(Array.isArray(p.telefones) ? p.telefones as string[] : []),
        ...(p.phone ? [p.phone as string] : []),
      ];
      const phonesE164 = rawPhones.map(normalizePhone).filter(Boolean) as string[];
      const primaryPhone = phonesE164[0] ?? null;
      const email =
        (p.email as string | undefined) ??
        (Array.isArray(p.emails) && p.emails.length > 0 ? (p.emails as string[])[0] : null) ??
        null;

      const { data: newLead, error } = await supabase
        .from("leads")
        .insert({
          nome,
          cpf: cpf || null,
          cidade: (p.cidade as string | undefined) ?? null,
          uf: (p.uf as string | undefined)?.toUpperCase().substring(0, 2) ?? null,
          email,
          origem: (p.source as string | undefined) ?? null,
          status: "Novo",
          phone_e164: primaryPhone,
          telefones_adicionais: phonesE164.length > 1 ? phonesE164.slice(1) : null,
          crm: (p.crm as string | undefined) ?? null,
          rqe: (p.rqe as string | undefined) ?? null,
          data_nascimento: (p.data_nascimento as string | undefined) ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      await supabase
        .from("import_leads_failed_queue")
        .update({ status: "resolved", resolved_at: new Date().toISOString(), lead_id: newLead.id })
        .eq("id", item.id);

      return newLead.id;
    },
    onSuccess: () => {
      toast.success("Lead criado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["import-monitor-failures"] });
      queryClient.invalidateQueries({ queryKey: ["import-monitor-queue-stats"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alreadyResolved = item.status === "resolved";
  const isPending = mergeLead.isPending || createLead.isPending;

  return (
    <>
      <tr
        className="border-b hover:bg-muted/20 transition-colors cursor-pointer"
        onClick={() => { setOpen((v) => !v); checkExisting(); }}
      >
        <td className="px-4 py-2">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </td>
        <td className="px-4 py-2">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLS[item.status] ?? "bg-muted text-muted-foreground"}`}>
            {item.status}
          </span>
        </td>
        <td className="px-4 py-2 max-w-[180px] truncate text-sm font-medium">
          {(p.nome as string | undefined) ?? "—"}
        </td>
        <td className="px-4 py-2 text-muted-foreground max-w-[180px] truncate text-sm">
          {item.abandonment_reason ?? item.error_message ?? "—"}
        </td>
        <td className="px-4 py-2 text-center text-sm">{item.attempts}</td>
        <td className="px-4 py-2 whitespace-nowrap text-sm">
          {format(parseISO(item.created_at), "dd/MM HH:mm", { locale: ptBR })}
        </td>
        <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
          {existingLeadId ? (
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs gap-1"
              onClick={() => mergeLead.mutate()}
              disabled={isPending || alreadyResolved}
            >
              {mergeLead.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <GitMerge className="h-3 w-3" />}
              Mesclar
            </Button>
          ) : existingLeadId === null ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => createLead.mutate()}
              disabled={isPending || alreadyResolved}
            >
              {createLead.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
              Criar Lead
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1 text-muted-foreground"
              onClick={() => { checkExisting(); mergeLead.mutate(); }}
              disabled={isPending || alreadyResolved}
            >
              {isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Processar
            </Button>
          )}
        </td>
      </tr>

      {open && (
        <tr className="bg-muted/10 border-b">
          <td colSpan={7} className="px-6 py-3">
            {existingLeadId && (
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-accent text-accent-foreground text-xs px-2 py-0.5 font-medium border border-border">
                  <CheckCircle2 className="h-3 w-3" /> Já existe no CRM
                </span>
                <span className="text-xs text-muted-foreground">ID: {existingLeadId}</span>
              </div>
            )}
            {existingLeadId === null && (
              <div className="mb-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground text-xs px-2 py-0.5 font-medium border border-border">
                  <AlertTriangle className="h-3 w-3" /> Novo lead — não encontrado no CRM
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-1 text-xs">
              {[
                ["Nome", p.nome],
                ["CPF", p.cpf],
                ["Cidade", p.cidade],
                ["UF", p.uf],
                ["Telefones", Array.isArray(p.telefones) ? (p.telefones as string[]).join(" / ") : p.phone],
                ["E-mail", Array.isArray(p.emails) ? (p.emails as string[])[0] : p.email],
                ["CRM", p.crm],
                ["RQE", p.rqe],
                ["Nascimento", p.data_nascimento],
                ["Origem", p.source],
                ["Especialidade", p.especialidades_crua],
                ["Endereço", p.endereco],
              ].filter(([, v]) => v).map(([label, value]) => (
                <div key={label as string}>
                  <span className="text-muted-foreground">{label}: </span>
                  <span className="font-medium break-words">{value as string}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function ImportMonitorTab() {
  const queryClient = useQueryClient();
  const [failuresPage, setFailuresPage] = useState(0);

  const { data: leadCounts } = useQuery({
    queryKey: ["import-monitor-lead-counts"],
    queryFn: async () => {
      const [r24, r48] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString()),
        supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString()),
      ]);
      return { last24h: r24.count ?? 0, last48h: r48.count ?? 0 };
    },
    refetchInterval: 60_000,
  });

  const { data: queueStats } = useQuery<QueueStats>({
    queryKey: ["import-monitor-queue-stats"],
    queryFn: async () => {
      const [counts, oldest] = await Promise.all([
        supabase.from("import_leads_failed_queue").select("status"),
        supabase.from("import_leads_failed_queue").select("created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(1).maybeSingle(),
      ]);
      const tally = (counts.data ?? []).reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {});
      return {
        pending:    tally["pending"]    ?? 0,
        processing: tally["processing"] ?? 0,
        resolved:   tally["resolved"]   ?? 0,
        abandoned:  tally["abandoned"]  ?? 0,
        oldestPending: oldest.data?.created_at ?? null,
      };
    },
    refetchInterval: 30_000,
  });

  const { data: hourlyData } = useQuery<HourlyLead[]>({
    queryKey: ["import-monitor-hourly"],
    queryFn: async () => {
      const since = new Date(Date.now() - 48 * 3600_000).toISOString();
      const { data } = await supabase.from("leads").select("created_at").gte("created_at", since).order("created_at", { ascending: true });
      if (!data) return [];
      const map: Record<string, number> = {};
      data.forEach(({ created_at }) => {
        const h = format(parseISO(created_at), "yyyy-MM-dd'T'HH:00:00");
        map[h] = (map[h] ?? 0) + 1;
      });
      return Array.from({ length: 48 }, (_, i) => {
        const d = subHours(new Date(), 47 - i);
        const key = format(d, "yyyy-MM-dd'T'HH:00:00");
        return { hora: format(d, "HH'h'", { locale: ptBR }), total: map[key] ?? 0 };
      });
    },
    refetchInterval: 60_000,
  });

  // Paginated failures query — server-side
  const { data: failuresData, isLoading: loadingFailures } = useQuery<{ items: FailureItem[]; totalCount: number }>({
    queryKey: ["import-monitor-failures", failuresPage],
    queryFn: async () => {
      const from = failuresPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await supabase
        .from("import_leads_failed_queue")
        .select("id, status, error_message, abandonment_reason, attempts, created_at, next_retry_at, payload, lead_id", { count: "exact" })
        .neq("status", "resolved")
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { items: (data ?? []) as FailureItem[], totalCount: count ?? 0 };
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });

  const failures = failuresData?.items ?? [];
  const totalFailures = failuresData?.totalCount ?? 0;
  const totalPages = Math.ceil(totalFailures / PAGE_SIZE);

  // Force process queue
  const forceProcess = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("process-failed-leads-queue", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Processamento: ${data?.results?.resolved ?? 0} resolvidos, ${data?.results?.failed ?? 0} falhas, ${data?.results?.abandoned ?? 0} abandonados`);
      queryClient.invalidateQueries({ queryKey: ["import-monitor-queue-stats"] });
      queryClient.invalidateQueries({ queryKey: ["import-monitor-failures"] });
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  // Batch resolve pending whose CPF already exists
  const batchResolveCrm = useMutation({
    mutationFn: async () => {
      // We need ALL pending items with CPF, not just current page — fetch them separately
      const { data: allPending } = await supabase
        .from("import_leads_failed_queue")
        .select("id, payload")
        .eq("status", "pending")
        .not("payload->cpf", "is", null);

      const pending = (allPending ?? []).filter(f => (f.payload as QueuePayload)?.cpf);
      if (!pending.length) return 0;

      const cpfMap: Record<string, string> = {};
      pending.forEach(item => {
        const raw = ((item.payload as QueuePayload)?.cpf as string) ?? "";
        const clean = raw.replace(/\D/g, "");
        const fmt = clean.length === 11
          ? `${clean.slice(0,3)}.${clean.slice(3,6)}.${clean.slice(6,9)}-${clean.slice(9,11)}`
          : null;
        [raw, clean, fmt].filter(Boolean).forEach(v => { cpfMap[v!] = item.id; });
      });

      const uniqueCpfs = Object.keys(cpfMap);
      if (!uniqueCpfs.length) return 0;

      const foundIds = new Set<string>();
      const chunkSize = 200;
      for (let i = 0; i < uniqueCpfs.length; i += chunkSize) {
        const chunk = uniqueCpfs.slice(i, i + chunkSize);
        const orFilter = chunk.map(v => `cpf.eq.${v}`).join(",");
        const { data } = await supabase
          .from("leads")
          .select("cpf")
          .or(orFilter);
        (data ?? []).forEach(row => {
          const c = row.cpf ?? "";
          const cl = c.replace(/\D/g, "");
          if (cpfMap[c])  foundIds.add(cpfMap[c]);
          if (cpfMap[cl]) foundIds.add(cpfMap[cl]);
        });
      }

      if (!foundIds.size) return 0;

      const now = new Date().toISOString();
      const ids = Array.from(foundIds);
      const chunkDb = 100;
      let resolved = 0;
      for (let i = 0; i < ids.length; i += chunkDb) {
        const chunk = ids.slice(i, i + chunkDb);
        const { error } = await supabase
          .from("import_leads_failed_queue")
          .update({ status: "resolved", resolved_at: now })
          .in("id", chunk);
        if (!error) resolved += chunk.length;
      }
      return resolved;
    },
    onSuccess: (count) => {
      if (count === 0) {
        toast.info("Nenhum item com CPF já existente no CRM encontrado.");
      } else {
        toast.success(`${count} itens marcados como resolvidos (lead já existe no CRM)`);
      }
      queryClient.invalidateQueries({ queryKey: ["import-monitor-queue-stats"] });
      queryClient.invalidateQueries({ queryKey: ["import-monitor-failures"] });
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const health = queueStats ? getQueueHealth(queueStats) : "ok";
  const hCfg = HEALTH[health];

  return (
    <div className="space-y-6">
      {/* Alert banner */}
      {health !== "ok" && !!queueStats?.pending && (
        <div className={`flex items-start gap-3 rounded-lg border p-4 shrink-0 ${hCfg.bg}`}>
          <hCfg.Icon className={`h-5 w-5 mt-0.5 shrink-0 ${hCfg.color}`} />
          <div className="flex-1">
            <p className={`font-semibold ${hCfg.color}`}>
              Fila parada — {queueStats.pending.toLocaleString("pt-BR")} itens pendentes sem processamento
            </p>
            {queueStats.oldestPending && (
              <p className="text-sm text-muted-foreground mt-0.5">
                Item mais antigo: {format(parseISO(queueStats.oldestPending), "dd/MM/yyyy HH:mm", { locale: ptBR })} UTC
              </p>
            )}
          </div>
          <Button size="sm" variant="outline" className={`${hCfg.color} border-current`} onClick={() => forceProcess.mutate()} disabled={forceProcess.isPending}>
            <Play className="h-3.5 w-3.5 mr-1" />
            Forçar
          </Button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Users className="h-4 w-4" /> Leads 24h</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{leadCounts?.last24h.toLocaleString("pt-BR") ?? "—"}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Leads 48h</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{leadCounts?.last48h.toLocaleString("pt-BR") ?? "—"}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4" /> Fila pendente</CardTitle></CardHeader>
          <CardContent><p className={`text-3xl font-bold ${queueStats && queueStats.pending > 0 ? "text-yellow-600" : ""}`}>{queueStats?.pending.toLocaleString("pt-BR") ?? "—"}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><hCfg.Icon className="h-4 w-4" /> Status da fila</CardTitle></CardHeader>
          <CardContent><span className={`text-lg font-semibold ${hCfg.color}`}>{hCfg.label}</span></CardContent>
        </Card>
      </div>

      {/* Breakdown + action buttons */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        {([
          { label: "Processando", value: queueStats?.processing, cls: "text-blue-600" },
          { label: "Resolvidos",  value: queueStats?.resolved,   cls: "text-green-600" },
          { label: "Abandonados", value: queueStats?.abandoned,  cls: "text-destructive" },
        ] as const).map(({ label, value, cls }) => (
          <div key={label} className="rounded-md border bg-card px-4 py-3 flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className={`font-bold text-lg ${cls}`}>{(value ?? 0).toLocaleString("pt-BR")}</span>
          </div>
        ))}
        <div className="rounded-md border bg-card px-4 py-3 flex justify-between items-center gap-2">
          <span className="text-xs text-muted-foreground leading-tight">Forçar fila</span>
          <Button size="sm" onClick={() => forceProcess.mutate()} disabled={forceProcess.isPending}>
            {forceProcess.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Chart */}
      <Card className="shrink-0">
        <CardHeader><CardTitle className="text-base">Leads inseridos por hora (últimas 48h)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourlyData ?? []} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="hora" tick={{ fontSize: 11 }} interval={3} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [v.toLocaleString("pt-BR"), "Leads"]} />
              <Bar dataKey="total" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Fetch by exact name */}
      <FetchByNamePanel />

      {/* Failure table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap shrink-0">
          <div>
            <CardTitle className="text-base">Fila de falhas</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Expanda uma linha para ver payload · <span className="font-medium text-primary">Mesclar</span> = lead já no CRM · <span className="font-medium text-muted-foreground">Criar</span> = lead novo
              {totalFailures > 0 && (
                <span className="ml-2 font-medium">· {totalFailures.toLocaleString("pt-BR")} itens totais</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => batchResolveCrm.mutate()}
              disabled={batchResolveCrm.isPending || totalFailures === 0}
              title="Marca como resolvidos todos os itens da fila cujo CPF já existe no CRM"
            >
              {batchResolveCrm.isPending
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <Layers className="h-3.5 w-3.5" />}
              Resolver já no CRM
            </Button>
            <Button size="sm" variant="ghost" onClick={() => queryClient.invalidateQueries({ queryKey: ["import-monitor-failures"] })}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingFailures ? (
            <p className="p-6 text-center text-muted-foreground text-sm">Carregando...</p>
          ) : !failures.length ? (
            <p className="p-6 text-center text-muted-foreground text-sm">Nenhum item na fila 🎉</p>
          ) : (
            <>
              <div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 sticky top-0 z-10">
                      <th className="w-8 px-4 py-2" />
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Nome</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Motivo</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Tent.</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Criado em</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failures.map((item) => (
                      <PayloadRow
                        key={item.id}
                        item={item}
                        onDone={() => queryClient.invalidateQueries({ queryKey: ["import-monitor-failures"] })}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Exibindo {failuresPage * PAGE_SIZE + 1}–{Math.min((failuresPage + 1) * PAGE_SIZE, totalFailures)} de {totalFailures.toLocaleString("pt-BR")}
                  </p>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(e) => { e.preventDefault(); if (failuresPage > 0) setFailuresPage(p => p - 1); }}
                          className={failuresPage === 0 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {getPageNumbers(failuresPage, totalPages).map((page, idx) => (
                        <PaginationItem key={idx}>
                          {page === "ellipsis" ? (
                            <PaginationEllipsis />
                          ) : (
                            <PaginationLink
                              href="#"
                              onClick={(e) => { e.preventDefault(); setFailuresPage(page); }}
                              isActive={failuresPage === page}
                              className="cursor-pointer"
                            >
                              {page + 1}
                            </PaginationLink>
                          )}
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(e) => { e.preventDefault(); if (failuresPage < totalPages - 1) setFailuresPage(p => p + 1); }}
                          className={failuresPage >= totalPages - 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
