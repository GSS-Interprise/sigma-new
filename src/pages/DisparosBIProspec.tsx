import { AppLayout } from "@/components/layout/AppLayout";
import { AbaProspec } from "@/components/bi/AbaProspec";

export default function DisparosBIProspec() {
  const headerActions = (
    <div>
      <h1 className="text-2xl font-bold">BI - Prospec</h1>
      <p className="text-sm text-muted-foreground">Análise de tráfego pago, disparos e conversões</p>
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-4">
        <AbaProspec />
      </div>
    </AppLayout>
  );
}