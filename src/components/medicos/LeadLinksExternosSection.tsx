import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Link2, Plus, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface LeadLinksExternosSectionProps {
  leadId: string;
}

export function LeadLinksExternosSection({ leadId }: LeadLinksExternosSectionProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [linkNome, setLinkNome] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const { data: links = [], isLoading } = useQuery({
    queryKey: ["lead-links-externos", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_anexos")
        .select("*")
        .eq("lead_id", leadId)
        .eq("arquivo_tipo", "link_externo")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!leadId,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("lead_anexos").insert({
        lead_id: leadId,
        arquivo_nome: linkNome,
        arquivo_url: linkUrl,
        arquivo_tipo: "link_externo",
        usuario_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-links-externos", leadId] });
      queryClient.invalidateQueries({ queryKey: ["lead-anexos", leadId] });
      toast.success("Link adicionado");
      setLinkNome("");
      setLinkUrl("");
    },
    onError: () => toast.error("Erro ao adicionar link"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lead_anexos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-links-externos", leadId] });
      queryClient.invalidateQueries({ queryKey: ["lead-anexos", leadId] });
      toast.success("Link removido");
    },
    onError: () => toast.error("Erro ao remover link"),
  });

  const handleAdd = () => {
    if (!linkNome.trim() || !linkUrl.trim()) {
      toast.error("Preencha o nome e o link");
      return;
    }
    addMutation.mutate();
  };

  return (
    <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
      <h4 className="text-sm font-semibold flex items-center gap-2 text-primary border-b pb-2">
        <Link2 className="h-4 w-4" />
        Links Externos
      </h4>

      {/* Input row */}
      <div className="flex items-center gap-2">
        <Input
          value={linkNome}
          onChange={(e) => setLinkNome(e.target.value)}
          placeholder="Digite o nome aqui"
          className="h-8 text-sm flex-1"
        />
        <Input
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="Cole o link aqui"
          className="h-8 text-sm flex-1"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8 shrink-0 rounded-full border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          onClick={handleAdd}
          disabled={addMutation.isPending || !linkNome.trim() || !linkUrl.trim()}
        >
          {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>

      {/* Existing links */}
      {isLoading ? (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : links.length > 0 && (
        <div className="space-y-1.5">
          {links.map((link) => (
            <div
              key={link.id}
              className="flex items-center gap-2 group text-sm rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
            >
              <Link2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span className="font-medium truncate min-w-0">{link.arquivo_nome}</span>
              <a
                href={link.arquivo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline truncate min-w-0 flex-1"
                onClick={(e) => e.stopPropagation()}
              >
                {link.arquivo_url}
              </a>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={() => deleteMutation.mutate(link.id)}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
