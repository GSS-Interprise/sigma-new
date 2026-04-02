import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Folder, 
  Star, 
  Briefcase, 
  BookOpen, 
  Settings, 
  Users,
  FileText,
  Calendar,
  Lightbulb,
  Target
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface WorkspacePastaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pasta?: any;
  onSuccess?: () => void;
}

const ICONS = [
  { id: 'folder', icon: Folder },
  { id: 'star', icon: Star },
  { id: 'briefcase', icon: Briefcase },
  { id: 'book', icon: BookOpen },
  { id: 'settings', icon: Settings },
  { id: 'users', icon: Users },
  { id: 'file', icon: FileText },
  { id: 'calendar', icon: Calendar },
  { id: 'idea', icon: Lightbulb },
  { id: 'target', icon: Target },
];

const COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
];

export function WorkspacePastaDialog({ 
  open, 
  onOpenChange, 
  pasta, 
  onSuccess 
}: WorkspacePastaDialogProps) {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState("");
  const [icone, setIcone] = useState("folder");
  const [cor, setCor] = useState("#6366f1");

  useEffect(() => {
    if (pasta) {
      setNome(pasta.nome || "");
      setIcone(pasta.icone || "folder");
      setCor(pasta.cor || "#6366f1");
    } else {
      setNome("");
      setIcone("folder");
      setCor("#6366f1");
    }
  }, [pasta, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Não autenticado");

      if (pasta?.id) {
        const { error } = await supabase
          .from('user_pastas')
          .update({ nome, icone, cor })
          .eq('id', pasta.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_pastas')
          .insert({
            user_id: userData.user.id,
            nome,
            icone,
            cor,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-pastas'] });
      toast.success(pasta ? "Pasta atualizada!" : "Pasta criada!");
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao salvar pasta");
    },
  });

  const getIconComponent = (iconId: string) => {
    const found = ICONS.find(i => i.id === iconId);
    return found ? found.icon : Folder;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{pasta ? "Editar Pasta" : "Nova Pasta"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Preview */}
          <div className="flex justify-center">
            <div 
              className="w-16 h-16 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: cor + '20' }}
            >
              {(() => {
                const IconComponent = getIconComponent(icone);
                return <IconComponent className="h-8 w-8" style={{ color: cor }} />;
              })()}
            </div>
          </div>

          {/* Nome */}
          <div className="space-y-2">
            <Label>Nome da Pasta</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Projetos, Ideias, Reuniões..."
            />
          </div>

          {/* Ícone */}
          <div className="space-y-2">
            <Label>Ícone</Label>
            <div className="flex flex-wrap gap-2">
              {ICONS.map((item) => {
                const IconComponent = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setIcone(item.id)}
                    className={`p-2 rounded-lg border-2 transition-colors ${
                      icone === item.id 
                        ? 'border-primary bg-primary/10' 
                        : 'border-transparent hover:bg-muted'
                    }`}
                  >
                    <IconComponent className="h-5 w-5" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cor */}
          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setCor(color)}
                  className={`w-8 h-8 rounded-full border-2 transition-transform ${
                    cor === color 
                      ? 'border-foreground scale-110' 
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !nome.trim()}>
            {saveMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}