import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, ShieldAlert, ShieldOff, AlertTriangle, Loader2, X, Shield } from "lucide-react";

type BloqueadoLead = {
  id: string;
  lead_id: string;
  motivo: string;
  created_at: string;
  created_by: string | null;
  nome: string;
  cpf: string | null;
  phone_e164: string | null;
  status: string;
  uf: string | null;
};

type SearchLead = {
  id: string;
  nome: string;
  cpf: string | null;
  phone_e164: string | null;
  status: string;
  uf: string | null;
  bloqueio_id?: string | null;
  bloqueio_motivo?: string | null;
};

/** Normaliza CPF para apenas dígitos */
const cpfDigits = (v: string) => v.replace(/\D/g, "");

export function AbaBloqueioTemporario() {
  const [busca, setBusca] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLead, setSelectedLead] = useState<SearchLead | null>(null);
  const [motivo, setMotivo] = useState("");
  const [showBloquearDialog, setShowBloquearDialog] = useState(false);
  const [desbloquearId, setDesbloquearId] = useState<string | null>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Lista de leads atualmente bloqueados
  const { data: bloqueados = [], isLoading: isLoadingBloqueados } = useQuery<BloqueadoLead[]>({
    queryKey: ["bloqueios-temporarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads_bloqueio_temporario")
        .select("id, lead_id, motivo, created_at, created_by")
        .is("removed_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) return [];

      const leadIds = data.map((b) => b.lead_id);
      const { data: leadsData, error: leadsErr } = await supabase
        .from("leads")
        .select("id, nome, cpf, phone_e164, status, uf")
        .in("id", leadIds);

      if (leadsErr) throw leadsErr;

      const leadsMap = new Map((leadsData || []).map((l) => [l.id, l]));
      return data
        .map((b) => {
          const lead = leadsMap.get(b.lead_id);
          if (!lead) return null;
          return {
            id: b.id,
            lead_id: b.lead_id,
            motivo: b.motivo,
            created_at: b.created_at,
            created_by: b.created_by,
            nome: lead.nome,
            cpf: lead.cpf,
            phone_e164: lead.phone_e164,
            status: lead.status,
            uf: lead.uf,
          } as BloqueadoLead;
        })
        .filter(Boolean) as BloqueadoLead[];
    },
  });

  // Busca manual de leads — case-insensitive + CPF com/sem máscara
  const { data: resultadosBusca = [], isLoading: isSearching, refetch: doSearch } = useQuery<SearchLead[]>({
    queryKey: ["leads-search-bloqueio", searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.trim().length < 2) return [];

      const termo = searchTerm.trim();
      const digits = cpfDigits(termo);

      // Monta variantes de busca: nome (ilike), cpf raw digits, cpf formatado xxx.xxx.xxx-xx
      let orFilter: string;
      if (digits.length >= 6) {
        // Busca tanto por CPF (dígitos) quanto por nome
        const cpfFormatado =
          digits.length === 11
            ? `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
            : digits;
        orFilter = [
          `cpf.ilike.%${digits}%`,
          `cpf.ilike.%${cpfFormatado}%`,
          `nome.ilike.%${termo}%`,
        ].join(",");
      } else {
        orFilter = `nome.ilike.%${termo}%`;
      }

      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, cpf, phone_e164, status, uf")
        .or(orFilter)
        .order("nome")
        .limit(50);

      if (error) throw error;
      if (!data || data.length === 0) return [];

      const ids = data.map((l) => l.id);
      const { data: bloqueiosAtivos } = await supabase
        .from("leads_bloqueio_temporario")
        .select("lead_id, id, motivo")
        .in("lead_id", ids)
        .is("removed_at", null);

      const bloqueioMap = new Map(
        (bloqueiosAtivos || []).map((b) => [b.lead_id, b])
      );

      return data.map((lead) => ({
        id: lead.id,
        nome: lead.nome,
        cpf: lead.cpf,
        phone_e164: lead.phone_e164,
        status: lead.status,
        uf: lead.uf,
        bloqueio_id: bloqueioMap.get(lead.id)?.id ?? null,
        bloqueio_motivo: bloqueioMap.get(lead.id)?.motivo ?? null,
      }));
    },
    enabled: searchTerm.length >= 2,
  });

  const bloquearMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLead) throw new Error("Nenhum lead selecionado");
      if (!motivo.trim()) throw new Error("Motivo obrigatório");

      const { error } = await supabase.from("leads_bloqueio_temporario").insert({
        lead_id: selectedLead.id,
        motivo: motivo.trim(),
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bloqueios-temporarios"] });
      queryClient.invalidateQueries({ queryKey: ["leads-search-bloqueio", searchTerm] });
      queryClient.invalidateQueries({ queryKey: ["bloqueio-temporario-entry", selectedLead?.id] });
      toast.success("Lead bloqueado temporariamente");
      setMotivo("");
      setShowBloquearDialog(false);
      setSelectedLead(null);
      doSearch();
    },
    onError: (err: Error) => toast.error("Erro: " + err.message),
  });

  const desbloquearMutation = useMutation({
    mutationFn: async (bloqueioId: string) => {
      const { error } = await supabase
        .from("leads_bloqueio_temporario")
        .update({ removed_at: new Date().toISOString(), removed_by: user?.id })
        .eq("id", bloqueioId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bloqueios-temporarios"] });
      queryClient.invalidateQueries({ queryKey: ["leads-search-bloqueio", searchTerm] });
      toast.success("Bloqueio removido");
      setDesbloquearId(null);
      doSearch();
    },
    onError: (err: Error) => toast.error("Erro: " + err.message),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (busca.trim().length >= 2) setSearchTerm(busca.trim());
  };

  const clearSearch = () => {
    setBusca("");
    setSearchTerm("");
  };

  const showingSearch = searchTerm.length >= 2;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Painel de busca ── */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Buscar lead para bloquear</h2>
          <span className="text-xs text-muted-foreground">(nome ou CPF com ou sem máscara)</span>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Ex: João Silva ou 123.456.789-00 ou 12345678900"
              className="pl-9 h-10"
              autoFocus
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button type="submit" disabled={busca.trim().length < 2} className="h-10 px-5">
            Buscar
          </Button>
          {showingSearch && (
            <Button type="button" variant="ghost" onClick={clearSearch} className="h-10">
              Limpar
            </Button>
          )}
        </form>

        {/* Resultados */}
        {showingSearch && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {isSearching ? "Buscando..." : `${resultadosBusca.length} resultado(s) para "${searchTerm}"`}
            </p>

            {isSearching ? (
              <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Buscando...</span>
              </div>
            ) : resultadosBusca.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                <Search className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Nenhum lead encontrado para "{searchTerm}"</p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="font-semibold">Nome</TableHead>
                      <TableHead className="font-semibold">CPF</TableHead>
                      <TableHead className="font-semibold">Telefone</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold">UF</TableHead>
                      <TableHead className="font-semibold">Situação</TableHead>
                      <TableHead className="text-right font-semibold">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultadosBusca.map((lead) => (
                      <TableRow key={lead.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium">{lead.nome}</TableCell>
                        <TableCell className="text-muted-foreground text-sm font-mono">{lead.cpf || "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm font-mono">{lead.phone_e164 || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{lead.status}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{lead.uf || "—"}</TableCell>
                        <TableCell>
                          {lead.bloqueio_id ? (
                            <Badge variant="outline" className="text-xs gap-1 border-destructive/40 text-destructive bg-destructive/5">
                              <ShieldAlert className="h-3 w-3" />
                              Bloqueado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs gap-1 border-green-400/40 text-green-700 bg-green-500/5">
                              <Shield className="h-3 w-3" />
                              Liberado
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {lead.bloqueio_id ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 h-8 text-xs"
                              onClick={() => setDesbloquearId(lead.bloqueio_id!)}
                            >
                              <ShieldOff className="h-3.5 w-3.5" />
                              Desbloquear
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 h-8 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                setSelectedLead(lead);
                                setShowBloquearDialog(true);
                              }}
                            >
                              <ShieldAlert className="h-3.5 w-3.5" />
                              Bloquear
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Lista de bloqueados ativos ── */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            <h2 className="font-semibold text-sm">Leads com bloqueio ativo</h2>
          </div>
          <Badge variant="secondary" className="text-xs">
            {isLoadingBloqueados ? "..." : bloqueados.length} bloqueado(s)
          </Badge>
        </div>

        {isLoadingBloqueados ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Carregando...</span>
          </div>
        ) : bloqueados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <div className="rounded-full bg-muted p-4">
              <Shield className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium">Nenhum bloqueio ativo</p>
              <p className="text-xs text-muted-foreground mt-1">
                Use a busca acima para encontrar um lead e aplicar um bloqueio temporário.
              </p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead className="font-semibold pl-5">Nome</TableHead>
                <TableHead className="font-semibold">CPF</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">UF</TableHead>
                <TableHead className="font-semibold">Motivo</TableHead>
                <TableHead className="font-semibold">Bloqueado em</TableHead>
                <TableHead className="text-right pr-5 font-semibold">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bloqueados.map((b) => (
                <TableRow key={b.id} className="hover:bg-muted/20">
                  <TableCell className="font-medium pl-5">{b.nome}</TableCell>
                  <TableCell className="text-muted-foreground text-sm font-mono">{b.cpf || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{b.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{b.uf || "—"}</TableCell>
                  <TableCell className="text-sm max-w-[220px]">
                    <span className="line-clamp-2 text-muted-foreground" title={b.motivo}>{b.motivo}</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {format(new Date(b.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-right pr-5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 h-8 text-xs"
                      onClick={() => setDesbloquearId(b.id)}
                      disabled={desbloquearMutation.isPending}
                    >
                      <ShieldOff className="h-3.5 w-3.5" />
                      Desbloquear
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Dialog: Bloquear */}
      <AlertDialog open={showBloquearDialog} onOpenChange={setShowBloquearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Bloquear Temporariamente
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-foreground">{selectedLead?.nome}</span> não aparecerá
              na seleção de disparos. O status real do lead não será alterado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Motivo do bloqueio *</label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Descreva o motivo do bloqueio temporário..."
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setMotivo(""); setSelectedLead(null); }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bloquearMutation.mutate()}
              disabled={!motivo.trim() || bloquearMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bloquearMutation.isPending ? "Bloqueando..." : "Confirmar Bloqueio"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Desbloquear */}
      <AlertDialog open={!!desbloquearId} onOpenChange={(o) => !o && setDesbloquearId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Bloqueio Temporário?</AlertDialogTitle>
            <AlertDialogDescription>
              Este lead voltará a aparecer na seleção de disparos de WhatsApp e E-mail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => desbloquearId && desbloquearMutation.mutate(desbloquearId)}
              disabled={desbloquearMutation.isPending}
            >
              Confirmar Remoção
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
