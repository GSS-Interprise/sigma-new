// Escala de plantão do SLA de laudos. Pergunta da tela: "Quem o robô vai avisar agora e nos próximos dias?"
// Quem usa: Wagner e Brenda. O robô só aciona quem está escalado no horário: plantonista aos 80% do prazo;
// plantonista + coordenador quando vence sem ninguém assumir.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { UNIDADE, type Plantao, normalizarTelefone, telefoneBonito, useColetor, useEscala } from "./useSla";

const db = supabase as any;
const PAPEL: Record<Plantao["papel"], { nome: string; selo: string }> = {
  plantonista: { nome: "Plantonista", selo: "bg-sky-100 text-sky-900" },
  coordenador: { nome: "Coordenador", selo: "bg-violet-100 text-violet-900" },
  diretoria: { nome: "Diretoria", selo: "bg-slate-200 text-slate-900" },
};
const TURNOS = {
  noturno: { nome: "Noturno (19h às 7h)", ini: "19:00", fim: "07:00" },
  diurno: { nome: "Diurno (7h às 19h)", ini: "07:00", fim: "19:00" },
  dia_todo: { nome: "24 horas (7h às 7h)", ini: "07:00", fim: "07:00" },
  outro: { nome: "Outro horário", ini: "", fim: "" },
} as const;
type Turno = keyof typeof TURNOS;

const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...o });
const diaSemana = (iso: string) => fmt(iso, { weekday: "long", day: "2-digit", month: "2-digit" });
const hm = (iso: string) => fmt(iso, { hour: "2-digit", minute: "2-digit" });

// Intervalo de um plantão: fim menor ou igual ao início = termina no dia seguinte (19h às 7h).
function intervalo(data: string, ini: string, fim: string, somaDias: number) {
  const base = new Date(`${data}T00:00:00`);
  base.setDate(base.getDate() + somaDias);
  const [hi, mi] = ini.split(":").map(Number), [hf, mf] = fim.split(":").map(Number);
  const a = new Date(base); a.setHours(hi, mi, 0, 0);
  const b = new Date(base); b.setHours(hf, mf, 0, 0);
  if (b <= a) b.setDate(b.getDate() + 1);
  return { inicio: a.toISOString(), fim: b.toISOString() };
}

export function AbaEscalaPlantao() {
  const escala = useEscala(14);
  const coletor = useColetor();
  const qc = useQueryClient();
  const [papel, setPapel] = useState<Plantao["papel"]>("plantonista");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [data, setData] = useState(hojeISO());
  const [turno, setTurno] = useState<Turno>("noturno");
  const [ini, setIni] = useState("19:00");
  const [fim, setFim] = useState("07:00");
  const [dias, setDias] = useState(1);
  const [remover, setRemover] = useState<Plantao | null>(null);

  const agora = Date.now();
  const deAgora = (escala.data ?? []).filter((p) => new Date(p.inicio).getTime() <= agora && new Date(p.fim).getTime() > agora);
  const porDia = useMemo(() => {
    const m = new Map<string, Plantao[]>();
    for (const p of escala.data ?? []) {
      const k = fmt(p.inicio, { year: "numeric", month: "2-digit", day: "2-digit" });
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.values()];
  }, [escala.data]);

  const fone = normalizarTelefone(telefone);
  const horaIni = turno === "outro" ? ini : TURNOS[turno].ini;
  const horaFim = turno === "outro" ? fim : TURNOS[turno].fim;
  const erroForm = !nome.trim() ? "Informe o nome." : !fone ? "Telefone com DDD, ex.: (47) 99999-0000." : !data ? "Escolha a data."
    : !horaIni || !horaFim ? "Informe o horário." : dias < 1 || dias > 31 ? "Repetir de 1 a 31 dias." : null;

  const adicionar = useMutation({
    mutationFn: async () => {
      const linhas = Array.from({ length: dias }, (_, i) => ({
        unidade: UNIDADE, papel, nome: nome.trim(), telefone: fone, ...intervalo(data, horaIni, horaFim, i),
      }));
      const { error } = await db.from("sla_plantao").insert(linhas);
      if (error) throw error;
      return linhas.length;
    },
    onSuccess: (n) => {
      toast.success(n === 1 ? `Plantão de ${nome.trim()} adicionado.` : `${n} plantões de ${nome.trim()} adicionados.`);
      setNome(""); setTelefone(""); setDias(1);
      qc.invalidateQueries({ queryKey: ["sla-escala"] });
    },
    onError: (e) => toast.error(`Não salvou: ${(e as Error).message}`),
  });

  const apagar = useMutation({
    mutationFn: async (id: string) => { const { error } = await db.from("sla_plantao").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Plantão removido."); qc.invalidateQueries({ queryKey: ["sla-escala"] }); },
    onError: (e) => toast.error(`Não removeu: ${(e as Error).message}`),
  });

  const ligar = useMutation({
    mutationFn: async (ativo: boolean) => { const { error } = await db.rpc("sla_alertas_ligar", { p_ativo: ativo }); if (error) throw error; return ativo; },
    onSuccess: (ativo) => {
      toast.success(ativo ? "Avisos ligados. O robô passa a avisar quem está na escala." : "Avisos desligados. Nenhum médico será avisado.");
      qc.invalidateQueries({ queryKey: ["sla-coletor"] });
    },
    onError: (e) => toast.error(`Não mudou: ${(e as Error).message}`),
  });

  const ligarEscada = useMutation({
    mutationFn: async (v: boolean) => { const { error } = await db.rpc("sla_escada_ligar", { p_ativo: v }); if (error) throw error; return v; },
    onSuccess: (v) => {
      toast.success(v ? "Ligações ligadas: laudo vencido sem dono liga para o plantonista, depois o coordenador." : "Ligações desligadas. O vencido continua avisando por WhatsApp.");
      qc.invalidateQueries({ queryKey: ["sla-coletor"] });
    },
    onError: (e) => toast.error(`Não mudou: ${(e as Error).message}`),
  });

  const plantonistaAgora = deAgora.filter((p) => p.papel === "plantonista");
  const ativo = !!coletor.data?.alertasAtivos;
  const escadaAtiva = !!coletor.data?.escadaAtiva;
  const testeDestino = coletor.data?.testeDestino ?? null;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">De plantão agora</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {escala.isLoading && <Skeleton className="h-8 w-full" />}
            {!escala.isLoading && plantonistaAgora.length === 0 && (
              <p className="text-amber-800">Ninguém de plantão agora: os avisos de prazo vão só por e-mail para a coordenação.</p>
            )}
            {deAgora.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={cn("rounded px-2 py-0.5 text-xs font-semibold", PAPEL[p.papel].selo)}>{PAPEL[p.papel].nome}</span>
                <span className="font-medium">{p.nome}</span>
                <span className="text-muted-foreground">{telefoneBonito(p.telefone)} · até {hm(p.fim)}</span>
              </div>
            ))}
            {testeDestino && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Teste interno ligado: os avisos vão para {telefoneBonito(testeDestino)}, não para os médicos da escala, e ninguém recebe ligação.
              </p>
            )}
            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <div>
                <p className="font-medium">Avisos automáticos ao médico</p>
                <p className="text-xs text-muted-foreground">{ativo ? "Ligados: WhatsApp aos 80% do prazo e quando vence." : "Desligados: ninguém é avisado."}</p>
              </div>
              <Switch checked={ativo} disabled={coletor.isLoading || ligar.isPending} onCheckedChange={(v) => ligar.mutate(v)} aria-label="Avisos automáticos ao médico" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">Ligar quando vencer</p>
                <p className="text-xs text-muted-foreground">
                  {!ativo ? "Só funciona com os avisos ligados."
                    : escadaAtiva ? "Ligado: plantonista 2 vezes, depois coordenador e diretoria. Só a tecla 1 para."
                    : "Desligado: o vencido avisa só por WhatsApp e e-mail."}
                </p>
              </div>
              <Switch checked={escadaAtiva} disabled={coletor.isLoading || ligarEscada.isPending || (!ativo && !escadaAtiva)}
                onCheckedChange={(v) => ligarEscada.mutate(v)} aria-label="Ligar quando o laudo vencer" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Próximos 14 dias</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            {escala.isLoading && <Skeleton className="h-16 w-full" />}
            {escala.error && <p className="text-red-700">Não deu para carregar a escala: {(escala.error as Error).message}</p>}
            {!escala.isLoading && !escala.error && porDia.length === 0 && (
              <p className="text-muted-foreground">Nenhum plantão cadastrado. Comece pelo noturno de hoje em "Adicionar plantão".</p>
            )}
            {porDia.map((lista) => (
              <div key={lista[0].id}>
                <p className="mb-1 font-medium capitalize">{diaSemana(lista[0].inicio)}</p>
                <div className="divide-y rounded-md border">
                  {lista.map((p) => (
                    <div key={p.id} className="grid grid-cols-[110px_110px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2">
                      <span className="tabular-nums">{hm(p.inicio)} às {hm(p.fim)}</span>
                      <span className={cn("w-fit rounded px-2 py-0.5 text-xs font-semibold", PAPEL[p.papel].selo)}>{PAPEL[p.papel].nome}</span>
                      {/* nome longo corta com reticências; o telefone nunca some */}
                      <span className="flex min-w-0 items-baseline gap-1" title={`${p.nome} · ${telefoneBonito(p.telefone)}`}>
                        <span className="truncate font-medium">{p.nome}</span>
                        <span className="shrink-0 text-muted-foreground">· {telefoneBonito(p.telefone)}</span>
                      </span>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Remover plantão de ${p.nome}`} onClick={() => setRemover(p)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader className="pb-2"><CardTitle className="text-base">Adicionar plantão</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-1">
            <Label>Papel</Label>
            <Select value={papel} onValueChange={(v) => setPapel(v as Plantao["papel"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="plantonista">Plantonista (recebe aos 80%)</SelectItem>
                <SelectItem value="coordenador">Coordenador (recebe quando vence)</SelectItem>
                <SelectItem value="diretoria">Diretoria</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sla-nome">Nome</Label>
            <Input id="sla-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Dr. Paulo Souza" maxLength={80} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sla-fone">WhatsApp</Label>
            <Input id="sla-fone" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(47) 99999-0000" inputMode="tel" />
            {telefone && !fone && <p className="text-xs text-red-700">Número com DDD, ex.: (47) 99999-0000.</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="sla-data">Começa em</Label>
              <Input id="sla-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sla-dias">Repetir por</Label>
              <div className="flex items-center gap-2">
                <Input id="sla-dias" type="number" min={1} max={31} value={dias} onChange={(e) => setDias(Number(e.target.value) || 1)} className="w-20" />
                <span className="text-muted-foreground">{dias === 1 ? "dia" : "dias"}</span>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Horário</Label>
            <Select value={turno} onValueChange={(v) => setTurno(v as Turno)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TURNOS).map(([k, t]) => <SelectItem key={k} value={k}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {turno === "outro" && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Input type="time" value={ini} onChange={(e) => setIni(e.target.value)} aria-label="Início" />
                <Input type="time" value={fim} onChange={(e) => setFim(e.target.value)} aria-label="Fim" />
              </div>
            )}
          </div>
          <Button className="h-9 w-full" disabled={!!erroForm || adicionar.isPending} onClick={() => adicionar.mutate()}>
            {adicionar.isPending ? "Salvando…" : dias > 1 ? `Adicionar ${dias} plantões` : "Adicionar plantão"}
          </Button>
          {erroForm && (nome || telefone) && <p className="text-xs text-muted-foreground">{erroForm}</p>}
        </CardContent>
      </Card>

      <AlertDialog open={!!remover} onOpenChange={(o) => !o && setRemover(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este plantão?</AlertDialogTitle>
            <AlertDialogDescription>
              {remover && `${PAPEL[remover.papel].nome} ${remover.nome}, ${diaSemana(remover.inicio)} das ${hm(remover.inicio)} às ${hm(remover.fim)}. O robô deixa de avisar essa pessoa nesse horário.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (remover) apagar.mutate(remover.id); setRemover(null); }}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
