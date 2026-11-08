import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useEspecialidades } from "@/components/campanhas/assistente/useAssistenteCampanha";
import { TIPOS_VAGA, useClientesNomes, useResponsaveis, useSalvarVaga, type Vaga, type VagaForm } from "./useVagas";

const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR",
  "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];
const hoje = () => new Date().toLocaleDateString("sv-SE");
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

const vazio = (): VagaForm => ({
  hospital_nome: "", cliente_id: null, especialidade_id: "", tipo: "plantao", cidade: "", uf: "",
  descricao: "", valor: "", quantidade: 1, prioridade: "normal", aberta_em: hoje(), responsavel_id: null,
});

export function NovaVagaDialog({ open, onOpenChange, vaga }: { open: boolean; onOpenChange: (v: boolean) => void; vaga?: Vaga | null }) {
  const [form, setForm] = useState<VagaForm>(vazio);
  const { data: especialidades = [] } = useEspecialidades();
  const { data: clientes = [] } = useClientesNomes();
  const { data: responsaveis = [] } = useResponsaveis();
  const salvar = useSalvarVaga();

  useEffect(() => {
    if (!open) return;
    setForm(vaga ? {
      hospital_nome: vaga.hospital_nome, cliente_id: vaga.cliente_id, especialidade_id: vaga.especialidade_id, tipo: vaga.tipo,
      cidade: vaga.cidade, uf: vaga.uf || "", descricao: vaga.descricao || "", valor: vaga.valor || "",
      quantidade: vaga.quantidade, prioridade: vaga.prioridade, aberta_em: vaga.aberta_em, responsavel_id: vaga.responsavel_id,
    } : vazio());
  }, [open, vaga]);

  const set = <K extends keyof VagaForm>(k: K, v: VagaForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const opcoesEsp = useMemo(() => especialidades.map((e) => ({ value: e.id, label: titulo(e.nome) })), [especialidades]);

  // Hospital digitado que bate com um cliente cadastrado vira vínculo (o relatório agrupa por cliente depois).
  const mudarHospital = (nome: string) => {
    const cliente = clientes.find((c) => c.nome.toLowerCase() === nome.trim().toLowerCase());
    setForm((f) => ({ ...f, hospital_nome: nome, cliente_id: cliente?.id ?? null, uf: f.uf || cliente?.uf || "" }));
  };

  const falta = !form.hospital_nome.trim() ? "o hospital" : !form.especialidade_id ? "a especialidade"
    : form.cidade.trim().length < 2 ? "a cidade" : null;

  const enviar = () => {
    if (falta) { toast.error(`Falta ${falta}.`); return; }
    salvar.mutate({ id: vaga?.id, form }, {
      onSuccess: () => {
        toast.success(vaga ? "Vaga atualizada." : "Vaga aberta. Ela já conta os dias na lista.");
        onOpenChange(false);
      },
      onError: (e: any) => toast.error(String(e?.message || e).includes("row-level security")
        ? "Seu perfil não pode cadastrar vagas. Peça a um gestor." : `Não consegui salvar: ${e?.message || e}`),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{vaga ? "Editar vaga" : "Nova vaga"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-6 gap-x-3 gap-y-4">
          <Campo label="Hospital ou cliente" className="col-span-3">
            <Input list="vagas-clientes" value={form.hospital_nome} onChange={(e) => mudarHospital(e.target.value)} placeholder="Ex.: Hospital de Navegantes" />
            <datalist id="vagas-clientes">
              {clientes.map((c) => <option key={c.id} value={c.nome} />)}
            </datalist>
          </Campo>
          <Campo label="Especialidade" className="col-span-3">
            <SearchableSelect options={opcoesEsp} value={form.especialidade_id} onChange={(v) => set("especialidade_id", v)}
              placeholder="Escolha" searchPlaceholder="Buscar especialidade..." clearable={false} />
          </Campo>

          <Campo label="Tipo" className="col-span-2">
            <Select value={form.tipo} onValueChange={(v) => set("tipo", v as VagaForm["tipo"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS_VAGA.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          <Campo label="Cidade" className="col-span-3">
            <Input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} placeholder="Ex.: Navegantes" />
          </Campo>
          <Campo label="UF" className="col-span-1">
            <Select value={form.uf || undefined} onValueChange={(v) => set("uf", v)}>
              <SelectTrigger aria-label="UF"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>

          <Campo label="Carga, dias e horário" className="col-span-6">
            <Textarea rows={2} value={form.descricao} onChange={(e) => set("descricao", e.target.value)}
              placeholder="Ex.: 2 turnos por semana, terça e quinta, 8h às 12h" />
          </Campo>

          <Campo label="Valor" className="col-span-2">
            <Input value={form.valor} onChange={(e) => set("valor", e.target.value)} placeholder="Ex.: R$ 1.800 / 12 h" />
          </Campo>
          <Campo label="Quantas vagas" className="col-span-2">
            <Input type="number" min={1} max={99} value={form.quantidade}
              onChange={(e) => set("quantidade", Math.max(1, Math.min(99, Number(e.target.value) || 1)))} />
          </Campo>
          <Campo label="Aberta desde" className="col-span-2">
            <Input type="date" max={hoje()} value={form.aberta_em} onChange={(e) => set("aberta_em", e.target.value || hoje())} />
          </Campo>

          <Campo label="Responsável" className="col-span-4">
            <Select value={form.responsavel_id || "ninguem"} onValueChange={(v) => set("responsavel_id", v === "ninguem" ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguem">Ninguém ainda</SelectItem>
                {responsaveis.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_completo}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
          <div className="col-span-2 flex items-end pb-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Switch checked={form.prioridade === "urgente"} onCheckedChange={(v) => set("prioridade", v ? "urgente" : "normal")} />
              Urgente
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={enviar} disabled={salvar.isPending}>
            {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {vaga ? "Salvar" : "Abrir vaga"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
