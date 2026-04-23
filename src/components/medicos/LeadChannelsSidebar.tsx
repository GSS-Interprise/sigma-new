import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, Instagram, Linkedin, Loader2, Construction } from "lucide-react";
import { SigZapChatColumn } from "@/components/sigzap/SigZapChatColumn";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface LeadChannelsSidebarProps {
  leadId: string;
  activeConversaIdOverride?: string | null;
}

export function LeadChannelsSidebar({ leadId, activeConversaIdOverride }: LeadChannelsSidebarProps) {
  const [selectedConversaId, setSelectedConversaId] = useState<string | null>(null);
  const [activeChannelTab, setActiveChannelTab] = useState("whatsapp");

  // When parent sets a conversation, switch to whatsapp tab and select it
  useEffect(() => {
    if (activeConversaIdOverride) {
      setSelectedConversaId(activeConversaIdOverride);
      setActiveChannelTab("whatsapp");
    }
  }, [activeConversaIdOverride]);

  // Fetch conversations for this lead
  const { data: conversas, isLoading } = useQuery({
    queryKey: ['lead-sigzap-conversas-sidebar', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sigzap_conversations')
        .select(`
          id, status, last_message_at, last_message_text, unread_count,
          contact:sigzap_contacts(contact_name, contact_phone),
          instance:sigzap_instances(id, name)
        `)
        .eq('lead_id', leadId)
        .order('last_message_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!leadId,
  });

  // Auto-select first conversation
  const activeConversaId = selectedConversaId || conversas?.[0]?.id || null;

  return (
    <Tabs value={activeChannelTab} onValueChange={setActiveChannelTab} className="flex flex-col h-full">
      <TabsList className="grid grid-cols-3 mx-2 mt-2 flex-shrink-0">
        <TabsTrigger value="whatsapp" className="gap-1 text-[10px] px-1">
          <MessageCircle className="h-3 w-3" />
          WhatsApp
        </TabsTrigger>
        <TabsTrigger value="instagram" className="gap-1 text-[10px] px-1">
          <Instagram className="h-3 w-3" />
          Instagram
        </TabsTrigger>
        <TabsTrigger value="linkedin" className="gap-1 text-[10px] px-1">
          <Linkedin className="h-3 w-3" />
          LinkedIn
        </TabsTrigger>
      </TabsList>

      {/* WhatsApp Tab */}
      <TabsContent value="whatsapp" className="flex-1 min-h-0 flex flex-col m-0 mt-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !conversas || conversas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-4">
            <MessageCircle className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-xs text-center">Nenhuma conversa WhatsApp encontrada para este lead.</p>
          </div>
        ) : (
          <div className="flex flex-col h-full min-h-0">
            {/* Conversation selector if multiple */}
            {conversas.length > 1 && (
              <div className="px-2 pb-1 flex gap-1 overflow-x-auto flex-shrink-0">
                {conversas.map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedConversaId(c.id)}
                    className={cn(
                      "text-[10px] px-2 py-1 rounded-full border whitespace-nowrap transition-colors",
                      activeConversaId === c.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 hover:bg-muted border-border"
                    )}
                  >
                    {c.instance?.name || "WhatsApp"}
                    {c.unread_count > 0 && (
                      <Badge variant="destructive" className="ml-1 text-[8px] px-1 py-0 h-3">
                        {c.unread_count}
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
            {/* Chat */}
            <div className="flex-1 min-h-0">
              <SigZapChatColumn conversaId={activeConversaId} hideLeadButton />
            </div>
          </div>
        )}
      </TabsContent>

      {/* Instagram Tab */}
      <TabsContent value="instagram" className="flex-1 min-h-0 m-0 mt-1">
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
          <Construction className="h-10 w-10 opacity-40" />
          <div className="text-center">
            <p className="text-sm font-medium">Em desenvolvimento</p>
            <p className="text-xs opacity-60 mt-1">A integração com Instagram estará disponível em breve.</p>
          </div>
        </div>
      </TabsContent>

      {/* LinkedIn Tab */}
      <TabsContent value="linkedin" className="flex-1 min-h-0 m-0 mt-1">
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
          <Construction className="h-10 w-10 opacity-40" />
          <div className="text-center">
            <p className="text-sm font-medium">Em desenvolvimento</p>
            <p className="text-xs opacity-60 mt-1">A integração com LinkedIn estará disponível em breve.</p>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
