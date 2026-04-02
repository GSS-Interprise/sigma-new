import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";

interface EditorMensagemProps {
  mensagem: string;
  revisadoIA: boolean;
  onMensagemChange: (value: string) => void;
  onRevisarIA: () => void;
}

export function EditorMensagem({
  mensagem,
  revisadoIA,
  onMensagemChange,
  onRevisarIA,
}: EditorMensagemProps) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <Label htmlFor="mensagem" className="text-lg font-semibold">
          Mensagem *
        </Label>
        {revisadoIA && (
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="h-3 w-3" />
            Revisado por IA
          </Badge>
        )}
      </div>

      <div className="space-y-4">
        <Textarea
          id="mensagem"
          placeholder="Digite a mensagem que será enviada aos médicos..."
          value={mensagem}
          onChange={(e) => onMensagemChange(e.target.value)}
          className="min-h-[200px] resize-y"
        />

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {mensagem.length} caracteres
          </span>
          <Button
            variant="outline"
            onClick={onRevisarIA}
            disabled={!mensagem.trim()}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Revisar com IA
          </Button>
        </div>
      </div>
    </Card>
  );
}
