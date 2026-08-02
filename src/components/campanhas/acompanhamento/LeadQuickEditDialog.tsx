import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
}

function normalizeWhatsapp(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `+${withCountry}`;
}

export function LeadQuickEditDialog({ open, onOpenChange, leadId }: Props) {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["lead-quick-edit", leadId],
    enabled: open,
    queryFn: async () => {
      const { data: lead, error } = await supabase
        .from("leads")
        .select("nome, email, phone_e164")
        .eq("id", leadId)
        .single();
      if (error) throw error;
      return lead;
    },
  });

  useEffect(() => {
    if (!data || !open) return;
    setNome(data.nome || "");
    setEmail(data.email || "");
    setWhatsapp(data.phone_e164 || "");
  }, [data, open]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Informe o nome do médico.");
      const emailNormalizado = email.trim().toLowerCase() || null;
      if (emailNormalizado && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
        throw new Error("Informe um e-mail válido.");
      }
      const { error } = await supabase
        .from("leads")
        .update({
          nome: nome.trim(),
          email: emailNormalizado,
          phone_e164: normalizeWhatsapp(whatsapp),
          updated_at: new Date().toISOString(),
        })
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["acompanhamento-leads"] }),
        queryClient.invalidateQueries({ queryKey: ["lead-email-context", leadId] }),
        queryClient.invalidateQueries({ queryKey: ["lead-quick-edit", leadId] }),
      ]);
      toast.success("Contato atualizado");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível atualizar o contato"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar contato</DialogTitle>
          <DialogDescription>
            Corrija os dados usados nas próximas mensagens e campanhas.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex min-h-32 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando contato...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="quick-lead-name">Nome</Label>
              <Input id="quick-lead-name" className="min-h-11" value={nome} onChange={(event) => setNome(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-lead-whatsapp">WhatsApp</Label>
              <Input
                id="quick-lead-whatsapp"
                className="min-h-11"
                inputMode="tel"
                placeholder="+55 48 99999-9999"
                value={whatsapp}
                onChange={(event) => setWhatsapp(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-lead-email">E-mail</Label>
              <Input
                id="quick-lead-email"
                className="min-h-11"
                type="email"
                inputMode="email"
                placeholder="medico@exemplo.com.br"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={isLoading || salvar.isPending || !nome.trim()}
            onClick={() => salvar.mutate()}
          >
            {salvar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar contato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
