import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Search, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

// Extract root of specialty for fuzzy matching
// e.g. "ANESTESIOLOGIA" -> "anestesio", "PEDIATRIA" -> "pediatr"
function getSpecialtyRoot(esp: string): string {
  const normalized = normalizeForSearch(esp);
  // Take first meaningful word and get root (min 5 chars)
  const words = normalized.split(/\s+/);
  const main = words[0];
  if (main.length <= 5) return main;
  return main.substring(0, Math.min(main.length, 7));
}

export function ImportarSigmaModal({ open, onOpenChange, residentes }: ImportarSigmaModalProps) {
  const [matches, setMatches] = useState<ResidenteMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const searchMedicos = useCallback(async () => {
    if (residentes.length === 0) return;
    
    setSearching(true);
    setSearched(false);

    const results: ResidenteMatch[] = residentes.map(r => ({
      residente: r,
      encontrado: false,
      loading: true,
    }));
    setMatches([...results]);

    // Process in batches of 10
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

            // Search by name parts using ilike
            let query = supabase
              .from("medicos")
              .select("id, nome_completo, especialidade, crm")
              .ilike("nome_completo", `%${firstName}%`);

            if (lastName && lastName !== firstName) {
              query = query.ilike("nome_completo", `%${lastName}%`);
            }

            const { data: medicos } = await query.limit(10);

            if (medicos && medicos.length > 0) {
              // Check specialty match with fuzzy
              const espRoot = getSpecialtyRoot(item.residente.especialidade);
              
              const bestMatch = medicos.find(m => {
                if (!m.especialidade || !Array.isArray(m.especialidade)) return false;
                return m.especialidade.some(e => 
                  normalizeForSearch(e).includes(espRoot) || 
                  espRoot.includes(normalizeForSearch(e).substring(0, 5))
                );
              });

              // If specialty match found, use it; otherwise just use name match
              const match = bestMatch || medicos[0];
              
              results[idx] = {
                ...results[idx],
                encontrado: true,
                medicoId: match.id,
                medicoNome: match.nome_completo,
                medicoEspecialidades: match.especialidade as string[] || [],
                loading: false,
              };
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
    }
  }, [open, residentes, searchMedicos]);

  const encontrados = matches.filter(m => m.encontrado && !m.loading);
  const naoEncontrados = matches.filter(m => !m.encontrado && !m.loading);
  const carregando = matches.filter(m => m.loading);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Importar para Sigma
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 text-xs border-b border-border/30 pb-3">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Total:</span>
            <Badge variant="secondary" className="text-[10px] h-5">{residentes.length}</Badge>
          </div>
          {searched && (
            <>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                <span className="text-muted-foreground">No Sigma:</span>
                <Badge className="text-[10px] h-5 bg-green-500/10 text-green-600 border-green-500/20">{encontrados.length}</Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-muted-foreground">Não encontrados:</span>
                <Badge className="text-[10px] h-5 bg-orange-500/10 text-orange-600 border-orange-500/20">{naoEncontrados.length}</Badge>
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

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-1 pr-3">
            {/* Not found first */}
            {naoEncontrados.length > 0 && (
              <div className="mb-3">
                <h4 className="text-[10px] uppercase tracking-wider text-orange-500 font-semibold mb-2 flex items-center gap-1.5">
                  <XCircle className="h-3 w-3" />
                  Não encontrados no Sigma ({naoEncontrados.length})
                </h4>
                {naoEncontrados.map((m, i) => (
                  <div key={`nao-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-orange-500/5 border border-orange-500/10 mb-1">
                    <XCircle className="h-4 w-4 text-orange-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{m.residente.medico}</p>
                      <p className="text-[10px] text-muted-foreground">
                        CRM: {m.residente.crm} · {m.residente.especialidade} · {m.residente.uf}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Found */}
            {encontrados.length > 0 && (
              <div className="mb-3">
                <h4 className="text-[10px] uppercase tracking-wider text-green-500 font-semibold mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3" />
                  Já cadastrados no Sigma ({encontrados.length})
                </h4>
                {encontrados.map((m, i) => (
                  <div key={`sim-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-green-500/5 border border-green-500/10 mb-1">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{m.residente.medico}</p>
                      <p className="text-[10px] text-muted-foreground">
                        CRM: {m.residente.crm} · {m.residente.especialidade} · {m.residente.uf}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-green-600 font-medium truncate max-w-[180px]">{m.medicoNome}</p>
                      {m.medicoEspecialidades && m.medicoEspecialidades.length > 0 && (
                        <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                          {m.medicoEspecialidades.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Loading items */}
            {carregando.map((m, i) => (
              <div key={`load-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/20 mb-1">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{m.residente.medico}</p>
                  <p className="text-[10px] text-muted-foreground">{m.residente.especialidade}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-3 border-t border-border/30">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
