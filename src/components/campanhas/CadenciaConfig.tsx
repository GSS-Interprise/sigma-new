import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ListChecks, Plus, Trash2, ArrowUp, ArrowDown, Save } from "lucide-react";
import { toast } from "sonner";
import { resolveTaskIcon } from "@/lib/taskIcons";
import {
  useTaskTipos,
  useCadenciaTemplates,
  useCriarCadenciaTemplate,
  type CadenciaPasso,
} from "@/hooks/useCadencia";

interface Props {
  passos: CadenciaPasso[];
  onChange: (passos: CadenciaPasso[]) => void;
  templateId: string | null;
  onTemplateChange: (id: string | null) => void;
}

/** Renumera ordem 1..n após qualquer mudança na lista. */
function renumerar(passos: CadenciaPasso[]): CadenciaPasso[] {
  return passos.map((p, i) => ({ ...p, ordem: i + 1 }));
}

export function CadenciaConfig({ passos, onChange, templateId, onTemplateChange }: Props) {
  const { data: tipos = [] } = useTaskTipos();
  const { data: templates = [] } = useCadenciaTemplates();
  const criarTemplate = useCriarCadenciaTemplate();

  const [salvarOpen, setSalvarOpen] = useState(false);
  const [novoNome, setNovoNome] = useState("");

  const canalPadrao = tipos[0]?.codigo ?? "whatsapp";

  // Abre vazio → carrega o template padrão pra operadora já ver uma cadência pronta.
  useEffect(() => {
    if (passos.length === 0 && templateId === null && templates.length > 0) {
      const padrao = templates.find((t) => t.is_default) ?? templates[0];
      onTemplateChange(padrao.id);
      onChange(renumerar(padrao.passos ?? []));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates]);

  const aplicarTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    onTemplateChange(id);
    onChange(renumerar(t.passos ?? []));
  };

  const setPasso = (idx: number, patch: Partial<CadenciaPasso>) => {
    onChange(passos.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
    onTemplateChange(null); // editou → vira cadência custom (deixa de ser "o template")
  };

  const addPasso = () => {
    const ultimoDia = passos.length ? passos[passos.length - 1].dia_offset : -1;
    onChange(
      renumerar([
        ...passos,
        { ordem: passos.length + 1, canal: canalPadrao, rotulo: "", dia_offset: ultimoDia + 1 },
      ]),
    );
    onTemplateChange(null);
  };

  const removerPasso = (idx: number) => {
    onChange(renumerar(passos.filter((_, i) => i !== idx)));
    onTemplateChange(null);
  };

  const mover = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= passos.length) return;
    const novo = [...passos];
    [novo[idx], novo[j]] = [novo[j], novo[idx]];
    onChange(renumerar(novo));
    onTemplateChange(null);
  };

  const salvarComoTemplate = async () => {
    if (!novoNome.trim()) return;
    try {
      const t = await criarTemplate.mutateAsync({ nome: novoNome.trim(), passos: renumerar(passos) });
      onTemplateChange(t.id);
      toast.success(`Template "${t.nome}" salvo`);
      setSalvarOpen(false);
      setNovoNome("");
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar template");
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-primary" />
        <h4 className="font-semibold text-sm">Cadência de tarefas (operadora)</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        Cada lead desta campanha gera estas tarefas pra operadora executar e marcar feita. Escolha um
        template e ajuste como quiser.
      </p>

      {/* Seletor de template */}
      <div className="space-y-1.5">
        <Label className="text-xs">Template base</Label>
        <Select value={templateId ?? "custom"} onValueChange={(v) => v !== "custom" && aplicarTemplate(v)}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Escolha um template" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.nome}
                {t.is_default ? " (padrão)" : ""}
              </SelectItem>
            ))}
            <SelectItem value="custom" disabled>
              Personalizada
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista de passos */}
      <div className="space-y-2">
        {passos.length === 0 && (
          <p className="text-xs text-muted-foreground italic py-2">
            Sem passos. Adicione ao menos uma tarefa.
          </p>
        )}
        {passos.map((passo, idx) => {
          const tipo = tipos.find((t) => t.codigo === passo.canal);
          const Icon = resolveTaskIcon(tipo?.icone);
          return (
            <div key={idx} className="flex items-center gap-2 bg-card border rounded-md p-2">
              <Icon className={`h-4 w-4 shrink-0 ${tipo?.cor ?? "text-slate-600"}`} />

              <Select value={passo.canal} onValueChange={(v) => setPasso(idx, { canal: v })}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tipos.map((t) => (
                    <SelectItem key={t.codigo} value={t.codigo}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                value={passo.rotulo}
                onChange={(e) => setPasso(idx, { rotulo: e.target.value })}
                placeholder={tipo?.label ?? "Rótulo"}
                className="h-8 text-xs flex-1 min-w-0"
              />

              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-muted-foreground">D+</span>
                <Input
                  type="number"
                  min={0}
                  value={passo.dia_offset}
                  onChange={(e) => setPasso(idx, { dia_offset: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="h-8 w-14 text-xs"
                />
              </div>

              <div className="flex items-center shrink-0">
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => mover(idx, -1)} disabled={idx === 0}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => mover(idx, 1)} disabled={idx === passos.length - 1}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removerPasso(idx)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={addPasso}>
          <Plus className="h-3.5 w-3.5" />
          Adicionar passo
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-1.5"
          onClick={() => setSalvarOpen(true)}
          disabled={passos.length === 0}
        >
          <Save className="h-3.5 w-3.5" />
          Salvar como template
        </Button>
      </div>

      <AlertDialog open={salvarOpen} onOpenChange={setSalvarOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Salvar cadência como template</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Vira um template reutilizável em outras campanhas. Dê um nome:
                </p>
                <Input
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder="Ex: Agressiva, Suave, Só ligação..."
                  autoFocus
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setNovoNome("")}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={salvarComoTemplate} disabled={!novoNome.trim() || criarTemplate.isPending}>
              Salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
