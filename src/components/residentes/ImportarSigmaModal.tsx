import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle2, XCircle, Upload, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ResidenteData } from "./constants";

interface ImportarSigmaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  residentes: ResidenteData[];
}

interface ResidenteMatch {
  residente: ResidenteData;
  encontrado: boolean;
  medicoId?: string;
  medicoNome?: string;
  medicoEspecialidades?: string[];
  loading: boolean;
}

function normalizeForSearch(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getSpecialtyRoot(esp: string): string {
  const normalized = normalizeForSearch(esp);
  const words = normalized.split(/\s+/);
  const main = words[0];
  if (main.length <= 5) return main;
  return main.substring(0, Math.min(main.length, 7));
}

export function ImportarSigmaModal({ open, onOpenChange, residentes }: ImportarSigmaModalProps) {
  const [matches, setMatches] = useState<ResidenteMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedNovos, setSelectedNovos] = useState<Set<number>>(new Set());
  const [selectedExistentes, setSelectedExistentes] = useState<Set<number>>(new Set());
  const [criando, setCriando] = useState(false);

  const searchMedicos = useCallback(async () => {
    if (residentes.length === 0) return;

    setSearching(true);
    setSearched(false);
    setSelectedNovos(new Set());
    setSelectedExistentes(new Set());

    const results: ResidenteMatch[] = residentes.map(r => ({
      residente: r,
      encontrado: false,
      loading: true,
    }));
    setMatches([...results]);

    const batchSize = 10;
    for (let i = 0; i < results.length; i += batchSize) {
      const batch = results.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (item, batchIdx) => {
          const idx = i + batchIdx;
          try {
            const nomeParts = item.residente.medico.trim().split(/\s+/);
            const firstName = nomeParts[0];
            const lastName = nomeParts.length > 1 ? nomeParts[nomeParts.length - 1] : "";

            // Require at least 2 name parts to match (first + last)
            let query = supabase
              .from("medicos")
              .select("id, nome_completo, especialidade, crm")
              .ilike("nome_completo", `%${firstName}%`);

            if (lastName && lastName !== firstName) {
              query = query.ilike("nome_completo", `%${lastName}%`);
            }

            const { data: medicos } = await query.limit(20);

            if (medicos && medicos.length > 0) {
              // Score each candidate by how many name parts match
              const residenteNameParts = nomeParts.map(p => normalizeForSearch(p));
              
              const scored = medicos.map(m => {
                const candidateParts = (m.nome_completo || "").trim().split(/\s+/).map(p => normalizeForSearch(p));
                // Count how many resident name parts appear in candidate
                const nameMatches = residenteNameParts.filter(rp => 
                  candidateParts.some(cp => cp === rp)
                ).length;
                const nameScore = nameMatches / residenteNameParts.length;
                
                // Check specialty match
                const espRoot = getSpecialtyRoot(item.residente.especialidade);
                let espMatch = false;
                if (m.especialidade && Array.isArray(m.especialidade)) {
                  espMatch = m.especialidade.some(e =>
                    normalizeForSearch(e).includes(espRoot) ||
                    espRoot.includes(normalizeForSearch(e).substring(0, 5))
                  );
                }
                
                return { medico: m, nameScore, espMatch };
              });

              // Require at least 60% of name parts matching (e.g. 2 out of 3 for short names, 3 out of 5 for longer)
              const validCandidates = scored
                .filter(s => s.nameScore >= 0.6)
                .sort((a, b) => {
                  // Prefer specialty match, then higher name score
                  if (a.espMatch !== b.espMatch) return a.espMatch ? -1 : 1;
                  return b.nameScore - a.nameScore;
                });

              const best = validCandidates[0];

              if (best) {
                results[idx] = {
                  ...results[idx],
                  encontrado: true,
                  medicoId: best.medico.id,
                  medicoNome: best.medico.nome_completo,
                  medicoEspecialidades: best.medico.especialidade as string[] || [],
                  loading: false,
                };
              } else {
                results[idx] = { ...results[idx], encontrado: false, loading: false };
              }
            } else {
              results[idx] = { ...results[idx], encontrado: false, loading: false };
            }
          } catch {
            results[idx] = { ...results[idx], encontrado: false, loading: false };
          }
        })
      );

      setMatches([...results]);
    }

    setSearching(false);
    setSearched(true);
  }, [residentes]);

  useEffect(() => {
    if (open && residentes.length > 0) {
      searchMedicos();
    }
    if (!open) {
      setMatches([]);
      setSearched(false);
      setSelectedNovos(new Set());
      setSelectedExistentes(new Set());
    }
  }, [open, residentes, searchMedicos]);

  const encontrados = matches.filter(m => m.encontrado && !m.loading);
  const naoEncontrados = matches.filter(m => !m.encontrado && !m.loading);
  const carregando = matches.filter(m => m.loading);

  const toggleNovo = (idx: number) => {
    setSelectedNovos(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const toggleExistente = (idx: number) => {
    setSelectedExistentes(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const toggleAllNovos = () => {
    if (selectedNovos.size === naoEncontrados.length) {
      setSelectedNovos(new Set());
    } else {
      setSelectedNovos(new Set(naoEncontrados.map((_, i) => i)));
    }
  };

  const toggleAllExistentes = () => {
    if (selectedExistentes.size === encontrados.length) {
      setSelectedExistentes(new Set());
    } else {
      setSelectedExistentes(new Set(encontrados.map((_, i) => i)));
    }
  };

  const criarLeadsSelecionados = async () => {
    const selecionados = naoEncontrados.filter((_, i) => selectedNovos.has(i));
    if (selecionados.length === 0) return;

    setCriando(true);
    let sucesso = 0;
    let falhas = 0;

    for (const item of selecionados) {
      try {
        const { error } = await supabase.from("captacao_leads").insert({
          nome: item.residente.medico,
          especialidade: item.residente.especialidade,
          uf: item.residente.uf,
          status: "Novo",
          observacoes: `Importado de Residentes - CRM: ${item.residente.crm} | Instituição: ${item.residente.instituicao} | Período: ${item.residente.periodo}`,
        });
        if (error) throw error;
        sucesso++;
      } catch {
        falhas++;
      }
    }

    setCriando(false);
    if (sucesso > 0) toast.success(`${sucesso} lead(s) criado(s) com sucesso!`);
    if (falhas > 0) toast.error(`${falhas} lead(s) falharam ao criar.`);
    if (sucesso > 0) searchMedicos(); // refresh
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] w-[1200px] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/30 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Importar para Sigma
          </DialogTitle>
          <div className="flex items-center gap-3 text-xs mt-2">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Total:</span>
              <Badge variant="secondary" className="text-[10px] h-5">{residentes.length}</Badge>
            </div>
            {searched && (
              <>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-muted-foreground">No Sigma:</span>
                  <Badge variant="secondary" className="text-[10px] h-5">{encontrados.length}</Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-muted-foreground">Não encontrados:</span>
                  <Badge variant="secondary" className="text-[10px] h-5">{naoEncontrados.length}</Badge>
                </div>
              </>
            )}
            {carregando.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Buscando: {carregando.length}</span>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Two-column layout */}
        <div className="flex-1 min-h-0 flex">
          {/* Left column - Found in Sigma */}
          <div className="flex-1 flex flex-col border-r border-border/30 min-w-0">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20 bg-muted/20 shrink-0">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-[11px] font-semibold text-foreground">Já no Sigma</span>
                <Badge variant="secondary" className="text-[10px] h-4">{encontrados.length}</Badge>
              </div>
              {encontrados.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    checked={selectedExistentes.size === encontrados.length && encontrados.length > 0}
                    onCheckedChange={toggleAllExistentes}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-[10px] text-muted-foreground">Todos</span>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
              {encontrados.map((m, i) => (
                <div
                  key={`sim-${i}`}
                  className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 transition-colors"
                >
                  <Checkbox
                    checked={selectedExistentes.has(i)}
                    onCheckedChange={() => toggleExistente(i)}
                    className="h-3.5 w-3.5 mt-0.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate">{m.residente.medico}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      CRM: {m.residente.crm} · {m.residente.especialidade} · {m.residente.uf}
                    </p>
                    <p className="text-[10px] text-emerald-600 truncate mt-0.5">
                      Sigma: {m.medicoNome}
                      {m.medicoEspecialidades?.length ? ` · ${m.medicoEspecialidades.join(", ")}` : ""}
                    </p>
                  </div>
                </div>
              ))}
              {carregando.length > 0 && carregando.map((m, i) => (
                <div key={`load-l-${i}`} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted/20">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                  <p className="text-[11px] text-muted-foreground truncate">{m.residente.medico}</p>
                </div>
              ))}
              {searched && encontrados.length === 0 && carregando.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <CheckCircle2 className="h-6 w-6 opacity-20 mb-2" />
                  <p className="text-xs">Nenhum residente encontrado no Sigma</p>
                </div>
              )}
            </div>
          </div>

          {/* Right column - Not found */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20 bg-muted/20 shrink-0">
              <div className="flex items-center gap-2">
                <XCircle className="h-3.5 w-3.5 text-destructive" />
                <span className="text-[11px] font-semibold text-foreground">Não encontrados</span>
                <Badge variant="secondary" className="text-[10px] h-4">{naoEncontrados.length}</Badge>
              </div>
              {naoEncontrados.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    checked={selectedNovos.size === naoEncontrados.length && naoEncontrados.length > 0}
                    onCheckedChange={toggleAllNovos}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-[10px] text-muted-foreground">Todos</span>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
              {naoEncontrados.map((m, i) => (
                <div
                  key={`nao-${i}`}
                  className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-destructive/5 border border-destructive/10 hover:bg-destructive/10 transition-colors"
                >
                  <Checkbox
                    checked={selectedNovos.has(i)}
                    onCheckedChange={() => toggleNovo(i)}
                    className="h-3.5 w-3.5 mt-0.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate">{m.residente.medico}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      CRM: {m.residente.crm} · {m.residente.especialidade} · {m.residente.uf}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {m.residente.instituicao} · {m.residente.periodo}
                    </p>
                  </div>
                </div>
              ))}
              {searched && naoEncontrados.length === 0 && carregando.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <XCircle className="h-6 w-6 opacity-20 mb-2" />
                  <p className="text-xs">Todos os residentes foram encontrados no Sigma</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-border/30 bg-muted/10 shrink-0">
          <div className="text-[10px] text-muted-foreground">
            {selectedNovos.size > 0 && `${selectedNovos.size} não encontrado(s) selecionado(s)`}
            {selectedNovos.size > 0 && selectedExistentes.size > 0 && " · "}
            {selectedExistentes.size > 0 && `${selectedExistentes.size} existente(s) selecionado(s)`}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            {selectedNovos.size > 0 && (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={criarLeadsSelecionados}
                disabled={criando}
              >
                {criando ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserPlus className="h-3.5 w-3.5" />
                )}
                Criar {selectedNovos.size} Lead(s)
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
