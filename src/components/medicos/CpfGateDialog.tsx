import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UserCheck, UserPlus, Search, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CpfGateResult {
  value: string;
  type: "cpf" | "cnpj";
}

interface CpfGateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeadFound: (leadId: string) => void;
  onNewLead: (result: CpfGateResult) => void;
}

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatDocument(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 11) return formatCpf(value);
  return formatCnpj(value);
}

function buildCpfVariants(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return [raw];
  const formatted = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  return Array.from(new Set([raw, digits, formatted]));
}

function buildCnpjVariants(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 14) return [raw];
  const formatted = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  return Array.from(new Set([raw, digits, formatted]));
}

interface NameSearchResult {
  id: string;
  nome: string;
  cpf: string | null;
  cnpj: string | null;
}

export function CpfGateDialog({ open, onOpenChange, onLeadFound, onNewLead }: CpfGateDialogProps) {
  const [doc, setDoc] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Estado intermediário: CNPJ não encontrado → busca por nome
  const [cnpjNotFound, setCnpjNotFound] = useState(false);
  const [pendingCnpj, setPendingCnpj] = useState("");
  const [nomeBusca, setNomeBusca] = useState("");
  const [nameResults, setNameResults] = useState<NameSearchResult[] | null>(null);
  const [loadingName, setLoadingName] = useState(false);

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setDoc("");
      setCnpjNotFound(false);
      setPendingCnpj("");
      setNomeBusca("");
      setNameResults(null);
    }
    onOpenChange(isOpen);
  };

  const digits = doc.replace(/\D/g, "");
  const isCnpj = digits.length > 11;
  const isValidLength = digits.length === 11 || digits.length === 14;

  const handleSearch = async () => {
    if (!isValidLength) {
      toast.error("Digite um CPF (11 dígitos) ou CNPJ (14 dígitos) válido");
      return;
    }

    setLoading(true);
    try {
      if (digits.length === 11) {
        // === FLUXO CPF (sem alterações) ===
        const variants = buildCpfVariants(doc);
        const orFilter = variants.map((v) => `cpf.eq.${v}`).join(",");

        const { data, error } = await supabase
          .from("leads")
          .select("id, nome, cpf")
          .or(orFilter)
          .limit(1)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          toast.success(`Lead encontrado: ${data.nome}`);
          handleClose(false);
          onLeadFound(data.id);
        } else {
          handleClose(false);
          onNewLead({ value: doc, type: "cpf" });
        }
      } else {
        // === FLUXO CNPJ ===
        const variants = buildCnpjVariants(doc);
        const orFilter = variants.map((v) => `cnpj.eq.${v}`).join(",");

        const { data, error } = await supabase
          .from("leads")
          .select("id, nome, cnpj")
          .or(orFilter)
          .limit(1)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          toast.success(`Lead PJ encontrado: ${data.nome}`);
          handleClose(false);
          onLeadFound(data.id);
        } else {
          // CNPJ não encontrado → mostrar busca por nome
          setCnpjNotFound(true);
          setPendingCnpj(doc);
          toast.info("CNPJ não encontrado. Busque por nome para evitar duplicatas.");
        }
      }
    } catch (err: any) {
      toast.error("Erro ao verificar documento");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleNameSearch = async () => {
    const term = nomeBusca.trim();
    if (term.length < 3) {
      toast.error("Digite pelo menos 3 caracteres para buscar");
      return;
    }

    setLoadingName(true);
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, cpf, cnpj")
        .ilike("nome", `%${term}%`)
        .limit(5);

      if (error) throw error;

      if (!data || data.length === 0) {
        // Nenhum resultado → criar lead com CNPJ
        toast.info("Nenhum lead encontrado. Criando novo lead PJ.");
        handleClose(false);
        onNewLead({ value: pendingCnpj, type: "cnpj" });
      } else if (data.length === 1) {
        toast.success(`Lead encontrado: ${data[0].nome}`);
        handleClose(false);
        onLeadFound(data[0].id);
      } else {
        // Múltiplos → mostrar lista
        setNameResults(data as NameSearchResult[]);
      }
    } catch (err: any) {
      toast.error("Erro ao buscar por nome");
      console.error(err);
    } finally {
      setLoadingName(false);
    }
  };

  const handleSelectFromList = (leadId: string) => {
    handleClose(false);
    onLeadFound(leadId);
  };

  const handleCreateNewPJ = () => {
    handleClose(false);
    onNewLead({ value: pendingCnpj, type: "cnpj" });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Verificar CPF/CNPJ antes de criar lead
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {!cnpjNotFound ? (
            <>
              <p className="text-sm text-muted-foreground">
                Informe o CPF ou CNPJ. Se já existir no CRM, o prontuário será aberto automaticamente.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="cpf-gate-input">
                  {isCnpj ? "CNPJ" : "CPF"}
                </Label>
                <Input
                  id="cpf-gate-input"
                  ref={inputRef}
                  value={doc}
                  onChange={(e) => setDoc(formatDocument(e.target.value))}
                  placeholder="CPF ou CNPJ"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && isValidLength && !loading) {
                      handleSearch();
                    }
                  }}
                />
                {isCnpj && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    Pessoa Jurídica detectada
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => handleClose(false)} disabled={loading}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={handleSearch}
                  disabled={!isValidLength || loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  {loading ? "Verificando..." : "Verificar"}
                </Button>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t">
                <div className="flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5 text-primary" />
                  Existe → abre prontuário
                </div>
                <div className="flex items-center gap-1.5">
                  <UserPlus className="h-3.5 w-3.5 text-primary" />
                  Novo → cria lead
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                CNPJ <strong>{pendingCnpj}</strong> não encontrado. Busque por nome para verificar se já existe.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="name-search-input">Nome</Label>
                <Input
                  id="name-search-input"
                  value={nomeBusca}
                  onChange={(e) => setNomeBusca(e.target.value)}
                  placeholder="Digite o nome do lead..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && nomeBusca.trim().length >= 3 && !loadingName) {
                      handleNameSearch();
                    }
                  }}
                />
              </div>

              {nameResults && nameResults.length > 1 && (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  <Label className="text-xs text-muted-foreground">Resultados encontrados:</Label>
                  {nameResults.map((r) => (
                    <Button
                      key={r.id}
                      variant="outline"
                      className="w-full justify-start text-left h-auto py-2"
                      onClick={() => handleSelectFromList(r.id)}
                    >
                      <div>
                        <div className="font-medium text-sm">{r.nome}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.cpf ? `CPF: ${r.cpf}` : r.cnpj ? `CNPJ: ${r.cnpj}` : "Sem documento"}
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleCreateNewPJ}
                >
                  <UserPlus className="h-4 w-4 mr-1" />
                  Criar novo PJ
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={handleNameSearch}
                  disabled={nomeBusca.trim().length < 3 || loadingName}
                >
                  {loadingName ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  {loadingName ? "Buscando..." : "Buscar"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
