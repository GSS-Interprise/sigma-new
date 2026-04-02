import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Calendar, 
  DollarSign, 
  MapPin, 
  User, 
  FileText, 
  Building2,
  Tag,
  GripVertical,
  Settings2
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { TIPO_MODALIDADE_OPTIONS, getSubtiposForTipo } from "@/lib/modalidadeConfig";

export interface FieldConfig {
  id: string;
  label: string;
  icon: string;
  labelWidth: string;
}

export const DEFAULT_FIELDS_ORDER: FieldConfig[] = [
  { id: "numero_edital", label: "Nº Edital", icon: "FileText", labelWidth: "w-16" },
  { id: "orgao", label: "Órgão", icon: "Building2", labelWidth: "w-12" },
  { id: "cnpj_orgao", label: "CNPJ", icon: "Building2", labelWidth: "w-12" },
  { id: "tipo_licitacao", label: "Tipo", icon: "Tag", labelWidth: "w-10" },
  { id: "tipo_modalidade", label: "Tipo Mod.", icon: "Tag", labelWidth: "w-16" },
  { id: "subtipo_modalidade", label: "Subtipo Mod.", icon: "Tag", labelWidth: "w-20" },
  { id: "data_disputa", label: "Data Disputa", icon: "Calendar", labelWidth: "w-20" },
  { id: "valor_estimado", label: "Valor Est.", icon: "DollarSign", labelWidth: "w-16" },
  { id: "municipio_uf", label: "Município/UF", icon: "MapPin", labelWidth: "w-20" },
  { id: "responsavel_id", label: "Responsável", icon: "User", labelWidth: "w-20" },
  { id: "prioridade", label: "Prioridade", icon: "Tag", labelWidth: "w-18" },
];

const STORAGE_KEY = "licitacoes_fields_order_v3";

export function getFieldsOrder(): FieldConfig[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.every(f => f.id && f.label)) {
        // Merge any new fields from DEFAULT that are missing in stored layout
        const storedIds = new Set(parsed.map((f: FieldConfig) => f.id));
        const missingFields = DEFAULT_FIELDS_ORDER.filter(f => !storedIds.has(f.id));
        // Remove fields that no longer exist in defaults (e.g. old "modalidade")
        const validIds = new Set(DEFAULT_FIELDS_ORDER.map(f => f.id));
        const filtered = parsed.filter((f: FieldConfig) => validIds.has(f.id));
        return [...filtered, ...missingFields];
      }
    }
  } catch (e) {
    console.error("Error loading fields order:", e);
  }
  return DEFAULT_FIELDS_ORDER;
}

export function saveFieldsOrder(order: FieldConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
}

const IconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText,
  Building2,
  MapPin,
  Tag,
  DollarSign,
  Calendar,
  User,
};

interface LicitacaoFieldProps {
  field: FieldConfig;
  editando: boolean;
  formData: any;
  setFormData: (data: any) => void;
  licitacao: any;
  profiles: any[];
  layoutMode: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  canEditTipoLicitacao?: boolean;
}

export function LicitacaoField({
  field,
  editando,
  formData,
  setFormData,
  licitacao,
  profiles,
  layoutMode,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  canEditTipoLicitacao = false,
}: LicitacaoFieldProps) {
  const Icon = IconMap[field.icon] || FileText;

  const renderFieldContent = () => {
    switch (field.id) {
      case "numero_edital":
        return editando ? (
          <Input
            value={formData.numero_edital}
            onChange={(e) => setFormData({ ...formData, numero_edital: e.target.value })}
            className="h-6 text-xs border-transparent bg-transparent hover:border-border hover:bg-muted/50 focus:border-primary focus:bg-background transition-colors flex-1"
            placeholder="—"
          />
        ) : (
          <span className="text-xs font-medium">{licitacao.numero_edital || "—"}</span>
        );

      case "orgao":
        return editando ? (
          <Input
            value={formData.orgao}
            onChange={(e) => setFormData({ ...formData, orgao: e.target.value })}
            className="h-6 text-xs border-transparent bg-transparent hover:border-border hover:bg-muted/50 focus:border-primary focus:bg-background transition-colors flex-1"
            placeholder="—"
          />
        ) : (
          <span className="text-xs font-medium">{licitacao.orgao || "—"}</span>
        );

      case "cnpj_orgao":
        return editando ? (
          <Input
            value={formData.cnpj_orgao || ''}
            onChange={(e) => setFormData({ ...formData, cnpj_orgao: e.target.value })}
            className="h-6 text-xs border-transparent bg-transparent hover:border-border hover:bg-muted/50 focus:border-primary focus:bg-background transition-colors flex-1"
            placeholder="00.000.000/0000-00"
          />
        ) : (
          <span className="text-xs font-medium">{licitacao.cnpj_orgao || "—"}</span>
        );

      case "municipio_uf":
        return editando ? (
          <Input
            value={formData.municipio_uf}
            onChange={(e) => setFormData({ ...formData, municipio_uf: e.target.value })}
            className="h-6 text-xs border-transparent bg-transparent hover:border-border hover:bg-muted/50 focus:border-primary focus:bg-background transition-colors flex-1"
            placeholder="—"
          />
        ) : (
          <span className="text-xs font-medium">{licitacao.municipio_uf || "—"}</span>
        );

      case "tipo_modalidade":
        return editando ? (
          <Select 
            value={formData.tipo_modalidade || ''} 
            onValueChange={(value) => setFormData({ ...formData, tipo_modalidade: value, subtipo_modalidade: '' })}
          >
            <SelectTrigger className="h-6 text-xs border-transparent bg-transparent hover:border-border hover:bg-muted/50 focus:border-primary transition-colors flex-1">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent className="z-50">
              {TIPO_MODALIDADE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs font-medium">{licitacao.tipo_modalidade || "—"}</span>
        );

      case "subtipo_modalidade": {
        const subtipos = getSubtiposForTipo(formData.tipo_modalidade || licitacao?.tipo_modalidade);
        return editando ? (
          <Select 
            value={formData.subtipo_modalidade || ''} 
            onValueChange={(value) => setFormData({ ...formData, subtipo_modalidade: value })}
          >
            <SelectTrigger className="h-6 text-xs border-transparent bg-transparent hover:border-border hover:bg-muted/50 focus:border-primary transition-colors flex-1">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent className="z-50">
              {subtipos.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs font-medium">{licitacao.subtipo_modalidade || "—"}</span>
        );
      }

      case "tipo_licitacao":
        const tipoValue = formData.tipo_licitacao || licitacao?.tipo_licitacao || 'GSS';
        return editando && canEditTipoLicitacao ? (
          <Select 
            value={formData.tipo_licitacao || 'GSS'} 
            onValueChange={(value) => setFormData({ ...formData, tipo_licitacao: value })}
          >
            <SelectTrigger className="h-6 text-xs border-transparent bg-transparent hover:border-border hover:bg-muted/50 focus:border-primary transition-colors flex-1">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent className="z-50">
              <SelectItem value="GSS" className="text-xs">GSS</SelectItem>
              <SelectItem value="AGES" className="text-xs">AGES</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <span className={cn(
            "text-xs font-medium px-1.5 py-0.5 rounded",
            tipoValue === 'AGES' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
          )}>
            {tipoValue}
          </span>
        );

      case "valor_estimado":
        // Formata valor numérico (em reais) para exibição brasileira
        const formatCurrencyDisplay = (value: number) => {
          return new Intl.NumberFormat('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(value);
        };
        
        // Valor atual do formData (já em reais, não centavos)
        const currentValue = typeof formData.valor_estimado === 'number' 
          ? formData.valor_estimado 
          : parseFloat(formData.valor_estimado) || 0;
        
        const displayValue = currentValue > 0 ? formatCurrencyDisplay(currentValue) : '';
        
        return editando ? (
          <Input
            type="text"
            inputMode="numeric"
            value={displayValue}
            onChange={(e) => {
              // Remove tudo exceto números
              const rawValue = e.target.value.replace(/\D/g, '');
              // Trata como centavos durante a digitação
              const numericValue = parseInt(rawValue, 10) / 100;
              setFormData({ ...formData, valor_estimado: numericValue || 0 });
            }}
            className="h-6 text-xs border-transparent bg-transparent hover:border-border hover:bg-muted/50 focus:border-primary focus:bg-background transition-colors flex-1"
            placeholder="0,00"
          />
        ) : (
          <span className="text-xs font-medium">
            {licitacao?.valor_estimado 
              ? new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(licitacao.valor_estimado)
              : "—"}
          </span>
        );

      case "data_disputa":
        return editando ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="ghost" 
                className="h-6 px-1.5 text-xs font-normal justify-start border border-transparent hover:border-border hover:bg-muted/50 transition-colors flex-1 min-w-0"
              >
                {formData.data_disputa 
                  ? format(formData.data_disputa, "dd/MM/yy HH:mm", { locale: ptBR }) 
                  : "—"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-50" align="start">
              <div className="p-3 space-y-3">
                <CalendarComponent
                  mode="single"
                  selected={formData.data_disputa}
                  onSelect={(date) => {
                    if (date) {
                      const currentDate = formData.data_disputa || new Date();
                      date.setHours(currentDate.getHours(), currentDate.getMinutes());
                    }
                    setFormData({ ...formData, data_disputa: date });
                  }}
                  initialFocus
                  className="pointer-events-auto p-0"
                />
                <div className="flex items-center gap-2 border-t pt-3">
                  <span className="text-xs text-muted-foreground">Hora:</span>
                  <Input
                    type="time"
                    className="h-8 w-full text-sm"
                    value={formData.data_disputa ? format(formData.data_disputa, "HH:mm") : "09:00"}
                    onChange={(e) => {
                      const [hours, minutes] = e.target.value.split(':').map(Number);
                      const newDate = formData.data_disputa ? new Date(formData.data_disputa) : new Date();
                      newDate.setHours(hours || 0, minutes || 0);
                      setFormData({ ...formData, data_disputa: newDate });
                    }}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <span className="text-xs font-medium truncate">
            {licitacao.data_disputa
              ? format(new Date(licitacao.data_disputa), "dd/MM/yy HH:mm", { locale: ptBR })
              : "—"}
          </span>
        );

      case "responsavel_id":
        return editando ? (
          <Select 
            value={formData.responsavel_id} 
            onValueChange={(value) => setFormData({ ...formData, responsavel_id: value })}
          >
            <SelectTrigger className="h-6 text-xs border-transparent bg-transparent hover:border-border hover:bg-muted/50 focus:border-primary transition-colors flex-1">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent className="z-50">
              {profiles?.map((profile) => (
                <SelectItem key={profile.id} value={profile.id} className="text-xs">
                  {profile.nome_completo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs font-medium">
            {profiles?.find(p => p.id === licitacao.responsavel_id)?.nome_completo || "—"}
          </span>
        );

      case "prioridade":
        const prioridadeValue = formData.prioridade || licitacao?.prioridade || '';
        const prioridadeColors: Record<string, string> = {
          'leve': 'bg-green-100 text-green-800',
          'media': 'bg-yellow-100 text-yellow-800',
          'alta': 'bg-red-100 text-red-800',
        };
        const prioridadeLabels: Record<string, string> = {
          'leve': 'Leve',
          'media': 'Média',
          'alta': 'Alta',
        };
        return editando ? (
          <Select 
            value={formData.prioridade || ''} 
            onValueChange={(value) => setFormData({ ...formData, prioridade: value })}
          >
            <SelectTrigger className="h-6 text-xs border-transparent bg-transparent hover:border-border hover:bg-muted/50 focus:border-primary transition-colors flex-1">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent className="z-50">
              <SelectItem value="leve" className="text-xs">Leve</SelectItem>
              <SelectItem value="media" className="text-xs">Média</SelectItem>
              <SelectItem value="alta" className="text-xs">Alta</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          prioridadeValue ? (
            <span className={cn(
              "text-xs font-medium px-1.5 py-0.5 rounded",
              prioridadeColors[prioridadeValue] || 'bg-muted text-muted-foreground'
            )}>
              {prioridadeLabels[prioridadeValue] || prioridadeValue}
            </span>
          ) : (
            <span className="text-xs font-medium">—</span>
          )
        );

      default:
        return <span className="text-xs font-medium">—</span>;
    }
  };

  return (
    <div 
      className={cn(
        "flex items-center gap-1 py-0.5 group",
        layoutMode && "bg-muted/30 rounded px-1.5 border border-dashed border-muted-foreground/30"
      )}
    >
      {layoutMode && (
        <div className="flex flex-col gap-0.5">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-0.5 hover:bg-accent rounded disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 15l-6-6-6 6"/>
            </svg>
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="p-0.5 hover:bg-accent rounded disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
        </div>
      )}
      {layoutMode && <GripVertical className="h-3 w-3 text-muted-foreground cursor-grab" />}
      <Icon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
      <span className={cn("text-xs text-muted-foreground flex-shrink-0", field.labelWidth)}>{field.label}</span>
      {renderFieldContent()}
    </div>
  );
}

interface LayoutModeToggleProps {
  isAdmin: boolean;
  layoutMode: boolean;
  onToggle: () => void;
}

export function LayoutModeToggle({ isAdmin, layoutMode, onToggle }: LayoutModeToggleProps) {
  if (!isAdmin) return null;

  return (
    <Button
      variant={layoutMode ? "secondary" : "ghost"}
      size="sm"
      onClick={onToggle}
      className="h-7 text-xs"
    >
      <Settings2 className="h-3.5 w-3.5 mr-1" />
      {layoutMode ? "Concluir" : "Reorganizar"}
    </Button>
  );
}
