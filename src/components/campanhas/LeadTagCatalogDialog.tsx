import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Tags } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CatalogTag {
  id: string;
  label: string;
  slug: string;
  active: boolean;
  sort_order: number;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erro inesperado";
}

export function LeadTagCatalogDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const queryKey = ["lead-tag-catalog-admin"];
  const { data: tags = [], isLoading } = useQuery({
    queryKey,
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_tag_catalog" as never)
        .select("id, label, slug, active, sort_order")
        .order("sort_order")
        .order("label");
      if (error) throw error;
      return (data ?? []) as CatalogTag[];
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      const slug = slugify(label);
      if (!slug) throw new Error("Informe um nome válido.");
      const { error } = await supabase.from("lead_tag_catalog" as never).insert({
        label: label.trim(),
        slug,
        sort_order: (tags.at(-1)?.sort_order || 0) + 10,
      } as never);
      if (error) throw error;
    },
    onSuccess: async () => {
      setLabel("");
      toast.success("Tag adicionada ao catálogo");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["lead-tag-catalog-active"] }),
      ]);
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const toggle = useMutation({
    mutationFn: async (tag: CatalogTag) => {
      const { error } = await supabase
        .from("lead_tag_catalog" as never)
        .update({ active: !tag.active } as never)
        .eq("id", tag.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["lead-tag-catalog-active"] }),
      ]);
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="h-5 w-5" />
            Catálogo de tags
          </DialogTitle>
          <DialogDescription>
            Somente tags ativas aparecem no atendimento. Desativar não apaga o histórico.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="min-h-11"
            value={label}
            maxLength={60}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Nome da nova tag"
            onKeyDown={(event) => {
              if (event.key === "Enter" && label.trim()) criar.mutate();
            }}
          />
          <Button
            type="button"
            className="min-h-11"
            disabled={label.trim().length < 2 || criar.isPending}
            onClick={() => criar.mutate()}
          >
            {criar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Adicionar
          </Button>
        </div>

        {isLoading ? (
          <div className="flex min-h-28 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : (
          <div className="space-y-2">
            {tags.map((tag) => (
              <div key={tag.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{tag.label}</p>
                  <p className="text-xs text-muted-foreground">{tag.slug}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate(tag)}
                >
                  <Badge variant="outline" className={tag.active ? "text-emerald-700" : "text-slate-500"}>
                    {tag.active ? "Ativa" : "Inativa"}
                  </Badge>
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
