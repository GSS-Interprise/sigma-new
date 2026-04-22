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
import { Briefcase } from "lucide-react";
import { SegmentoGenerico } from "./segments/SegmentoGenerico";
import { SegmentoTrafegoPago } from "./segments/SegmentoTrafegoPago";
import { EncerrarCampanhaButton } from "./EncerrarCampanhaButton";
import { Badge } from "@/components/ui/badge";
import { CampanhaLeadsList } from "./CampanhaLeadsList";
import { CascataTab } from "./CascataTab";
import { ZapTab } from "./ZapTab";
import {
  WhatsAppIcon,
  InstagramIcon,
  LinkedInIcon,
  TikTokIcon,
  GmailIcon,
  PhoneCallIcon,
  TrafegoPagoIcon,
} from "./icons/BrandIcons";
import { GitBranch } from "lucide-react";

interface Props {
  campanhaPropostaId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const STATUS_FECHADOS = ["Convertido", "Descartado", "Desinteresse", "Bloqueado"];

const ABAS: {
  value: string;
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
  descricao: string;
}[] = [
  { value: "cascata", label: "Cascata", Icon: (({ size = 20 }: { size?: number }) => <GitBranch size={size} />) as any, descricao: "Visão consolidada do caminho de cada lead pelos canais" },
  { value: "whatsapp", label: "WhatsApp", Icon: WhatsAppIcon, descricao: "Acompanhe disparo via Disparos Zap" },
  { value: "trafego_pago", label: "Tráfego Pago", Icon: TrafegoPagoIcon, descricao: "Anúncios pagos vinculados à proposta" },
  { value: "email", label: "Email", Icon: GmailIcon, descricao: "Disparo de email para a lista" },
  { value: "instagram", label: "Instagram", Icon: InstagramIcon, descricao: "Registro de interações via Instagram" },
  { value: "ligacao", label: "Ligação", Icon: PhoneCallIcon, descricao: "Follow-up por telefone" },
  { value: "linkedin", label: "LinkedIn", Icon: LinkedInIcon, descricao: "Prospecção e mensagens via LinkedIn" },
  { value: "tiktok", label: "TikTok", Icon: TikTokIcon, descricao: "Engajamento e prospecção via TikTok" },
];

const GRUPOS: { fase: string | null; abas: string[] }[] = [
  { fase: null, abas: ["cascata"] },
  { fase: "FASE 1", abas: ["whatsapp", "trafego_pago"] },
  { fase: "FASE 2", abas: ["email", "instagram", "ligacao", "linkedin", "tiktok"] },
];

const TRIGGER_CLASS =
  "flex flex-col gap-1 py-2 px-2 min-w-[88px] rounded-md transition-all " +
  "text-muted-foreground hover:text-foreground hover:bg-muted/40 " +
  "data-[state=active]:bg-primary/10 data-[state=active]:text-foreground " +
  "data-[state=active]:ring-2 data-[state=active]:ring-primary data-[state=active]:shadow-sm";

export function CampanhaPropostaModal({ campanhaPropostaId, open, onOpenChange }: Props) {
  const { data: cp } = useQuery({
    queryKey: ["campanha-proposta-detail", campanhaPropostaId],
    enabled: !!campanhaPropostaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campanha_propostas")
        .select(
          "*, proposta:proposta_id(id, id_proposta, descricao), lista:lista_id(id, nome, total_estimado), campanha:campanha_id(id, nome)"
        )
        .eq("id", campanhaPropostaId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

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

  const propostaLabel =
    (cp?.proposta as any)?.id_proposta ||
    (cp?.proposta as any)?.descricao ||
    "Proposta";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[92vw] h-[92vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="pb-2 border-b p-6 pt-6 shrink-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Dossiê de Campanha
                </div>
                <DialogTitle className="text-xl truncate">{propostaLabel}</DialogTitle>
                <DialogDescription className="flex items-center gap-2 mt-1 flex-wrap">
                  {(cp?.campanha as any)?.nome && (
                    <span className="text-xs">📣 {(cp?.campanha as any).nome}</span>
                  )}
                  <span className="text-xs">📋 {(cp?.lista as any)?.nome || "Sem lista"}</span>
                  {cp?.status && (
                    <Badge variant={cp.status === "encerrada" ? "destructive" : "default"}>
                      {cp.status}
                    </Badge>
                  )}
                  {leadStats && (
                    <Badge variant="outline" className="text-[10px]">
                      {leadStats.fechados}/{leadStats.total} leads fechados
                    </Badge>
                  )}
                </DialogDescription>
              </div>
            </div>
            {cp?.status === "ativa" && (
              <EncerrarCampanhaButton
                campanhaPropostaId={campanhaPropostaId}
                todosLeadsFechados={todosFechados}
              />
            )}
          </div>
        </DialogHeader>

        <Tabs defaultValue="cascata" className="flex-1 flex flex-col min-h-0 px-6 pb-6">
          <TabsList className="bg-transparent p-0 h-auto w-full mt-4 shrink-0 flex flex-wrap gap-3 items-stretch justify-start">
            {GRUPOS.map((grupo, idx) => {
              const triggers = grupo.abas
                .map((v) => ABAS.find((a) => a.value === v)!)
                .filter(Boolean);

              if (!grupo.fase) {
                return (
                  <div
                    key={idx}
                    className="border border-border rounded-md p-2 flex gap-1 bg-background"
                  >
                    {triggers.map(({ value, label, Icon }) => (
                      <TabsTrigger key={value} value={value} className={TRIGGER_CLASS}>
                        <Icon size={20} />
                        <span className="text-[11px] font-medium">{label}</span>
                      </TabsTrigger>
                    ))}
                  </div>
                );
              }

              return (
                <div key={idx} className="flex flex-col rounded-md overflow-hidden border-2 border-primary">
                  <div className="bg-primary text-primary-foreground text-xs font-bold tracking-wider px-4 py-1 text-center">
                    {grupo.fase}
                  </div>
                  <div className="p-2 flex gap-1 bg-background flex-1">
                    {triggers.map(({ value, label, Icon }) => (
                      <TabsTrigger key={value} value={value} className={TRIGGER_CLASS}>
                        <Icon size={20} />
                        <span className="text-[11px] font-medium">{label}</span>
                      </TabsTrigger>
                    ))}
                  </div>
                </div>
              );
            })}
          </TabsList>

          {ABAS.map(({ value, label, Icon, descricao }) => (
            <TabsContent key={value} value={value} className="mt-4 space-y-4 flex-1 min-h-0 overflow-y-auto">
              <div className="flex items-center gap-3 px-1">
                <Icon size={28} />
                <div>
                  <h3 className="font-semibold leading-tight">{label}</h3>
                  <p className="text-xs text-muted-foreground">{descricao}</p>
                </div>
              </div>

              {value === "cascata" ? (
                <CascataTab
                  campanhaPropostaId={campanhaPropostaId}
                  listaId={cp?.lista_id}
                />
              ) : value === "whatsapp" ? (
                <ZapTab campanhaPropostaId={campanhaPropostaId} />
              ) : (
                <>
              {value === "trafego_pago" && (
                <SegmentoTrafegoPago campanhaPropostaId={campanhaPropostaId} />
              )}

              <CampanhaLeadsList
                listaId={cp?.lista_id}
                listaNome={(cp?.lista as any)?.nome}
                    campanhaPropostaId={campanhaPropostaId}
                    canal={value as any}
              />
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
