import { useState, useRef, useCallback } from "react";
import { GripVertical, Move, Maximize2, Settings2, RotateCcw, Plus, Trash2, Type, Hash, Calendar, List, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type FieldType = "text" | "number" | "currency" | "date" | "select" | "textarea";

export interface CustomFieldConfig {
  id: string;
  label: string;
  type: FieldType;
  options?: string[]; // Para campos select
  placeholder?: string;
  required?: boolean;
}

export interface LayoutItemConfig {
  id: string;
  section: "header" | "campos" | "main";
  order: number;
  width?: string;
  height?: string;
  marginTop?: number;
  marginBottom?: number;
  padding?: number;
  isCustom?: boolean;
  customConfig?: CustomFieldConfig;
}

export interface LayoutConfig {
  items: LayoutItemConfig[];
  sectionSettings: {
    campos: {
      columns: number;
      gap: number;
      minHeight?: number;
    };
    main: {
      gap: number;
      minHeight?: number;
    };
    header: {
      minHeight?: number;
    };
  };
  customFields: CustomFieldConfig[];
}

const STORAGE_KEY = "licitacoes_layout_config_v2";

export const DEFAULT_LAYOUT: LayoutConfig = {
  items: [
    { id: "titulo", section: "header", order: 0 },
    { id: "etiquetas", section: "header", order: 1 },
    { id: "status", section: "header", order: 2 },
    { id: "numero_edital", section: "campos", order: 0, width: "33%" },
    { id: "orgao", section: "campos", order: 1, width: "33%" },
    { id: "cnpj_orgao", section: "campos", order: 2, width: "33%" },
    { id: "tipo_licitacao", section: "campos", order: 3, width: "33%" },
    { id: "municipio_uf", section: "campos", order: 3, width: "33%" },
    { id: "tipo_modalidade", section: "campos", order: 4, width: "33%" },
    { id: "subtipo_modalidade", section: "campos", order: 5, width: "33%" },
    { id: "valor_estimado", section: "campos", order: 5, width: "33%" },
    { id: "data_disputa", section: "campos", order: 6, width: "33%" },
    { id: "responsavel_id", section: "campos", order: 7, width: "33%" },
    { id: "prioridade", section: "campos", order: 8, width: "33%" },
    { id: "objeto", section: "main", order: 0, height: "120px" },
    { id: "observacoes", section: "main", order: 1, height: "80px" },
  ],
  sectionSettings: {
    campos: { columns: 3, gap: 16, minHeight: 120 },
    main: { gap: 16, minHeight: 200 },
    header: { minHeight: 60 },
  },
  customFields: [],
};

function ensureRequiredLayoutItems(config: LayoutConfig): LayoutConfig {
  const required: LayoutItemConfig[] = [
    { id: "tipo_licitacao", section: "campos", order: 3, width: "33%" },
    { id: "tipo_modalidade", section: "campos", order: 5, width: "33%" },
    { id: "subtipo_modalidade", section: "campos", order: 6, width: "33%" },
    { id: "prioridade", section: "campos", order: 9, width: "33%" },
    { id: "cnpj_orgao", section: "campos", order: 2, width: "33%" },
  ];

  // Deduplicate: remove extra occurrences of the same id (keep first)
  const seenIds = new Set<string>();
  config.items = (config.items || []).filter(i => {
    if (seenIds.has(i.id)) return false;
    seenIds.add(i.id);
    return true;
  });

  // Remove old "modalidade" field if present
  config.items = (config.items || []).filter(i => i.id !== "modalidade");

  let items = [...(config.items || [])];
  const existing = new Set(items.map((i) => i.id));

  for (const req of required) {
    if (existing.has(req.id)) continue;

    // Shift orders forward for items in the same section at/after the insertion point
    items = items.map((i) =>
      i.section === req.section && (i.order ?? 0) >= req.order
        ? { ...i, order: (i.order ?? 0) + 1 }
        : i
    );
    items.push(req);
    existing.add(req.id);
  }

  return { ...config, items };
}

export function getLayoutConfig(): LayoutConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Garantir que customFields existe
      if (!parsed.customFields) parsed.customFields = [];
      if (!parsed.sectionSettings?.header) parsed.sectionSettings = { ...parsed.sectionSettings, header: { minHeight: 60 } };
      if (!parsed.sectionSettings?.campos?.minHeight) parsed.sectionSettings.campos = { ...parsed.sectionSettings.campos, minHeight: 100 };
      if (!parsed.sectionSettings?.main?.minHeight) parsed.sectionSettings.main = { ...parsed.sectionSettings.main, minHeight: 200 };

      return ensureRequiredLayoutItems(parsed as LayoutConfig);
    }
  } catch (e) {
    console.error("Error loading layout:", e);
  }
  return DEFAULT_LAYOUT;
}

export function saveLayoutConfig(config: LayoutConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

const FIELD_TYPE_LABELS: Record<FieldType, { label: string; icon: typeof Type }> = {
  text: { label: "Texto", icon: Type },
  number: { label: "Número", icon: Hash },
  currency: { label: "Moeda", icon: Hash },
  date: { label: "Data", icon: Calendar },
  select: { label: "Seleção", icon: List },
  textarea: { label: "Texto Longo", icon: FileText },
};

interface AddCustomFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (field: CustomFieldConfig) => void;
  existingIds: string[];
}

function AddCustomFieldDialog({ open, onOpenChange, onAdd, existingIds }: AddCustomFieldDialogProps) {
  const [fieldId, setFieldId] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [fieldOptions, setFieldOptions] = useState("");
  const [fieldPlaceholder, setFieldPlaceholder] = useState("");

  const handleAdd = () => {
    const id = fieldId.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    
    if (!id || !fieldLabel.trim()) {
      toast.error("ID e Label são obrigatórios");
      return;
    }
    
    if (existingIds.includes(id)) {
      toast.error("Já existe um campo com este ID");
      return;
    }

    const newField: CustomFieldConfig = {
      id: `custom_${id}`,
      label: fieldLabel.trim(),
      type: fieldType,
      placeholder: fieldPlaceholder || undefined,
      options: fieldType === "select" ? fieldOptions.split(",").map(o => o.trim()).filter(Boolean) : undefined,
    };

    onAdd(newField);
    
    // Reset form
    setFieldId("");
    setFieldLabel("");
    setFieldType("text");
    setFieldOptions("");
    setFieldPlaceholder("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Campo Customizado</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>ID do Campo</Label>
            <Input
              value={fieldId}
              onChange={(e) => setFieldId(e.target.value)}
              placeholder="ex: prazo_entrega"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">Identificador único (sem espaços ou caracteres especiais)</p>
          </div>
          
          <div className="space-y-2">
            <Label>Label</Label>
            <Input
              value={fieldLabel}
              onChange={(e) => setFieldLabel(e.target.value)}
              placeholder="ex: Prazo de Entrega"
            />
          </div>
          
          <div className="space-y-2">
            <Label>Tipo do Campo</Label>
            <Select value={fieldType} onValueChange={(v) => setFieldType(v as FieldType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FIELD_TYPE_LABELS).map(([type, { label, icon: Icon }]) => (
                  <SelectItem key={type} value={type}>
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {fieldType === "select" && (
            <div className="space-y-2">
              <Label>Opções (separadas por vírgula)</Label>
              <Input
                value={fieldOptions}
                onChange={(e) => setFieldOptions(e.target.value)}
                placeholder="Opção 1, Opção 2, Opção 3"
              />
            </div>
          )}
          
          <div className="space-y-2">
            <Label>Placeholder (opcional)</Label>
            <Input
              value={fieldPlaceholder}
              onChange={(e) => setFieldPlaceholder(e.target.value)}
              placeholder="Texto de ajuda..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleAdd}>Adicionar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DraggableItemProps {
  id: string;
  children: React.ReactNode;
  layoutMode: boolean;
  config: LayoutItemConfig;
  onConfigChange: (id: string, changes: Partial<LayoutItemConfig>) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onRemoveCustomField?: (id: string) => void;
}

export function DraggableItem({
  id,
  children,
  layoutMode,
  config,
  onConfigChange,
  onDragStart,
  onDragEnd,
  onRemoveCustomField,
}: DraggableItemProps) {
  const [isResizing, setIsResizing] = useState(false);

  if (!layoutMode) {
    return <>{children}</>;
  }

  const widthOptions = ["25%", "33%", "50%", "66%", "75%", "100%"];
  const heightOptions = ["40px", "60px", "80px", "100px", "120px", "150px", "200px", "250px", "300px"];

  return (
    <div
      draggable={layoutMode}
      onDragStart={(e) => onDragStart(e, id)}
      onDragEnd={onDragEnd}
      className={cn(
        "relative group border-2 border-dashed border-transparent transition-all",
        layoutMode && "border-primary/30 hover:border-primary bg-primary/5 rounded-lg"
      )}
      style={{
        width: config.width || "auto",
        marginTop: config.marginTop ? `${config.marginTop}px` : undefined,
        marginBottom: config.marginBottom ? `${config.marginBottom}px` : undefined,
      }}
    >
      {/* Drag Handle */}
      <div className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
        <GripVertical className="h-5 w-5 text-primary" />
      </div>

      {/* Config Button */}
      <Popover>
        <PopoverTrigger asChild>
          <button className="absolute -right-2 -top-2 p-1 bg-primary text-primary-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <Settings2 className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3 z-[100]" side="right">
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Largura</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {widthOptions.map((w) => (
                  <button
                    key={w}
                    onClick={() => onConfigChange(id, { width: w })}
                    className={cn(
                      "px-2 py-1 text-xs rounded border",
                      config.width === w
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    )}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Margem Superior ({config.marginTop || 0}px)</Label>
              <Slider
                value={[config.marginTop || 0]}
                onValueChange={([v]) => onConfigChange(id, { marginTop: v })}
                max={48}
                step={4}
                className="mt-2"
              />
            </div>

            <div>
              <Label className="text-xs">Margem Inferior ({config.marginBottom || 0}px)</Label>
              <Slider
                value={[config.marginBottom || 0]}
                onValueChange={([v]) => onConfigChange(id, { marginBottom: v })}
                max={48}
                step={4}
                className="mt-2"
              />
            </div>

            <div>
              <Label className="text-xs">Altura</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {heightOptions.map((h) => (
                  <button
                    key={h}
                    onClick={() => onConfigChange(id, { height: h })}
                    className={cn(
                      "px-2 py-1 text-xs rounded border",
                      config.height === h
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    )}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            {config.isCustom && onRemoveCustomField && (
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={() => onRemoveCustomField(id)}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Remover Campo
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Item Label */}
      <div className="absolute -top-5 left-2 text-[10px] font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        {config.isCustom && <span className="text-orange-500">●</span>}
        {config.customConfig?.label || id}
      </div>

      {children}
    </div>
  );
}

interface DropZoneProps {
  section: "header" | "campos" | "main";
  children: React.ReactNode;
  layoutMode: boolean;
  onDrop: (section: string, targetIndex: number) => void;
  draggedItem: string | null;
  sectionConfig?: any;
  onSectionConfigChange?: (changes: any) => void;
}

export function DropZone({
  section,
  children,
  layoutMode,
  onDrop,
  draggedItem,
  sectionConfig,
  onSectionConfigChange,
}: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const children = e.currentTarget.children;
    let targetIndex = 0;
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      const childRect = child.getBoundingClientRect();
      const childMiddle = childRect.top + childRect.height / 2 - rect.top;
      if (y > childMiddle) {
        targetIndex = i + 1;
      }
    }
    
    onDrop(section, targetIndex);
  };

  const sectionLabels = {
    header: "Cabeçalho",
    campos: "Campos",
    main: "Principal",
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative transition-all",
        layoutMode && "border-2 border-dashed rounded-lg p-2",
        layoutMode && !isDragOver && "border-muted-foreground/30",
        isDragOver && "border-primary bg-primary/10"
      )}
      style={{
        minHeight: layoutMode && sectionConfig?.minHeight ? `${sectionConfig.minHeight}px` : '40px'
      }}
    >
      {layoutMode && (
        <div className="absolute -top-3 left-3 px-2 bg-background text-xs font-medium text-muted-foreground flex items-center gap-2">
          {sectionLabels[section]}
          <Popover>
            <PopoverTrigger asChild>
              <button className="p-0.5 hover:bg-muted rounded">
                <Settings2 className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3 z-[100]" side="right">
              <div className="space-y-4">
                {section === "campos" && sectionConfig && "columns" in sectionConfig && (
                  <div>
                    <Label className="text-xs">Colunas ({sectionConfig.columns})</Label>
                    <Slider
                      value={[sectionConfig.columns]}
                      onValueChange={([v]) => onSectionConfigChange?.({ columns: v })}
                      min={1}
                      max={4}
                      step={1}
                      className="mt-2"
                    />
                  </div>
                )}
                {(section === "campos" || section === "main") && sectionConfig && "gap" in sectionConfig && (
                  <div>
                    <Label className="text-xs">Espaçamento ({sectionConfig.gap}px)</Label>
                    <Slider
                      value={[sectionConfig.gap]}
                      onValueChange={([v]) => onSectionConfigChange?.({ gap: v })}
                      min={4}
                      max={32}
                      step={4}
                      className="mt-2"
                    />
                  </div>
                )}
                <div>
                  <Label className="text-xs">Altura Mínima ({sectionConfig?.minHeight || 40}px)</Label>
                  <Slider
                    value={[sectionConfig?.minHeight || 40]}
                    onValueChange={([v]) => onSectionConfigChange?.({ minHeight: v })}
                    min={40}
                    max={400}
                    step={20}
                    className="mt-2"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
      {children}
    </div>
  );
}

interface LayoutEditorControlsProps {
  isAdmin: boolean;
  layoutMode: boolean;
  onToggle: () => void;
  onReset: () => void;
  onSave: () => void;
  onAddField: () => void;
}

export function LayoutEditorControls({
  isAdmin,
  layoutMode,
  onToggle,
  onReset,
  onSave,
  onAddField,
}: LayoutEditorControlsProps) {
  if (!isAdmin) return null;

  return (
    <div className="flex items-center gap-2">
      {layoutMode && (
        <>
          <Button variant="outline" size="sm" onClick={onAddField} className="h-7 text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Novo Campo
          </Button>
          <Button variant="ghost" size="sm" onClick={onReset} className="h-7 text-xs">
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Resetar
          </Button>
          <Button size="sm" onClick={onSave} className="h-7 text-xs">
            Salvar Layout
          </Button>
        </>
      )}
      <Button
        variant={layoutMode ? "secondary" : "ghost"}
        size="sm"
        onClick={onToggle}
        className="h-7 text-xs"
      >
        <Move className="h-3.5 w-3.5 mr-1" />
        {layoutMode ? "Sair do Editor" : "Editar Layout"}
      </Button>
    </div>
  );
}

export function useLayoutEditor() {
  const [layoutConfig, setLayoutConfig] = useState<LayoutConfig>(getLayoutConfig());
  const [layoutMode, setLayoutMode] = useState(false);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [addFieldDialogOpen, setAddFieldDialogOpen] = useState(false);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggedItem(id);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
  }, []);

  const handleDrop = useCallback((section: string, targetIndex: number) => {
    if (!draggedItem) return;

    setLayoutConfig((prev) => {
      const items = [...prev.items];
      const draggedIdx = items.findIndex((i) => i.id === draggedItem);
      if (draggedIdx === -1) return prev;

      const item = { ...items[draggedIdx], section: section as any };
      items.splice(draggedIdx, 1);

      const sectionItems = items.filter((i) => i.section === section);
      const otherItems = items.filter((i) => i.section !== section);

      sectionItems.splice(targetIndex, 0, item);

      sectionItems.forEach((item, idx) => {
        item.order = idx;
      });

      return { ...prev, items: [...otherItems, ...sectionItems] };
    });
  }, [draggedItem]);

  const handleConfigChange = useCallback((id: string, changes: Partial<LayoutItemConfig>) => {
    setLayoutConfig((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id ? { ...item, ...changes } : item
      ),
    }));
  }, []);

  const handleSectionConfigChange = useCallback(
    (section: "campos" | "main" | "header", changes: any) => {
      setLayoutConfig((prev) => ({
        ...prev,
        sectionSettings: {
          ...prev.sectionSettings,
          [section]: { ...prev.sectionSettings[section], ...changes },
        },
      }));
    },
    []
  );

  const addCustomField = useCallback((field: CustomFieldConfig) => {
    setLayoutConfig((prev) => {
      const newItem: LayoutItemConfig = {
        id: field.id,
        section: "campos",
        order: prev.items.filter(i => i.section === "campos").length,
        width: "33%",
        isCustom: true,
        customConfig: field,
      };

      return {
        ...prev,
        items: [...prev.items, newItem],
        customFields: [...prev.customFields, field],
      };
    });
    toast.success(`Campo "${field.label}" adicionado!`);
  }, []);

  const removeCustomField = useCallback((id: string) => {
    setLayoutConfig((prev) => ({
      ...prev,
      items: prev.items.filter(i => i.id !== id),
      customFields: prev.customFields.filter(f => f.id !== id),
    }));
    toast.success("Campo removido!");
  }, []);

  const saveLayout = useCallback(() => {
    saveLayoutConfig(layoutConfig);
    toast.success("Layout salvo com sucesso!");
    setLayoutMode(false);
  }, [layoutConfig]);

  const resetLayout = useCallback(() => {
    setLayoutConfig(DEFAULT_LAYOUT);
    toast.info("Layout resetado para padrão");
  }, []);

  const getItemConfig = useCallback(
    (id: string): LayoutItemConfig => {
      return (
        layoutConfig.items.find((i) => i.id === id) || {
          id,
          section: "campos",
          order: 0,
        }
      );
    },
    [layoutConfig]
  );

  const getItemsBySection = useCallback(
    (section: "header" | "campos" | "main") => {
      return layoutConfig.items
        .filter((i) => i.section === section)
        .sort((a, b) => a.order - b.order);
    },
    [layoutConfig]
  );

  const existingFieldIds = layoutConfig.items.map(i => i.id);

  return {
    layoutConfig,
    layoutMode,
    setLayoutMode,
    draggedItem,
    handleDragStart,
    handleDragEnd,
    handleDrop,
    handleConfigChange,
    handleSectionConfigChange,
    saveLayout,
    resetLayout,
    getItemConfig,
    getItemsBySection,
    addCustomField,
    removeCustomField,
    addFieldDialogOpen,
    setAddFieldDialogOpen,
    existingFieldIds,
    AddCustomFieldDialog,
  };
}
