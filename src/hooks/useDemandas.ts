import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface DemandaTarefa {
  id: string;
  modulo: string;
  titulo: string;
  descricao: string | null;
  status: string;
  prioridade: string | null;
  urgencia: string;
  tipo: string;
  escopo: string;
  data_limite: string | null;
  concluida_em: string | null;
  created_at: string;
  created_by: string | null;
  responsavel_id: string | null;
  setor_destino_id: string | null;
  setor_origem_id: string | null;
  licitacao_id: string | null;
  contrato_id: string | null;
  lead_id: string | null;
  sigzap_conversation_id: string | null;
  relacionamento_id: string | null;
  responsavel_nome?: string | null;
  criador_nome?: string | null;
  setor_destino_nome?: string | null;
  mencionados?: { user_id: string; nome?: string | null }[];
  anexos_count?: number;
}

async function enrich(rows: any[]): Promise<DemandaTarefa[]> {
  if (!rows.length) return [];
  const userIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.created_by, r.responsavel_id])
        .filter((x): x is string => !!x),
    ),
  );
  const setorIds = Array.from(
    new Set(rows.map((r) => r.setor_destino_id).filter((x): x is string => !!x)),
  );
  const tarefaIds = rows.map((r) => r.id);

  const [profilesRes, setoresRes, mencRes, anexosRes] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id, nome_completo").in("id", userIds)
      : Promise.resolve({ data: [] as any[] }),
    setorIds.length
      ? supabase.from("setores").select("id, nome").in("id", setorIds)
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from("worklist_tarefa_mencionados")
      .select("tarefa_id, user_id")
      .in("tarefa_id", tarefaIds),
    supabase
      .from("worklist_tarefa_anexos")
      .select("tarefa_id")
      .in("tarefa_id", tarefaIds),
  ]);

  const profilesMap = new Map(
    (profilesRes.data || []).map((p: any) => [p.id, p.nome_completo]),
  );
  const setoresMap = new Map(
    (setoresRes.data || []).map((s: any) => [s.id, s.nome]),
  );
  const mencByTarefa = new Map<string, { user_id: string; nome?: string | null }[]>();
  (mencRes.data || []).forEach((m: any) => {
    const list = mencByTarefa.get(m.tarefa_id) || [];
    list.push({ user_id: m.user_id, nome: profilesMap.get(m.user_id) ?? null });
    mencByTarefa.set(m.tarefa_id, list);
  });
  const mencUserIds = Array.from(
    new Set((mencRes.data || []).map((m: any) => m.user_id)),
  ).filter((id) => !profilesMap.has(id));
  if (mencUserIds.length) {
    const { data: extras } = await supabase
      .from("profiles")
      .select("id, nome_completo")
      .in("id", mencUserIds);
    (extras || []).forEach((p: any) => profilesMap.set(p.id, p.nome_completo));
    mencByTarefa.forEach((list) => {
      list.forEach((m) => {
        if (!m.nome) m.nome = profilesMap.get(m.user_id) ?? null;
      });
    });
  }
  const anexosCount = new Map<string, number>();
  (anexosRes.data || []).forEach((a: any) => {
    anexosCount.set(a.tarefa_id, (anexosCount.get(a.tarefa_id) || 0) + 1);
  });

  return rows.map((r) => ({
    ...r,
    responsavel_nome: r.responsavel_id ? profilesMap.get(r.responsavel_id) ?? null : null,
    criador_nome: r.created_by ? profilesMap.get(r.created_by) ?? null : null,
    setor_destino_nome: r.setor_destino_id
      ? setoresMap.get(r.setor_destino_id) ?? null
      : null,
    mencionados: mencByTarefa.get(r.id) ?? [],
    anexos_count: anexosCount.get(r.id) ?? 0,
  })) as DemandaTarefa[];
}

export function useDemandasMinhasEnviadas() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["demandas", "enviadas", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worklist_tarefas")
        .select("*")
        .eq("modulo", "demandas")
        .eq("created_by", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return enrich(data || []);
    },
  });
}

export function useDemandasParaMim() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["demandas", "para-mim", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // Tarefas onde sou responsável
      const responsavelP = supabase
        .from("worklist_tarefas")
        .select("*")
        .eq("modulo", "demandas")
        .eq("responsavel_id", user!.id);

      // Tarefas em que fui mencionado
      const mencP = supabase
        .from("worklist_tarefa_mencionados")
        .select("tarefa_id")
        .eq("user_id", user!.id);

      const [respRes, mencRes] = await Promise.all([responsavelP, mencP]);
      if (respRes.error) throw respRes.error;
      if (mencRes.error) throw mencRes.error;

      const mencIds = (mencRes.data || []).map((m) => m.tarefa_id);
      let mencionadasRows: any[] = [];
      if (mencIds.length) {
        const { data, error } = await supabase
          .from("worklist_tarefas")
          .select("*")
          .eq("modulo", "demandas")
          .in("id", mencIds);
        if (error) throw error;
        mencionadasRows = data || [];
      }

      const map = new Map<string, any>();
      [...(respRes.data || []), ...mencionadasRows].forEach((r) => map.set(r.id, r));
      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      return enrich(merged);
    },
  });
}

export function useDemandasDoSetor(setorId: string | null | undefined) {
  return useQuery({
    queryKey: ["demandas", "agenda-setor", setorId],
    enabled: !!setorId,
    queryFn: async () => {
      // Para o calendário trazemos tudo que o usuário consegue ver e que tem data_limite
      const { data, error } = await supabase
        .from("worklist_tarefas")
        .select("*")
        .eq("modulo", "demandas")
        .not("data_limite", "is", null)
        .order("data_limite", { ascending: true });
      if (error) throw error;
      return enrich(data || []);
    },
  });
}

export function usePendenciasSetor(setorId: string | null | undefined, isAdmin = false) {
  return useQuery({
    queryKey: ["demandas", "pendencias-setor", setorId, isAdmin],
    enabled: !!setorId || isAdmin,
    queryFn: async () => {
      let q: any = supabase.from("vw_worklist_pendencias_setor" as any).select("*");
      if (!isAdmin && setorId) q = q.eq("setor_id", setorId);
      const { data, error } = await q.order("urgencia", { ascending: false }).limit(200);
      if (error) throw error;
      return (data || []) as unknown as Array<{
        id: string;
        setor_id: string;
        origem: string;
        recurso_id: string;
        titulo: string;
        descricao: string;
        urgencia: string;
        referencia_data: string;
        link: string;
      }>;
    },
  });
}

export interface NovaDemandaInput {
  titulo: string;
  descricao?: string;
  setor_destino_id: string | null;
  escopo: "setor" | "geral";
  responsavel_id?: string | null;
  mencionados?: string[];
  urgencia: "baixa" | "media" | "alta" | "critica";
  tipo: "tarefa" | "arquivo" | "esclarecimento";
  data_limite?: string | null;
  licitacao_id?: string | null;
  contrato_id?: string | null;
  lead_id?: string | null;
  sigzap_conversation_id?: string | null;
  setor_origem_id?: string | null;
  modulo?: string;
  checklist?: { texto: string; ok: boolean }[];
  tags?: string[];
}

export function useCriarDemanda() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NovaDemandaInput) => {
      if (!user?.id) throw new Error("Sem usuário autenticado");
      const { data, error } = await supabase
        .from("worklist_tarefas")
        .insert({
          modulo: input.modulo ?? "demandas",
          titulo: input.titulo,
          descricao: input.descricao ?? null,
          status: "aberta",
          urgencia: input.urgencia,
          tipo: input.tipo,
          escopo: input.escopo,
          prioridade: input.urgencia,
          setor_destino_id: input.setor_destino_id,
          setor_origem_id: input.setor_origem_id ?? null,
          responsavel_id: input.responsavel_id ?? null,
          data_limite: input.data_limite ?? null,
          licitacao_id: input.licitacao_id ?? null,
          contrato_id: input.contrato_id ?? null,
          lead_id: input.lead_id ?? null,
          sigzap_conversation_id: input.sigzap_conversation_id ?? null,
          created_by: user.id,
          checklist: (input.checklist ?? []) as any,
          tags: (input.tags ?? []) as any,
        })
        .select("id")
        .single();
      if (error) throw error;
      const tarefaId = data.id as string;
      if (input.mencionados && input.mencionados.length) {
        const rows = input.mencionados.map((uid) => ({ tarefa_id: tarefaId, user_id: uid }));
        const { error: mErr } = await supabase
          .from("worklist_tarefa_mencionados")
          .insert(rows);
        if (mErr) throw mErr;
      }
      return tarefaId;
    },
    onSuccess: () => {
      toast.success("Demanda criada");
      qc.invalidateQueries({ queryKey: ["demandas"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao criar demanda"),
  });
}

export function useAtualizarStatusDemanda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: any = { status, updated_at: new Date().toISOString() };
      if (status === "concluida") patch.concluida_em = new Date().toISOString();
      const { error } = await supabase.from("worklist_tarefas").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demandas"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar"),
  });
}

export function useUploadAnexoDemanda() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      tarefaId,
      file,
      nome,
    }: {
      tarefaId: string;
      file: File | Blob;
      nome?: string;
    }) => {
      if (!user?.id) throw new Error("Sem usuário autenticado");
      const ext = (nome || (file as File).name || "anexo").split(".").pop() || "bin";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `${tarefaId}/${fileName}`;
      const { error: upErr } = await supabase.storage
        .from("worklist-anexos")
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("worklist_tarefa_anexos").insert({
        tarefa_id: tarefaId,
        storage_path: path,
        mime_type: (file as File).type || null,
        nome: nome || (file as File).name || fileName,
        tamanho_bytes: (file as File).size || null,
        created_by: user.id,
      });
      if (insErr) throw insErr;
      return path;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demandas"] });
    },
  });
}
