import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Mail, CheckCircle, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";

export function InstrucoesRespostas() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="bg-blue-500/5 border-blue-500/20">
        <CollapsibleTrigger className="w-full">
          <CardHeader className="cursor-pointer hover:bg-blue-500/5 transition-colors">
            <CardTitle className="flex items-center justify-between text-blue-600">
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Como funciona o rastreamento de respostas
              </div>
              <ChevronDown className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <Alert className="bg-background">
              <Mail className="h-4 w-4" />
              <AlertDescription>
                <strong>Emails enviados automaticamente incluem ID único</strong>
                <p className="text-sm text-muted-foreground mt-1">
                  Todos os emails de disparo agora contêm um identificador único no assunto (ex: [SIGMA-ABC123])
                </p>
              </AlertDescription>
            </Alert>

            <Alert className="bg-background">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Respostas são vinculadas automaticamente</strong>
                <p className="text-sm text-muted-foreground mt-1">
                  Quando um médico responder o email, o sistema identifica o ID e registra a resposta automaticamente no Kanban de Acompanhamento
                </p>
              </AlertDescription>
            </Alert>

            <div className="text-sm text-muted-foreground space-y-2">
              <p><strong>Para configurar o recebimento automático:</strong></p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Configure o webhook no Gmail para enviar respostas para a edge function</li>
                <li>Ou utilize o sistema de polling (verificação automática a cada X minutos)</li>
                <li>As respostas aparecerão automaticamente em "Acompanhamento"</li>
              </ol>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

