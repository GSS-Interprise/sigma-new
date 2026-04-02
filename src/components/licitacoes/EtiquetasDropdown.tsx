import { useState, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Trash2, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const TAG_COLORS = [
  { id: "blue", bg: "bg-blue-600", hover: "hover:bg-blue-700" },
  { id: "teal", bg: "bg-teal-600", hover: "hover:bg-teal-700" },
  { id: "green", bg: "bg-green-600", hover: "hover:bg-green-700" },
  { id: "yellow", bg: "bg-yellow-500", hover: "hover:bg-yellow-600" },
  { id: "orange", bg: "bg-orange-500", hover: "hover:bg-orange-600" },
  { id: "red", bg: "bg-red-500", hover: "hover:bg-red-600" },
  { id: "pink", bg: "bg-pink-500", hover: "hover:bg-pink-600" },
  { id: "purple", bg: "bg-purple-600", hover: "hover:bg-purple-700" },
  { id: "gray", bg: "bg-gray-500", hover: "hover:bg-gray-600" },
  { id: "stone", bg: "bg-stone-400", hover: "hover:bg-stone-500" },
  { id: "black", bg: "bg-black", hover: "hover:bg-gray-900" },
];

interface TagConfig {
  name: string;
  colorId: string;
}

interface EtiquetasDropdownProps {
  selectedTags: string[];
  availableTags: TagConfig[];
  onToggleTag: (tagName: string) => void;
  onAddTag: (tagName: string, colorId: string) => void;
  onUpdateTagColor: (tagName: string, colorId: string) => void;
  onDeleteTag: (tagName: string) => void;
}

export function EtiquetasDropdown({
  selectedTags,
  availableTags,
  onToggleTag,
  onAddTag,
  onUpdateTagColor,
  onDeleteTag,
}: EtiquetasDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const getTagColor = (tagName: string) => {
    const tag = availableTags.find(t => t.name === tagName);
    const colorId = tag?.colorId || "gray";
    return TAG_COLORS.find(c => c.id === colorId) || TAG_COLORS[8];
  };

  const filteredTags = (availableTags || []).filter(tag =>
    tag?.name?.toLowerCase()?.includes(search.toLowerCase()) ?? false
  );

  const canAddNew = search.trim() && !(availableTags || []).some(
    t => t?.name?.toLowerCase() === search.trim().toLowerCase()
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canAddNew) {
      onAddTag(search.trim(), "gray");
      setSearch("");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="text-sm text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent transition-colors">
          + Adicionar etiqueta
        </button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[280px] p-0 bg-popover border shadow-lg z-50" 
        align="start"
        sideOffset={4}
      >
        <div className="p-2 border-b">
          <Input
            ref={inputRef}
            placeholder="Pesquise ou adicione tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-8 text-sm bg-transparent border-0 focus-visible:ring-0 px-1"
          />
        </div>
        
        <div className="max-h-[300px] overflow-y-auto p-1">
          {filteredTags.map((tag) => {
            const colorId = tag?.colorId || "gray";
            const color = TAG_COLORS.find(c => c.id === colorId) || TAG_COLORS[8];
            const isSelected = (selectedTags || []).includes(tag?.name || "");
            
            return (
              <div 
                key={tag.name} 
                className="flex items-center justify-between group px-1 py-0.5 rounded hover:bg-accent/50"
              >
                <button
                  onClick={() => onToggleTag(tag.name)}
                  className="flex-1 text-left"
                >
                  <span 
                    className={cn(
                      "inline-flex items-center px-2.5 py-1 rounded text-xs font-medium text-white",
                      color.bg,
                      isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                    )}
                  >
                    {tag.name}
                  </span>
                </button>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <button 
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent 
                    className="w-[200px] p-3 bg-popover border shadow-lg z-[60]" 
                    align="end"
                    side="right"
                  >
                    <div className="space-y-3">
                      <Input
                        value={editingTag === tag.name ? editingTag : tag.name}
                        onChange={(e) => setEditingTag(e.target.value)}
                        className="h-8 text-sm"
                        placeholder="Nome da tag"
                      />
                      
                      <div className="flex flex-wrap gap-2">
                        {TAG_COLORS.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => onUpdateTagColor(tag.name, c.id)}
                            className={cn(
                              "w-6 h-6 rounded-full transition-transform hover:scale-110",
                              c.bg,
                              tag.colorId === c.id && "ring-2 ring-primary ring-offset-2 ring-offset-popover"
                            )}
                          />
                        ))}
                      </div>
                      
                      <button
                        onClick={() => {
                          onDeleteTag(tag.name);
                        }}
                        className="flex items-center gap-2 w-full text-sm text-muted-foreground hover:text-destructive py-1"
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            );
          })}
          
          {canAddNew && (
            <button
              onClick={() => {
                onAddTag(search.trim(), "gray");
                setSearch("");
              }}
              className="w-full text-left px-2 py-2 text-sm text-muted-foreground hover:bg-accent/50 rounded"
            >
              Criar "<span className="font-medium text-foreground">{search.trim()}</span>"
            </button>
          )}
          
          {filteredTags.length === 0 && !canAddNew && (
            <div className="px-2 py-4 text-sm text-muted-foreground text-center">
              Nenhuma tag encontrada
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { TAG_COLORS };
export type { TagConfig };
