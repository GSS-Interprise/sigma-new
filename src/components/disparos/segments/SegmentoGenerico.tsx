import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import {
  useCampanhaPropostaCanais,
  useUpdateCanalStatus,
  type CanalSegmento,
} from "@/hooks/useCampanhaPropostaCanais";
import { useCriarTarefa } from "@/hooks/useTarefasCaptacao";
import { Loader2, Play, CheckCircle2, ListTodo } from "lucide-react";

interface Props {
  campanhaPropostaId: string;
  canal: CanalSegmento;
  titulo: string;
  descricao: string;
}

const statusVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pendente: "outline",
  em_andamento: "secondary",
  concluido: "default",
  falha: "destructive",
};

export function SegmentoGenerico({ campanhaPropostaId, canal, titulo, descricao }: Props) {
  const { data: canais = [], isLoading } = useCampanhaPropostaCanais(campanhaPropostaId);
  const update = useUpdateCanalStatus();
  const criarTarefa = useCriarTarefa();
  const [obs, setObs] = useState("");

  const registro = canais.find((c) => c.canal === canal);

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{titulo}</CardTitle>
            <CardDescription>{descricao}</CardDescription>
          </div>
          {registro && (
            <Badge variant={statusVariants[registro.status] || "outline"}>
              {registro.status}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label className="text-xs">Observações / registro manual</Label>
          <Textarea
            placeholder={`Anote tentativas, respostas ou interações via ${titulo}`}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            rows={3}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="secondary"
            disabled={!registro || update.isPending}
            onClick={() =>
              registro &&
              update.mutate({
                id: registro.id,
                status: "em_andamento",
                metadados: { ...registro.metadados, ultima_obs: obs },
              })
            }
          >
            <Play className="h-4 w-4 mr-2" />
            Em andamento
          </Button>
          <Button
            size="sm"
            disabled={!registro || update.isPending}
            onClick={() =>
              registro &&
              update.mutate({
                id: registro.id,
                status: "concluido",
                metadados: { ...registro.metadados, ultima_obs: obs },
              })
            }
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Concluir canal
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={criarTarefa.isPending}
            onClick={() =>
              criarTarefa.mutate({
                titulo: `Follow-up ${titulo}`,
                descricao: obs || `Acompanhamento via ${titulo}`,
                canal,
                tipo: "follow_up",
                campanha_proposta_id: campanhaPropostaId,
              })
            }
          >
            <ListTodo className="h-4 w-4 mr-2" />
            Criar tarefa
          </Button>
        </div>
        {registro?.metadados && Object.keys(registro.metadados).length > 0 && (
          <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
            {JSON.stringify(registro.metadados, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
