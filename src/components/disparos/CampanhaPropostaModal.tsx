import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  MessageCircle,
  Megaphone,
  Mail,
  Instagram,
  Phone,
  Linkedin,
  Music,
} from "lucide-react";
import { SegmentoGenerico } from "./segments/SegmentoGenerico";
import { SegmentoTrafegoPago } from "./segments/SegmentoTrafegoPago";
import { EncerrarCampanhaButton } from "./EncerrarCampanhaButton";
import { Badge } from "@/components/ui/badge";

interface Props {
  campanhaPropostaId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const STATUS_FECHADOS = ["Convertido", "Descartado", "Desinteresse", "Bloqueado"];

export function CampanhaPropostaModal({ campanhaPropostaId, open, onOpenChange }: Props) {
  const { data: cp } = useQuery({
    queryKey: ["campanha-proposta-detail", campanhaPropostaId],
    enabled: !!campanhaPropostaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campanha_propostas")
        .select(
          "*, proposta:proposta_id(id, id_proposta, descricao), lista:lista_id(id, nome, modo, total_estimado)"
        )
        .eq("id", campanhaPropostaId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Verifica se todos os leads da lista vinculada estão em status fechado
  const { data: leadStats } = useQuery({
    queryKey: ["campanha-proposta-leads-stats", cp?.lista_id],
    enabled: !!cp?.lista_id,
    queryFn: async () => {
      const { data: itens } = await supabase
        .from("disparo_lista_itens")
        .select("leads:lead_id(status)")
        .eq("lista_id", cp!.lista_id!);
      const todos = (itens || []).map((i: any) => i.leads).filter(Boolean);
      const fechados = todos.filter((l: any) => STATUS_FECHADOS.includes(l.status));
      return { total: todos.length, fechados: fechados.length };
    },
  });

  const todosFechados =
    !!leadStats && leadStats.total > 0 && leadStats.fechados === leadStats.total;

  if (!campanhaPropostaId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <DialogTitle>
                {(cp?.proposta as any)?.id_proposta ||
                  (cp?.proposta as any)?.descricao ||
                  "Proposta"}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1">
                Lista: {(cp?.lista as any)?.nome || "—"}
                {cp?.status && (
                  <Badge variant={cp.status === "encerrada" ? "destructive" : "default"}>
                    {cp.status}
                  </Badge>
                )}
                {leadStats && (
                  <Badge variant="outline">
                    {leadStats.fechados}/{leadStats.total} leads fechados
                  </Badge>
                )}
              </DialogDescription>
            </div>
            {cp?.status === "ativa" && (
              <EncerrarCampanhaButton
                campanhaPropostaId={campanhaPropostaId}
                todosLeadsFechados={todosFechados}
              />
            )}
          </div>
        </DialogHeader>

        <Tabs defaultValue="whatsapp" className="mt-4">
          <TabsList className="grid grid-cols-7 w-full">
            <TabsTrigger value="whatsapp">
              <MessageCircle className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="trafego_pago">
              <Megaphone className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="email">
              <Mail className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="instagram">
              <Instagram className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="ligacao">
              <Phone className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="linkedin">
              <Linkedin className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="tiktok">
              <Music className="h-4 w-4" />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="whatsapp" className="mt-4">
            <SegmentoGenerico
              campanhaPropostaId={campanhaPropostaId}
              canal="whatsapp"
              titulo="WhatsApp"
              descricao="Acompanhe disparo via Disparos Zap"
            />
          </TabsContent>
          <TabsContent value="trafego_pago" className="mt-4">
            <SegmentoTrafegoPago campanhaPropostaId={campanhaPropostaId} />
          </TabsContent>
          <TabsContent value="email" className="mt-4">
            <SegmentoGenerico
              campanhaPropostaId={campanhaPropostaId}
              canal="email"
              titulo="Email"
              descricao="Disparo de email para a lista"
            />
          </TabsContent>
          <TabsContent value="instagram" className="mt-4">
            <SegmentoGenerico
              campanhaPropostaId={campanhaPropostaId}
              canal="instagram"
              titulo="Instagram"
              descricao="Registro de interações via Instagram"
            />
          </TabsContent>
          <TabsContent value="ligacao" className="mt-4">
            <SegmentoGenerico
              campanhaPropostaId={campanhaPropostaId}
              canal="ligacao"
              titulo="Ligação"
              descricao="Follow-up por telefone"
            />
          </TabsContent>
          <TabsContent value="linkedin" className="mt-4">
            <SegmentoGenerico
              campanhaPropostaId={campanhaPropostaId}
              canal="linkedin"
              titulo="LinkedIn"
              descricao="Prospecção e mensagens via LinkedIn"
            />
          </TabsContent>
          <TabsContent value="tiktok" className="mt-4">
            <SegmentoGenerico
              campanhaPropostaId={campanhaPropostaId}
              canal="tiktok"
              titulo="TikTok"
              descricao="Engajamento e prospecção via TikTok"
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
