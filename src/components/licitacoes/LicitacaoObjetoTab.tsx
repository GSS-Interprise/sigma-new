import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, EyeOff } from "lucide-react";

interface Props {
  licitacaoId: string;
  objeto: string | null;
  objetoResumo: string | null;
  disputaValorAnonimo: boolean;
  readOnly?: boolean;
}

const MAX_RESUMO = 500;

export function LicitacaoObjetoTab({
  licitacaoId,
  objeto,
  objetoResumo,
  disputaValorAnonimo,
  readOnly = false,
}: Props) {
  const queryClient = useQueryClient();
  const [resumo, setResumo] = useState(objetoResumo ?? "");
  const [anonimo, setAnonimo] = useState(!!disputaValorAnonimo);

  useEffect(() => setResumo(objetoResumo ?? ""), [objetoResumo]);
  useEffect(() => setAnonimo(!!disputaValorAnonimo), [disputaValorAnonimo]);

  const save = useMutation({
    mutationFn: async (patch: { objeto_resumo?: string | null; disputa_valor_anonimo?: boolean }) => {
      const { error } = await supabase
        .from("licitacoes")
        .update(patch as any)
        .eq("id", licitacaoId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["licitacoes"] });
      queryClient.invalidateQueries({ queryKey: ["licitacao", licitacaoId] });
      toast.success("Salvo!");
    },
    onError: (e: any) => toast.error(`Erro ao salvar: ${e.message}`),
  });

  const handleSaveResumo = () => save.mutate({ objeto_resumo: resumo.trim() || null });

  const handleToggleAnonimo = (v: boolean) => {
    setAnonimo(v);
    save.mutate({ disputa_valor_anonimo: v });
  };

  return (
    <ScrollArea className="h-full px-3 py-2">
      <div className="space-y-5">
        {/* Resumo curto */}
        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">
              Objeto (resumo)
              <span className="ml-1 font-normal text-muted-foreground">
                — texto puro usado em listagens, kanban e BI
              </span>
            </Label>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {resumo.length}/{MAX_RESUMO}
            </span>
          </div>
          <Textarea
            value={resumo}
            onChange={(e) => setResumo(e.target.value.slice(0, MAX_RESUMO))}
            placeholder="Ex.: Contratação de plantões médicos clínicos 12h para o Hospital XYZ por 12 meses."
            rows={3}
            disabled={readOnly}
            className="text-sm"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSaveResumo}
              disabled={readOnly || save.isPending || resumo === (objetoResumo ?? "")}
            >
              <Save className="h-3 w-3 mr-1" />
              Salvar resumo
            </Button>
          </div>
        </section>

        {/* Disputa anônima */}
        <section className="flex items-start gap-2 p-3 rounded-md border bg-muted/30">
          <Checkbox
            id="disputa-anonima"
            checked={anonimo}
            disabled={readOnly}
            onCheckedChange={(v) => handleToggleAnonimo(!!v)}
          />
          <div className="flex-1">
            <Label htmlFor="disputa-anonima" className="text-xs font-semibold cursor-pointer flex items-center gap-1">
              <EyeOff className="h-3 w-3" />
              Disputa de valor anônimo
            </Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Marque quando o portal não revela o preço dos concorrentes durante a disputa. Usado para
              filtrar e contabilizar métricas separadamente no BI.
            </p>
          </div>
        </section>

        {/* Texto completo (somente leitura aqui — edição continua na aba Detalhes) */}
        <section className="space-y-1.5">
          <Label className="text-xs font-semibold">
            Objeto completo
            <span className="ml-1 font-normal text-muted-foreground">
              — edição na aba Detalhes
            </span>
          </Label>
          {objeto ? (
            <div
              className="prose prose-sm max-w-none border rounded-md p-3 bg-card text-sm"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(objeto) }}
            />
          ) : (
            <p className="text-xs text-muted-foreground italic p-3 border border-dashed rounded-md">
              Objeto ainda não preenchido. Edite na aba Detalhes.
            </p>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}