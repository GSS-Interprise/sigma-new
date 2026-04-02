import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function Demandas() {
  const headerActions = (
    <div className="flex items-center justify-between w-full">
      <div>
        <h1 className="text-2xl font-bold">Demandas</h1>
        <p className="text-sm text-muted-foreground">Gerencie demandas de clientes</p>
      </div>
      <Button>
        <Plus className="mr-2 h-4 w-4" />
        Nova Demanda
      </Button>
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-4">

        <div className="text-center py-12 text-muted-foreground">
          Lista de demandas será implementada aqui
        </div>
      </div>
    </AppLayout>
  );
}
