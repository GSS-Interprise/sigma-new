import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export type OfficialTemplateBindings = Record<string, string>;

interface Props {
  templateId: string | null;
  value: OfficialTemplateBindings;
  onChange: (value: OfficialTemplateBindings) => void;
}

const TOKEN_SUGGESTIONS = [
  "{{lead.nome}}",
  "{{campanha.nome_remetente}}",
  "{{campanha.nome}}",
  "{{briefing.nome_servico}}",
  "{{briefing.hospital}}",
  "{{briefing.cidade}}",
  "{{briefing.inicio_servico}}",
  "{{briefing.tipo_servico}}",
];

function suggestedBinding(templateName: string, position: string) {
  const defaults: Record<string, Record<string, string>> = {
    marketing_oportunidade_medica: {
      "1": "{{lead.nome}}",
      "2": "{{campanha.nome_remetente}}",
      "3": "{{briefing.nome_servico}}",
      "4": "{{briefing.cidade}}",
    },
    marketing_oportunidade_regional: {
      "1": "{{lead.nome}}",
      "2": "{{briefing.nome_servico}}",
      "3": "{{briefing.cidade}}",
      "4": "{{briefing.inicio_servico}}",
    },
    marketing_retomada_oportunidade: {
      "1": "{{lead.nome}}",
      "2": "{{briefing.nome_servico}}",
      "3": "{{briefing.cidade}}",
    },
    utility_atualizacao_processo: {
      "1": "{{lead.nome}}",
      "2": "{{briefing.nome_servico}}",
      "3": "{{briefing.cidade}}",
    },
    utility_detalhes_solicitados: {
      "1": "{{lead.nome}}",
      "2": "{{briefing.nome_servico}}",
      "3": "{{briefing.cidade}}",
    },
    utility_pendencia_documental: {
      "1": "{{lead.nome}}",
      "2": "{{briefing.nome_servico}}",
    },
  };
  return defaults[templateName]?.[position] || "";
}

export function OfficialTemplateVariablesConfig({ templateId, value, onChange }: Props) {
  const { data: template, isLoading } = useQuery({
    queryKey: ["official-template-bindings", templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_official_templates" as never)
        .select("id, friendly_name, body, variables")
        .eq("id", templateId)
        .single();
      if (error) throw error;
      return data as unknown as {
        id: string;
        friendly_name: string;
        body: string | null;
        variables: Record<string, string>;
      };
    },
  });

  const positions = useMemo(
    () => Object.keys(template?.variables || {}).sort((a, b) => Number(a) - Number(b)),
    [template],
  );

  useEffect(() => {
    if (!template || positions.length === 0 || Object.keys(value).length > 0) return;
    const defaults = Object.fromEntries(
      positions.map((position) => [position, suggestedBinding(template.friendly_name, position)]),
    );
    onChange(defaults);
  }, [template, positions, value, onChange]);

  if (!templateId) return null;
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!template || positions.length === 0) {
    return <p className="text-xs text-muted-foreground">Este template não possui variáveis.</p>;
  }

  return (
    <div className="space-y-3 rounded-md border bg-background p-3">
      <div>
        <Label>Variáveis do template</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Use dados dinâmicos do Sigma ou digite um valor fixo. Nenhum exemplo da Twilio será enviado.
        </p>
      </div>

      <div className="rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap">
        {template.body}
      </div>

      <datalist id={`official-template-tokens-${template.id}`}>
        {TOKEN_SUGGESTIONS.map((token) => <option key={token} value={token} />)}
      </datalist>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {positions.map((position) => (
          <div key={position} className="space-y-1.5">
            <Label htmlFor={`template-variable-${position}`} className="text-xs">
              {`{{${position}}}`} · exemplo: {template.variables[position]}
            </Label>
            <Input
              id={`template-variable-${position}`}
              value={value[position] || ""}
              list={`official-template-tokens-${template.id}`}
              placeholder="Selecione um dado ou digite um texto"
              onChange={(event) => onChange({ ...value, [position]: event.target.value })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
