import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserPlus, FileText, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function QuickActions() {
  const navigate = useNavigate();

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-lg">⚡</span>
          </div>
          Ações Rápidas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          <Button 
            onClick={() => navigate('/medicos')} 
            className="w-full justify-start gap-3 h-12"
            variant="outline"
          >
            <UserPlus className="h-5 w-5" />
            <span className="text-left flex-1">Cadastrar Novo Médico</span>
          </Button>
          <Button 
            onClick={() => navigate('/contratos')} 
            className="w-full justify-start gap-3 h-12"
            variant="outline"
          >
            <FileText className="h-5 w-5" />
            <span className="text-left flex-1">Criar Contrato</span>
          </Button>
          <Button 
            onClick={() => navigate('/disparos')} 
            className="w-full justify-start gap-3 h-12"
            variant="outline"
          >
            <Send className="h-5 w-5" />
            <span className="text-left flex-1">Enviar Disparo</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
