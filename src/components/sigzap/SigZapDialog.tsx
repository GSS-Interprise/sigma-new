import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EndpointTester } from "./EndpointTester";
import { Settings } from "lucide-react";

interface SigZapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTestSuccess?: () => void;
}

export function SigZapDialog({ open, onOpenChange, onTestSuccess }: SigZapDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configurações SigZap
          </DialogTitle>
          <DialogDescription>
            Teste o endpoint de recebimento de mensagens WhatsApp
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-auto flex-1 pr-2">
          <EndpointTester onSuccess={onTestSuccess} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
