import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  instance_ids?: string[];
  dry_run?: boolean;
};

function digitsOnly(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

function brPhone(v: string): string {
  const d = digitsOnly(v);
  if (d.startsWith("55") && d.length > 11) return d.slice(2);
  return d;
}

/**
 * Chave de dedupe que unifica variações com/sem o dígito 9 (celular BR).
 * - Se for 11 dígitos e o 3º dígito for 9: remove esse 9 e retorna 10 dígitos
 * - Se for 10 dígitos: retorna 10 dígitos
 */
function dedupeKey(rawPhone: string): string {
  const br = brPhone(rawPhone);
  const last11 = br.length >= 11 ? br.slice(-11) : br;
  const last10 = br.length >= 10 ? br.slice(-10) : br;

  if (last11.length === 11 && last11[2] === "9") {
    return last11.slice(0, 2) + last11.slice(3);
  }

  if (last10.length === 10) return last10;
  return br;
}

function preferCanonicalPhone(a: string, b: string): string {
  // Preferimos o formato celular com 9 (11 dígitos) quando existir
  const aa = brPhone(a);
  const bb = brPhone(b);

  const a11 = aa.length >= 11 ? aa.slice(-11) : aa;
  const b11 = bb.length >= 11 ? bb.slice(-11) : bb;

  const aLooksMobile = a11.length === 11 && a11[2] === "9";
  const bLooksMobile = b11.length === 11 && b11[2] === "9";

  if (aLooksMobile && !bLooksMobile) return a;
  if (bLooksMobile && !aLooksMobile) return b;

  // fallback: maior (geralmente tem DDI) e depois lexicográfico
  if (aa.length !== bb.length) return aa.length > bb.length ? a : b;
  return a < b ? a : b;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Verificar autenticação (somente usuário logado pode disparar)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: Body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const instanceIds = Array.isArray(body.instance_ids) ? body.instance_ids : null;
    const dryRun = body.dry_run === true;

    // 1) Carregar contatos
    let contactsQuery = supabase
      .from("sigzap_contacts")
      .select("id, instance_id, contact_phone")
      .not("instance_id", "is", null)
      .not("contact_phone", "is", null)
      .limit(5000);

    if (instanceIds && instanceIds.length > 0) {
      contactsQuery = contactsQuery.in("instance_id", instanceIds);
    }

    const { data: contacts, error: contactsError } = await contactsQuery;
    if (contactsError) throw contactsError;

    if (!contacts || contacts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum contato para processar", merged: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2) Agrupar duplicidades por instância + chave
    const groups = new Map<string, { instanceId: string; key: string; contactIds: string[]; phones: Record<string, string> }>();

    for (const c of contacts as any[]) {
      const instanceId = c.instance_id as string;
      const phone = String(c.contact_phone ?? "");
      const k = dedupeKey(phone);
      if (!k) continue;
      const gk = `${instanceId}:${k}`;
      if (!groups.has(gk)) {
        groups.set(gk, { instanceId, key: k, contactIds: [], phones: {} });
      }
      const g = groups.get(gk)!;
      g.contactIds.push(c.id);
      g.phones[c.id] = phone;
    }

    const duplicateGroups = Array.from(groups.values()).filter((g) => g.contactIds.length > 1);
    if (duplicateGroups.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma duplicidade encontrada", merged: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3) Buscar conversas desses contatos
    const allDupContactIds = duplicateGroups.flatMap((g) => g.contactIds);

    const { data: convs, error: convsError } = await supabase
      .from("sigzap_conversations")
      .select("id, instance_id, contact_id, last_message_at, last_message_text, unread_count, assigned_user_id, status")
      .in("contact_id", allDupContactIds)
      .limit(10000);

    if (convsError) throw convsError;

    const convByContact = new Map<string, any>();
    (convs || []).forEach((c: any) => convByContact.set(c.contact_id, c));

    let mergedGroups = 0;
    let movedMessages = 0;
    let deletedConversations = 0;
    let deletedContacts = 0;

    const errors: { group: string; error: string }[] = [];

    for (const g of duplicateGroups) {
      const convList = g.contactIds
        .map((cid) => convByContact.get(cid))
        .filter(Boolean);

      if (convList.length <= 1) continue;

      try {
        // Escolher contato canônico (preferindo telefone com 9)
        let canonicalContactId = g.contactIds[0];
        for (const cid of g.contactIds.slice(1)) {
          const a = g.phones[canonicalContactId] ?? "";
          const b = g.phones[cid] ?? "";
          const preferred = preferCanonicalPhone(a, b);
          canonicalContactId = preferred === a ? canonicalContactId : cid;
        }

        // Escolher conversa canônica
        const convSorted = [...convList].sort((a, b) => {
          const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
          const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
          return tb - ta;
        });

        const canonicalConv = convByContact.get(canonicalContactId) ?? convSorted[0];
        const canonicalConvId = canonicalConv.id as string;

        const toMerge = convList.filter((c: any) => c.id !== canonicalConvId);
        const mergeIds = toMerge.map((c: any) => c.id as string);
        if (mergeIds.length === 0) continue;

        // Consolidar dados da conversa canônica
        const bestAssigned = [canonicalConv, ...toMerge].find((c: any) => !!c.assigned_user_id)?.assigned_user_id ?? null;
        const bestStatus = [canonicalConv, ...toMerge].some((c: any) => c.status === "in_progress") ? "in_progress" : (canonicalConv.status ?? "open");
        const bestUnread = Math.max(...[canonicalConv, ...toMerge].map((c: any) => Number(c.unread_count || 0)));

        // Última mensagem (por conversa) - usado como fallback rápido
        const latestConv = convSorted[0];
        const nextLastMessageAt = latestConv.last_message_at ?? canonicalConv.last_message_at ?? null;
        const nextLastMessageText = latestConv.last_message_text ?? canonicalConv.last_message_text ?? null;

        if (!dryRun) {
          // mover mensagens
          const { data: moved, error: moveErr } = await supabase
            .from("sigzap_messages")
            .update({ conversation_id: canonicalConvId })
            .in("conversation_id", mergeIds)
            .select("id");
          if (moveErr) throw moveErr;
          movedMessages += moved?.length ?? 0;

          // deletar conversas duplicadas
          const { error: delConvErr } = await supabase
            .from("sigzap_conversations")
            .delete()
            .in("id", mergeIds);
          if (delConvErr) throw delConvErr;
          deletedConversations += mergeIds.length;

          // atualizar conversa canônica
          await supabase
            .from("sigzap_conversations")
            .update({
              assigned_user_id: bestAssigned,
              status: bestStatus,
              unread_count: bestUnread,
              last_message_at: nextLastMessageAt,
              last_message_text: nextLastMessageText,
              updated_at: new Date().toISOString(),
            })
            .eq("id", canonicalConvId);

          // apagar contatos que ficaram sem conversa
          const otherContactIds = g.contactIds.filter((cid) => cid !== canonicalContactId);
          if (otherContactIds.length > 0) {
            // Como removemos as conversas, esses contatos não devem mais ser referenciados
            const { error: delContactsErr } = await supabase
              .from("sigzap_contacts")
              .delete()
              .in("id", otherContactIds);
            if (!delContactsErr) {
              deletedContacts += otherContactIds.length;
            }
          }
        }

        mergedGroups++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        errors.push({ group: `${g.instanceId}:${g.key}`, error: msg });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dryRun,
        found_groups: duplicateGroups.length,
        merged_groups: mergedGroups,
        moved_messages: movedMessages,
        deleted_conversations: deletedConversations,
        deleted_contacts: deletedContacts,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("❌ sigzap-dedupe-conversations error:", error);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
