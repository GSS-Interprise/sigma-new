import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  PhoneOff,
  Flame,
  CheckCircle2,
  Ban,
  Rocket,
  Sparkles,
  Search,
  Eye,
  Phone,
  Mail,
  MapPin,
  Stethoscope,
  ShieldOff,
} from "lucide-react";
import { LeadProntuarioDialog } from "@/components/medicos/LeadProntuarioDialog";
import { useLeadsPaginated, useLeadsFilterCounts, LEADS_PAGE_SIZE } from "@/hooks/useLeadsPaginated";
import { LeadsTablePagination } from "@/components/medicos/LeadsTablePagination";
import { formatPhoneForDisplay } from "@/lib/phoneUtils";

/**
 * Fase 4 — Rota /leads.
 *
 * Catálogo do universo médico (alvo: todos os médicos do Brasil via CFM).
 * Diferente de /medicos (kanban de conversão), aqui a operadora explora a
 * base inteira: filtra por UF/especialidade/status, vê funil agregado em
 * tempo real, e abre perfil completo de cada médico.
 *
 * KPIs do funil vêm de vw_leads_funil_stats (agregação no banco).
 * Lista usa useLeadsPaginated (server-side, mandatório com 270k+ leads).
 */

interface FunilStats {
  total: number;
  sem_telefone: number;
  opt_out: number;
  proibidos: number;
  convertidos: number;
  quentes: number;
  em_campanha: number;
  blacklist: number;
  novos_7d: number;
}

const UF_LIST = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

const STATUS_OPTIONS = [
  "Novo",
  "Qualificado",
  "Acompanhamento",
  "Em Resposta",
  "Proposta Enviada",
  "Proposta Aceita",
  "Convertido",
  "Descartado",
];

export default function Leads() {
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [ufFilter, setUfFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [especialidadeFilter, setEspecialidadeFilter] = useState<string | null>(null);
  const [prontuarioOpen, setProntuarioOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const { data: funilStats } = useQuery<FunilStats>({
    queryKey: ["leads-funil-stats"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("vw_leads_funil_stats")
        .select("*")
        .single();
      return data as FunilStats;
    },
    staleTime: 30_000,
  });

  const { data: filterCounts } = useLeadsFilterCounts();

  const { data: paginatedLeads, isLoading: leadsLoading } = useLeadsPaginated({
    page,
    searchTerm,
    statusFilter,
    origemFilter: null,
    ufFilter,
    cidadeFilter: null,
    especialidadeFilter,
    sortField: null,
    sortDirection: null,
    dataInicio: null,
    dataFim: null,
    anoFormaturaMin: null,
    enrichStatus: null,
  });

  const leads = paginatedLeads?.leads || [];
  const totalCount = paginatedLeads?.totalCount || 0;
  const totalPages = paginatedLeads?.totalPages || 0;

  const headerActions = (
    <div>
      <h1 className="text-2xl font-bold">Universo de Leads</h1>
      <p className="text-sm text-muted-foreground">
        Todos os médicos do Brasil — filtre, explore e acione
      </p>
    </div>
  );

  const handleAbrirPerfil = (leadId: string) => {
    setSelectedLeadId(leadId);
    setProntuarioOpen(true);
  };

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-4 space-y-4">
        {/* Funil KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KpiCard
            icon={Users}
            label="Total na base"
            value={funilStats?.total}
            color="primary"
            sublabel={
              funilStats?.novos_7d
                ? `+${funilStats.novos_7d.toLocaleString("pt-BR")} nos últimos 7d`
                : undefined
            }
          />
          <KpiCard
            icon={Rocket}
            label="Em campanha"
            value={funilStats?.em_campanha}
            color="indigo"
          />
          <KpiCard
            icon={Flame}
            label="Quentes (IA)"
            value={funilStats?.quentes}
            color="red"
          />
          <KpiCard
            icon={CheckCircle2}
            label="Convertidos"
            value={funilStats?.convertidos}
            color="emerald"
          />
          <KpiCard
            icon={PhoneOff}
            label="Sem WhatsApp"
            value={funilStats?.sem_telefone}
            color="amber"
            sublabel="Precisa enriquecer"
          />
          <KpiCard
            icon={Ban}
            label="Blacklist + opt-out"
            value={
              funilStats
                ? funilStats.blacklist + funilStats.opt_out + funilStats.proibidos
                : undefined
            }
            color="slate"
          />
        </div>

        {/* Filtros */}
        <Card className="p-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, CPF, telefone ou email"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(0);
                }}
                className="pl-9"
              />
            </div>

            <Select
              value={ufFilter ?? "__all"}
              onValueChange={(v) => {
                setUfFilter(v === "__all" ? null : v);
                setPage(0);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Estado (UF)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos os estados</SelectItem>
                {UF_LIST.map((uf) => (
                  <SelectItem key={uf} value={uf}>
                    {uf}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={especialidadeFilter ?? "__all"}
              onValueChange={(v) => {
                setEspecialidadeFilter(v === "__all" ? null : v);
                setPage(0);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Especialidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todas as especialidades</SelectItem>
                {filterCounts?.especialidades?.map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter ?? "__all"}
              onValueChange={(v) => {
                setStatusFilter(v === "__all" ? null : v);
                setPage(0);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Qualquer status</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(searchTerm || ufFilter || especialidadeFilter || statusFilter) && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t">
              <span className="text-xs text-muted-foreground">Ativos:</span>
              {searchTerm && (
                <FilterPill label={`Busca: ${searchTerm}`} onClear={() => setSearchTerm("")} />
              )}
              {ufFilter && (
                <FilterPill label={`UF: ${ufFilter}`} onClear={() => setUfFilter(null)} />
              )}
              {especialidadeFilter && (
                <FilterPill
                  label={`Esp: ${
                    filterCounts?.especialidades?.find((e: any) => e.id === especialidadeFilter)?.nome ??
                    especialidadeFilter
                  }`}
                  onClear={() => setEspecialidadeFilter(null)}
                />
              )}
              {statusFilter && (
                <FilterPill label={`Status: ${statusFilter}`} onClear={() => setStatusFilter(null)} />
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchTerm("");
                  setUfFilter(null);
                  setEspecialidadeFilter(null);
                  setStatusFilter(null);
                  setPage(0);
                }}
                className="ml-auto h-7"
              >
                Limpar todos
              </Button>
            </div>
          )}
        </Card>

        {/* Resultado */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b">
            <p className="text-sm text-muted-foreground">
              {leadsLoading
                ? "Carregando..."
                : `${totalCount.toLocaleString("pt-BR")} médico(s) encontrado(s)`}
            </p>
          </div>

          {leadsLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : leads.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Nenhum médico encontrado com esses filtros</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Especialidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead: any) => (
                  <TableRow key={lead.id} className="hover:bg-muted/40">
                    <TableCell>
                      <button
                        onClick={() => handleAbrirPerfil(lead.id)}
                        className="font-medium text-left hover:text-primary transition-colors flex items-center gap-1.5"
                      >
                        {lead.nome}
                        {lead.opt_out && (
                          <ShieldOff
                            className="h-3.5 w-3.5 text-red-600"
                            aria-label="Opt-out"
                          />
                        )}
                        {lead.classificacao === "proibido" && (
                          <Ban
                            className="h-3.5 w-3.5 text-red-700"
                            aria-label="Proibido"
                          />
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5 text-xs">
                        {lead.phone_e164 ? (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {formatPhoneForDisplay(lead.phone_e164)}
                          </span>
                        ) : (
                          <span className="text-amber-600 flex items-center gap-1">
                            <PhoneOff className="h-3 w-3" /> sem WhatsApp
                          </span>
                        )}
                        {lead.email && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {lead.email}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {(lead.cidade || lead.uf) ? (
                        <span className="text-sm flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          {[lead.cidade, lead.uf].filter(Boolean).join("/")}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.especialidade ? (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Stethoscope className="h-3 w-3" />
                          {lead.especialidade}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.status && <Badge variant="secondary">{lead.status}</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAbrirPerfil(lead.id)}
                      >
                        <Eye className="h-4 w-4 mr-1.5" />
                        Ver perfil
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {totalPages > 1 && (
            <div className="border-t p-3">
              <LeadsTablePagination
                currentPage={page}
                totalPages={totalPages}
                totalCount={totalCount}
                onPageChange={setPage}
              />
            </div>
          )}
        </Card>
      </div>

      <LeadProntuarioDialog
        open={prontuarioOpen}
        onOpenChange={setProntuarioOpen}
        leadId={selectedLeadId}
      />
    </AppLayout>
  );
}

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | undefined;
  color: "primary" | "indigo" | "red" | "emerald" | "amber" | "slate";
  sublabel?: string;
}

function KpiCard({ icon: Icon, label, value, color, sublabel }: KpiCardProps) {
  const colorMap: Record<KpiCardProps["color"], string> = {
    primary: "text-primary bg-primary/10",
    indigo: "text-indigo-700 bg-indigo-100",
    red: "text-red-700 bg-red-100",
    emerald: "text-emerald-700 bg-emerald-100",
    amber: "text-amber-700 bg-amber-100",
    slate: "text-slate-700 bg-slate-100",
  };

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums leading-tight">
            {value !== undefined ? value.toLocaleString("pt-BR") : "—"}
          </p>
          {sublabel && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</p>
          )}
        </div>
        <div className={`p-2 rounded-md ${colorMap[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

function FilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      {label}
      <button
        onClick={onClear}
        className="ml-0.5 rounded hover:bg-background/50 px-0.5"
        aria-label="Remover filtro"
      >
        ×
      </button>
    </Badge>
  );
}
