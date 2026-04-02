import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  moduloNome?: string;
}

export function ManutencaoBlockModal({ open, onOpenChange, moduloNome }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader className="items-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-7 w-7 text-amber-600" />
          </div>
          <DialogTitle>Em Manutenção</DialogTitle>
          <DialogDescription>
            O módulo <strong>{moduloNome}</strong> está temporariamente indisponível para manutenção. Tente novamente mais tarde.
          </DialogDescription>
        </DialogHeader>
        <Button variant="outline" className="mt-2" onClick={() => onOpenChange(false)}>
          Entendi
        </Button>
      </DialogContent>
    </Dialog>
  );
}
