import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  BarChart3, TrendingUp, Send, Calendar, Briefcase,
  Users, MessageSquare, DollarSign, FileText, Monitor,
  ChevronDown, Building2, Megaphone,
} from "lucide-react";

export interface BIModule {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface BICategory {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  modules: BIModule[];
}

export const BI_CATEGORIES: BICategory[] = [
  {
    key: "comercial",
    label: "Comercial",
    icon: TrendingUp,
    modules: [
      { key: "licitacoes", label: "Licitações", icon: BarChart3 },
      { key: "competitiva", label: "Competitiva", icon: TrendingUp },
      { key: "disparos", label: "Disparos", icon: Send },
      { key: "prospec", label: "Prospec", icon: Megaphone },
    ],
  },
  {
    key: "operacional",
    label: "Operacional",
    icon: Calendar,
    modules: [
      { key: "escalas", label: "Escalas", icon: Calendar },
      { key: "ages", label: "AGES", icon: Briefcase },
    ],
  },
  {
    key: "pessoas",
    label: "Pessoas",
    icon: Users,
    modules: [
      { key: "medicos", label: "Médicos", icon: Users },
      { key: "relacionamento", label: "Relacionamento", icon: MessageSquare },
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    icon: DollarSign,
    modules: [
      { key: "financeiro", label: "Financeiro", icon: DollarSign },
      { key: "contratos", label: "Contratos", icon: FileText },
    ],
  },
  {
    key: "ti",
    label: "TI",
    icon: Monitor,
    modules: [
      { key: "ti", label: "TI", icon: Monitor },
    ],
  },
  {
    key: "clientes",
    label: "Clientes",
    icon: Building2,
    modules: [
      { key: "hospital-de-gaspar", label: "Hospital de Gaspar", icon: Building2 },
    ],
  },
];

// Helper to find which category a module belongs to
export function findCategoryForModule(moduleKey: string): string | undefined {
  for (const cat of BI_CATEGORIES) {
    if (cat.modules.some((m) => m.key === moduleKey)) return cat.key;
  }
  return undefined;
}

interface BINavigationProps {
  activeModule: string;
  onSelectModule: (moduleKey: string) => void;
}

export function BINavigation({ activeModule, onSelectModule }: BINavigationProps) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const activeCategoryKey = findCategoryForModule(activeModule);

  return (
    <nav className="flex flex-wrap gap-2">
      {BI_CATEGORIES.map((category) => {
        const isActiveCategory = activeCategoryKey === category.key;
        const isSingleModule = category.modules.length === 1;

        if (isSingleModule) {
          const mod = category.modules[0];
          const isActive = activeModule === mod.key;
          return (
            <Button
              key={category.key}
              variant={isActive ? "default" : "outline"}
              size="sm"
              className={cn("gap-2", isActive && "shadow-md")}
              onClick={() => onSelectModule(mod.key)}
            >
              <mod.icon className="h-4 w-4" />
              {category.label}
            </Button>
          );
        }

        return (
          <Popover
            key={category.key}
            open={openCategory === category.key}
            onOpenChange={(open) => setOpenCategory(open ? category.key : null)}
          >
            <PopoverTrigger asChild>
              <Button
                variant={isActiveCategory ? "default" : "outline"}
                size="sm"
                className={cn("gap-2", isActiveCategory && "shadow-md")}
              >
                <category.icon className="h-4 w-4" />
                {category.label}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="start" sideOffset={6}>
              <div className="flex flex-col gap-0.5">
                {category.modules.map((mod) => {
                  const isActive = activeModule === mod.key;
                  return (
                    <button
                      key={mod.key}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors w-full text-left",
                        isActive
                          ? "bg-primary text-primary-foreground font-medium"
                          : "hover:bg-accent text-foreground"
                      )}
                      onClick={() => {
                        onSelectModule(mod.key);
                        setOpenCategory(null);
                      }}
                    >
                      <mod.icon className="h-4 w-4" />
                      {mod.label}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        );
      })}
    </nav>
  );
}
