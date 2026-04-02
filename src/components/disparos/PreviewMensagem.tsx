import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";

interface PreviewMensagemProps {
  mensagem: string;
  totalDestinatarios: number;
  isLoading: boolean;
}

export function PreviewMensagem({
  mensagem,
  totalDestinatarios,
  isLoading,
}: PreviewMensagemProps) {
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-4">Prévia da Mensagem</h2>
      
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Users className="h-4 w-4 text-muted-foreground" />
        {isLoading ? (
          <Skeleton className="h-4 w-32" />
        ) : (
          <span className="font-medium">
            {totalDestinatarios} destinatário{totalDestinatarios !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="bg-muted/50 rounded-lg p-4 min-h-[120px] whitespace-pre-wrap">
        {mensagem || (
          <span className="text-muted-foreground italic">
            A mensagem aparecerá aqui...
          </span>
        )}
      </div>
    </Card>
  );
}
