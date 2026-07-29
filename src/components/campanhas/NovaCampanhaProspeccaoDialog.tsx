import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Rocket, MapPin, Stethoscope, Smartphone, Brain, Settings2, Zap, ClipboardList, Eye, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PreviewLeadsCampanhaModal } from "./PreviewLeadsCampanhaModal";
import { type JanelaHorario } from "./JanelaHorarioConfig";
import { CadenciaConfig } from "./CadenciaConfig";
import type { CadenciaPasso } from "@/hooks/useCadencia";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useChipsEmUso } from "@/hooks/useChipsEmUso";
import {
  OfficialTemplateVariablesConfig,
  type OfficialTemplateBindings,
} from "./OfficialTemplateVariablesConfig";

const UF_LIST = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** F2.9 — Lead pré-selecionado vindo do perfil 360. Após criar campanha, INSERT direto em campanha_leads pra incluir esse lead manualmente. */
  preLead?: { id: string; nome: string } | null;
  /** WS-C — chamado com o id da campanha recém-criada, pra conduzir o usuário a adicionar leads (campanha nasce vazia). */
  onCreated?: (campanhaId: string) => void;
}

// Sentinela do picker de especialidades: não é uuid — ao criar, vira
// campanhas.sem_especialidade=true e sai do array especialidade_ids.
const GENERALISTA_ID = "GENERALISTA";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erro inesperado";
}

export function NovaCampanhaProspeccaoDialog({ open, onOpenChange, preLead, onCreated }: Props) {
  const [tab, setTab] = useState("basico");
  const [nome, setNome] = useState("");
  const [especialidadeIds, setEspecialidadeIds] = useState<string[]>([]);
  const [regiaoEstados, setRegiaoEstados] = useState<string[]>([]);
  // derivado: primeira UF, pra retrocompat (briefing/insert legados usam single)
  const regiaoEstado = regiaoEstados[0] || "";
  // Filtros do pool (13/07) — cidade já era suportada no backend (regiao_cidades),
  // mas o wizard nunca expunha. As demais são novas (filtro_tem_email/idade/origem).
  const [regiaoCidades, setRegiaoCidades] = useState<string[]>([]);
  const [buscaCidade, setBuscaCidade] = useState("");
  const [filtroTemEmail, setFiltroTemEmail] = useState(false);
  const [idadeMin, setIdadeMin] = useState("");
  const [idadeMax, setIdadeMax] = useState("");
  const [filtroOrigem, setFiltroOrigem] = useState("");
  const [chipIds, setChipIds] = useState<string[]>([]);
  const [whatsappProvider, setWhatsappProvider] = useState<"evolution" | "twilio">("evolution");
  const [officialTemplateId, setOfficialTemplateId] = useState<string | null>(null);
  const [officialSenderId, setOfficialSenderId] = useState<string | null>(null);
  const [officialTemplateVariables, setOfficialTemplateVariables] = useState<OfficialTemplateBindings>({});
  const [rotationStrategy, setRotationStrategy] = useState("round_robin");
  const [batchSize, setBatchSize] = useState(10);
  const [delayMinMs, setDelayMinMs] = useState(8);
  const [delayMaxMs, setDelayMaxMs] = useState(25);
  const [delayBatchMin, setDelayBatchMin] = useState(5);
  const [delayBatchMax, setDelayBatchMax] = useState(10);
  // WS2: janela de disparo (default 07-17h dias úteis)
  const [janela, setJanela] = useState<JanelaHorario>({ ativo: true, inicio: 7, fim: 17, dias: [1, 2, 3, 4, 5] });
  const [mensagemInicial, setMensagemInicial] = useState("");
  const [cadenciaAtiva, setCadenciaAtiva] = useState(true);
  // F2.2: tipo de envio (default IA pra manter comportamento atual)
  const [tipoEnvio, setTipoEnvio] = useState<"ia" | "manual">("ia");
  // WS-A: cadência de tarefas parametrizável (só usada quando tipo_envio = manual)
  const [cadenciaTemplateId, setCadenciaTemplateId] = useState<string | null>(null);
  const [cadenciaPassos, setCadenciaPassos] = useState<CadenciaPasso[]>([]);
  // Briefing IA — campos estruturados (anti-burro)
  const [bNomeServico, setBNomeServico] = useState(""); // Ex: "Plantão UTI Pediátrica"
  const [bHospital, setBHospital] = useState(""); // Ex: "Hospital Regional do Oeste"
  const [bCidade, setBCidade] = useState(""); // Ex: "Chapecó / SC"
  // WS5 — locais adicionais (multi-local): além do hospital/cidade principal. A IA menciona todos.
  const [bLocaisExtras, setBLocaisExtras] = useState<Array<{ hospital: string; cidade: string }>>([]);
  const [bTipoServico, setBTipoServico] = useState(""); // plantao_12h, plantao_24h, rotineiro, producao
  const [bRequisitos, setBRequisitos] = useState(""); // Ex: "RQE em Pediatria ou experiência UTI"
  const [bEstrutura, setBEstrutura] = useState(""); // Ex: "10 leitos, suporte de especialidades"
  const [bContratacao, setBContratacao] = useState("PJ"); // PJ, CLT, Cooperativa
  const [bValorMin, setBValorMin] = useState(""); // Ex: "1200"
  const [bValorMax, setBValorMax] = useState(""); // Ex: "1800"
  const [bValorPor, setBValorPor] = useState("plantão 12h"); // plantão 12h, plantão 24h, hora, mês
  const [bBeneficios, setBBeneficios] = useState<string[]>([]); // Hospedagem, Alimentação, Passagem, etc.
  const [bHandoffNome, setBHandoffNome] = useState(""); // Ex: "Ester"
  const [bHandoffTelefone, setBHandoffTelefone] = useState(""); // Ex: "554799514821"
  const [responsavelId, setResponsavelId] = useState<string | null>(null);
  const [bObjecao1, setBObjecao1] = useState("");
  const [bResposta1, setBResposta1] = useState("");
  const [bObjecao2, setBObjecao2] = useState("");
  const [bResposta2, setBResposta2] = useState("");
  const [bInfoExtra, setBInfoExtra] = useState(""); // Algo mais que a IA precisa saber?
  // Novos campos ricos (opcionais, melhoram muito a qualidade da IA)
  const [bInicioServico, setBInicioServico] = useState(""); // "01/05/2026"
  const [bPagamento, setBPagamento] = useState(""); // "Último dia do mês subsequente"
  const [bCidadeInfo, setBCidadeInfo] = useState(""); // Contexto da cidade
  const [bLinkVideo, setBLinkVideo] = useState(""); // URL do vídeo
  const [bHandoffFrase, setBHandoffFrase] = useState(""); // Frase do handoff
  const [bHandoffGatilhos, setBHandoffGatilhos] = useState(""); // Regras explícitas de quando acionar handoff
  const [bPalavrasProibidas, setBPalavrasProibidas] = useState(""); // Termos que a IA não pode usar
  const [briefingSourceId, setBriefingSourceId] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [excludedLeadIds, setExcludedLeadIds] = useState<Set<string>>(new Set());
  // Identidade do remetente — arquitetura templates-email-por-campanha.md.
  // Aplicado em todos os templates que tem {{nome_remetente}}, {{whatsapp_remetente}},
  // {{descricao_oportunidade}} (passos de WhatsApp reforço D+2 e Email D+3).
  const [nomeRemetente, setNomeRemetente] = useState("Equipe GSS");
  const [whatsappRemetente, setWhatsappRemetente] = useState("");
  const [descricaoOportunidade, setDescricaoOportunidade] = useState("");
  const qc = useQueryClient();
  // Pedido Bruna (08/06): bloqueia no seletor os chips já usados por outra campanha ativa.
  const { data: chipsEmUso } = useChipsEmUso();

  const { data: especialidades = [] } = useQuery({
    queryKey: ["especialidades-lista-com-count"],
    queryFn: async () => {
      // Usa a view vw_especialidade_pool_count que pré-computa contagem
      const { data, error } = await supabase
        .from("vw_especialidade_pool_count")
        .select("especialidade_id, especialidade_nome, especialidade_area, total_leads")
        .order("especialidade_nome");
      if (error) throw error;
      return [
        // Pedido equipe (10/06): mirar médicos SEM especialidade (102k+ na base).
        // Não é uuid de especialidade — vira flag sem_especialidade na campanha.
        // total_leads -1 = picker mostra "—" (count real aparece no preview do pool).
        {
          id: GENERALISTA_ID,
          nome: "Generalista (sem especialidade)",
          area: null,
          total_leads: -1,
        },
        ...(data || []).map((specialty) => ({
          id: specialty.especialidade_id,
          nome: specialty.especialidade_nome,
          area: specialty.especialidade_area,
          total_leads: specialty.total_leads || 0,
        })),
      ];
    },
  });

  const { data: chips = [] } = useQuery({
    queryKey: ["chips-disparo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chips")
        .select("id, nome, numero, status, pode_disparar, tipo_instancia, connection_state, categoria_uso")
        .eq("status", "ativo")
        .eq("tipo_instancia", "disparos")
        .eq("pode_disparar", true)
        .eq("connection_state", "open") // só oferece chip realmente conectado (evita escolher chip offline que nunca dispara)
        .order("nome");
      if (error) throw error;
      return data || [];
    },
  });

  // F2.2 — preview via RPC server-side com debounce de 300ms.
  // Reduz N queries por keystroke pra 1 e centraliza a lógica
  // dos filtros (mesmos do selecionar_leads_campanha).
  const { data: briefingSources = [] } = useQuery({
    queryKey: ["campaign-briefing-sources"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campanhas")
        .select("id, nome, briefing_ia, updated_at")
        .not("briefing_ia", "is", null)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []).filter((campaign) => {
        const briefing = campaign.briefing_ia as Record<string, unknown> | null;
        return briefing && Object.keys(briefing).length > 0;
      });
    },
    staleTime: 60_000,
  });

  const { data: officialTemplates = [] } = useQuery({
    queryKey: ["approved-whatsapp-official-templates", "pt_BR"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_official_templates" as never)
        .select("id, friendly_name, category, language")
        .eq("approval_status", "approved")
        .eq("language", "pt_BR")
        .order("friendly_name");
      if (error) throw error;
      return (data || []) as Array<{ id: string; friendly_name: string; category: string | null; language: string }>;
    },
  });

  const { data: officialSenders = [] } = useQuery({
    queryKey: ["active-whatsapp-official-senders"],
    enabled: open && whatsappProvider === "twilio",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_official_senders" as never)
        .select("id, display_name, phone_e164, status")
        .in("status", ["approved", "online", "active", "activated"])
        .order("display_name");
      if (error) throw error;
      return (data || []) as Array<{ id: string; display_name: string | null; phone_e164: string; status: string }>;
    },
  });

  const { data: responsaveis = [] } = useQuery({
    queryKey: ["campanha-responsaveis-ativos"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome_completo, telefone")
        .eq("status", "ativo")
        .order("nome_completo");
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (whatsappProvider === "twilio" && !officialSenderId && officialSenders.length === 1) {
      setOfficialSenderId(officialSenders[0].id);
    }
  }, [whatsappProvider, officialSenderId, officialSenders]);

  const applyBriefing = (sourceId: string) => {
    setBriefingSourceId(sourceId);
    const source = briefingSources.find((campaign) => campaign.id === sourceId);
    const briefing = source?.briefing_ia as Record<string, unknown> | undefined;
    if (!briefing || !source) return;
    const text = (key: string) => String(briefing[key] || "");
    const textArray = (key: string) =>
      Array.isArray(briefing[key]) ? (briefing[key] as unknown[]).map(String) : [];

    setBNomeServico(text("nome_servico"));
    setBHospital(text("hospital"));
    setBCidade(text("cidade"));
    setBTipoServico(text("tipo_servico"));
    setBRequisitos(text("requisitos"));
    setBEstrutura(text("estrutura"));
    setBContratacao(text("contratacao") || "PJ");
    setBValorMin(text("valor_min"));
    setBValorMax(text("valor_max"));
    setBValorPor(text("valor_por") || "plantão 12h");
    setBBeneficios(textArray("beneficios"));
    setBHandoffNome(text("handoff_nome"));
    setBHandoffTelefone(text("handoff_telefone"));
    setBInfoExtra(text("info_extra"));
    setBInicioServico(text("inicio_servico"));
    setBPagamento(text("pagamento"));
    setBCidadeInfo(text("cidade_info"));
    setBLinkVideo(text("link_video"));
    setBHandoffFrase(text("handoff_frase"));
    setBHandoffGatilhos(text("handoff_gatilhos"));
    setBPalavrasProibidas(text("palavras_proibidas"));

    const locais = Array.isArray(briefing.locais) ? briefing.locais : [];
    setBLocaisExtras(
      locais
        .map((item) => item as Record<string, unknown>)
        .slice(1)
        .map((item) => ({
          hospital: String(item.hospital || ""),
          cidade: String(item.cidade || ""),
        })),
    );
    const objecoes = Array.isArray(briefing.objecoes)
      ? briefing.objecoes.map((item) => item as Record<string, unknown>)
      : [];
    setBObjecao1(String(objecoes[0]?.objecao || ""));
    setBResposta1(String(objecoes[0]?.resposta || ""));
    setBObjecao2(String(objecoes[1]?.objecao || ""));
    setBResposta2(String(objecoes[1]?.resposta || ""));
    toast.success(`Briefing importado de “${source.nome}”. Revise os campos antes de criar.`);
  };

  const debouncedEspIds = useDebouncedValue(especialidadeIds, 300);
  const debouncedUfs = useDebouncedValue(regiaoEstados, 300);
  const debouncedIdadeMin = useDebouncedValue(idadeMin, 400);
  const debouncedIdadeMax = useDebouncedValue(idadeMax, 400);
  const debouncedBuscaCidade = useDebouncedValue(buscaCidade, 300);

  const { data: previewData } = useQuery({
    queryKey: [
      "campanha-wizard-preview",
      debouncedEspIds.join(","),
      debouncedUfs.join(","),
      regiaoCidades.join(","),
      filtroTemEmail,
      debouncedIdadeMin,
      debouncedIdadeMax,
      filtroOrigem,
    ],
    enabled: debouncedEspIds.length > 0 || debouncedUfs.length > 0,
    queryFn: async () => {
      const idsReais = debouncedEspIds.filter((id) => id !== GENERALISTA_ID);
      const call = async (uf: string | null) => {
        const { data, error } = await supabase.rpc("campanha_wizard_preview", {
          p_especialidade_ids: idsReais.length > 0 ? idsReais : null,
          p_uf: uf,
          p_exclude_lead_ids: null,
          p_sample_limit: 0,
          p_sem_especialidade: debouncedEspIds.includes(GENERALISTA_ID),
          p_cidades: regiaoCidades.length > 0 ? regiaoCidades : null,
          p_tem_email: filtroTemEmail,
          p_idade_min: debouncedIdadeMin ? Number(debouncedIdadeMin) : null,
          p_idade_max: debouncedIdadeMax ? Number(debouncedIdadeMax) : null,
          p_origem: filtroOrigem || null,
        });
        if (error) throw error;
        return data as {
          count: number;
          count_em_outras_campanhas?: number;
          top_cidades?: { cidade: string; n: number }[];
          sample: unknown[];
        };
      };
      // Multi-UF: a RPC filtra por 1 UF; somamos por estado (UFs são disjuntas).
      if (debouncedUfs.length <= 1) return call(debouncedUfs[0] || null);
      const parts = await Promise.all(debouncedUfs.map((uf) => call(uf)));
      const mergeCid = new Map<string, number>();
      for (const p of parts) for (const c of p?.top_cidades || []) mergeCid.set(c.cidade, (mergeCid.get(c.cidade) || 0) + c.n);
      return {
        count: parts.reduce((s, p) => s + (p?.count || 0), 0),
        count_em_outras_campanhas: parts.reduce((s, p) => s + (p?.count_em_outras_campanhas || 0), 0),
        top_cidades: [...mergeCid].map(([cidade, n]) => ({ cidade, n })).sort((a, b) => b.n - a.n).slice(0, 12),
        sample: [],
      };
    },
    staleTime: 30_000,
  });
  const poolCount = previewData?.count;
  const poolCrossCampanha = previewData?.count_em_outras_campanhas ?? 0;
  const topCidades = previewData?.top_cidades ?? [];

  // Facetas do pool (cidades/origens disponíveis pra esse esp+uf) — popula os pickers.
  const { data: facets } = useQuery({
    queryKey: [
      "campanha-pool-facets",
      debouncedEspIds.join(","),
      debouncedUfs.join(","),
      debouncedBuscaCidade,
    ],
    enabled: debouncedEspIds.length > 0 || debouncedUfs.length > 0,
    queryFn: async () => {
      const idsReais = debouncedEspIds.filter((id) => id !== GENERALISTA_ID);
      const call = async (uf: string | null) => {
        const { data, error } = await supabase.rpc("campanha_pool_facets", {
          p_especialidade_ids: idsReais.length > 0 ? idsReais : null,
          p_uf: uf,
          p_sem_especialidade: debouncedEspIds.includes(GENERALISTA_ID),
          p_busca_cidade: debouncedBuscaCidade || null,
        });
        if (error) throw error;
        return data as { cidades: { cidade: string; n: number }[]; origens: { origem: string; n: number }[] };
      };
      if (debouncedUfs.length <= 1) return call(debouncedUfs[0] || null);
      const parts = await Promise.all(debouncedUfs.map((uf) => call(uf)));
      const mC = new Map<string, number>();
      const mO = new Map<string, number>();
      for (const p of parts) {
        for (const c of p?.cidades || []) mC.set(c.cidade, (mC.get(c.cidade) || 0) + c.n);
        for (const o of p?.origens || []) mO.set(o.origem, (mO.get(o.origem) || 0) + o.n);
      }
      return {
        cidades: [...mC].map(([cidade, n]) => ({ cidade, n })).sort((a, b) => b.n - a.n).slice(0, 60),
        origens: [...mO].map(([origem, n]) => ({ origem, n })).sort((a, b) => b.n - a.n).slice(0, 25),
      };
    },
    staleTime: 30_000,
  });
  const cidadesDisponiveis = facets?.cidades ?? [];
  const origensDisponiveis = facets?.origens ?? [];

  const criar = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      const briefing = {
        nome_servico: bNomeServico,
        hospital: bHospital,
        cidade: bCidade,
        // WS5 — multi-local: principal + extras (a IA lista todos). Retrocompat: hospital/cidade single acima.
        locais: [{ hospital: bHospital, cidade: bCidade, uf: regiaoEstado || "" }, ...bLocaisExtras.map((l) => ({ ...l, uf: regiaoEstado || "" }))].filter((l) => l.hospital || l.cidade),
        tipo_servico: bTipoServico,
        requisitos: bRequisitos,
        estrutura: bEstrutura,
        contratacao: bContratacao,
        valor_min: bValorMin,
        valor_max: bValorMax,
        valor_por: bValorPor,
        beneficios: bBeneficios,
        handoff_nome: bHandoffNome,
        handoff_telefone: bHandoffTelefone,
        objecoes: [
          ...(bObjecao1 ? [{ objecao: bObjecao1, resposta: bResposta1 }] : []),
          ...(bObjecao2 ? [{ objecao: bObjecao2, resposta: bResposta2 }] : []),
        ],
        info_extra: bInfoExtra,
        inicio_servico: bInicioServico,
        pagamento: bPagamento,
        cidade_info: bCidadeInfo,
        link_video: bLinkVideo,
        handoff_frase: bHandoffFrase,
        handoff_gatilhos: bHandoffGatilhos,
        palavras_proibidas: bPalavrasProibidas,
      };

      const espIdsReais = especialidadeIds.filter((id) => id !== GENERALISTA_ID);
      const { data, error } = await supabase
        .from("campanhas")
        .insert({
          nome,
          canal: "whatsapp",
          status: "ativa",
          tipo_campanha: "prospeccao",
          especialidade_ids: espIdsReais.length > 0 ? espIdsReais : null,
          // Mantém especialidade_id (singular) com a primeira pra retrocompat de UI legada
          especialidade_id: espIdsReais[0] || null,
          sem_especialidade: especialidadeIds.includes(GENERALISTA_ID),
          regiao_estado: regiaoEstado || null,
          regiao_estados: regiaoEstados.length > 0 ? regiaoEstados : null,
          // Filtros do pool (13/07) — selecionar_leads_campanha aplica todos.
          regiao_cidades: regiaoCidades.length > 0 ? regiaoCidades : null,
          filtro_tem_email: filtroTemEmail,
          filtro_idade_min: idadeMin ? Number(idadeMin) : null,
          filtro_idade_max: idadeMax ? Number(idadeMax) : null,
          filtro_origem: filtroOrigem || null,
          chip_ids: chipIds.length > 0 ? chipIds : null,
          chip_id: chipIds[0] || null,
          chip_fallback_id: chipIds[1] || null,
          whatsapp_provider: whatsappProvider,
          official_template_id: whatsappProvider === "twilio" ? officialTemplateId : null,
          official_sender_id: whatsappProvider === "twilio" ? officialSenderId : null,
          official_template_variables: whatsappProvider === "twilio" ? officialTemplateVariables : {},
          responsavel_id: responsavelId,
          rotation_strategy: rotationStrategy,
          // teto diário NÃO é definido na campanha — o sistema controla pelo limite de cada chip (anti-ban)
          limite_diario_campanha: null,
          batch_size: batchSize,
          delay_min_ms: delayMinMs * 1000,
          delay_max_ms: delayMaxMs * 1000,
          delay_between_batches_min: delayBatchMin * 60,
          delay_between_batches_max: delayBatchMax * 60,
          // WS2: janela de disparo (07-17h dias úteis default)
          horario_inteligente_ativo: janela.ativo,
          horario_inicio_brt: janela.inicio,
          horario_fim_brt: janela.fim,
          dias_semana: janela.dias,
          mensagem_inicial: mensagemInicial || null,
          briefing_ia: briefing,
          cadencia_ativa: cadenciaAtiva,
          tipo_envio: tipoEnvio,
          // WS-A: snapshot da cadência de TAREFAS manuais (fonte de verdade do trigger). Só pra manual.
          // (distinto de cadencia_template_id, que é a cadência de mensagens automáticas)
          tarefa_cadencia_template_id: tipoEnvio === "manual" ? cadenciaTemplateId : null,
          tarefa_cadencia_passos: tipoEnvio === "manual" && cadenciaPassos.length > 0 ? cadenciaPassos : null,
          leads_excluidos_ids:
            excludedLeadIds.size > 0 ? Array.from(excludedLeadIds) : null,
          // Identidade do remetente (templates-email-por-campanha.md)
          nome_remetente: nomeRemetente || "Equipe GSS",
          whatsapp_remetente: whatsappRemetente || null,
          descricao_oportunidade: descricaoOportunidade || null,
          criado_por: user.user?.id,
        } as never)
        .select()
        .single();
      if (error) throw error;

      // F2.9: se veio com preLead, insere manualmente em campanha_leads
      if (preLead?.id && data?.id) {
        const { error: clError } = await supabase
          .from("campanha_leads")
          .insert({
            campanha_id: data.id,
            lead_id: preLead.id,
            status: "pendente",
            etapa_acompanhamento: "frio",
          });
        if (clError) {
          // Não falha a criação — só avisa
          console.warn("Falha ao incluir preLead na campanha:", clError.message);
        }
      }

      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["campanhas-prospeccao"] });
      toast.success("Campanha criada! Agora adicione os leads pra ela começar a rodar.");
      resetForm();
      onOpenChange(false);
      if (data?.id) onCreated?.(data.id);
    },
    onError: (error: unknown) => toast.error("Erro: " + errorMessage(error)),
  });

  const resetForm = () => {
    setNome("");
    setEspecialidadeIds([]);
    setRegiaoEstados([]);
    setRegiaoCidades([]);
    setBuscaCidade("");
    setFiltroTemEmail(false);
    setIdadeMin("");
    setIdadeMax("");
    setFiltroOrigem("");
    setChipIds([]);
    setRotationStrategy("round_robin");
    setBatchSize(10);
    setDelayMinMs(8);
    setDelayMaxMs(25);
    setDelayBatchMin(5);
    setDelayBatchMax(10);
    setJanela({ ativo: true, inicio: 7, fim: 17, dias: [1, 2, 3, 4, 5] });
    setMensagemInicial("");
    setCadenciaAtiva(true);
    setTipoEnvio("ia");
    setCadenciaTemplateId(null);
    setCadenciaPassos([]);
    setBNomeServico("");
    setBHospital("");
    setBCidade("");
    setBTipoServico("");
    setBRequisitos("");
    setBEstrutura("");
    setBContratacao("PJ");
    setBValorMin("");
    setBValorMax("");
    setBValorPor("plantão 12h");
    setBBeneficios([]);
    setBHandoffNome("");
    setBHandoffTelefone("");
    setBObjecao1("");
    setBResposta1("");
    setBObjecao2("");
    setBResposta2("");
    setNomeRemetente("Equipe GSS");
    setWhatsappRemetente("");
    setDescricaoOportunidade("");
    setBInfoExtra("");
    setBInicioServico("");
    setBPagamento("");
    setBCidadeInfo("");
    setBLinkVideo("");
    setBHandoffFrase("");
    setBHandoffGatilhos("");
    setBPalavrasProibidas("");
    setExcludedLeadIds(new Set());
    setWhatsappProvider("evolution");
    setOfficialTemplateId(null);
    setTab("basico");
  };

  const espsSelecionadas = especialidades.filter((e) => especialidadeIds.includes(e.id));
  const briefingCompletoIA = [bNomeServico, bHospital, bCidade, bTipoServico, bHandoffNome, bHandoffTelefone]
    .every((c) => c.trim().length > 0);
  // Manual: a operadora conversa, não a IA — não exige handoff/tipo/briefing IA, só o contexto básico.
  const briefingMinimoManual = [bNomeServico, bHospital, bCidade].every((c) => c.trim().length > 0);
  const briefingOk = tipoEnvio === "manual" ? briefingMinimoManual : briefingCompletoIA;
  // WS2: janela inválida (fim<=início ou sem dias) faria a campanha nunca disparar — bloqueia o submit.
  const janelaValida = !janela.ativo || (janela.dias.length > 0 && janela.fim > janela.inicio);
  const canCreate =
    nome.trim().length > 0 &&
    briefingOk &&
    janelaValida &&
    !!responsavelId &&
    (whatsappProvider === "evolution" ||
      (
        !!officialTemplateId &&
        !!officialSenderId &&
        Object.keys(officialTemplateVariables).length > 0 &&
        Object.values(officialTemplateVariables).every((binding) => binding.trim().length > 0)
      ));
  // Feedback claro: o que ainda falta pra liberar o botão (em vez de só desabilitar sem explicar)
  const faltaPreencher: string[] = [];
  if (whatsappProvider === "twilio" && !officialTemplateId) faltaPreencher.push("template oficial aprovado");
  if (whatsappProvider === "twilio" && !officialSenderId) faltaPreencher.push("número oficial remetente");
  if (
    whatsappProvider === "twilio" &&
    (
      Object.keys(officialTemplateVariables).length === 0 ||
      Object.values(officialTemplateVariables).some((binding) => !binding.trim())
    )
  ) faltaPreencher.push("variáveis do template");
  if (nome.trim().length === 0) faltaPreencher.push("nome da campanha (aba Configuração)");
  if (!responsavelId) faltaPreencher.push("responsável no Sigma");
  if (bNomeServico.trim().length === 0) faltaPreencher.push("nome do serviço");
  if (bHospital.trim().length === 0) faltaPreencher.push("hospital/unidade");
  if (bCidade.trim().length === 0) faltaPreencher.push("cidade");
  if (tipoEnvio !== "manual") {
    if (bTipoServico.trim().length === 0) faltaPreencher.push("tipo de serviço");
    if (bHandoffNome.trim().length === 0) faltaPreencher.push("nome do handoff");
    if (bHandoffTelefone.trim().length === 0) faltaPreencher.push("telefone do handoff");
  }
  if (!janelaValida) faltaPreencher.push("janela de horário válida");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Nova Campanha de Prospecção
          </DialogTitle>
        </DialogHeader>

        {preLead && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 text-sm">
            <p className="text-emerald-800">
              <strong>{preLead.nome}</strong> será incluído manualmente nesta campanha após você criá-la.
              Configure os filtros normalmente — o pool da especialidade vai juntar com este lead extra.
            </p>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="basico" className="flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5" />
              Configuração
            </TabsTrigger>
            <TabsTrigger value="mensagem" className="flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5" />
              Mensagem
            </TabsTrigger>
            <TabsTrigger value="ia" className="flex items-center gap-1.5">
              <Brain className="h-3.5 w-3.5" />
              {tipoEnvio === "manual" ? "Contexto da vaga" : "Briefing IA"}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basico" className="space-y-4 mt-4">
            {/* F2.2: tipo de envio — define se IA conduz ou operadora executa tasks manuais */}
            <div className="space-y-2">
              <Label>Como a campanha funciona? *</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setTipoEnvio("ia")}
                  className={`text-left border rounded-md p-3 transition-colors ${
                    tipoEnvio === "ia"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <Brain className="h-4 w-4" />
                    IA conduz
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-snug">
                    Sistema dispara, responde médicos automaticamente e faz cadência. Operadora só recebe lead quente.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setTipoEnvio("manual")}
                  className={`text-left border rounded-md p-3 transition-colors ${
                    tipoEnvio === "manual"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <ClipboardList className="h-4 w-4" />
                    Manual (operadora)
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-snug">
                    Cada lead gera uma cadência de tarefas (configurável: WhatsApp, ligação, Instagram…) pra operadora executar e marcar feita.
                  </p>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Canal de WhatsApp</Label>
              <Select value={whatsappProvider} onValueChange={(value) => setWhatsappProvider(value as "evolution" | "twilio")}>
                <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="evolution">API não oficial · Evolution</SelectItem>
                  <SelectItem value="twilio">API oficial · Twilio/WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Nome da campanha *</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Intensivistas Pediátricos - SC"
              />
            </div>

            {whatsappProvider === "twilio" ? (
              <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                <Label>Número oficial remetente</Label>
                <Select value={officialSenderId || ""} onValueChange={setOfficialSenderId}>
                  <SelectTrigger className="min-h-11 bg-background">
                    <SelectValue placeholder="Selecione o número oficial" />
                  </SelectTrigger>
                  <SelectContent>
                    {officialSenders.map((sender) => (
                      <SelectItem key={sender.id} value={sender.id}>
                        {sender.display_name || "WhatsApp oficial"} · {sender.phone_e164}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {officialSenders.length === 0 && (
                  <p className="text-xs text-amber-800">Nenhum número oficial ativo foi encontrado na Twilio.</p>
                )}

                <Label>Template oficial aprovado</Label>
                <p className="text-xs text-blue-900">
                  O primeiro contato usa o template aprovado; as respostas continuam pelo mesmo número dentro do Sigma.
                </p>
                <Select
                  value={officialTemplateId || ""}
                  onValueChange={(templateId) => {
                    setOfficialTemplateId(templateId);
                    setOfficialTemplateVariables({});
                  }}
                >
                  <SelectTrigger className="min-h-11 bg-background">
                    <SelectValue placeholder="Selecione um template aprovado" />
                  </SelectTrigger>
                  <SelectContent>
                    {officialTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.friendly_name} · {template.category || "sem categoria"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {officialTemplates.length === 0 && (
                  <p className="text-xs text-amber-800">Ainda não há template aprovado pela Meta.</p>
                )}
                <OfficialTemplateVariablesConfig
                  templateId={officialTemplateId}
                  value={officialTemplateVariables}
                  onChange={setOfficialTemplateVariables}
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Responsável pela campanha no Sigma *</Label>
              <Select
                value={responsavelId || ""}
                onValueChange={(id) => {
                  setResponsavelId(id);
                  const profile = responsaveis.find((item) => item.id === id);
                  if (!profile) return;
                  setBHandoffNome(profile.nome_completo);
                  if (profile.telefone) {
                    const phone = profile.telefone.replace(/\D/g, "");
                    setBHandoffTelefone(phone.startsWith("55") ? `+${phone}` : `+55${phone}`);
                  }
                }}
              >
                <SelectTrigger className="min-h-11">
                  <SelectValue placeholder="Selecione quem receberá os leads" />
                </SelectTrigger>
                <SelectContent>
                  {responsaveis.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.nome_completo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Quando a IA aquecer um médico, o card será atribuído automaticamente e a IA será pausada.
              </p>
            </div>

            {/* Identidade do remetente — controla quem assina email/WhatsApp e qual o conteúdo da oportunidade.
                Sem isso, o template usa default genérico "Equipe GSS" e a frase fica fraca. */}
            <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/40 p-3">
              <div>
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  ✉️ Identidade do remetente
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Como o médico vai te ver no email e no WhatsApp. Sem isso, sai genérico.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome do remetente *</Label>
                  <Input
                    value={nomeRemetente}
                    onChange={(e) => setNomeRemetente(e.target.value)}
                    placeholder="Ex: Dr. Maikon Madeira"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">WhatsApp do remetente (opcional)</Label>
                  <Input
                    value={whatsappRemetente}
                    onChange={(e) => setWhatsappRemetente(e.target.value)}
                    placeholder="(51) 99540-1928"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Descrição da oportunidade *</Label>
                <Textarea
                  value={descricaoOportunidade}
                  onChange={(e) => setDescricaoOportunidade(e.target.value)}
                  placeholder="Ex: uma vaga de Telediagnóstico em Radiologia, 100% remoto, atendendo 3 hospitais em SC"
                  rows={2}
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Vai entrar no email assim: "Estamos com <em>{descricaoOportunidade || "..."}</em> — valores, estrutura..."
                </p>
              </div>

              {/* Preview do email renderizado */}
              {(nomeRemetente || descricaoOportunidade) && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-amber-700 font-medium">
                    👁 Ver preview do email
                  </summary>
                  <div className="mt-2 rounded border border-amber-200 bg-white p-3 font-mono text-[11px] whitespace-pre-wrap leading-relaxed text-foreground">
{`Olá Dr(a). [NOME DO MÉDICO],

Sou ${nomeRemetente || "[NOME REMETENTE]"}, da equipe GSS Saúde. Como não consegui falar com você pelo WhatsApp, estou te escrevendo por aqui.

Estamos com ${descricaoOportunidade || "[DESCRIÇÃO DA OPORTUNIDADE]"} — valores, estrutura e condições completas posso compartilhar assim que tivermos um papo rápido.

Se tiver interesse, basta responder este email${whatsappRemetente ? ` ou me chamar direto no WhatsApp: ${whatsappRemetente}` : ""}.

Abraço,
${nomeRemetente || "[NOME REMETENTE]"}
GSS Saúde`}
                  </div>
                </details>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Stethoscope className="h-3.5 w-3.5" />
                  Especialidades
                  <span className="text-xs text-muted-foreground font-normal">
                    (1 ou mais)
                  </span>
                </Label>
                <EspecialidadesMultiPicker
                  value={especialidadeIds}
                  onChange={setEspecialidadeIds}
                  options={especialidades}
                />
                {espsSelecionadas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {espsSelecionadas.map((e) => (
                      <Badge
                        key={e.id}
                        variant="secondary"
                        className="text-xs gap-1 pr-1"
                      >
                        {e.nome}
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground tabular-nums">
                          {(e.total_leads || 0).toLocaleString("pt-BR")}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setEspecialidadeIds(
                              especialidadeIds.filter((id) => id !== e.id),
                            )
                          }
                          className="ml-0.5 rounded hover:bg-background/50 px-0.5"
                          aria-label={`Remover ${e.nome}`}
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  Estados (UF)
                  <span className="text-xs text-muted-foreground font-normal">(1 ou mais)</span>
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="w-full flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
                      <span className={regiaoEstados.length ? "" : "text-muted-foreground"}>
                        {regiaoEstados.length ? `${regiaoEstados.length} estado(s)` : "Todo o Brasil"}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2">
                    <div className="grid grid-cols-4 gap-1 max-h-56 overflow-y-auto">
                      {UF_LIST.map((uf) => {
                        const on = regiaoEstados.includes(uf);
                        return (
                          <button key={uf} type="button"
                            onClick={() => setRegiaoEstados((prev) => prev.includes(uf) ? prev.filter((x) => x !== uf) : [...prev, uf])}
                            className={`text-xs rounded px-1.5 py-1 border ${on ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                            {uf}
                          </button>
                        );
                      })}
                    </div>
                    {regiaoEstados.length > 0 && (
                      <button type="button" onClick={() => setRegiaoEstados([])} className="mt-2 text-xs text-muted-foreground hover:text-foreground underline">limpar</button>
                    )}
                  </PopoverContent>
                </Popover>
                {regiaoEstados.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {regiaoEstados.map((uf) => (
                      <Badge key={uf} variant="secondary" className="text-xs gap-1 pr-1">
                        {uf}
                        <button type="button" onClick={() => setRegiaoEstados((p) => p.filter((x) => x !== uf))} className="hover:text-red-600">×</button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Cidade — filtro fino (backend já suportava via regiao_cidades; agora exposto) */}
            {(especialidadeIds.length > 0 || regiaoEstados.length > 0) && (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    Cidades
                    <span className="text-xs text-muted-foreground font-normal">(opcional — filtra dentro do estado)</span>
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="w-full flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
                        <span className={regiaoCidades.length ? "" : "text-muted-foreground"}>
                          {regiaoCidades.length ? `${regiaoCidades.length} cidade(s)` : "Todas as cidades"}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-2" align="start">
                      <Input
                        placeholder="Buscar cidade..."
                        value={buscaCidade}
                        onChange={(e) => setBuscaCidade(e.target.value)}
                        className="h-8 text-xs mb-2"
                      />
                      <div className="max-h-64 overflow-y-auto space-y-0.5">
                        {cidadesDisponiveis.length === 0 ? (
                          <div className="text-center text-xs text-muted-foreground py-4">
                            {buscaCidade ? "Nenhuma cidade encontrada" : "Selecione especialidade/estado primeiro"}
                          </div>
                        ) : (
                          cidadesDisponiveis.map((c) => {
                            const on = regiaoCidades.includes(c.cidade);
                            return (
                              <button key={c.cidade} type="button"
                                onClick={() => setRegiaoCidades((prev) => prev.includes(c.cidade) ? prev.filter((x) => x !== c.cidade) : [...prev, c.cidade])}
                                className={`w-full flex items-center justify-between px-2 py-1.5 text-xs rounded hover:bg-muted/50 ${on ? "bg-primary/10 font-medium" : ""}`}>
                                <span className="flex items-center gap-2 min-w-0">
                                  <span className={`shrink-0 h-3.5 w-3.5 rounded border ${on ? "bg-primary border-primary" : "bg-background border-input"} flex items-center justify-center`}>
                                    {on && <span className="text-[10px] text-primary-foreground">✓</span>}
                                  </span>
                                  <span className="truncate text-left">{c.cidade}</span>
                                </span>
                                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 ml-2">{c.n.toLocaleString("pt-BR")}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                      {regiaoCidades.length > 0 && (
                        <button type="button" onClick={() => setRegiaoCidades([])} className="mt-2 text-xs text-muted-foreground hover:text-foreground underline">limpar</button>
                      )}
                    </PopoverContent>
                  </Popover>
                  {regiaoCidades.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {regiaoCidades.map((c) => (
                        <Badge key={c} variant="secondary" className="text-xs gap-1 pr-1">
                          {c}
                          <button type="button" onClick={() => setRegiaoCidades((p) => p.filter((x) => x !== c))} className="hover:text-red-600">×</button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Filtros avançados de qualidade do lead */}
                <details className="rounded-md border bg-muted/20 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground flex items-center gap-1.5 select-none">
                    <Settings2 className="h-3.5 w-3.5" /> Filtros avançados
                    {(filtroTemEmail || idadeMin || idadeMax || filtroOrigem) && (
                      <Badge variant="secondary" className="text-[10px]">ativos</Badge>
                    )}
                  </summary>
                  <div className="mt-3 space-y-3">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={filtroTemEmail} onChange={(e) => setFiltroTemEmail(e.target.checked)} className="w-4 h-4" />
                      Só médicos com e-mail cadastrado <span className="text-xs text-muted-foreground">(habilita a cadência de e-mail)</span>
                    </label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Origem do lead</Label>
                        <Select value={filtroOrigem || "__todas"} onValueChange={(v) => setFiltroOrigem(v === "__todas" ? "" : v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__todas">Todas as origens</SelectItem>
                            {origensDisponiveis.map((o) => (
                              <SelectItem key={o.origem} value={o.origem}>{o.origem} ({o.n.toLocaleString("pt-BR")})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Faixa etária</Label>
                        <div className="flex items-center gap-1.5">
                          <Input type="number" value={idadeMin} onChange={(e) => setIdadeMin(e.target.value)} placeholder="min" className="h-8 text-xs" />
                          <span className="text-xs text-muted-foreground">a</span>
                          <Input type="number" value={idadeMax} onChange={(e) => setIdadeMax(e.target.value)} placeholder="max" className="h-8 text-xs" />
                        </div>
                      </div>
                    </div>
                    {(idadeMin || idadeMax) && (
                      <p className="text-[10px] text-muted-foreground">⚠ Só ~37% dos médicos têm data de nascimento cadastrada — o filtro de idade só considera esses.</p>
                    )}
                  </div>
                </details>
              </div>
            )}

            {(especialidadeIds.length > 0 || regiaoEstado) && poolCount !== undefined && (
              <div className="space-y-2">
                <div className="bg-muted/50 rounded-lg p-3 text-sm flex items-center justify-between gap-3">
                  <div>
                    <span className="font-medium text-primary">
                      ~{poolCount.toLocaleString("pt-BR")} leads
                    </span>{" "}
                    disponíveis para esses filtros
                    {especialidadeIds.length > 1 && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({especialidadeIds.length} especialidades combinadas)
                      </span>
                    )}
                  </div>
                  {poolCount > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 shrink-0"
                      onClick={() => setPreviewOpen(true)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Ver lista
                    </Button>
                  )}
                </div>
                {/* Distribuição por cidade — a equipe vê ONDE estão os médicos, não só quantos */}
                {topCidades.length > 0 && regiaoCidades.length === 0 && (
                  <div className="text-xs text-muted-foreground px-1">
                    <span className="font-medium text-foreground">Onde estão:</span>{" "}
                    {topCidades.slice(0, 8).map((c, i) => (
                      <span key={c.cidade}>
                        {i > 0 && " · "}
                        {c.cidade} <span className="tabular-nums">{c.n.toLocaleString("pt-BR")}</span>
                      </span>
                    ))}
                  </div>
                )}
                {/* Bloco G — alerta cross-campanha */}
                {poolCrossCampanha > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-start gap-2">
                    <span className="text-amber-600 text-base leading-none">⚠</span>
                    <div className="flex-1">
                      <strong>{poolCrossCampanha.toLocaleString("pt-BR")}</strong>{" "}
                      desses leads <strong>já estão em outra campanha ativa ou pausada</strong>.
                      Se incluir nesta, o médico vai receber abordagem de dois lugares ao
                      mesmo tempo. Considere excluí-los manualmente na lista abaixo
                      ou aceitar (operadora decide).
                    </div>
                  </div>
                )}
              </div>
            )}

            <PreviewLeadsCampanhaModal
              open={previewOpen}
              onOpenChange={setPreviewOpen}
              especialidadeIds={especialidadeIds.filter((id) => id !== GENERALISTA_ID)}
              uf={regiaoEstado}
              cidades={regiaoCidades}
              temEmail={filtroTemEmail}
              idadeMin={idadeMin}
              idadeMax={idadeMax}
              origem={filtroOrigem}
              poolCount={poolCount}
              excludedIds={excludedLeadIds}
              onExcludedChange={setExcludedLeadIds}
            />

            {excludedLeadIds.size > 0 && (
              <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                <span className="text-amber-800">
                  <strong>{excludedLeadIds.size.toLocaleString("pt-BR")}</strong>{" "}
                  médico{excludedLeadIds.size === 1 ? "" : "s"} excluído
                  {excludedLeadIds.size === 1 ? "" : "s"} do disparo
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() => setExcludedLeadIds(new Set())}
                >
                  Limpar
                </Button>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                Chips WhatsApp (selecione 1 ou mais)
              </Label>
              <div className="flex flex-wrap gap-2">
                {chips.map((c) => {
                  const selected = chipIds.includes(c.id);
                  const usadoPor = !selected ? chipsEmUso?.get(c.id) : undefined;
                  const bloqueado = !!usadoPor;
                  return (
                    <Badge
                      key={c.id}
                      variant={selected ? "default" : "outline"}
                      className={bloqueado ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                      title={bloqueado ? `Já em uso por: ${usadoPor}` : undefined}
                      onClick={() =>
                        bloqueado
                          ? undefined
                          : setChipIds((prev) =>
                              selected
                                ? prev.filter((id) => id !== c.id)
                                : [...prev, c.id]
                            )
                      }
                    >
                      {c.nome} {c.numero ? `(${c.numero})` : ""}
                      {bloqueado ? " · em uso" : ""}
                    </Badge>
                  );
                })}
              </div>
              {chipIds.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  {chipIds.length} chips selecionados — rotação{" "}
                  {rotationStrategy === "round_robin" ? "alternada" : "aleatória"} entre eles
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="mensagem" className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <Label>Mensagem inicial do disparo</Label>
              <Textarea
                value={mensagemInicial}
                onChange={(e) => setMensagemInicial(e.target.value)}
                placeholder="Olá Dr(a). {{nome}}, tudo bem? Sou da GSS Saúde..."
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                Use {"{{nome}}"} para o nome do médico. Esta é a primeira mensagem
                enviada pelo disparo automático.
              </p>
            </div>

            {/* Cadência automática da IA (follow-up) — só pra campanha IA */}
            {tipoEnvio === "ia" && (
              <div className="border rounded-lg p-4 space-y-3 bg-amber-50/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <Zap className="h-4 w-4 text-amber-600" />
                      Cadência automática (follow-up)
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Se o médico não responder à mensagem inicial, o sistema envia automaticamente
                      um reforço em 2 dias (WhatsApp) e um email em 3 dias.
                      Se o médico responder em qualquer momento, a cadência pausa e a IA assume.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={cadenciaAtiva}
                      onChange={(e) => setCadenciaAtiva(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium">
                      {cadenciaAtiva ? "Ativada" : "Desativada"}
                    </span>
                  </label>
                </div>
                {cadenciaAtiva && (
                  <div className="text-xs bg-white rounded border p-2 space-y-1 text-muted-foreground">
                    <div><strong>T1 D+0</strong> — WhatsApp (mensagem inicial acima)</div>
                    <div><strong>T2 D+2</strong> — WhatsApp reforço automático</div>
                    <div><strong>T3 D+3</strong> — Email de último contato</div>
                  </div>
                )}
              </div>
            )}

            {/* WS-A: cadência de tarefas parametrizável — só pra campanha manual */}
            {tipoEnvio === "manual" && (
              <CadenciaConfig
                passos={cadenciaPassos}
                onChange={setCadenciaPassos}
                templateId={cadenciaTemplateId}
                onTemplateChange={setCadenciaTemplateId}
              />
            )}
          </TabsContent>

          <TabsContent value="ia" className="space-y-4 mt-4">
            {briefingSources.length > 0 && (
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                <Label htmlFor="briefing-source">Reutilizar briefing existente</Label>
                <select
                  id="briefing-source"
                  className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
                  value={briefingSourceId}
                  onChange={(event) => applyBriefing(event.target.value)}
                >
                  <option value="">Selecione uma campanha...</option>
                  {briefingSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.nome}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Os campos são copiados para edição; o briefing original não é alterado.
                </p>
              </div>
            )}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <Brain className="h-4 w-4 inline mr-1" />
              {tipoEnvio === "manual"
                ? "Contexto da vaga pra equipe consultar na conversa. Só nome do serviço, hospital e cidade são obrigatórios — o resto é opcional."
                : "Preencha cada campo — a IA vai usar essas informações pra conversar com os médicos automaticamente. Quanto mais completo, melhor a conversa."}
            </div>

            <ScrollArea className="h-[min(400px,50dvh)] pr-3">
              <div className="space-y-4">
                {/* BLOCO 1: Sobre a vaga */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm border-b pb-1">Sobre a vaga</h4>

                  <div className="space-y-1">
                    <Label>Nome do serviço *</Label>
                    <Input
                      value={bNomeServico}
                      onChange={(e) => setBNomeServico(e.target.value)}
                      placeholder="Ex: UTI Pediátrica, Pronto Socorro, Ambulatório de Cardiologia"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Hospital / Unidade *</Label>
                      <Input
                        value={bHospital}
                        onChange={(e) => setBHospital(e.target.value)}
                        placeholder="Ex: Hospital Regional do Oeste"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Cidade *</Label>
                      <Input
                        value={bCidade}
                        onChange={(e) => setBCidade(e.target.value)}
                        placeholder="Ex: Chapecó / SC"
                      />
                    </div>
                  </div>

                  {/* WS5 — outras unidades/locais (multi-local, opcional) */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Outras unidades/locais (opcional — a IA menciona todos na campanha)</Label>
                    {bLocaisExtras.map((loc, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                        <Input
                          value={loc.hospital}
                          onChange={(e) => setBLocaisExtras((prev) => prev.map((l, j) => (j === i ? { ...l, hospital: e.target.value } : l)))}
                          placeholder="Hospital / Unidade"
                        />
                        <Input
                          value={loc.cidade}
                          onChange={(e) => setBLocaisExtras((prev) => prev.map((l, j) => (j === i ? { ...l, cidade: e.target.value } : l)))}
                          placeholder="Cidade"
                        />
                        <Button type="button" variant="ghost" size="sm" onClick={() => setBLocaisExtras((prev) => prev.filter((_, j) => j !== i))}>
                          Remover
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => setBLocaisExtras((prev) => [...prev, { hospital: "", cidade: "" }])}>
                      + Adicionar local
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Tipo de serviço *</Label>
                      <Select value={bTipoServico} onValueChange={setBTipoServico}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="plantao_12h">Plantão 12h</SelectItem>
                          <SelectItem value="plantao_24h">Plantão 24h</SelectItem>
                          <SelectItem value="rotineiro">Rotineiro (diário)</SelectItem>
                          <SelectItem value="sobreaviso">Sobreaviso</SelectItem>
                          <SelectItem value="ambulatorio">Ambulatório</SelectItem>
                          <SelectItem value="producao">Produção</SelectItem>
                          <SelectItem value="outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Contratação</Label>
                      <Select value={bContratacao} onValueChange={setBContratacao}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PJ">PJ (nota fiscal)</SelectItem>
                          <SelectItem value="CLT">CLT</SelectItem>
                          <SelectItem value="Cooperativa">Cooperativa</SelectItem>
                          <SelectItem value="RPA">RPA</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label>Requisito mínimo do médico</Label>
                    <Input
                      value={bRequisitos}
                      onChange={(e) => setBRequisitos(e.target.value)}
                      placeholder="Ex: RQE em Pediatria ou experiência comprovada em UTI Pediátrica"
                    />
                    <p className="text-xs text-muted-foreground">
                      A IA vai verificar isso na conversa antes de encaminhar o médico
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label>Estrutura do local (opcional)</Label>
                    <Textarea
                      value={bEstrutura}
                      onChange={(e) => setBEstrutura(e.target.value)}
                      placeholder="Ex: 10 leitos, 1 plantonista + 1 rotineiro por turno, suporte de especialidades"
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Início do serviço (opcional)</Label>
                      <Input
                        value={bInicioServico}
                        onChange={(e) => setBInicioServico(e.target.value)}
                        placeholder="Ex: 01/05/2026 ou imediato"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Forma de pagamento (opcional)</Label>
                      <Input
                        value={bPagamento}
                        onChange={(e) => setBPagamento(e.target.value)}
                        placeholder="Ex: Último dia do mês subsequente"
                      />
                    </div>
                  </div>
                </div>

                {/* BLOCO 1.5: Cidade / Material */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm border-b pb-1">
                    Cidade e material de apoio (opcional mas recomendado)
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Quanto mais contexto, mais rica a conversa da IA com o médico.
                    Se o médico perguntar sobre a cidade, a IA usa essas informações.
                  </p>

                  <div className="space-y-1">
                    <Label>Sobre a cidade</Label>
                    <Textarea
                      value={bCidadeInfo}
                      onChange={(e) => setBCidadeInfo(e.target.value)}
                      placeholder="Ex: Chapecó, Capital do Oeste Catarinense. 282k habitantes, aeroporto com 5 voos/dia pra SP, boa infra urbana..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label>Link de vídeo da cidade/hospital</Label>
                    <Input
                      type="url"
                      value={bLinkVideo}
                      onChange={(e) => setBLinkVideo(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                    />
                    <p className="text-xs text-muted-foreground">
                      A IA vai oferecer esse vídeo ao médico no momento certo da conversa.
                    </p>
                  </div>
                </div>

                {/* BLOCO 2: Valores e benefícios */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm border-b pb-1">Valores e benefícios</h4>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label>Valor mínimo (R$)</Label>
                      <Input
                        type="number"
                        value={bValorMin}
                        onChange={(e) => setBValorMin(e.target.value)}
                        placeholder="1200"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Valor máximo (R$)</Label>
                      <Input
                        type="number"
                        value={bValorMax}
                        onChange={(e) => setBValorMax(e.target.value)}
                        placeholder="1800"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Por</Label>
                      <Select value={bValorPor} onValueChange={setBValorPor}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="plantão 12h">Plantão 12h</SelectItem>
                          <SelectItem value="plantão 24h">Plantão 24h</SelectItem>
                          <SelectItem value="hora">Hora</SelectItem>
                          <SelectItem value="mês">Mês</SelectItem>
                          <SelectItem value="procedimento">Procedimento</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Benefícios inclusos</Label>
                    <div className="flex flex-wrap gap-2">
                      {["Hospedagem", "Alimentação", "Passagem aérea", "Deslocamento", "Seguro", "Pagamento semanal", "Pagamento quinzenal"].map(
                        (b) => (
                          <Badge
                            key={b}
                            variant={bBeneficios.includes(b) ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() =>
                              setBBeneficios((prev) =>
                                prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]
                              )
                            }
                          >
                            {b}
                          </Badge>
                        )
                      )}
                    </div>
                  </div>
                </div>

                {/* BLOCOS 3-5: Handoff/Objeções/Palavras — só IA (na manual, a operadora conduz) */}
                {tipoEnvio === "ia" && (
                <>
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm border-b pb-1">
                    Quando o médico estiver interessado
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Quem a IA deve avisar quando um médico demonstrar interesse real?
                    A IA vai pedir permissão ao médico antes de passar o contato.
                  </p>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Nome do responsável *</Label>
                      <Input
                        value={bHandoffNome}
                        onChange={(e) => setBHandoffNome(e.target.value)}
                        placeholder="Ex: Ester, Bruna"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>WhatsApp do responsável *</Label>
                      <Input
                        value={bHandoffTelefone}
                        onChange={(e) => setBHandoffTelefone(e.target.value)}
                        placeholder="Ex: 47999514821"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label>Frase de contexto no handoff (opcional)</Label>
                    <Input
                      value={bHandoffFrase}
                      onChange={(e) => setBHandoffFrase(e.target.value)}
                      placeholder="Ex: Ela vai te passar todos os detalhes sobre valores e escala."
                    />
                    <p className="text-xs text-muted-foreground">
                      Como a IA explica pro médico o que o responsável vai fazer.
                      Se em branco, usa frase genérica.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label>Quando acionar o responsável (opcional)</Label>
                    <Textarea
                      value={bHandoffGatilhos}
                      onChange={(e) => setBHandoffGatilhos(e.target.value)}
                      placeholder={`Default: APENAS quando (1) médico perguntar valor/remuneração OU (2) IA não souber responder alguma dúvida.`}
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">
                      Se vazio, usa regra padrão. Customize se essa campanha tiver
                      critério específico pra passar pro responsável.
                    </p>
                  </div>
                </div>

                {/* BLOCO 4: Objeções */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm border-b pb-1">
                    Objeções comuns (opcional)
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Se um médico disser algo negativo, como a IA deve responder?
                  </p>

                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Input
                        value={bObjecao1}
                        onChange={(e) => setBObjecao1(e.target.value)}
                        placeholder='Ex: "É muito longe"'
                      />
                      <Input
                        value={bResposta1}
                        onChange={(e) => setBResposta1(e.target.value)}
                        placeholder="Resposta: Oferecemos hospedagem e passagem"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Input
                        value={bObjecao2}
                        onChange={(e) => setBObjecao2(e.target.value)}
                        placeholder='Ex: "O valor está baixo"'
                      />
                      <Input
                        value={bResposta2}
                        onChange={(e) => setBResposta2(e.target.value)}
                        placeholder="Resposta: Negociável conforme volume e disponibilidade"
                      />
                    </div>
                  </div>
                </div>

                {/* BLOCO 5: Palavras proibidas */}
                <div className="space-y-1.5">
                  <Label>Palavras ou expressões proibidas (opcional)</Label>
                  <Textarea
                    value={bPalavrasProibidas}
                    onChange={(e) => setBPalavrasProibidas(e.target.value)}
                    placeholder="Ex: moderno, tecnologia de ponta, ambiente incrível, oportunidade única"
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">
                    Separadas por vírgula. A IA já evita termos de venda genéricos por padrão
                    — use isto pra adicionar termos específicos desta campanha.
                  </p>
                </div>
                </>
                )}

                {/* BLOCO 6: Info extra */}
                <div className="space-y-1.5">
                  <Label>Algo mais que a IA precisa saber? (opcional)</Label>
                  <Textarea
                    value={bInfoExtra}
                    onChange={(e) => setBInfoExtra(e.target.value)}
                    placeholder="Qualquer informação adicional sobre a vaga, o hospital, a cidade ou regras especiais"
                    rows={2}
                  />
                </div>
              </div>
            </ScrollArea>

            {/* Indicador de completude — manual exige só os 3 básicos da vaga */}
            {(() => {
              const campos = tipoEnvio === "manual"
                ? [bNomeServico, bHospital, bCidade]
                : [bNomeServico, bHospital, bCidade, bTipoServico, bHandoffNome, bHandoffTelefone];
              const preenchidos = campos.filter((c) => c.trim()).length;
              const total = campos.length;
              const pct = Math.round((preenchidos / total) * 100);
              return (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className={pct === 100 ? "text-green-600 font-medium" : "text-amber-600"}>
                      {pct === 100 ? "Briefing completo!" : `${preenchidos}/${total} campos obrigatórios preenchidos`}
                    </span>
                    <span className="text-muted-foreground">{pct}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${pct === 100 ? "bg-green-500" : "bg-amber-400"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })()}
          </TabsContent>
        </Tabs>

        <div className="flex justify-between items-center pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            {tab === "basico" && "Configure o alvo da campanha"}
            {tab === "mensagem" && "Defina a mensagem de abertura"}
            {tab === "ia" && "Briefing para a IA conversar"}
          </p>
          <div className="flex gap-2">
            {tab !== "basico" && (
              <Button
                variant="outline"
                onClick={() => {
                  const order = ["basico", "mensagem", "ia"];
                  const idx = order.indexOf(tab);
                  setTab(order[Math.max(0, idx - 1)]);
                }}
              >
                Voltar
              </Button>
            )}
            {tab !== "ia" ? (
              <Button
                onClick={() => {
                  const order = ["basico", "mensagem", "ia"];
                  const idx = order.indexOf(tab);
                  setTab(order[Math.min(order.length - 1, idx + 1)]);
                }}
              >
                Próximo
              </Button>
            ) : (
              <div className="flex flex-col items-end gap-1">
                {!canCreate && faltaPreencher.length > 0 && (
                  <span className="text-xs text-amber-600 text-right max-w-md">
                    Falta preencher: {faltaPreencher.join(", ")}
                  </span>
                )}
                <Button
                  onClick={() => criar.mutate()}
                  disabled={!canCreate || criar.isPending}
                >
                  {criar.isPending ? "Criando..." : "Criar Campanha"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────
// Multi-picker de especialidades com contagem inline (UX da campanha)
// ─────────────────────────────────────────────────────────────────
interface EspecialidadeOption {
  id: string;
  nome: string;
  area: string | null;
  total_leads: number;
}

function EspecialidadesMultiPicker({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: EspecialidadeOption[];
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");

  const filtradas = busca.trim()
    ? options.filter((o) =>
        o.nome.toLowerCase().includes(busca.toLowerCase()),
      )
    : options;

  // Ordena: selecionadas no topo, Generalista fixo em seguida, depois por total_leads desc
  const ordenadas = [...filtradas].sort((a, b) => {
    const aSel = value.includes(a.id) ? 1 : 0;
    const bSel = value.includes(b.id) ? 1 : 0;
    if (aSel !== bSel) return bSel - aSel;
    const aGen = a.id === GENERALISTA_ID ? 1 : 0;
    const bGen = b.id === GENERALISTA_ID ? 1 : 0;
    if (aGen !== bGen) return bGen - aGen;
    return (b.total_leads || 0) - (a.total_leads || 0);
  });

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted/40 transition-colors"
      >
        <span
          className={
            value.length === 0 ? "text-muted-foreground" : "font-medium"
          }
        >
          {value.length === 0
            ? "Todas as especialidades"
            : `${value.length} selecionada${value.length > 1 ? "s" : ""}`}
        </span>
        <span className="text-muted-foreground text-xs">▾</span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpen(false);
              setBusca("");
            }}
          />
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
            <div className="p-2 border-b">
              <Input
                placeholder="Buscar especialidade..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="h-8 text-xs"
                autoFocus
              />
            </div>
            <div className="max-h-72 overflow-y-auto overscroll-contain p-1">
              <div>
                {ordenadas.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground py-4">
                    Nenhuma especialidade encontrada
                  </div>
                ) : (
                  ordenadas.map((opt) => {
                    const selected = value.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggle(opt.id)}
                        className={`w-full flex items-center justify-between px-2 py-1.5 text-xs rounded hover:bg-muted/50 transition-colors ${
                          selected ? "bg-primary/10 font-medium" : ""
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className={`shrink-0 h-3.5 w-3.5 rounded border ${
                              selected
                                ? "bg-primary border-primary"
                                : "bg-background border-input"
                            } flex items-center justify-center`}
                          >
                            {selected && (
                              <span className="text-[10px] text-primary-foreground">
                                ✓
                              </span>
                            )}
                          </span>
                          <span className="truncate text-left">{opt.nome}</span>
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 ml-2">
                          {opt.total_leads < 0 ? "—" : (opt.total_leads || 0).toLocaleString("pt-BR")}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
