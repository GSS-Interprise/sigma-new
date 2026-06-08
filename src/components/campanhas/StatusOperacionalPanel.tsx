import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Loader2, Wifi, WifiOff, AlertTriangle, Send, Smartphone, MapPin } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Chip {
  id: string;
  nome: string;
  numero: string | null;
  connection_state: string | null;
  status: string | null;
  pode_disparar: boolean | null;
}
interface Campanha {
  id: string;
  nome: string;
  tipo_envio: string | null;
  chip_ids: string[] | null;
}

const online = (c?: Chip) => !!c && c.connection_state === "open" && c.status === "ativo" && !!c.pode_disparar;

/**
 * Aba "Status" (operacional) — pra a líder de prospecção acompanhar sozinha:
 * quais campanhas rodando, com quais chips conectados, e quais chips precisam
 * reconectar. Dados ao vivo (refetch 60s). Espelha o levantamento manual.
 */
export function StatusOperacionalPanel() {
  const hoje = format(new Date(), "yyyy-MM-dd");
  const { data, isLoading } = useQuery({
    queryKey: ["status-operacional"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [{ data: camps }, { data: chips }, { data: disp }, { data: ult }] = await Promise.all([
        (supabase as any).from("campanhas").select("id, nome, tipo_envio, chip_ids").eq("status", "ativa"),
        (supabase as any).from("chips").select("id, nome, numero, connection_state, status, pode_disparar"),
        (supabase as any).from("vw_disparos_diarios").select("n_disparos").eq("dia", hoje),
        (supabase as any).from("vw_campanha_ultimo_disparo").select("campanha_id, ultimo_disparo"),
      ]);
      const chipMap = new Map<string, Chip>((chips ?? []).map((c: Chip) => [c.id, c]));
      const ultMap = new Map<string, string>((ult ?? []).map((u: any) => [u.campanha_id, u.ultimo_disparo]));
      const campanhas = (camps ?? []).map((c: Campanha) => {
        const ids = c.chip_ids ?? [];
        const on = ids.map((id) => chipMap.get(id)).filter(online) as Chip[];
        const off = ids.map((id) => chipMap.get(id)).filter((c) => c && !online(c)) as Chip[];
        return { ...c, on, off, ultimo: ultMap.get(c.id) ?? null };
      });
      const rodando = campanhas.filter((c) => c.on.length > 0).sort((a, b) => b.on.length - a.on.length);
      const paradas = campanhas.filter((c) => c.on.length === 0 && (c.chip_ids?.length ?? 0) > 0);

      // chips offline que estão em alguma campanha ativa → precisam reconectar
      const reconectarIds = new Set<string>();
      campanhas.forEach((c) => c.off.forEach((ch) => reconectarIds.add(ch.id)));
      const reconectar = [...reconectarIds].map((id) => {
        const ch = chipMap.get(id)!;
        const destrava = campanhas.filter((c) => (c.chip_ids ?? []).includes(id)).map((c) => c.nome.trim());
        const inativo = ch.status !== "ativo";
        return { chip: ch, destrava, inativo };
      });

      const disparosHoje = (disp ?? []).reduce((a: number, b: any) => a + Number(b.n_disparos), 0);
      return { rodando, paradas, reconectar, disparosHoje };
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando status...
      </div>
    );
  }

  const d = data!;
  const nomeCurto = (n: string) => n.replace(/^prospec-raul-/i, "").trim();

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground -mt-1">
        Visão operacional ao vivo — atualiza sozinho a cada minuto. Mostra o que está disparando e o que precisa reconectar.
      </p>

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ResumoCard n={d.rodando.length} label="campanhas disparando" cor="text-emerald-600" />
        <ResumoCard n={d.paradas.length} label="campanha(s) parada(s)" cor={d.paradas.length ? "text-red-600" : "text-muted-foreground"} />
        <ResumoCard n={d.reconectar.length} label="chips pra reconectar" cor={d.reconectar.length ? "text-amber-600" : "text-muted-foreground"} />
        <ResumoCard n={d.disparosHoje} label="disparos hoje" cor="text-emerald-600" />
      </div>

      {/* Campanhas rodando */}
      <div>
        <h3 className="text-sm font-semibold text-emerald-700 mb-2 flex items-center gap-1.5">
          <Wifi className="h-4 w-4" /> Campanhas rodando ({d.rodando.length})
        </h3>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Campanha</th>
                <th className="text-left px-3 py-2 font-medium">Tipo</th>
                <th className="text-left px-3 py-2 font-medium">Último disparo</th>
                <th className="text-left px-3 py-2 font-medium">Chips conectados ✅</th>
                <th className="text-left px-3 py-2 font-medium">A reconectar 🔴</th>
              </tr>
            </thead>
            <tbody>
              {d.rodando.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{c.nome.trim()}</td>
                  <td className="px-3 py-2"><TipoTag tipo={c.tipo_envio} /></td>
                  <td className="px-3 py-2"><UltimoDisparo iso={c.ultimo} /></td>
                  <td className="px-3 py-2">{c.on.map((ch) => <ChipBadge key={ch.id} nome={nomeCurto(ch.nome)} ok />)}</td>
                  <td className="px-3 py-2">{c.off.length ? c.off.map((ch) => <ChipBadge key={ch.id} nome={nomeCurto(ch.nome)} />) : <span className="text-muted-foreground">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Campanhas paradas */}
      {d.paradas.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1.5">
            <WifiOff className="h-4 w-4" /> Campanhas paradas — sem chip conectado ({d.paradas.length})
          </h3>
          <div className="border border-red-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-red-50 text-xs text-red-700">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Campanha</th>
                  <th className="text-left px-3 py-2 font-medium">Tipo</th>
                  <th className="text-left px-3 py-2 font-medium">Chips a reativar 🔴</th>
                </tr>
              </thead>
              <tbody>
                {d.paradas.map((c) => (
                  <tr key={c.id} className="border-t border-red-100 bg-red-50/40">
                    <td className="px-3 py-2 font-medium">{c.nome.trim()}</td>
                    <td className="px-3 py-2"><TipoTag tipo={c.tipo_envio} /></td>
                    <td className="px-3 py-2">{c.off.map((ch) => <ChipBadge key={ch.id} nome={nomeCurto(ch.nome)} />)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ação: reconectar */}
      {d.reconectar.length > 0 && (
        <div className="border-l-4 border-amber-500 bg-amber-50/60 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Ação — reconectar {d.reconectar.length} chip(s)
          </h3>
          <div className="space-y-2">
            {d.reconectar.map(({ chip, destrava, inativo }) => (
              <div key={chip.id} className="text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold text-red-700">{nomeCurto(chip.nome)}</span>
                {chip.numero && <span className="text-xs text-muted-foreground font-mono">{chip.numero}</span>}
                <span className="text-muted-foreground">
                  → {inativo ? <b>ativar + reconectar QR</b> : <b>reconectar QR</b>}
                </span>
                <span className="text-xs text-muted-foreground">· destrava: {destrava.join(", ")}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Onde: Disparos &amp; Chips → Chips &amp; Instâncias → botão de QR Code do chip.
          </p>
        </div>
      )}
    </div>
  );
}

function ResumoCard({ n, label, cor }: { n: number; label: string; cor: string }) {
  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className={cn("text-3xl font-bold tabular-nums", cor)}>{n}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function TipoTag({ tipo }: { tipo: string | null }) {
  const manual = tipo === "manual";
  return (
    <span className={cn("inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full", manual ? "bg-emerald-100 text-emerald-800" : "bg-indigo-100 text-indigo-800")}>
      {manual ? "Manual" : "IA"}
    </span>
  );
}

function ChipBadge({ nome, ok }: { nome: string; ok?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold rounded px-2 py-0.5 mr-1.5 mb-1", ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700")}>
      <Smartphone className="h-3 w-3" />{nome}
    </span>
  );
}

// "Está disparando agora?" — verde pulsante se disparou nos últimos 30min; senão hora + há quanto tempo
function UltimoDisparo({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-muted-foreground text-xs">sem disparo ainda</span>;
  const d = new Date(iso);
  const ativo = (Date.now() - d.getTime()) / 60000 < 30;
  const hora = format(d, "HH:mm");
  let rel = "";
  try { rel = formatDistanceToNow(d, { locale: ptBR, addSuffix: true }); } catch {}
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", ativo ? "text-emerald-700 font-semibold" : "text-muted-foreground")}>
      <span className={cn("h-2 w-2 rounded-full shrink-0", ativo ? "bg-emerald-500 animate-pulse" : "bg-gray-300")} />
      {ativo ? `disparando · ${hora}` : `${hora} · ${rel}`}
    </span>
  );
}
