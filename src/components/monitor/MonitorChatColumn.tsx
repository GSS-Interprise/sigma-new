import { SigZapChatColumn } from "@/components/sigzap/SigZapChatColumn";
import { Eye } from "lucide-react";

interface MonitorChatColumnProps {
  conversaId: string | null;
}

/**
 * Monitor chat: reuses SigZapChatColumn for full chat + respond capabilities.
 * The admin can respond to any conversation without it being assigned to them.
 */
export function MonitorChatColumn({ conversaId }: MonitorChatColumnProps) {
  if (!conversaId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground bg-muted/10">
        <Eye className="h-12 w-12 opacity-30" />
        <p className="text-sm">Selecione uma conversa para supervisionar</p>
        <p className="text-xs opacity-60">Você pode responder sem atribuir a si mesmo</p>
      </div>
    );
  }

  return <SigZapChatColumn conversaId={conversaId} />;
}
