import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Search, User, MessageCircle, Inbox, UserCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { normalizeToE164 } from "@/lib/phoneUtils";
import { sigzapNormalizePhoneKey } from "@/lib/sigzapPhoneKey";

interface MonitorConversasListProps {
  captadorId: string | null;
  selectedConversaId: string | null;
  onSelectConversa: (id: string) => void;
}

const PAGE_SIZE = 200;

export function MonitorConversasList({
  captadorId,
  selectedConversaId,
  onSelectConversa,
}: MonitorConversasListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString();
  }, []);

  // Only fetch conversations when a captador is selected
  const { data: conversas, isLoading } = useQuery({
    queryKey: ["monitor-conversations", captadorId],
    queryFn: async () => {
      if (!captadorId) return [];

      // Paginate in chunks to avoid 1000-row limit
      let allData: any[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error } = await supabase
          .from("sigzap_conversations")
          .select(`
            *,
            contact:sigzap_contacts(*),
            instance:sigzap_instances(id, name),
            assigned_user:profiles!sigzap_conversations_assigned_user_id_fkey(id, nome_completo)
          `)
          .eq("assigned_user_id", captadorId)
          .neq("status", "inactive")
          .gte("last_message_at", thirtyDaysAgo)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .range(from, to);

        if (error) throw error;

        allData = allData.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        page++;
      }

      return deduplicateConversas(allData);
    },
    enabled: !!captadorId,
    refetchInterval: 20000,
  });

  // Search query: when user types in search, fetch ALL conversations for this captador (no date limit)
  const { data: searchResults, isLoading: loadingSearch } = useQuery({
    queryKey: ["monitor-search", captadorId, searchTerm],
    queryFn: async () => {
      if (!captadorId || !searchTerm || searchTerm.length < 2) return null;

      // Search by contact phone or name via contacts table
      // We fetch all captador conversations without date limit for search
      let allData: any[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error } = await supabase
          .from("sigzap_conversations")
          .select(`
            *,
            contact:sigzap_contacts(*),
            instance:sigzap_instances(id, name),
            assigned_user:profiles!sigzap_conversations_assigned_user_id_fkey(id, nome_completo)
          `)
          .eq("assigned_user_id", captadorId)
          .neq("status", "inactive")
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .range(from, to);

        if (error) throw error;

        allData = allData.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        page++;

        // Safety: max 5 pages (1000 results) for search
        if (page >= 5) break;
      }

      const deduped = deduplicateConversas(allData);

      // Filter client-side by search term
      const s = searchTerm.toLowerCase();
      return deduped.filter((c: any) => {
        const contact = c.contact as any;
        return (
          contact?.contact_name?.toLowerCase().includes(s) ||
          contact?.contact_phone?.includes(searchTerm)
        );
      });
    },
    enabled: !!captadorId && searchTerm.length >= 2,
    staleTime: 10000,
  });

  // Fetch captador colors for badges
  const assignedUserIds = useMemo(() => {
    const source = searchTerm.length >= 2 && searchResults ? searchResults : conversas;
    if (!source) return [];
    return [...new Set(source.map((c: any) => c.assigned_user_id).filter(Boolean))] as string[];
  }, [conversas, searchResults, searchTerm]);

  const { data: captadorCores } = useQuery({
    queryKey: ["monitor-captador-cores", assignedUserIds],
    queryFn: async () => {
      if (assignedUserIds.length === 0) return {};
      const { data } = await supabase
        .from("captacao_permissoes_usuario")
        .select("user_id, cor")
        .in("user_id", assignedUserIds);
      const map: Record<string, string> = {};
      data?.forEach((p) => {
        if (p.cor) map[p.user_id] = p.cor;
      });
      return map;
    },
    enabled: assignedUserIds.length > 0,
  });

  // Resolve lead names by phone
  const displayList = useMemo(() => {
    if (searchTerm.length >= 2 && searchResults) return searchResults;
    return conversas || [];
  }, [conversas, searchResults, searchTerm]);

  const phoneNumbers = useMemo(() => {
    return displayList
      .map((c: any) => (c.contact as any)?.contact_phone)
      .filter(Boolean)
      .map((phone: string) => normalizeToE164(phone))
      .filter(Boolean) as string[];
  }, [displayList]);

  const { data: leadsMap } = useQuery({
    queryKey: ["monitor-leads-phone", phoneNumbers],
    queryFn: async () => {
      if (phoneNumbers.length === 0) return {};
      // Chunk phone lookups to avoid overly large IN clauses
      const chunkSize = 200;
      const map: Record<string, string> = {};
      for (let i = 0; i < phoneNumbers.length; i += chunkSize) {
        const chunk = phoneNumbers.slice(i, i + chunkSize);
        const { data } = await supabase
          .from("leads")
          .select("id, nome, phone_e164")
          .in("phone_e164", chunk);
        data?.forEach((lead) => {
          if (lead.phone_e164 && lead.nome) map[lead.phone_e164] = lead.nome;
        });
      }
      return map;
    },
    enabled: phoneNumbers.length > 0,
  });

  const toHslAlpha = (color: string, alpha: number) => {
    if (color.startsWith("hsl("))
      return color.replace("hsl(", "hsla(").replace(")", `, ${alpha})`);
    return color;
  };

  const activeLoading = isLoading || (searchTerm.length >= 2 && loadingSearch);

  // No captador selected - show empty state
  if (!captadorId) {
    return (
      <div className="flex flex-col h-full border-r overflow-hidden">
        <div className="p-3 border-b bg-muted/30 flex items-center gap-2 h-12">
          <MessageCircle className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm flex-1">Conversas</h3>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-2 p-4">
          <UserCircle className="h-10 w-10 opacity-30" />
          <p className="text-sm text-center">Selecione um captador para ver as conversas</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border-r overflow-hidden">
      <div className="p-3 border-b bg-muted/30 flex items-center gap-2 h-12">
        <MessageCircle className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm flex-1">Conversas</h3>
        <Badge variant="secondary" className="text-xs">{displayList.length}</Badge>
      </div>

      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou número..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        {searchTerm.length >= 2 && (
          <p className="text-[10px] text-muted-foreground mt-1 px-1">
            Busca sem limite de data
          </p>
        )}
      </div>

      <ScrollArea className="flex-1">
        {activeLoading ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : displayList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Inbox className="h-8 w-8" />
            <p className="text-sm">Nenhuma conversa encontrada</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {displayList.map((conversa: any) => {
              const contact = conversa.contact as any;
              const instance = conversa.instance as any;
              const assignedUser = conversa.assigned_user as any;
              const isSelected = selectedConversaId === conversa.id;
              const corCaptador = captadorCores?.[conversa.assigned_user_id] || null;
              const assignedName = assignedUser?.nome_completo?.split(" ")[0] || null;
              const phoneE164 = contact?.contact_phone ? normalizeToE164(contact.contact_phone) : null;
              const leadName = phoneE164 && leadsMap ? leadsMap[phoneE164] : null;
              const displayName = contact?.contact_name || leadName || contact?.contact_phone || "Contato";
              const msgCount = conversa.unread_count || 0;

              return (
                <Card
                  key={conversa.id}
                  className={cn(
                    "p-3 cursor-pointer transition-all hover:shadow-md border-l-4",
                    !isSelected && "hover:bg-muted/40"
                  )}
                  style={{
                    borderLeftColor: corCaptador || "transparent",
                    ...(isSelected
                      ? { backgroundColor: corCaptador || "hsl(var(--primary))", color: "white" }
                      : corCaptador
                      ? { backgroundColor: toHslAlpha(corCaptador, 0.08) }
                      : {}),
                  }}
                  onClick={() => onSelectConversa(conversa.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative flex-shrink-0">
                      <div className="h-9 w-9 rounded-full flex items-center justify-center overflow-hidden bg-muted/50">
                        {contact?.profile_picture_url ? (
                          <img
                            src={contact.profile_picture_url}
                            alt={displayName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <User className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      {msgCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                          {msgCount > 99 ? "99+" : msgCount}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className={cn("font-medium text-sm truncate", isSelected && "text-white")}>
                          {displayName}
                        </h4>
                        {conversa.last_message_at && (
                          <span className={cn("text-[10px] flex-shrink-0", isSelected ? "text-white/70" : "text-muted-foreground")}>
                            {format(new Date(conversa.last_message_at), "dd/MM HH:mm", { locale: ptBR })}
                          </span>
                        )}
                      </div>
                      <p className={cn("text-xs truncate mt-0.5", isSelected ? "text-white/70" : "text-muted-foreground")}>
                        {contact?.contact_phone}
                      </p>
                      {conversa.last_message_text && (
                        <p className={cn("text-xs truncate mt-1 italic", isSelected ? "text-white/60" : "text-muted-foreground/80")}>
                          {conversa.last_message_text}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {instance?.name && (
                          <Badge variant="outline" className={cn("text-[10px] h-5", isSelected ? "border-white/40 text-white bg-white/10" : "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-300")}>
                            {instance.name}
                          </Badge>
                        )}
                        {assignedName && (
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] h-5 font-semibold", isSelected ? "border-white/40 text-white bg-white/20" : "")}
                            style={!isSelected && corCaptador ? {
                              backgroundColor: toHslAlpha(corCaptador, 0.1),
                              color: corCaptador,
                              borderColor: toHslAlpha(corCaptador, 0.3),
                            } : {}}
                          >
                            {assignedName}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function deduplicateConversas(data: any[]): any[] {
  const seen = new Map<string, any>();
  data.forEach((conv) => {
    const contact = conv.contact as any;
    const phoneRaw = contact?.contact_phone || contact?.contact_jid || "";
    const normalizedPhone = sigzapNormalizePhoneKey(phoneRaw);
    const fallback = contact?.id || conv.contact_id || conv.id;
    const key = `${conv.instance_id}-${normalizedPhone || fallback}`;
    if (!seen.has(key)) {
      seen.set(key, conv);
    } else {
      const existing = seen.get(key);
      if (new Date(conv.last_message_at || 0) > new Date(existing.last_message_at || 0)) {
        seen.set(key, conv);
      }
    }
  });
  return Array.from(seen.values());
}
