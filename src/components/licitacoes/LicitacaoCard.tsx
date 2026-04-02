import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, ExternalLink, Calendar, DollarSign, MapPin, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface LicitacaoCardProps {
  licitacao: any;
  onEdit?: (licitacao: any) => void;
}

const TAG_COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-600",
  teal: "bg-teal-600",
  green: "bg-green-600",
  yellow: "bg-yellow-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  pink: "bg-pink-500",
  purple: "bg-purple-600",
  gray: "bg-gray-500",
  stone: "bg-stone-400",
  black: "bg-black",
};

export function LicitacaoCard({ licitacao, onEdit }: LicitacaoCardProps) {
  const diasAteDisputa = licitacao.data_disputa
    ? Math.ceil((new Date(licitacao.data_disputa).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const isUrgente = diasAteDisputa !== null && diasAteDisputa <= 10 && diasAteDisputa >= 0;

  // Buscar configuração de cores das etiquetas
  const { data: tagsConfig = [] } = useQuery({
    queryKey: ["licitacoes-etiquetas-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licitacoes_etiquetas_config")
        .select("nome, cor_id")
        .order("nome");
      if (error) throw error;
      return (data || []).map((t: any) => ({
        name: t?.nome,
        colorId: t?.cor_id,
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 minutos de cache
  });

  const normalizeTagKey = (v: unknown) =>
    String(v ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

  const getTagColor = (tagName: string) => {
    const key = normalizeTagKey(tagName);
    const tag = tagsConfig.find((t: any) => normalizeTagKey(t?.name) === key);
    const colorId = tag?.colorId || "gray";
    return TAG_COLOR_MAP[colorId] || "bg-gray-500";
  };

  const handleOpenPdf = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { data: files, error } = await supabase.storage
        .from("editais-pdfs")
        .list(licitacao.id);

      if (error) throw error;

      if (!files || files.length === 0) {
        toast.info("Nenhum PDF anexado a esta licitação");
        return;
      }

      const { data: urlData } = await supabase.storage
        .from("editais-pdfs")
        .createSignedUrl(`${licitacao.id}/${files[0].name}`, 3600);

      if (urlData?.signedUrl) {
        window.open(urlData.signedUrl, "_blank");
      }
    } catch (error) {
      console.error("Erro ao abrir PDF:", error);
      toast.error("Erro ao abrir PDF");
    }
  };

  const handleOpenEffect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (licitacao.effect_id) {
      // Substituir pela URL real do Effect
      window.open(`https://effect.com/licitacao/${licitacao.effect_id}`, "_blank");
    }
  };

  const handleClick = () => {
    if (onEdit) {
      onEdit(licitacao);
    }
  };

  return (
    <Card 
      className={`${isUrgente ? "border-destructive" : ""} cursor-pointer transition-shadow hover:shadow-md`}
      onClick={handleClick}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{licitacao.titulo || licitacao.numero_edital}</CardTitle>
            {isUrgente && (
              <Badge variant="destructive" className="mt-2">
                <AlertTriangle className="mr-1 h-3 w-3" />
                Urgente - {diasAteDisputa} dias
              </Badge>
            )}
          </div>
          {licitacao.fonte === "Effect" && (
            <Badge variant="secondary" className="ml-2">
              Effect
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* Etiquetas no topo com cores */}
        {licitacao.etiquetas && licitacao.etiquetas.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {licitacao.etiquetas.map((tag: string, idx: number) => (
              <span 
                key={idx} 
                className={cn(
                  "px-2 py-0.5 rounded text-xs font-medium text-white",
                  getTagColor(tag)
                )}
              >
                {tag.toUpperCase()}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {licitacao.modalidade && (
            <Badge variant="outline">{licitacao.modalidade}</Badge>
          )}
          {licitacao.municipio_uf && (
            <Badge variant="outline">
              <MapPin className="mr-1 h-3 w-3" />
              {licitacao.municipio_uf}
            </Badge>
          )}
        </div>

        {licitacao.orgao && (
          <p className="text-sm text-muted-foreground">{licitacao.orgao}</p>
        )}

        <div className="flex items-center gap-4 text-sm">
          {licitacao.valor_estimado && (
            <div className="flex items-center gap-1">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span>
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(licitacao.valor_estimado)}
              </span>
            </div>
          )}
          
          {licitacao.data_disputa && (
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>
                {format(new Date(licitacao.data_disputa), "dd/MM/yyyy HH:mm", { locale: ptBR })}
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={handleOpenPdf}>
            <FileText className="mr-1 h-4 w-4" />
            Abrir PDF
          </Button>
          
          {licitacao.effect_id && (
            <Button size="sm" variant="outline" onClick={handleOpenEffect}>
              <ExternalLink className="mr-1 h-4 w-4" />
              Ir ao Effect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
