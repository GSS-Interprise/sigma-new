import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Search, UserPlus, Link, Phone, Mail, User, Sparkles, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface SigZapLeadLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactPhone: string;
  contactName: string;
  onLinkLead: (leadId: string) => void;
  onCreateNew: () => void;
}

// Normaliza número para comparação - últimos 8-9 dígitos
function normalizeForComparison(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Pega os últimos 9 dígitos (número sem DDD para comparação fuzzy)
  return digits.slice(-9);
}

// Calcula similaridade entre dois números (0-100)
function calculatePhoneSimilarity(phone1: string, phone2: string): number {
  const n1 = normalizeForComparison(phone1);
  const n2 = normalizeForComparison(phone2);
  
  if (n1 === n2) return 100;
  
  // Verificar se os últimos 8 dígitos são iguais
  if (n1.slice(-8) === n2.slice(-8)) return 95;
  
  // Verificar se os últimos 7 dígitos são iguais
  if (n1.slice(-7) === n2.slice(-7)) return 85;
  
  // Contar dígitos iguais nas mesmas posições
  let matches = 0;
  const minLen = Math.min(n1.length, n2.length);
  for (let i = 0; i < minLen; i++) {
    if (n1[n1.length - 1 - i] === n2[n2.length - 1 - i]) {
      matches++;
    } else {
      break; // Para quando encontra diferença
    }
  }
  
  return Math.round((matches / 9) * 80);
}

// Calcula similaridade de nome (simples)
function calculateNameSimilarity(name1: string, name2: string): number {
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();
  
  if (n1 === n2) return 100;
  if (n1.includes(n2) || n2.includes(n1)) return 80;
  
  // Primeiro nome igual
  const firstName1 = n1.split(' ')[0];
  const firstName2 = n2.split(' ')[0];
  if (firstName1 === firstName2 && firstName1.length > 2) return 60;
  
  return 0;
}

export function SigZapLeadLinkDialog({
  open,
  onOpenChange,
  contactPhone,
  contactName,
  onLinkLead,
  onCreateNew,
}: SigZapLeadLinkDialogProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeTab, setActiveTab] = useState("sugestoes");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset tab when opening
  useEffect(() => {
    if (open) {
      setActiveTab("sugestoes");
      setSearch("");
    }
  }, [open]);

  // Buscar todos os leads para sugestões
  const isLidPhone = contactPhone.length > 15 || !/^\+?\d{10,13}$/.test(contactPhone.replace(/\D/g, ''));
  const { data: allLeads, isLoading: loadingSuggestions } = useQuery({
    queryKey: ['sigzap-lead-suggestions', contactPhone, contactName],
    queryFn: async () => {
      const firstName = contactName.split(' ')[0];
      
      if (isLidPhone) {
        // LID contact: search only by name (phone is meaningless)
        const { data, error } = await supabase
          .from('leads')
          .select('id, nome, phone_e164, telefones_adicionais, email, especialidade, uf, status')
          .ilike('nome', `${firstName}%`)
          .limit(50);
        if (error) throw error;
        return data || [];
      }
      
      // Real phone: search by phone digits + name
      const phoneDigits = contactPhone.replace(/\D/g, '');
      const lastDigits = phoneDigits.slice(-7);
      const { data, error } = await supabase
        .from('leads')
        .select('id, nome, phone_e164, telefones_adicionais, email, especialidade, uf, status')
        .or(`phone_e164.ilike.%${lastDigits}%,nome.ilike.%${firstName}%`)
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Calcular sugestões com score
  const suggestions = useMemo(() => {
    if (!allLeads || allLeads.length === 0) return [];
    
    const scored = allLeads.map(lead => {
      const phoneSim = lead.phone_e164 
        ? calculatePhoneSimilarity(contactPhone, lead.phone_e164) 
        : 0;
      const nameSim = lead.nome 
        ? calculateNameSimilarity(contactName, lead.nome) 
        : 0;
      
      // Score ponderado: telefone tem mais peso
      const score = Math.max(phoneSim * 0.7 + nameSim * 0.3, phoneSim, nameSim);
      
      return { ...lead, score, phoneSim, nameSim };
    });
    
    // Filtrar apenas com score > 40 e ordenar
    return scored
      .filter(s => s.score >= 40)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [allLeads, contactPhone, contactName]);

  // Search leads manual
  const { data: searchResults, isLoading: loadingSearch } = useQuery({
    queryKey: ['sigzap-lead-search', debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch.trim()) return [];
      
      const searchTerm = `%${debouncedSearch.trim()}%`;
      const { data, error } = await supabase
        .from('leads')
        .select('id, nome, phone_e164, email, especialidade, status')
        .or(`nome.ilike.${searchTerm},phone_e164.ilike.${searchTerm},email.ilike.${searchTerm}`)
        .order('nome', { ascending: true })
        .limit(50);
      
      if (error) throw error;
      return data || [];
    },
    enabled: open && debouncedSearch.trim().length > 0,
  });

  const handleLinkClick = (leadId: string) => {
    onLinkLead(leadId);
    onOpenChange(false);
  };

  const handleCreateClick = () => {
    onCreateNew();
    onOpenChange(false);
  };

  const renderLeadItem = (lead: any, showScore = false) => (
    <button
      key={lead.id}
      onClick={() => handleLinkClick(lead.id)}
      className={cn(
        "w-full p-3 text-left hover:bg-muted/50 transition-colors",
        "flex items-start justify-between gap-2 border-b last:border-0"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm truncate">{lead.nome}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
          {lead.phone_e164 && (
            <span className={cn(
              "text-xs flex items-center gap-1",
              lead.phoneSim >= 80 ? "text-green-600 font-medium" : "text-muted-foreground"
            )}>
              <Phone className="h-3 w-3" />
              {lead.phone_e164}
              {lead.phoneSim >= 80 && <span className="text-[10px]">({lead.phoneSim}%)</span>}
            </span>
          )}
          {lead.email && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
              <Mail className="h-3 w-3" />
              {lead.email}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {showScore && lead.score && (
          <Badge 
            variant={lead.score >= 80 ? "default" : lead.score >= 60 ? "secondary" : "outline"}
            className="text-[10px]"
          >
            {lead.score >= 80 ? "Alta" : lead.score >= 60 ? "Média" : "Baixa"} similaridade
          </Badge>
        )}
        {lead.especialidade && (
          <Badge variant="outline" className="text-xs">
            {lead.especialidade}
          </Badge>
        )}
        <Link className="h-4 w-4 text-primary" />
      </div>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Vincular Lead
          </DialogTitle>
          <DialogDescription>
            Vincule este contato a um lead existente ou crie um novo
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Contact info */}
          <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{contactName}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Phone className="h-3 w-3" />
                {contactPhone}
              </p>
            </div>
            <Button 
              onClick={handleCreateClick}
              size="sm"
              className="gap-1.5 flex-shrink-0"
            >
              <UserPlus className="h-4 w-4" />
              Criar Novo
            </Button>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="sugestoes" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Sugestões
                {suggestions.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                    {suggestions.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="buscar" className="gap-1.5">
                <Search className="h-3.5 w-3.5" />
                Buscar
              </TabsTrigger>
            </TabsList>
            
            {/* Sugestões Tab */}
            <TabsContent value="sugestoes" className="flex-1 overflow-hidden mt-3">
              <ScrollArea className="h-[280px] border rounded-lg">
                {loadingSuggestions ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : suggestions.length > 0 ? (
                  <div>
                    <div className="px-3 py-2 bg-amber-50 border-b flex items-center gap-2 text-amber-700 text-xs sticky top-0">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Leads com telefone ou nome similares encontrados
                    </div>
                    {suggestions.map(lead => renderLeadItem(lead, true))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                    <Sparkles className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm font-medium">Nenhuma sugestão encontrada</p>
                    <p className="text-xs text-center mt-1">
                      Não há leads com telefone ou nome similar.<br/>
                      Use a busca ou crie um novo lead.
                    </p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Buscar Tab */}
            <TabsContent value="buscar" className="flex-1 overflow-hidden mt-3 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, telefone ou email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>

              <ScrollArea className="h-[230px] border rounded-lg">
                {loadingSearch ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : searchResults && searchResults.length > 0 ? (
                  <div>
                    {searchResults.map(lead => renderLeadItem(lead))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                    <Search className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">
                      {debouncedSearch ? "Nenhum lead encontrado" : "Digite para buscar leads"}
                    </p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
