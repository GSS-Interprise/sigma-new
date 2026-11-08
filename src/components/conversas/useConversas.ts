import { useEffect } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Dados da tela Conversas (só números oficiais, Chakra). Funções em
// supabase/migrations/20261108170000_conversas_oficiais.sql.

export type NumeroConversa = {
  instance_id: string;
  phone_e164: string;
  display_name: string | null;
  uso: string;
  disponibilidade: string | null;
  responsavel_nome: string | null;
  nao_lidas: number;
};

export type ConversaItem = {
  id: string;
  instance_id: string;
  lead_id: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number;
  assigned_user_id: string | null;
  service_window_expires_at: string | null;
  contact: { contact_name: string | null; contact_phone: string | null; profile_picture_url: string | null } | null;
  lead: { nome: string | null } | null;
};

export type Mensagem = {
  id: string;
  from_me: boolean;
  message_text: string | null;
  message_type: string | null;
  message_status: string | null;
  media_url: string | null;
  media_mime_type: string | null;
  media_filename: string | null;
  media_caption: string | null;
  quoted_message_text: string | null;
  provider_error_message: string | null;
  sent_at: string;
};

export type ModeloConversa = {
  template_id: string;
  friendly_name: string;
  body: string;
  variables: Record<string, string> | null;
  category: string | null;
};

export type FiltroConversa = "nao_lidas" | "todas" | "minhas" | "sem_dono";

const PAGINA = 60;
const rpc = (nome: string, args?: Record<string, unknown>) => (supabase as any).rpc(nome, args);

export function useNumerosConversa() {
  return useQuery({
    queryKey: ["conversas-numeros"],
    queryFn: async () => {
      const { data, error } = await rpc("conversas_numeros");
      if (error) throw error;
      return (data || []) as NumeroConversa[];
    },
    refetchInterval: 60_000,
  });
}

export function useListaConversas(instanceIds: string[], filtro: FiltroConversa, busca: string, userId: string | null) {
  return useInfiniteQuery({
    queryKey: ["conversas-lista", instanceIds.join(","), filtro, busca, userId],
    enabled: instanceIds.length > 0,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let contatoIds: string[] | null = null;
      const termo = busca.trim();
      if (termo.length >= 2) {
        const digitos = termo.replace(/\D/g, "");
        const { data: contatos, error: erroContatos } = await supabase
          .from("sigzap_contacts")
          .select("id")
          .in("instance_id", instanceIds)
          .or(digitos.length >= 4 ? `contact_phone.ilike.%${digitos}%,contact_name.ilike.%${termo}%` : `contact_name.ilike.%${termo}%`)
          .limit(200);
        if (erroContatos) throw erroContatos;
        contatoIds = (contatos || []).map((c) => c.id);
        if (contatoIds.length === 0) return [] as ConversaItem[];
      }
      let q = supabase
        .from("sigzap_conversations")
        .select("id, instance_id, lead_id, last_message_text, last_message_at, unread_count, assigned_user_id, service_window_expires_at, contact:sigzap_contacts(contact_name, contact_phone, profile_picture_url), lead:leads(nome)")
        .in("instance_id", instanceIds)
        .not("last_message_at", "is", null)
        .order("last_message_at", { ascending: false })
        .range(Number(pageParam), Number(pageParam) + PAGINA - 1);
      if (contatoIds) q = q.in("contact_id", contatoIds);
      if (filtro === "nao_lidas") q = q.gt("unread_count", 0);
      if (filtro === "minhas" && userId) q = q.eq("assigned_user_id", userId);
      if (filtro === "sem_dono") q = q.is("assigned_user_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as ConversaItem[];
    },
    getNextPageParam: (ultima, todas) => (ultima.length === PAGINA ? todas.length * PAGINA : undefined),
  });
}

export function useMensagens(conversaId: string | null) {
  return useInfiniteQuery({
    queryKey: ["conversas-mensagens", conversaId],
    enabled: !!conversaId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("sigzap_messages")
        .select("id, from_me, message_text, message_type, message_status, media_url, media_mime_type, media_filename, media_caption, quoted_message_text, provider_error_message, sent_at")
        .eq("conversation_id", conversaId as string)
        .order("sent_at", { ascending: false })
        .limit(PAGINA);
      if (pageParam) q = q.lt("sent_at", pageParam);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as Mensagem[];
    },
    getNextPageParam: (ultima) => (ultima.length === PAGINA ? ultima[ultima.length - 1].sent_at : undefined),
  });
}

export function useModelosConversa(conversaId: string | null, ativo: boolean) {
  return useQuery({
    queryKey: ["conversas-modelos", conversaId],
    enabled: !!conversaId && ativo,
    queryFn: async () => {
      const { data, error } = await rpc("conversa_modelos", { p_conversation_id: conversaId });
      if (error) throw error;
      return (data || []) as ModeloConversa[];
    },
  });
}

/** Mensagem nova, tique e "lida" chegam sem recarregar (lacuna de 05/11: a caixa não atualizava). */
export function useTempoRealConversas(conversaId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const atualizarLista = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        qc.invalidateQueries({ queryKey: ["conversas-lista"] });
        qc.invalidateQueries({ queryKey: ["conversas-numeros"] });
      }, 1500);
    };
    const canal = supabase
      .channel(`conversas-oficiais-${conversaId || "lista"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sigzap_conversations" }, atualizarLista);
    if (conversaId) {
      canal.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sigzap_messages", filter: `conversation_id=eq.${conversaId}` },
        () => qc.invalidateQueries({ queryKey: ["conversas-mensagens", conversaId] }),
      );
    }
    canal.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(canal);
    };
  }, [conversaId, qc]);
}
