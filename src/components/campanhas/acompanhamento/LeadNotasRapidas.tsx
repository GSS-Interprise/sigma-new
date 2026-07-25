import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Send, StickyNote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  leadId: string;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível salvar a anotação.";
}

export function LeadNotasRapidas({ leadId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [conteudo, setConteudo] = useState("");
  const queryKey = ["lead-anotacoes-rapidas", leadId];

  const { data: anotacoes = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_anotacoes")
        .select("id, conteudo, created_at, usuario_nome")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const criarAnotacao = useMutation({
    mutationFn: async () => {
      const texto = conteudo.trim();
      if (!texto) return;
      const nome =
        user?.user_metadata?.nome_completo ||
        user?.user_metadata?.name ||
        user?.email ||
        "Usuário";
      const { error } = await supabase.from("lead_anotacoes").insert({
        lead_id: leadId,
        conteudo: texto,
        tipo: "anotacao",
        usuario_id: user?.id ?? null,
        usuario_nome: nome,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setConteudo("");
      await queryClient.invalidateQueries({ queryKey });
      toast({ title: "Anotação salva no histórico do lead." });
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar anotação",
        description: errorMessage(error),
        variant: "destructive",
      });
    },
  });

  return (
    <section className="space-y-4 p-4 sm:p-5">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <StickyNote className="h-4 w-4 text-primary" />
          Anotações do lead
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Visíveis em qualquer campanha, com autoria e data.
        </p>
      </div>

      <div className="space-y-2">
        <Textarea
          value={conteudo}
          onChange={(event) => setConteudo(event.target.value)}
          placeholder="Registre um contexto importante para a próxima pessoa..."
          className="min-h-24 resize-y"
          maxLength={2000}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs tabular-nums text-muted-foreground">{conteudo.length}/2000</span>
          <Button
            type="button"
            size="sm"
            className="min-h-11 min-w-28"
            disabled={!conteudo.trim() || criarAnotacao.isPending}
            onClick={() => criarAnotacao.mutate()}
          >
            {criarAnotacao.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Salvar
          </Button>
        </div>
      </div>

      <div className="space-y-3" aria-live="polite">
        {isLoading && (
          <div className="flex min-h-24 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando anotações...
          </div>
        )}
        {!isLoading && anotacoes.length === 0 && (
          <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
            Ainda não há anotações para este lead.
          </div>
        )}
        {anotacoes.map((anotacao) => (
          <article key={anotacao.id} className="rounded-lg border bg-card p-3 shadow-sm">
            <p className="whitespace-pre-wrap break-words text-sm">{anotacao.conteudo}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {anotacao.usuario_nome || "Usuário"} ·{" "}
              {format(new Date(anotacao.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
