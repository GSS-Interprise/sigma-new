import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ResendEmailButtonProps {
  ticketId: string;
  ticketNumero: string;
}

export function ResendEmailButton({ ticketId, ticketNumero }: ResendEmailButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleResendEmail = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("resend-ticket-email", {
        body: { ticketId },
      });

      if (error) throw error;

      toast.success("Email reenviado", {
        description: `Email do ticket ${ticketNumero} foi reenviado com sucesso.`,
      });
    } catch (error) {
      console.error("Erro ao reenviar email:", error);
      toast.error("Erro ao reenviar email", {
        description: "Não foi possível reenviar o email. Tente novamente.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleResendEmail}
      disabled={isLoading}
      className="gap-2"
    >
      <Mail className="h-4 w-4" />
      {isLoading ? "Enviando..." : "Reenviar Email"}
    </Button>
  );
}
