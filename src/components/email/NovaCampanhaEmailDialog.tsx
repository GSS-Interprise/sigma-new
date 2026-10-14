import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR",
  "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"].map((u) => ({ value: u, label: u }));

/**
 * Campanha só de e-mail. O público sai dos filtros (especialidade, estado, cidade e/ou
 * lista de disparo); filtro vazio = sem restrição. Nasce em rascunho: o texto e o disparo
 * ficam na tela da campanha, onde aparece quantos médicos vão receber.
 *
 * Com `campanhaId` o mesmo formulário edita o público de uma campanha que já existe
 * (a equipe pediu para trocar as listas sem recriar a campanha).
 */
export function NovaCampanhaEmailDialog({
  open, onOpenChange, onCreated, campanhaId, onSaved,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; onCreated?: (id: string) => void;
  campanhaId?: string; onSaved?: () => void;
}) {
  const editando = !!campanhaId;
  const [nome, setNome] = useState("");
  const [especialidades, setEspecialidades] = useState<string[]>([]);
  const [ufs, setUfs] = useState<string[]>([]);
  const [cidades, setCidades] = useState("");
  const [listas, setListas] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const qc = useQueryClient();

  const { data: opcoesEsp = [] } = useQuery({
    queryKey: ["especialidades-opcoes"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("especialidades").select("id, nome").order("nome");
      return (data ?? []).map((e: any) => ({ value: e.id, label: e.nome }));
    },
  });
  const { data: opcoesListas = [] } = useQuery({
    queryKey: ["disparo-listas-opcoes"],
    enabled: open,
    queryFn: async () => {
      const { data } = await (supabase as any).from("disparo_listas").select("id, nome").order("created_at", { ascending: false });
      return (data ?? []).map((l: any) => ({ value: l.id, label: l.nome }));
    },
  });

  const limpar = () => { setNome(""); setEspecialidades([]); setUfs([]); setCidades(""); setListas([]); };

  // edição: abre com o público atual da campanha
  useEffect(() => {
    if (!open || !campanhaId) return;
    (async () => {
      const { data: c } = await (supabase as any).from("campanhas")
        .select("nome, especialidade_ids, regiao_estados, regiao_cidades").eq("id", campanhaId).single();
      const { data: ls } = await (supabase as any).from("campanha_listas").select("lista_id").eq("campanha_id", campanhaId);
      setNome(c?.nome ?? ""); setEspecialidades(c?.especialidade_ids ?? []); setUfs(c?.regiao_estados ?? []);
      setCidades((c?.regiao_cidades ?? []).join(", ")); setListas((ls ?? []).map((l: any) => l.lista_id));
    })();
  }, [open, campanhaId]);

  const salvarPublico = async () => {
    if (!campanhaId) return;
    if (!nome.trim()) return toast.error("Dê um nome para a campanha.");
    setSalvando(true);
    const cidadesArr = cidades.split(/[,;\n]+/).map((c) => c.trim()).filter(Boolean);
    const { error } = await (supabase as any).from("campanhas").update({
      nome: nome.trim(),
      especialidade_ids: especialidades.length ? especialidades : null,
      regiao_estados: ufs.length ? ufs : null,
      regiao_cidades: cidadesArr.length ? cidadesArr : null,
    }).eq("id", campanhaId);
    if (error) { setSalvando(false); return toast.error("Não salvou: " + error.message); }
    // listas: troca o conjunto inteiro pelo escolhido agora
    const { data: atuais } = await (supabase as any).from("campanha_listas").select("lista_id").eq("campanha_id", campanhaId);
    const tinha = new Set((atuais ?? []).map((l: any) => l.lista_id as string));
    const sair = [...tinha].filter((id) => !listas.includes(id));
    const entrar = listas.filter((id) => !tinha.has(id));
    if (sair.length) await (supabase as any).from("campanha_listas").delete().eq("campanha_id", campanhaId).in("lista_id", sair);
    if (entrar.length) {
      const { error: e2 } = await (supabase as any).from("campanha_listas").insert(entrar.map((lista_id) => ({ campanha_id: campanhaId, lista_id })));
      if (e2) toast.error("Público salvo, mas as listas não foram atualizadas: " + e2.message);
    }
    await qc.invalidateQueries({ queryKey: ["campanhas-email"] });
    setSalvando(false);
    toast.success("Público atualizado.");
    onOpenChange(false);
    onSaved?.();
  };

  const criar = async () => {
    if (!nome.trim()) return toast.error("Dê um nome para a campanha.");
    setSalvando(true);
    const cidadesArr = cidades.split(/[,;\n]+/).map((c) => c.trim()).filter(Boolean);
    const { data, error } = await (supabase as any).from("campanhas").insert({
      nome: nome.trim(), canal: "email", tipo_campanha: "email_marketing", status: "rascunho",
      especialidade_ids: especialidades.length ? especialidades : null,
      regiao_estados: ufs.length ? ufs : null,
      regiao_cidades: cidadesArr.length ? cidadesArr : null,
      email_ativo: true, email_remetente_nome: "GSS Saúde",
    }).select("id").single();
    if (error) { setSalvando(false); return toast.error("Não criou: " + error.message); }
    if (listas.length) {
      const { error: e2 } = await (supabase as any).from("campanha_listas")
        .insert(listas.map((lista_id) => ({ campanha_id: data.id, lista_id })));
      if (e2) toast.error("Campanha criada, mas as listas não foram vinculadas: " + e2.message);
    }
    // recarrega a lista antes de abrir: o cabeçalho da campanha vem dela
    await qc.invalidateQueries({ queryKey: ["campanhas-email"] });
    setSalvando(false);
    limpar();
    onOpenChange(false);
    onCreated?.(data.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? "Quem recebe esta campanha" : "Nova campanha de e-mail"}</DialogTitle>
          <DialogDescription>
            Escolha quem recebe. Filtro vazio não restringe; combinar filtros restringe mais.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Pediatras SC — outubro" autoFocus />
          </div>
          <div>
            <Label className="text-xs">Especialidades</Label>
            <SearchableMultiSelect options={opcoesEsp} values={especialidades} onChange={setEspecialidades}
              placeholder="Todas" searchPlaceholder="Buscar especialidade…" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Estados</Label>
              <SearchableMultiSelect options={UFS} values={ufs} onChange={setUfs} placeholder="Todos" maxBadges={4} />
            </div>
            <div>
              <Label className="text-xs">Cidades</Label>
              <Input value={cidades} onChange={(e) => setCidades(e.target.value)} placeholder="Itajaí, Blumenau" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Listas de disparo (opcional)</Label>
            <SearchableMultiSelect options={opcoesListas} values={listas} onChange={setListas}
              placeholder="Nenhuma — usa só os filtros acima" searchPlaceholder="Buscar lista…" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Sempre ficam de fora: e-mail inválido, quem se descadastrou e quem pediu opt-out (LGPD).
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={editando ? salvarPublico : criar} disabled={salvando}>
            {salvando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} {editando ? "Salvar público" : "Criar e escrever o e-mail"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
