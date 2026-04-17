import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  WhatsAppIcon,
  GmailIcon,
  InstagramIcon,
  LinkedInIcon,
  TikTokIcon,
} from "./icons/BrandIcons";

export type CanalKey = "whatsapp" | "email" | "instagram" | "linkedin" | "tiktok";

export interface MensagensCanaisValues {
  whatsapp: string;
  email: string;
  instagram: string;
  linkedin: string;
  tiktok: string;
}

interface MensagensCanaisTabsProps {
  values: MensagensCanaisValues;
  onChange: (canal: CanalKey, valor: string) => void;
  readOnly?: boolean;
  rows?: number;
}

const CANAIS: { key: CanalKey; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "whatsapp", label: "WhatsApp", Icon: WhatsAppIcon },
  { key: "email", label: "E-mail", Icon: GmailIcon },
  { key: "instagram", label: "Instagram", Icon: InstagramIcon },
  { key: "linkedin", label: "LinkedIn", Icon: LinkedInIcon },
  { key: "tiktok", label: "TikTok", Icon: TikTokIcon },
];

export function MensagensCanaisTabs({
  values,
  onChange,
  readOnly = false,
  rows = 5,
}: MensagensCanaisTabsProps) {
  return (
    <div className="space-y-2">
      {readOnly && (
        <p className="text-xs text-muted-foreground italic">
          Somente administradores podem editar as mensagens.
        </p>
      )}
      <Tabs defaultValue="whatsapp" className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-auto">
          {CANAIS.map(({ key, label, Icon }) => (
            <TabsTrigger key={key} value={key} className="flex items-center gap-1.5 py-2">
              <Icon size={16} />
              <span className="hidden sm:inline text-xs">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {CANAIS.map(({ key, label }) => (
          <TabsContent key={key} value={key} className="mt-3">
            <Textarea
              placeholder={
                readOnly
                  ? `Sem mensagem cadastrada para ${label}.`
                  : `Mensagem para ${label} (opcional)...`
              }
              value={values[key] ?? ""}
              onChange={(e) => onChange(key, e.target.value)}
              rows={rows}
              disabled={readOnly}
              className={readOnly ? "bg-muted/30" : ""}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
