import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ShieldAlert, ShieldOff, AlertTriangle, Clock, User } from "lucide-react";

interface BloqueioTemporarioSectionProps {
  leadId: string | null | undefined;
  nome?: string;
}

type BloqueioEntry = {
  id: string;
  lead_id: string;
  motivo: string;
  created_at: string;
  created_by: string | null;
  usuario_nome?: string;
};

export function BloqueioTemporarioSection({ leadId, nome }: BloqueioTemporarioSectionProps) {
  const [motivo, setMotivo] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: bloqueioEntry, isLoading } = useQuery<BloqueioEntry | null>({
    queryKey: ["bloqueio-temporario-entry", leadId],
    queryFn: async () => {
      if (!leadId) return null;

      const { data, error } = await supabase
        .from("leads_bloqueio_temporario")
        .select("*")
        .eq("lead_id", leadId)
        .is("removed_at", null)
        .maybeSingle();

      if (error) throw error;

      if (data?.created_by) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("nome_completo")
          .eq("id", data.created_by)
          .single();

        return { ...data, usuario_nome: profile?.nome_completo || "Sistema" };
      }

      return data;
    },
    enabled: !!leadId,
  });

  const bloquearMutation = useMutation({
    mutationFn: async () => {
      if (!leadId) throw new Error("Lead não informado");
      if (!motivo.trim()) throw new Error("Motivo é obrigatório");

      const { error } = await supabase.from("leads_bloqueio_temporario").insert({
        lead_id: leadId,
        motivo: motivo.trim(),
        created_by: user?.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bloqueio-temporario-entry", leadId] });
      queryClient.invalidateQueries({ queryKey: ["bloqueios-temporarios"] });
      toast.success("Bloqueio temporário aplicado");
      setMotivo("");
      setShowAddDialog(false);
    },
    onError: (error: Error) => {
      toast.error("Erro ao bloquear: " + error.message);
    },
  });

  const desbloquearMutation = useMutation({
    mutationFn: async () => {
      if (!bloqueioEntry) throw new Error("Nenhum bloqueio ativo");

      const { error } = await supabase
        .from("leads_bloqueio_temporario")
        .update({ removed_at: new Date().toISOString(), removed_by: user?.id })
        .eq("id", bloqueioEntry.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bloqueio-temporario-entry", leadId] });
      queryClient.invalidateQueries({ queryKey: ["bloqueios-temporarios"] });
      toast.success("Bloqueio removido");
    },
    onError: (error: Error) => {
      toast.error("Erro ao remover bloqueio: " + error.message);
    },
  });

  if (!leadId) return null;

  const isBloqueado = !!bloqueioEntry;

  return (
    <div
      className={`rounded-lg border-2 p-4 space-y-3 ${
        isBloqueado
          ? "border-orange-400/40 bg-orange-500/5"
          : "border-border bg-muted/30"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`rounded-full p-2 ${
            isBloqueado ? "bg-orange-500/10 text-orange-600" : "bg-muted text-muted-foreground"
          }`}
        >
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h4
            className={`text-base font-semibold ${
              isBloqueado ? "text-orange-600" : "text-foreground"
            }`}
          >
            Bloqueio Temporário de Disparos
          </h4>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Verificando...</p>
          ) : isBloqueado ? (
            <div className="space-y-2 mt-1">
              <p className="text-sm text-muted-foreground">
                Este lead está bloqueado temporariamente e não aparecerá na seleção de disparos.
              </p>
              <div className="rounded-md border border-orange-400/20 bg-background p-2.5 space-y-1.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-orange-500" />
                  <span className="text-sm text-muted-foreground">{bloqueioEntry.motivo}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {bloqueioEntry.usuario_nome || "Sistema"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(bloqueioEntry.created_at), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-0.5">
              Este lead pode aparecer normalmente na seleção de disparos.
            </p>
          )}
        </div>
      </div>

      {isBloqueado ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="default"
              className="gap-2 border-green-300 text-green-700 hover:bg-green-100"
              disabled={desbloquearMutation.isPending}
            >
              <ShieldOff className="h-4 w-4" />
              Remover Bloqueio
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover Bloqueio Temporário?</AlertDialogTitle>
              <AlertDialogDescription>
                Este lead voltará a aparecer na seleção de disparos de WhatsApp e E-mail.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => desbloquearMutation.mutate()}>
                Confirmar Remoção
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <AlertDialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="default"
              className="gap-2 border-orange-400/50 text-orange-600 hover:bg-orange-500/10"
            >
              <ShieldAlert className="h-4 w-4" />
              Bloquear Disparos
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Bloquear Temporariamente
              </AlertDialogTitle>
              <AlertDialogDescription>
                Este lead não aparecerá na seleção de disparos de WhatsApp e E-mail.
                O status real do lead não será alterado.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-2 py-2">
              <label className="text-sm font-medium">Motivo do bloqueio *</label>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Descreva o motivo do bloqueio temporário..."
                rows={3}
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setMotivo("")}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => bloquearMutation.mutate()}
                disabled={!motivo.trim() || bloquearMutation.isPending}
                className="bg-orange-500 text-white hover:bg-orange-600"
              >
                {bloquearMutation.isPending ? "Bloqueando..." : "Confirmar Bloqueio"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
