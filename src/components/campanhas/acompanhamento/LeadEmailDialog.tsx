import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  campanhaId: string;
  campanhaLeadId: string;
}

export function LeadEmailDialog({
  open,
  onOpenChange,
  leadId,
  campanhaId,
  campanhaLeadId,
}: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["lead-email-context", leadId, campanhaId],
    enabled: open,
    queryFn: async () => {
      const [leadResult, campaignResult] = await Promise.all([
        supabase.from("leads").select("nome, email").eq("id", leadId).single(),
        supabase
          .from("campanhas")
          .select("nome, assunto_email, descricao_oportunidade, nome_remetente, whatsapp_remetente")
          .eq("id", campanhaId)
          .single(),
      ]);
      if (leadResult.error) throw leadResult.error;
      if (campaignResult.error) throw campaignResult.error;
      return { lead: leadResult.data, campaign: campaignResult.data };
    },
  });

  useEffect(() => {
    if (!data || !open) return;
    const doctorName = data.lead.nome || "Doutor(a)";
    const campaignName = data.campaign.nome || "oportunidade médica";
    const opportunity = data.campaign.descricao_oportunidade || campaignName;
    const sender = data.campaign.nome_remetente || "Equipe GSS Saúde";
    const whatsapp = data.campaign.whatsapp_remetente
      ? `\n\nSe preferir, responda pelo WhatsApp: ${data.campaign.whatsapp_remetente}.`
      : "";
    setSubject(data.campaign.assunto_email || `Oportunidade médica — ${campaignName}`);
    setBody(
      `Olá, Dr(a). ${doctorName}, tudo bem?\n\nEstamos entrando em contato sobre ${opportunity}.\n\nCaso tenha interesse, responda este e-mail para enviarmos os detalhes.${whatsapp}\n\nAtenciosamente,\n${sender}`,
    );
  }, [data, open]);

  const sendEmail = useMutation({
    mutationFn: async () => {
      const to = data?.lead.email?.trim();
      if (!to) throw new Error("Este médico não possui e-mail cadastrado.");
      if (!subject.trim() || !body.trim()) throw new Error("Informe assunto e mensagem.");
      const { data: result, error } = await supabase.functions.invoke("campanha-email-sender", {
        body: {
          to,
          subject: subject.trim(),
          text: body.trim(),
          lead_id: leadId,
          campanha_id: campanhaId,
          campanha_lead_id: campanhaLeadId,
          tags: { origem: "sigma_card", campanha: campanhaId },
        },
      });
      if (error) throw error;
      if (!result?.ok) throw new Error(result?.error || "O provedor não confirmou o envio.");
    },
    onSuccess: () => {
      toast.success(`E-mail enviado para ${data?.lead.email}`);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível enviar o e-mail"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-xl flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Enviar e-mail ao médico
          </DialogTitle>
          <DialogDescription>
            O envio usa o template da campanha e será registrado na timeline do médico.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex min-h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando template...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lead-email-to">Destinatário</Label>
              <Input id="lead-email-to" className="min-h-11" value={data?.lead.email || ""} readOnly />
              {!data?.lead.email && (
                <p className="text-xs text-destructive">Cadastre um e-mail no prontuário antes de enviar.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-email-subject">Assunto</Label>
              <Input
                id="lead-email-subject"
                className="min-h-11"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-email-body">Mensagem</Label>
              <Textarea
                id="lead-email-body"
                className="min-h-56"
                value={body}
                onChange={(event) => setBody(event.target.value)}
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
            disabled={isLoading || !data?.lead.email || !subject.trim() || !body.trim() || sendEmail.isPending}
            onClick={() => sendEmail.mutate()}
          >
            {sendEmail.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Confirmar envio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
