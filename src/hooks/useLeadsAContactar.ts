import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LeadAContactar {
  lead_id: string;
  nome: string | null;
  phone_e164: string | null;
  telefones_adicionais: string[] | null;
  especialidade: string | null;
  uf: string | null;
  cidade: string | null;
  contactado: boolean;
  ultimo_contato_em: string | null;
}

export function useLeadsAContactar(campanhaPropostaId: string | null | undefined) {
  return useQuery({
    queryKey: ["leads-a-contactar", campanhaPropostaId],
    enabled: !!campanhaPropostaId,
    queryFn: async (): Promise<LeadAContactar[]> => {
      // 1. Pega status_proposta dos leads
      const { data: statusRows, error: e1 } = await (supabase as any)
        .from("vw_lead_status_por_proposta")
        .select("lead_id, status_proposta")
        .eq("campanha_proposta_id", campanhaPropostaId!)
        .eq("status_proposta", "a_contactar");
      // A view pode falhar por permissões internas (ex.: lead_liberacoes).
      // Nesses casos, seguimos com fallback pela lista vinculada à proposta.
      if (e1 && e1.code !== "42501") throw e1;

      let leadIds = Array.from(
        new Set((statusRows || []).map((r: any) => r.lead_id).filter(Boolean))
      ) as string[];

      // Fallback: quando a proposta ainda não materializou status por canal,
      // usa os leads da lista vinculada e trata todos como "a contactar".
      if (leadIds.length === 0) {
        const { data: propostaRow, error: eLista } = await supabase
          .from("campanha_propostas")
          .select("lista_id")
          .eq("id", campanhaPropostaId!)
          .maybeSingle();

        if (eLista) throw eLista;

        if (propostaRow?.lista_id) {
          // Pagina manualmente — Supabase trava em 1000 por padrão
          const PAGE = 1000;
          let from = 0;
          const acc: any[] = [];
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { data: page, error: eItems } = await supabase
              .from("disparo_lista_itens")
              .select("lead_id")
              .eq("lista_id", propostaRow.lista_id)
              .range(from, from + PAGE - 1);
            if (eItems) throw eItems;
            if (!page || page.length === 0) break;
            acc.push(...page);
            if (page.length < PAGE) break;
            from += PAGE;
          }
          leadIds = Array.from(
            new Set(acc.map((item: any) => item.lead_id).filter(Boolean))
          ) as string[];
        }
      }

      if (leadIds.length === 0) return [];

      // 2. Busca dados dos leads em lotes (URL fica gigante com milhares de UUIDs)
      const chunk = <T,>(arr: T[], size: number): T[][] => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
      };
      const leadIdChunks = chunk(leadIds, 200);
      const leadsAcc: any[] = [];
      for (const ids of leadIdChunks) {
        const { data: page, error: e2 } = await supabase
          .from("leads")
          .select("id, nome, phone_e164, telefones_adicionais, especialidade, uf, cidade")
          .in("id", ids)
          .is("merged_into_id", null);
        if (e2) throw e2;
        if (page) leadsAcc.push(...page);
      }
      const leads = leadsAcc;

      // 3. Busca envios manuais já realizados nesta proposta para marcar como "contactado"
      const enviosAcc: any[] = [];
      for (const ids of leadIdChunks) {
        const { data: page } = await (supabase as any)
          .from("disparo_manual_envios")
          .select("lead_id, created_at, status")
          .eq("campanha_proposta_id", campanhaPropostaId!)
          .in("lead_id", ids);
        if (page) enviosAcc.push(...page);
      }
      const envios = enviosAcc;

      const contactMap = new Map<string, string>();
      for (const e of envios || []) {
        if (e.status && e.status !== "enviado") continue;
        const prev = contactMap.get(e.lead_id);
        if (!prev || new Date(e.created_at) > new Date(prev)) {
          contactMap.set(e.lead_id, e.created_at);
        }
      }

      // 3b. Fallback: também marca como contactado quando existir QUALQUER mensagem
      // enviada por nós (from_me=true) em conversas SIG Zap vinculadas ao lead.
      // Cobre o caso em que o usuário enviou direto pelo input do chat.
      const convsAcc: any[] = [];
      for (const ids of leadIdChunks) {
        const { data: page } = await (supabase as any)
          .from("sigzap_conversations")
          .select("id, lead_id")
          .in("lead_id", ids);
        if (page) convsAcc.push(...page);
      }
      const convs = convsAcc;
      const convIdToLead = new Map<string, string>();
      for (const c of convs || []) convIdToLead.set(c.id, c.lead_id);
      const convIds = Array.from(convIdToLead.keys());
      if (convIds.length > 0) {
        const convIdChunks = chunk(convIds, 200);
        const msgsAcc: any[] = [];
        for (const ids of convIdChunks) {
          const { data: page } = await (supabase as any)
            .from("sigzap_messages")
            .select("conversation_id, sent_at, created_at, from_me")
            .in("conversation_id", ids)
            .eq("from_me", true);
          if (page) msgsAcc.push(...page);
        }
        for (const m of msgsAcc) {
          const lid = convIdToLead.get(m.conversation_id);
          if (!lid) continue;
          const ts = m.sent_at || m.created_at;
          const prev = contactMap.get(lid);
          if (!prev || (ts && new Date(ts) > new Date(prev))) {
            contactMap.set(lid, ts);
          }
        }
      }

      // 3c. Sincroniza com a fila do disparo em massa: leads que o n8n já
      // pegou (3-TRATANDO) ou enviou (4-ENVIADO) também contam como contactado,
      // mesmo que ainda não exista mensagem em sigzap_messages.
      const filaAcc: any[] = [];
      for (const ids of leadIdChunks) {
        const { data: page } = await (supabase as any)
          .from("disparos_contatos")
          .select("lead_id, updated_at, status")
          .eq("campanha_proposta_id", campanhaPropostaId!)
          .in("lead_id", ids)
          .in("status", ["3-TRATANDO", "4-ENVIADO"]);
        if (page) filaAcc.push(...page);
      }
      for (const r of filaAcc) {
        const ts = r.updated_at;
        const prev = contactMap.get(r.lead_id);
        if (!prev || (ts && new Date(ts) > new Date(prev))) {
          contactMap.set(r.lead_id, ts);
        }
      }

      return (leads || []).map((l: any) => ({
        lead_id: l.id,
        nome: l.nome,
        phone_e164: l.phone_e164,
        telefones_adicionais: l.telefones_adicionais,
        especialidade: l.especialidade,
        uf: l.uf,
        cidade: l.cidade,
        contactado: contactMap.has(l.id),
        ultimo_contato_em: contactMap.get(l.id) ?? null,
      }));
    },
  });
}