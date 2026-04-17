import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { DisparoLista, useUpsertDisparoLista } from "@/hooks/useDisparoListas";
import { useEspecialidades } from "@/hooks/useEspecialidades";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lista?: DisparoLista | null;
}

export function ListaDisparoFormDialog({ open, onOpenChange, lista }: Props) {
  const isEdit = !!lista;
  const upsert = useUpsertDisparoLista();
  const { data: especialidades } = useEspecialidades();

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [modo, setModo] = useState<"manual" | "dinamica" | "mista">("manual");
  const [excluirBl, setExcluirBl] = useState(true);
  const [ufs, setUfs] = useState<string[]>([]);
  const [cidades, setCidades] = useState<string[]>([]);
  const [especialidadesSel, setEspecialidadesSel] = useState<string[]>([]);

  const { data: ufList } = useQuery({
    queryKey: ["leads-distinct-uf"],
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("uf").not("uf", "is", null).limit(1000);
      const uniq = Array.from(new Set((data || []).map((d: any) => d.uf).filter(Boolean))).sort();
      return uniq as string[];
    },
    enabled: open,
  });

  const { data: cidadeList } = useQuery({
    queryKey: ["leads-distinct-cidade", ufs],
    queryFn: async () => {
      let q = supabase.from("leads").select("cidade").not("cidade", "is", null).limit(2000);
      if (ufs.length) q = q.in("uf", ufs);
      const { data } = await q;
      const uniq = Array.from(new Set((data || []).map((d: any) => d.cidade).filter(Boolean))).sort();
      return uniq as string[];
    },
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setNome(lista?.nome || "");
      setDescricao(lista?.descricao || "");
      setModo((lista?.modo as any) || "manual");
      setExcluirBl(lista?.excluir_blacklist ?? true);
      setUfs(lista?.filtro_ufs || []);
      setCidades(lista?.filtro_cidades || []);
      setEspecialidadesSel(lista?.filtro_especialidades || []);
    }
  }, [open, lista]);

  const addItem = (arr: string[], setArr: (v: string[]) => void, val: string) => {
    if (val && !arr.includes(val)) setArr([...arr, val]);
  };
  const rmItem = (arr: string[], setArr: (v: string[]) => void, val: string) =>
    setArr(arr.filter((x) => x !== val));

  const handleSave = async () => {
    if (!nome.trim()) return;
    await upsert.mutateAsync({
      id: lista?.id,
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      modo,
      excluir_blacklist: excluirBl,
      filtro_ufs: ufs,
      filtro_cidades: cidades,
      filtro_especialidades: especialidadesSel,
      filtro_status: [],
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar lista" : "Nova lista para disparo"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Cardiologistas SP" />
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Modo da lista</Label>
            <Select value={modo} onValueChange={(v) => setModo(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual (escolher leads um a um)</SelectItem>
                <SelectItem value="dinamica">Dinâmica (filtros aplicados em tempo real)</SelectItem>
                <SelectItem value="mista">Mista (manual + filtros)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(modo === "dinamica" || modo === "mista") && (
            <div className="space-y-4 rounded-md border p-3">
              <p className="text-sm font-medium">Filtros dinâmicos</p>

              {/* UFs */}
              <div className="space-y-2">
                <Label>UFs</Label>
                <Select onValueChange={(v) => addItem(ufs, setUfs, v)}>
                  <SelectTrigger><SelectValue placeholder="Adicionar UF" /></SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {(ufList || []).filter((u) => !ufs.includes(u)).map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-1">
                  {ufs.map((u) => (
                    <Badge key={u} variant="secondary" className="gap-1">
                      {u}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => rmItem(ufs, setUfs, u)} />
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Cidades */}
              <div className="space-y-2">
                <Label>Cidades</Label>
                <Select onValueChange={(v) => addItem(cidades, setCidades, v)}>
                  <SelectTrigger><SelectValue placeholder="Adicionar cidade" /></SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {(cidadeList || []).filter((c) => !cidades.includes(c)).map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-1">
                  {cidades.map((c) => (
                    <Badge key={c} variant="secondary" className="gap-1">
                      {c}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => rmItem(cidades, setCidades, c)} />
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Especialidades */}
              <div className="space-y-2">
                <Label>Especialidades</Label>
                <Select onValueChange={(v) => addItem(especialidadesSel, setEspecialidadesSel, v)}>
                  <SelectTrigger><SelectValue placeholder="Adicionar especialidade" /></SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {(especialidades || [])
                      .filter((e: any) => !especialidadesSel.includes(e.nome))
                      .map((e: any) => (
                        <SelectItem key={e.id} value={e.nome}>{e.nome}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-1">
                  {especialidadesSel.map((e) => (
                    <Badge key={e} variant="secondary" className="gap-1">
                      {e}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => rmItem(especialidadesSel, setEspecialidadesSel, e)} />
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!nome.trim() || upsert.isPending}>
            {upsert.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
