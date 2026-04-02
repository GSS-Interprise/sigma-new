import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, List, Info } from "lucide-react";
import { EscalasFiltros } from "./EscalasFiltros";
import { EscalasCalendarioView } from "./EscalasCalendarioView";
import { EscalasListaView } from "./EscalasListaView";
import { useEscalasIntegradas } from "@/hooks/useEscalasData";
import { useEscalasSyncDrEscala } from "@/hooks/useEscalasSyncDrEscala";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function EscalasCalendarioTab() {
  const queryClient = useQueryClient();
  const currentDate = new Date();
  const [mes, setMes] = useState(currentDate.getMonth() + 1);
  const [ano, setAno] = useState(currentDate.getFullYear());
  const [localId, setLocalId] = useState("");
  const [setorId, setSetorId] = useState("");
  const [profissional, setProfissional] = useState("");
  const [apenasIncompletos, setApenasIncompletos] = useState(false);
  const [view, setView] = useState<"calendario" | "lista">("calendario");

  const { sync, isSyncing, syncProgress } = useEscalasSyncDrEscala();

  const { data: escalas = [], isLoading, refetch } = useEscalasIntegradas({
    mes,
    ano,
    localId: localId || undefined,
    setorId: setorId || undefined,
    profissional: profissional || undefined,
    apenasIncompletos,
  });

  const handleSync = async () => {
    try {
      await sync(mes, ano);
      // Invalidar todas as queries relacionadas a escalas para atualizar a UI
      queryClient.invalidateQueries({ queryKey: ["escalas-integration-status"] });
      queryClient.invalidateQueries({ queryKey: ["escalas-locais"] });
      queryClient.invalidateQueries({ queryKey: ["escalas-setores"] });
      queryClient.invalidateQueries({ queryKey: ["escalas-stats"] });
      refetch();
    } catch (error) {
      console.error("Erro na sincronização:", error);
    }
  };

  const handleLocalChange = (newLocalId: string) => {
    setLocalId(newLocalId);
    setSetorId(""); // Limpar setor ao mudar local
  };

  const totalIncompletos = escalas.filter(e => e.dados_incompletos).length;

  return (
    <div className="space-y-4">
      {/* Aviso de Read-Only */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Visualização Read-Only</AlertTitle>
        <AlertDescription>
          As escalas são sincronizadas do Dr. Escala (fonte única da verdade). 
          Para alterações, utilize o sistema Dr. Escala diretamente.
        </AlertDescription>
      </Alert>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <EscalasFiltros
            mes={mes}
            ano={ano}
            localId={localId}
            setorId={setorId}
            profissional={profissional}
            apenasIncompletos={apenasIncompletos}
            onMesChange={setMes}
            onAnoChange={setAno}
            onLocalChange={handleLocalChange}
            onSetorChange={setSetorId}
            onProfissionalChange={setProfissional}
            onApenasIncompletosChange={setApenasIncompletos}
            onSync={handleSync}
            isSyncing={isSyncing}
            syncProgress={syncProgress}
            totalIncompletos={totalIncompletos}
          />
        </CardContent>
      </Card>

      {/* Tabs de Visualização */}
      <Tabs value={view} onValueChange={(v) => setView(v as "calendario" | "lista")}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="calendario" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Calendário
            </TabsTrigger>
            <TabsTrigger value="lista" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              Lista
            </TabsTrigger>
          </TabsList>
          
          <div className="text-sm text-muted-foreground">
            {escalas.length} plantão(ões) encontrado(s)
          </div>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Carregando escalas...
            </CardContent>
          </Card>
        ) : (
          <>
            <TabsContent value="calendario" className="mt-4">
              <EscalasCalendarioView escalas={escalas} mes={mes} ano={ano} />
            </TabsContent>

            <TabsContent value="lista" className="mt-4">
              <EscalasListaView escalas={escalas} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
