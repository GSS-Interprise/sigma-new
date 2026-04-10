import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useModulosManutencao } from "@/hooks/useModulosManutencao";
import { Wrench } from "lucide-react";

const MODULOS = [
  { key: "disparos_zap", label: "Disparos Zap" },
  { key: "disparos_email", label: "Disparos Email" },
  { key: "acompanhamento", label: "Acompanhamento" },
  { key: "leads", label: "Leads" },
  { key: "contratos_servicos", label: "Contratos Captação" },
  { key: "blacklist", label: "Black List" },
  { key: "regiao_interesse", label: "Banco de Interesse" },
  { key: "sigzap", label: "SIG Zap" },
  { key: "config_instancia", label: "Config Instância" },
  { key: "captadores", label: "Captadores" },
  { key: "monitor", label: "Monitor" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ManutencaoAdminModal({ open, onOpenChange }: Props) {
  const { modulosInativos, toggleMutation } = useModulosManutencao();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-destructive" />
            Modo Manutenção
          </DialogTitle>
          <DialogDescription>
            Desative módulos temporariamente. Usuários verão um aviso de manutenção.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {MODULOS.map((m) => {
            const inativo = modulosInativos.includes(m.key);
            return (
              <div
                key={m.key}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <span className={inativo ? "text-destructive font-medium" : ""}>
                  {m.label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {inativo ? "Inativo" : "Ativo"}
                  </span>
                  <Switch
                    checked={!inativo}
                    disabled={toggleMutation.isPending}
                    onCheckedChange={() =>
                      toggleMutation.mutate({ key: m.key, active: !inativo })
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
