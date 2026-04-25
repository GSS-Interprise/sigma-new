import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Circle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  VALIDACAO_ITEMS,
  useValidarItem,
  type AcompanhamentoLead,
  type ValidacaoItem,
} from "@/hooks/useAcompanhamentoLeads";

interface Props {
  lead: AcompanhamentoLead;
  profilesMap?: Map<string, string>; // user_id -> nome
}

export function ValidacaoChecklist({ lead, profilesMap }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Checklist de validação
        </h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {lead.validacoes_ok}/4 concluídos
        </span>
      </div>
      <div className="space-y-2">
        {VALIDACAO_ITEMS.map((item) => {
          const v = lead.validacoes?.[item.key] as ValidacaoItem | undefined;
          return (
            <ValidacaoItemRow
              key={item.key}
              campanhaLeadId={lead.campanha_lead_id}
              itemKey={item.key}
              label={item.label}
              desc={item.desc}
              valor={v}
              profilesMap={profilesMap}
            />
          );
        })}
      </div>
    </div>
  );
}

function ValidacaoItemRow({
  campanhaLeadId,
  itemKey,
  label,
  desc,
  valor,
  profilesMap,
}: {
  campanhaLeadId: string;
  itemKey: string;
  label: string;
  desc: string;
  valor: ValidacaoItem | undefined;
  profilesMap?: Map<string, string>;
}) {
  const [obs, setObs] = useState(valor?.obs || "");
  const [editandoObs, setEditandoObs] = useState(false);
  const validar = useValidarItem();
  const ok = valor?.ok === true;

  const handleToggle = (checked: boolean) => {
    validar.mutate({
      campanha_lead_id: campanhaLeadId,
      item: itemKey,
      ok: checked,
      obs: obs || undefined,
    });
  };

  const handleSalvarObs = () => {
    validar.mutate({
      campanha_lead_id: campanhaLeadId,
      item: itemKey,
      ok,
      obs,
    });
    setEditandoObs(false);
  };

  const audit = (() => {
    if (!valor?.em) return null;
    const nome = valor.por ? profilesMap?.get(valor.por) || "alguém" : "alguém";
    try {
      const data = format(new Date(valor.em), "dd/MM HH:mm", { locale: ptBR });
      return `${ok ? "✓" : "○"} ${nome} · ${data}`;
    } catch {
      return null;
    }
  })();

  return (
    <div className={`border rounded-md p-3 ${ok ? "bg-green-50/50 border-green-200" : "bg-card"}`}>
      <div className="flex items-start gap-3">
        <Checkbox
          id={`valid-${itemKey}`}
          checked={ok}
          onCheckedChange={handleToggle}
          disabled={validar.isPending}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <Label htmlFor={`valid-${itemKey}`} className="text-sm font-medium cursor-pointer">
            {label}
          </Label>
          <p className="text-xs text-muted-foreground">{desc}</p>
          {audit && <p className="text-[11px] text-muted-foreground mt-1">{audit}</p>}
        </div>
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
        )}
      </div>

      {/* Obs */}
      <div className="mt-2 pl-7">
        {editandoObs ? (
          <div className="space-y-2">
            <Textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Observação (opcional)"
              className="text-xs min-h-[60px]"
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSalvarObs} disabled={validar.isPending}>
                Salvar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setObs(valor?.obs || "");
                  setEditandoObs(false);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditandoObs(true)}
            className="text-xs text-left text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            {valor?.obs ? <span className="italic">"{valor.obs}"</span> : <span className="opacity-60">+ adicionar observação</span>}
          </button>
        )}
      </div>
    </div>
  );
}
