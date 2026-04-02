import { AppLayout } from "@/components/layout/AppLayout";
import { WorkspaceArea } from "@/components/workspace/WorkspaceArea";

export default function Workspace() {
  return (
    <AppLayout>
      <div className="space-y-4 h-[calc(100vh-120px)]">
        <div>
          <h1 className="text-2xl font-bold">Minha Área de Serviços</h1>
          <p className="text-muted-foreground">
            Central pessoal de anotações, organizada por temas e assuntos
          </p>
        </div>
        
        <div className="flex-1 h-[calc(100%-60px)]">
          <WorkspaceArea />
        </div>
      </div>
    </AppLayout>
  );
}