import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Webhook, Search, ChevronDown, Copy, Check, Save, Loader2,
  ArrowRightLeft, Mail, Phone, FileText, Users,
  Stethoscope, Calendar, Shield, GraduationCap, BarChart3,
  Circle, ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type HttpMethod = "POST" | "GET" | "PATCH" | "DELETE";

interface WebhookEntry {
  name: string;
  description: string;
  method: HttpMethod;
  endpoint: string;
  auth: string;
  jsonExample: Record<string, unknown>;
  /** Key in config_lista_items for configurable URL */
  configKey?: string;
  /** Key in supabase_config for configurable URL */
  supabaseConfigKey?: string;
  /** Label for the config field */
  configLabel?: string;
}

interface WebhookModule {
  module: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  webhooks: WebhookEntry[];
}

const WEBHOOK_MODULES: WebhookModule[] = [
  {
    module: "Captação / Leads",
    icon: Users,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    webhooks: [
      {
        name: "import-leads",
        description: "Importa leads/médicos vindos de sistemas externos (n8n). Cria ou atualiza registros.",
        method: "POST",
        endpoint: "/functions/v1/import-leads",
        auth: "Bearer <API_TOKEN>",
        jsonExample: {
          leads: [{ nome: "Dr. João Silva", telefone: "5511999999999", email: "joao@email.com", especialidade: "Cardiologia", crm: "123456", uf: "SP" }]
        },
      },
      {
        name: "enrich-lead",
        description: "Enriquece dados de um lead existente (nunca sobrescreve campos já preenchidos, exceto nome e CRM).",
        method: "PATCH",
        endpoint: "/functions/v1/enrich-lead",
        auth: "Bearer <API_TOKEN>",
        jsonExample: { medico_id: "uuid", crm: "123456", nome: "Dr. João", rqe: "7890", email: "joao@email.com", uf: "SP" },
      },
      {
        name: "query-leads-for-enrich",
        description: "Retorna leads pendentes de enriquecimento para processamento externo.",
        method: "GET",
        endpoint: "/functions/v1/query-leads-for-enrich",
        auth: "Bearer <API_TOKEN>",
        jsonExample: { _response: [{ id: "uuid", nome: "Dr. João", crm: "123456", uf: "SP", status: "pendente" }] },
      },
      {
        name: "get-pending-leads",
        description: "Retorna leads com status pendente para enriquecimento automático.",
        method: "GET",
        endpoint: "/functions/v1/get-pending-leads",
        auth: "Bearer <API_TOKEN>",
        jsonExample: { _response: [{ id: "uuid", nome: "Dr. Maria", crm: "654321", uf: "RJ" }] },
      },
    ],
  },
  {
    module: "Disparos (WhatsApp/Email)",
    icon: Phone,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    webhooks: [
      {
        name: "disparos-webhook",
        description: "Inicia, pausa ou retoma uma campanha de disparos. Envia contatos para n8n.",
        method: "POST",
        endpoint: "/functions/v1/disparos-webhook",
        auth: "Bearer (Supabase Auth)",
        configKey: "n8n_disparos_webhook_url",
        configLabel: "URL do Webhook n8n (Disparos)",
        jsonExample: { campanha_id: "uuid", acao: "iniciar", contatos: [{ lead_id: "uuid", nome: "Dr. João", telefone: "5511999999999" }], limite: 120 },
      },
      {
        name: "disparos-callback",
        description: "Callback do n8n → SIGMA. Atualiza status de envio dos contatos.",
        method: "POST",
        endpoint: "/functions/v1/disparos-callback",
        auth: "Bearer (Supabase Auth)",
        jsonExample: { updates: [{ contato_id: "uuid", status: "4-ENVIADO", tentativas: 1 }] },
      },
      {
        name: "send-whatsapp",
        description: "Envia mensagem via WhatsApp através da Evolution API.",
        method: "POST",
        endpoint: "/functions/v1/send-whatsapp",
        auth: "Bearer (Supabase Auth)",
        jsonExample: { instanceName: "chip-01", number: "5511999999999", text: "Olá, mensagem de teste" },
      },
      {
        name: "send-bulk-emails",
        description: "Envia e-mails em massa para contatos de uma campanha.",
        method: "POST",
        endpoint: "/functions/v1/send-bulk-emails",
        auth: "Bearer (Supabase Auth)",
        jsonExample: { campanha_id: "uuid", contatos: [{ email: "medico@email.com", nome: "Dr. João" }] },
      },
      {
        name: "email-status-callback",
        description: "Callback de status de envio de e-mail.",
        method: "POST",
        endpoint: "/functions/v1/email-status-callback",
        auth: "Sem autenticação",
        jsonExample: { success: true, emailto: "medico@email.com", id_envio: "uuid", status: "enviado" },
      },
      {
        name: "receive-disparo-email-reply",
        description: "Recebe respostas de e-mails enviados pela campanha.",
        method: "POST",
        endpoint: "/functions/v1/receive-disparo-email-reply",
        auth: "X-Webhook-Signature (HMAC)",
        jsonExample: { subject: "Re: Oportunidade", from: "medico@email.com", body: "Tenho interesse" },
      },
    ],
  },
  {
    module: "SigZap (WhatsApp CRM)",
    icon: ArrowRightLeft,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    webhooks: [
      {
        name: "receive-whatsapp-messages",
        description: "Recebe mensagens do WhatsApp via Evolution API ou n8n.",
        method: "POST",
        endpoint: "/functions/v1/receive-whatsapp-messages",
        auth: "Sem autenticação (webhook)",
        jsonExample: { instanceName: "chip-01", remoteJid: "5511999999999@s.whatsapp.net", pushName: "João", message: { conversation: "Olá" }, fromMe: false },
      },
      {
        name: "receive-whatsapp-events",
        description: "Recebe eventos do WhatsApp (status, conexão, etc).",
        method: "POST",
        endpoint: "/functions/v1/receive-whatsapp-events",
        auth: "Sem autenticação (webhook)",
        jsonExample: { event: "messages.update", instance: "chip-01", data: { status: "READ", messageId: "msg-123" } },
      },
      {
        name: "send-sigzap-message",
        description: "Envia mensagem pelo SigZap via Evolution API.",
        method: "POST",
        endpoint: "/functions/v1/send-sigzap-message",
        auth: "Bearer (Supabase Auth)",
        jsonExample: { instance_name: "chip-01", remote_jid: "5511999999999@s.whatsapp.net", message: "Olá" },
      },
      {
        name: "evolution-api-proxy",
        description: "Proxy para a Evolution API (createInstance, checkIsOnWhatsapp, setWebhook, etc).",
        method: "POST",
        endpoint: "/functions/v1/evolution-api-proxy",
        auth: "Bearer (Supabase Auth)",
        jsonExample: { action: "checkIsOnWhatsapp", instanceName: "chip-01", data: { numbers: ["5511999999999"] } },
      },
    ],
  },
  {
    module: "Escalas / Dr. Escala",
    icon: Calendar,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    webhooks: [
      {
        name: "escalas-api",
        description: "API de importação de escalas de sistemas externos.",
        method: "POST",
        endpoint: "/functions/v1/escalas-api",
        auth: "x-api-token: <API_TOKEN>",
        jsonExample: { escalas: [{ id_externo: "ext-001", profissional_nome: "Dr. João", setor: "UTI", data_escala: "2025-04-01", hora_inicio: "07:00", hora_fim: "19:00" }] },
      },
      {
        name: "drescala-sync",
        description: "Sincroniza plantões do Dr. Escala para o SIGMA.",
        method: "POST",
        endpoint: "/functions/v1/drescala-sync",
        auth: "Bearer (Supabase Auth)",
        jsonExample: { mes: 4, ano: 2025, forcar_atualizacao: false },
      },
      {
        name: "drescala-bi",
        description: "Proxy para API de BI do Dr. Escala (locais-setores, plantões).",
        method: "GET",
        endpoint: "/functions/v1/drescala-bi?action=locais-setores",
        auth: "Bearer (Supabase Auth)",
        jsonExample: { _response: { locais: [{ id: "1", nome: "Hospital Central" }], setores: [{ id: "1", nome: "UTI" }] } },
      },
    ],
  },
  {
    module: "Licitações",
    icon: FileText,
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
    webhooks: [
      {
        name: "webhook-proxy",
        description: "Proxy de webhook para licitações. Envia arquivos de editais para n8n.",
        method: "POST",
        endpoint: "/functions/v1/webhook-proxy",
        auth: "Bearer (Supabase Auth)",
        supabaseConfigKey: "licitacao_webhook_url",
        configLabel: "URL do Webhook (Licitações - Editais)",
        jsonExample: { licitacao_id: "uuid", files: [{ bucket_name: "licitacoes", file_path: "editais/arquivo.pdf", file_name: "edital.pdf" }] },
      },
      {
        name: "sync-effect-licitacoes",
        description: "Sincroniza dados de licitações de fontes externas.",
        method: "POST",
        endpoint: "/functions/v1/sync-effect-licitacoes",
        auth: "Bearer (Supabase Auth)",
        jsonExample: { fonte: "portal_transparencia", filtros: { uf: "SP", data_inicio: "2025-01-01" } },
      },
    ],
  },
  {
    module: "Suporte / Tickets",
    icon: Mail,
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
    webhooks: [
      {
        name: "send-support-email",
        description: "Envia e-mail de notificação de ticket de suporte.",
        method: "POST",
        endpoint: "/functions/v1/send-support-email",
        auth: "Bearer (Supabase Auth)",
        jsonExample: { ticketId: "uuid", tipo: "abertura", destinatario_email: "suporte@empresa.com", titulo: "Problema no sistema" },
      },
      {
        name: "notify-ticket-comment",
        description: "Notifica solicitante por e-mail ao adicionar comentário.",
        method: "POST",
        endpoint: "/functions/v1/notify-ticket-comment",
        auth: "Bearer (Supabase Auth)",
        jsonExample: { ticketId: "uuid", comentario: "Seu problema foi resolvido", solicitante_email: "usuario@empresa.com" },
      },
      {
        name: "receive-support-email-reply",
        description: "Recebe respostas de e-mail de tickets e adiciona como comentário.",
        method: "POST",
        endpoint: "/functions/v1/receive-support-email-reply",
        auth: "X-Webhook-Signature (HMAC)",
        jsonExample: { subject: "Re: [Ticket #123]", from: "usuario@empresa.com", body: "Obrigado, resolvido!" },
      },
    ],
  },
  {
    module: "Radiologia",
    icon: Stethoscope,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    webhooks: [
      {
        name: "notify-radiologia-pendencia",
        description: "Notifica sobre pendência de laudo radiológico.",
        method: "POST",
        endpoint: "/functions/v1/notify-radiologia-pendencia",
        auth: "Bearer (Supabase Auth)",
        jsonExample: { pendenciaId: "uuid", medico_nome: "Dr. João", tipo_exame: "Raio-X Tórax" },
      },
    ],
  },
  {
    module: "Contratos / Kanban",
    icon: FileText,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    webhooks: [
      {
        name: "send-contract-email",
        description: "Envia e-mail relacionado a contratos.",
        method: "POST",
        endpoint: "/functions/v1/send-contract-email",
        auth: "Bearer (Supabase Auth)",
        jsonExample: { contrato_id: "uuid", tipo: "proposta", destinatario: "cliente@empresa.com" },
      },
      {
        name: "notify-kanban-ativo",
        description: "Notifica sobre movimentação no Kanban de captação.",
        method: "POST",
        endpoint: "/functions/v1/notify-kanban-ativo",
        auth: "Bearer (Supabase Auth)",
        jsonExample: { card_id: "uuid", novo_status: "arrematado", titulo: "PE/07/2026" },
      },
      {
        name: "process-email-reply-to-kanban",
        description: "Processa respostas de e-mail e vincula ao card.",
        method: "POST",
        endpoint: "/functions/v1/process-email-reply-to-kanban",
        auth: "X-Webhook-Signature (HMAC)",
        jsonExample: { subject: "Re: Proposta contrato", from: "medico@email.com", body: "Aceito" },
      },
    ],
  },
  {
    module: "IA / Processamento",
    icon: BarChart3,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    webhooks: [
      {
        name: "revisar-mensagem",
        description: "Revisa mensagem de campanha usando IA.",
        method: "POST",
        endpoint: "/functions/v1/revisar-mensagem",
        auth: "Bearer (Supabase Auth)",
        jsonExample: { mensagem: "Ola doutor, temos uma vaga", contexto: "Captação de médicos" },
      },
      {
        name: "ia-resposta-medico",
        description: "Gera resposta automática via IA para mensagens de médicos.",
        method: "POST",
        endpoint: "/functions/v1/ia-resposta-medico",
        auth: "Bearer (Supabase Auth)",
        jsonExample: { mensagem_medico: "Quais plantões disponíveis?", contexto_conversa: "Cardiologista de SP" },
      },
      {
        name: "parse-medico-data",
        description: "Extrai dados estruturados de texto sobre médico usando IA.",
        method: "POST",
        endpoint: "/functions/v1/parse-medico-data",
        auth: "Bearer (Supabase Auth)",
        jsonExample: { texto: "Dr. João Silva, CRM 123456 SP, Cardiologista" },
      },
      {
        name: "parse-folha-ponto",
        description: "Processa folha de ponto e extrai dados de horas.",
        method: "POST",
        endpoint: "/functions/v1/parse-folha-ponto",
        auth: "Bearer (Supabase Auth)",
        jsonExample: { arquivo_url: "https://storage.../folha.pdf", profissional_id: "uuid", mes: 3, ano: 2025 },
      },
    ],
  },
  {
    module: "Administração",
    icon: Shield,
    color: "text-gray-500",
    bgColor: "bg-gray-500/10",
    webhooks: [
      {
        name: "manage-user-roles",
        description: "Gerencia papéis (roles) de usuários.",
        method: "POST",
        endpoint: "/functions/v1/manage-user-roles",
        auth: "Bearer (Supabase Auth)",
        jsonExample: { action: "assign", user_id: "uuid", role: "admin" },
      },
      {
        name: "reset-user-password",
        description: "Envia e-mail de reset de senha.",
        method: "POST",
        endpoint: "/functions/v1/reset-user-password",
        auth: "Bearer (Supabase Auth)",
        jsonExample: { user_id: "uuid", email: "usuario@empresa.com" },
      },
      {
        name: "check-document-expiry",
        description: "Verifica documentos próximos do vencimento.",
        method: "POST",
        endpoint: "/functions/v1/check-document-expiry",
        auth: "Bearer (Supabase Auth) / pg_cron",
        jsonExample: { dias_antecedencia: 30 },
      },
    ],
  },
  {
    module: "Residentes",
    icon: GraduationCap,
    color: "text-teal-500",
    bgColor: "bg-teal-500/10",
    webhooks: [
      {
        name: "(A configurar)",
        description: "Webhook para receber dados de residentes médicos via filtros.",
        method: "POST",
        endpoint: "/functions/v1/residentes-webhook",
        auth: "A definir",
        configKey: "residentes_webhook_url",
        configLabel: "URL do Webhook (Residentes)",
        jsonExample: { campos: "1", referencia: 2, especialidade: "CARDIOLOGIA" },
      },
    ],
  },
];

const METHOD_COLORS: Record<HttpMethod, string> = {
  POST: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  GET: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  PATCH: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  DELETE: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
};

// Collect all configKeys and supabaseConfigKeys
const ALL_CONFIG_KEYS = WEBHOOK_MODULES.flatMap(m =>
  m.webhooks.filter(w => w.configKey).map(w => w.configKey!)
);
const ALL_SUPABASE_CONFIG_KEYS = WEBHOOK_MODULES.flatMap(m =>
  m.webhooks.filter(w => w.supabaseConfigKey).map(w => w.supabaseConfigKey!)
);

export function WebhookCentralTab() {
  const [busca, setBusca] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openModules, setOpenModules] = useState<Set<string>>(new Set());
  const [configUrls, setConfigUrls] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Load config_lista_items URLs
  const { data: configItems } = useQuery({
    queryKey: ["webhook-central-config-items"],
    queryFn: async () => {
      if (ALL_CONFIG_KEYS.length === 0) return [];
      const { data, error } = await supabase
        .from("config_lista_items")
        .select("*")
        .in("campo_nome", ALL_CONFIG_KEYS);
      if (error) throw error;
      return data || [];
    },
  });

  // Load supabase_config URLs
  const { data: supabaseConfigItems } = useQuery({
    queryKey: ["webhook-central-supabase-config"],
    queryFn: async () => {
      if (ALL_SUPABASE_CONFIG_KEYS.length === 0) return [];
      const { data, error } = await supabase
        .from("supabase_config" as any)
        .select("*")
        .in("chave", ALL_SUPABASE_CONFIG_KEYS);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  // Sync loaded values into local state
  useEffect(() => {
    const urls: Record<string, string> = {};
    configItems?.forEach((item: any) => { urls[item.campo_nome] = item.valor; });
    supabaseConfigItems?.forEach((item: any) => { urls[item.chave] = item.valor; });
    setConfigUrls(prev => ({ ...prev, ...urls }));
  }, [configItems, supabaseConfigItems]);

  const saveConfigUrl = async (key: string, isSupabaseConfig: boolean) => {
    setSavingKey(key);
    const valor = configUrls[key] || "";
    try {
      if (isSupabaseConfig) {
        const { data: existing } = await supabase
          .from("supabase_config" as any)
          .select("id")
          .eq("chave", key)
          .maybeSingle();
        if (existing) {
          await supabase.from("supabase_config" as any).update({ valor }).eq("chave", key);
        } else {
          await supabase.from("supabase_config" as any).insert({ chave: key, valor });
        }
        queryClient.invalidateQueries({ queryKey: ["webhook-central-supabase-config"] });
      } else {
        const existing = configItems?.find((i: any) => i.campo_nome === key);
        if (existing) {
          await supabase.from("config_lista_items").update({ valor }).eq("id", existing.id);
        } else {
          await supabase.from("config_lista_items").insert({ campo_nome: key, valor });
        }
        queryClient.invalidateQueries({ queryKey: ["webhook-central-config-items"] });
        // Also invalidate the specific page query so it syncs
        if (key === "n8n_disparos_webhook_url") {
          queryClient.invalidateQueries({ queryKey: ["disparos-n8n-webhook-config"] });
        }
      }
      toast.success("URL salva com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSavingKey(null);
    }
  };

  const toggleModule = (mod: string) => {
    setOpenModules(prev => {
      const next = new Set(prev);
      next.has(mod) ? next.delete(mod) : next.add(mod);
      return next;
    });
  };

  const copyJson = (id: string, json: Record<string, unknown>) => {
    navigator.clipboard.writeText(JSON.stringify(json, null, 2));
    setCopiedId(id);
    toast.success("JSON copiado!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyEndpoint = (endpoint: string) => {
    const baseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    navigator.clipboard.writeText(`${baseUrl}${endpoint}`);
    toast.success("URL completa copiada!");
  };

  const filteredModules = WEBHOOK_MODULES.map(mod => ({
    ...mod,
    webhooks: mod.webhooks.filter(wh =>
      !busca ||
      wh.name.toLowerCase().includes(busca.toLowerCase()) ||
      wh.description.toLowerCase().includes(busca.toLowerCase()) ||
      mod.module.toLowerCase().includes(busca.toLowerCase())
    ),
  })).filter(mod => mod.webhooks.length > 0);

  const totalWebhooks = WEBHOOK_MODULES.reduce((s, m) => s + m.webhooks.length, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Webhook className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Central de Webhooks</h2>
            <p className="text-xs text-muted-foreground">
              {totalWebhooks} endpoints • {WEBHOOK_MODULES.length} módulos • Configurações sincronizadas com as páginas
            </p>
          </div>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar webhook, módulo..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9 h-9 rounded-lg"
          />
        </div>
      </div>

      {/* Modules */}
      <ScrollArea className="h-[calc(100vh-280px)]">
        <div className="space-y-4 pr-2">
          {filteredModules.map((mod) => {
            const ModIcon = mod.icon;
            const isOpen = openModules.has(mod.module);
            return (
              <Collapsible key={mod.module} open={isOpen} onOpenChange={() => toggleModule(mod.module)}>
                <Card className="overflow-hidden border-border/50 shadow-sm">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors py-3 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-1.5 rounded-lg ${mod.bgColor}`}>
                            <ModIcon className={`h-4 w-4 ${mod.color}`} />
                          </div>
                          <CardTitle className="text-sm font-semibold">{mod.module}</CardTitle>
                          <Badge variant="secondary" className="text-[10px] h-5 font-medium">
                            {mod.webhooks.length}
                          </Badge>
                        </div>
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="p-0">
                      {mod.webhooks.map((wh, idx) => {
                        const whId = `${mod.module}-${idx}`;
                        const configKey = wh.configKey || wh.supabaseConfigKey;
                        const isSupabaseConfig = !!wh.supabaseConfigKey;
                        const currentUrl = configKey ? (configUrls[configKey] || "") : "";
                        const isConfigured = !!currentUrl;

                        return (
                          <div
                            key={idx}
                            className={`relative border-t border-border/30 ${idx % 2 === 0 ? "bg-background" : "bg-muted/10"}`}
                          >
                            {/* Left accent bar */}
                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                              wh.method === "POST" ? "bg-green-500" :
                              wh.method === "GET" ? "bg-blue-500" :
                              wh.method === "PATCH" ? "bg-amber-500" : "bg-red-500"
                            }`} />

                            <div className="pl-5 pr-4 py-4 space-y-3">
                              {/* Header row */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                  <Badge className={`${METHOD_COLORS[wh.method]} border text-[10px] font-bold px-2 py-0.5 rounded-md`}>
                                    {wh.method}
                                  </Badge>
                                  <code className="text-sm font-bold text-foreground">{wh.name}</code>
                                  {configKey && (
                                    <Badge variant={isConfigured ? "default" : "destructive"} className="text-[9px] h-4 px-1.5">
                                      {isConfigured ? "Configurado" : "Não configurado"}
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-[10px] text-muted-foreground font-mono">#{idx + 1}</span>
                              </div>

                              {/* Description */}
                              <p className="text-xs text-muted-foreground leading-relaxed">{wh.description}</p>

                              {/* Info grid */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div className="flex items-center gap-2 text-[11px]">
                                  <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="text-muted-foreground font-medium shrink-0">Endpoint:</span>
                                  <code
                                    className="bg-muted/50 px-2 py-0.5 rounded font-mono truncate cursor-pointer hover:bg-muted/80 transition-colors"
                                    onClick={() => copyEndpoint(wh.endpoint)}
                                    title="Clique para copiar URL completa"
                                  >
                                    {wh.endpoint}
                                  </code>
                                </div>
                                <div className="flex items-center gap-2 text-[11px]">
                                  <Shield className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="text-muted-foreground font-medium shrink-0">Auth:</span>
                                  <code className="bg-muted/50 px-2 py-0.5 rounded truncate">{wh.auth}</code>
                                </div>
                              </div>

                              {/* Configurable URL */}
                              {configKey && (
                                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Circle className={`h-2 w-2 ${isConfigured ? "fill-green-500 text-green-500" : "fill-red-500 text-red-500"}`} />
                                    <span className="text-xs font-medium">{wh.configLabel || "URL do Webhook"}</span>
                                  </div>
                                  <div className="flex gap-2">
                                    <Input
                                      value={currentUrl}
                                      onChange={e => setConfigUrls(prev => ({ ...prev, [configKey]: e.target.value }))}
                                      placeholder="https://seu-n8n.com/webhook/..."
                                      className="h-8 text-xs font-mono bg-background"
                                    />
                                    <Button
                                      size="sm"
                                      className="h-8 gap-1.5 px-3"
                                      disabled={savingKey === configKey}
                                      onClick={() => saveConfigUrl(configKey, isSupabaseConfig)}
                                    >
                                      {savingKey === configKey ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Save className="h-3 w-3" />
                                      )}
                                      <span className="text-xs">Salvar</span>
                                    </Button>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground">
                                    Alterações aqui são refletidas automaticamente na página do módulo.
                                  </p>
                                </div>
                              )}

                              {/* JSON Example - collapsible */}
                              <Collapsible>
                                <CollapsibleTrigger asChild>
                                  <div className="flex items-center justify-between cursor-pointer group">
                                    <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                                      {wh.jsonExample._response ? "▸ Exemplo de Response" : "▸ Exemplo de Payload"}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-[10px] gap-1"
                                      onClick={(e) => { e.stopPropagation(); copyJson(whId, wh.jsonExample); }}
                                    >
                                      {copiedId === whId ? (
                                        <><Check className="h-3 w-3" /> Copiado</>
                                      ) : (
                                        <><Copy className="h-3 w-3" /> Copiar</>
                                      )}
                                    </Button>
                                  </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <pre className="mt-2 bg-muted/30 border border-border/30 rounded-lg p-3 text-[11px] font-mono text-foreground overflow-x-auto leading-relaxed max-h-[200px]">
                                    {JSON.stringify(wh.jsonExample, null, 2)}
                                  </pre>
                                </CollapsibleContent>
                              </Collapsible>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
