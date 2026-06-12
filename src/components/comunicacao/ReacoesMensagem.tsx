import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SmilePlus } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReacaoTipo = "ok" | "aprovado" | "triste" | "feliz" | "legal" | "coracao";

export const REACOES: Array<{ tipo: ReacaoTipo; emoji: string; label: string }> = [
  { tipo: "ok",       emoji: "👌", label: "OK" },
  { tipo: "aprovado", emoji: "✅", label: "Aprovado" },
  { tipo: "feliz",    emoji: "😄", label: "Feliz" },
  { tipo: "triste",   emoji: "😢", label: "Triste" },
  { tipo: "legal",    emoji: "😎", label: "Legal" },
  { tipo: "coracao",  emoji: "❤️", label: "Coração" },
];

export interface Reacao {
  id: string;
  mensagem_id: string;
  user_id: string;
  user_nome: string;
  reacao: ReacaoTipo;
}

interface ReacoesMensagemProps {
  mensagemId: string;
  canalId: string;
  reacoes: Reacao[];
  currentUserId?: string;
  currentUserNome?: string;
  isOwn: boolean;
}

export function ReacoesMensagem({
  mensagemId,
  canalId,
  reacoes,
  currentUserId,
  currentUserNome,
  isOwn,
}: ReacoesMensagemProps) {
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  const toggleMutation = useMutation({
    mutationFn: async (tipo: ReacaoTipo) => {
      if (!currentUserId) return;
      const existente = reacoes.find(
        (r) => r.reacao === tipo && r.user_id === currentUserId
      );
      if (existente) {
        await supabase.from("comunicacao_reacoes").delete().eq("id", existente.id);
      } else {
        await supabase.from("comunicacao_reacoes").insert({
          mensagem_id: mensagemId,
          user_id: currentUserId,
          user_nome: currentUserNome || "Usuário",
          reacao: tipo,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reacoes", canalId] });
    },
  });

  const grupos = REACOES.map((r) => ({
    ...r,
    items: reacoes.filter((x) => x.reacao === r.tipo),
  })).filter((g) => g.items.length > 0);

  return (
    <div className={cn("flex flex-wrap items-center gap-1 mt-1", isOwn && "justify-end")}>
      <TooltipProvider delayDuration={200}>
        {grupos.map((g) => {
          const reagiu = g.items.some((i) => i.user_id === currentUserId);
          const nomes = g.items.map((i) => i.user_nome).join(", ");
          return (
            <Tooltip key={g.tipo}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => toggleMutation.mutate(g.tipo)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                    reagiu
                      ? "bg-primary/15 border-primary text-primary"
                      : "bg-background hover:bg-muted border-border"
                  )}
                >
                  <span>{g.emoji}</span>
                  <span className="font-medium">{g.items.length}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs font-medium">{g.label}</p>
                <p className="text-xs text-muted-foreground max-w-[220px]">{nomes}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </TooltipProvider>

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full border border-dashed border-border bg-background hover:bg-muted h-6 w-6 text-muted-foreground"
            title="Reagir"
          >
            <SmilePlus className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align={isOwn ? "end" : "start"}>
          <div className="flex gap-1">
            {REACOES.map((r) => {
              const reagiu = reacoes.some(
                (x) => x.reacao === r.tipo && x.user_id === currentUserId
              );
              return (
                <button
                  key={r.tipo}
                  type="button"
                  onClick={() => {
                    toggleMutation.mutate(r.tipo);
                    setPickerOpen(false);
                  }}
                  title={r.label}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-md px-2 py-1.5 text-lg hover:bg-muted transition-colors",
                    reagiu && "bg-primary/15 ring-1 ring-primary"
                  )}
                >
                  <span>{r.emoji}</span>
                  <span className="text-[9px] text-muted-foreground mt-0.5">{r.label}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}