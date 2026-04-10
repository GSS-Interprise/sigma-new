import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserCheck, Phone, Mail, MapPin, Stethoscope, X, Link } from "lucide-react";
import { cn } from "@/lib/utils";

interface MatchedLead {
  id: string;
  nome: string;
  phone_e164: string | null;
  telefones_adicionais: string[] | null;
  email: string | null;
  uf: string | null;
  especialidade: string | null;
  score: number;
}

interface SigZapLeadAutoMatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactPhone: string;
  contactName: string;
  matchedLead: MatchedLead | null;
  onConfirm: (leadId: string) => void;
  onReject: () => void;
}

export function SigZapLeadAutoMatchDialog({
  open,
  onOpenChange,
  contactPhone,
  contactName,
  matchedLead,
  onConfirm,
  onReject,
}: SigZapLeadAutoMatchDialogProps) {
  if (!matchedLead) return null;

  const scoreColor = matchedLead.score >= 90
    ? "bg-green-100 text-green-800 border-green-300"
    : matchedLead.score >= 70
      ? "bg-amber-100 text-amber-800 border-amber-300"
      : "bg-red-100 text-red-800 border-red-300";

  const scoreLabel = matchedLead.score >= 90
    ? "Alta"
    : matchedLead.score >= 70
      ? "Média"
      : "Baixa";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-green-600" />
            Lead encontrado automaticamente
          </DialogTitle>
          <DialogDescription>
            Encontramos um lead compatível com este contato. Deseja vincular?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Comparison */}
          <div className="grid grid-cols-2 gap-3">
            {/* Contact info */}
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Contato WhatsApp</p>
              <p className="text-sm font-medium truncate">{contactName}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {contactPhone}
              </p>
            </div>

            {/* Lead info */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-green-700 font-semibold">Lead encontrado</p>
                <Badge className={cn("text-[10px] px-1.5 py-0", scoreColor)}>
                  {matchedLead.score}% {scoreLabel}
                </Badge>
              </div>
              <p className="text-sm font-medium truncate">{matchedLead.nome}</p>
            </div>
          </div>

          {/* Lead details DTO */}
          <div className="border rounded-lg divide-y">
            {matchedLead.phone_e164 && (
              <div className="flex items-center gap-2 px-3 py-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Telefone</span>
                <span className="text-sm font-medium">{matchedLead.phone_e164}</span>
              </div>
            )}
            {matchedLead.telefones_adicionais && matchedLead.telefones_adicionais.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Adicionais</span>
                <span className="text-sm">{matchedLead.telefones_adicionais.join(', ')}</span>
              </div>
            )}
            {matchedLead.email && (
              <div className="flex items-center gap-2 px-3 py-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Email</span>
                <span className="text-sm">{matchedLead.email}</span>
              </div>
            )}
            {matchedLead.uf && (
              <div className="flex items-center gap-2 px-3 py-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Estado</span>
                <span className="text-sm">{matchedLead.uf}</span>
              </div>
            )}
            {matchedLead.especialidade && (
              <div className="flex items-center gap-2 px-3 py-2">
                <Stethoscope className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Especialidade</span>
                <span className="text-sm">{matchedLead.especialidade}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-1.5"
              onClick={() => {
                onReject();
                onOpenChange(false);
              }}
            >
              <X className="h-4 w-4" />
              Não vincular
            </Button>
            <Button
              className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700"
              onClick={() => {
                onConfirm(matchedLead.id);
                onOpenChange(false);
              }}
            >
              <Link className="h-4 w-4" />
              Vincular Lead
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
