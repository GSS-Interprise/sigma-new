import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface QRCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceName: string;
  onConnected: () => void;
}

export function QRCodeDialog({ open, onOpenChange, instanceName, onConnected }: QRCodeDialogProps) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [connectionState, setConnectionState] = useState<string>("close");
  const [polling, setPolling] = useState(false);

  const fetchQRCode = async () => {
    if (!instanceName) return;
    
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Sessão expirada");
        return;
      }

      const { data, error } = await supabase.functions.invoke("evolution-api-proxy", {
        body: { action: "connectInstance", instanceName },
      });

      if (error) throw error;

      if (data?.base64) {
        setQrCode(data.base64);
        setPairingCode(data.pairingCode || null);
        setPolling(true);
      } else if (data?.instance?.state === "open") {
        setConnectionState("open");
        toast.success("Instância já conectada!");
        onConnected();
      }
    } catch (error: any) {
      console.error("Erro ao buscar QR Code:", error);
      toast.error(error.message || "Erro ao buscar QR Code");
    } finally {
      setLoading(false);
    }
  };

  const checkConnectionState = async () => {
    if (!instanceName || !polling) return;

    try {
      const { data, error } = await supabase.functions.invoke("evolution-api-proxy", {
        body: { action: "connectionState", instanceName },
      });

      if (error) throw error;

      const state = data?.instance?.state || data?.state || "close";
      setConnectionState(state);

      if (state === "open") {
        setPolling(false);
        toast.success("WhatsApp conectado com sucesso!");
        onConnected();
        onOpenChange(false);
      }
    } catch (error) {
      console.error("Erro ao verificar estado:", error);
    }
  };

  useEffect(() => {
    if (open && instanceName) {
      fetchQRCode();
    } else {
      setQrCode(null);
      setPairingCode(null);
      setPolling(false);
      setConnectionState("close");
    }
  }, [open, instanceName]);

  useEffect(() => {
    if (!polling) return;

    const interval = setInterval(checkConnectionState, 5000);
    return () => clearInterval(interval);
  }, [polling, instanceName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar WhatsApp - {instanceName}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
            </div>
          ) : connectionState === "open" ? (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle className="h-16 w-16 text-green-500" />
              <p className="text-lg font-medium">Conectado!</p>
            </div>
          ) : qrCode ? (
            <>
              <div className="bg-white p-4 rounded-lg">
                <img 
                  src={qrCode} 
                  alt="QR Code WhatsApp" 
                  className="w-64 h-64"
                />
              </div>
              
              {pairingCode && (
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Código de pareamento:</p>
                  <p className="text-2xl font-mono font-bold tracking-wider">{pairingCode}</p>
                </div>
              )}

              <p className="text-sm text-muted-foreground text-center">
                Abra o WhatsApp no seu celular, vá em Dispositivos Conectados e escaneie o QR Code
              </p>

              {polling && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Aguardando conexão...
                </div>
              )}

              <Button variant="outline" onClick={fetchQRCode} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Gerar novo QR Code
              </Button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <XCircle className="h-16 w-16 text-destructive" />
              <p className="text-sm text-muted-foreground">Não foi possível gerar o QR Code</p>
              <Button variant="outline" onClick={fetchQRCode}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Tentar novamente
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
