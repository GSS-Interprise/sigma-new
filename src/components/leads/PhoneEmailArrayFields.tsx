import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Phone, Mail, Plus, Pencil, X, Check, MessageCircle, Loader2, BanIcon, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Convenção: números inativos são prefixados com "INATIVO:"
const INATIVO_PREFIX = "INATIVO:";
const isInativo = (phone: string) => phone.startsWith(INATIVO_PREFIX);
const getRawPhone = (phone: string) => phone.startsWith(INATIVO_PREFIX) ? phone.slice(INATIVO_PREFIX.length) : phone;
const setInativo = (phone: string) => isInativo(phone) ? phone : `${INATIVO_PREFIX}${phone}`;
const setAtivo = (phone: string) => isInativo(phone) ? phone.slice(INATIVO_PREFIX.length) : phone;

interface PhoneEmailArrayFieldsProps {
  phones: string[];
  email: string;
  onPhonesChange: (phones: string[]) => void;
  onEmailChange: (email: string) => void;
  inputClassName?: string;
  /** Telefones já confirmados com WhatsApp (persistidos no banco) */
  whatsappPhones?: string[];
  /** Callback para salvar os telefones confirmados */
  onWhatsappPhonesChange?: (phones: string[]) => void;
}

type WhatsAppStatus = "unchecked" | "checking" | "has_whatsapp" | "no_whatsapp";

export function PhoneEmailArrayFields({
  phones,
  email,
  onPhonesChange,
  onEmailChange,
  inputClassName = "",
  whatsappPhones = [],
  onWhatsappPhonesChange,
}: PhoneEmailArrayFieldsProps) {
  const [editingPhoneIdx, setEditingPhoneIdx] = useState<number | null>(null);
  const [editingPhoneValue, setEditingPhoneValue] = useState("");
  const [newPhone, setNewPhone] = useState("");
  // Initialize status from persisted whatsappPhones
  const [whatsappStatus, setWhatsappStatus] = useState<Record<string, WhatsAppStatus>>(() => {
    const initial: Record<string, WhatsAppStatus> = {};
    for (const p of whatsappPhones) {
      initial[p] = "has_whatsapp";
    }
    return initial;
  });
  const [checkingAll, setCheckingAll] = useState(false);

  const [editingEmail, setEditingEmail] = useState(false);
  const [editingEmailValue, setEditingEmailValue] = useState("");
  const [newEmail, setNewEmail] = useState("");

  // Emails as array: split single email + support multiple
  const emails = email ? email.split(",").map(e => e.trim()).filter(Boolean) : [];

  const handleAddPhone = () => {
    const trimmed = newPhone.trim();
    if (!trimmed) return;
    onPhonesChange([...phones, trimmed]);
    setNewPhone("");
  };

  const handleToggleInativoPhone = (idx: number) => {
    const updated = [...phones];
    const current = updated[idx];
    updated[idx] = isInativo(current) ? setAtivo(current) : setInativo(current);
    onPhonesChange(updated);
    toast.info(isInativo(current) ? "Número reativado." : "Número marcado como inativo — não entrará nos disparos.");
  };

  const handleEditPhone = (idx: number) => {
    setEditingPhoneIdx(idx);
    // Edit only the raw value (sem o prefixo INATIVO:)
    setEditingPhoneValue(getRawPhone(phones[idx]));
  };

  const handleSavePhone = (idx: number) => {
    const updated = [...phones];
    // Preserva o prefixo INATIVO: se o número estava inativo
    const prefix = isInativo(phones[idx]) ? INATIVO_PREFIX : "";
    updated[idx] = prefix + editingPhoneValue.trim();
    onPhonesChange(updated);
    setEditingPhoneIdx(null);
  };

  const handleAddEmail = () => {
    const trimmed = newEmail.trim();
    if (!trimmed) return;
    const updated = [...emails, trimmed];
    onEmailChange(updated.join(", "));
    setNewEmail("");
  };

  const handleRemoveEmail = (idx: number) => {
    const updated = emails.filter((_, i) => i !== idx);
    onEmailChange(updated.join(", "));
  };

  const handleEditEmailStart = (idx: number) => {
    setEditingEmail(true);
    setEditingEmailValue(emails[idx]);
    setEditingPhoneIdx(null); // reuse naming - track by storing idx in a separate state
  };

  const [editingEmailIdx, setEditingEmailIdx] = useState<number | null>(null);

  const handleEditEmailSave = (idx: number) => {
    const updated = [...emails];
    updated[idx] = editingEmailValue.trim();
    onEmailChange(updated.join(", "));
    setEditingEmailIdx(null);
  };

  const handleCheckWhatsApp = async () => {
    if (phones.length === 0) return;
    setCheckingAll(true);

    try {
      // Buscar TODAS as instâncias conectadas
      const { data: instances } = await supabase
        .from("sigzap_instances")
        .select("name")
        .eq("status", "connected");

      if (!instances || instances.length === 0) {
        toast.error("Nenhuma instância WhatsApp conectada para verificação.");
        setCheckingAll(false);
        return;
      }

      // Encontrar primeira instância funcional testando cada uma
      let workingInstance: string | null = null;
      for (const inst of instances) {
        try {
          const { data: testData } = await supabase.functions.invoke("evolution-api-proxy", {
            body: {
              action: "checkIsOnWhatsapp",
              instanceName: inst.name,
              data: { numbers: ["5511999999999"] },
            },
          });
          const isDisconnected =
            testData?.code === "CONNECTION_CLOSED" ||
            testData?.isBoom ||
            testData?.output?.payload?.message === "Connection Closed";
          if (!isDisconnected) {
            workingInstance = inst.name;
            break;
          }
        } catch {
          // tenta próxima
        }
      }

      if (!workingInstance) {
        toast.error("Todas as instâncias estão desconectadas. Reconecte via QR Code.");
        setCheckingAll(false);
        return;
      }

      const newStatuses: Record<string, WhatsAppStatus> = {};

      for (const phone of phones) {
        const digits = phone.replace(/\D/g, "");
        if (!digits) {
          newStatuses[phone] = "no_whatsapp";
          continue;
        }
        const numberToCheck = digits.startsWith("55") ? digits : `55${digits}`;

        try {
          const { data } = await supabase.functions.invoke("evolution-api-proxy", {
            body: {
              action: "checkIsOnWhatsapp",
              instanceName: workingInstance,
              data: { numbers: [numberToCheck] },
            },
          });

          if (Array.isArray(data) && data.length > 0 && data[0]?.exists) {
            newStatuses[phone] = "has_whatsapp";
          } else {
            newStatuses[phone] = "no_whatsapp";
          }
        } catch {
          newStatuses[phone] = "no_whatsapp";
        }
      }

      setWhatsappStatus(newStatuses);
    } catch (err: any) {
      toast.error("Erro ao verificar WhatsApp");
    } finally {
      setCheckingAll(false);
    }
  };

  const getWhatsAppIcon = (phone: string) => {
    const status = whatsappStatus[phone];
    if (status === "has_whatsapp") {
      return <MessageCircle className="h-4 w-4 text-green-500 fill-green-500" />;
    }
    if (status === "no_whatsapp") {
      return <MessageCircle className="h-4 w-4 text-muted-foreground/40" />;
    }
    return <MessageCircle className="h-4 w-4 text-muted-foreground/20" />;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Telefones */}
      <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            Telefones
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={handleCheckWhatsApp}
            disabled={checkingAll || phones.length === 0}
          >
            {checkingAll ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <MessageCircle className="h-3 w-3 mr-1" />
            )}
            Verificar WhatsApp
          </Button>
        </div>

        <div className="space-y-1.5">
          {phones.map((phone, idx) => {
            const inativo = isInativo(phone);
            const raw = getRawPhone(phone);
            return (
              <div key={idx} className={`flex items-center gap-1.5 ${inativo ? "opacity-50" : ""}`}>
                {editingPhoneIdx === idx ? (
                  <>
                    <Input
                      value={editingPhoneValue}
                      onChange={(e) => setEditingPhoneValue(e.target.value)}
                      className="h-7 text-xs flex-1"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleSavePhone(idx)}
                    />
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleSavePhone(idx)}>
                      <Check className="h-3 w-3 text-green-600" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingPhoneIdx(null)}>
                      <X className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Input
                      value={raw}
                      readOnly
                      title={inativo ? "Número inativo — não entra nos disparos" : undefined}
                      className={`h-7 text-xs flex-1 cursor-default bg-background ${inativo ? "line-through text-muted-foreground" : ""}`}
                    />
                    {!inativo && getWhatsAppIcon(phone)}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title={inativo ? "Reativar número" : "Inativar número (não entra nos disparos)"}
                      onClick={() => handleEditPhone(idx)}
                    >
                      <Pencil className="h-3 w-3 text-primary" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title={inativo ? "Reativar número" : "Inativar número"}
                      onClick={() => handleToggleInativoPhone(idx)}
                    >
                      {inativo
                        ? <RotateCcw className="h-3 w-3 text-green-600" />
                        : <BanIcon className="h-3 w-3 text-destructive" />
                      }
                    </Button>
                  </>
                )}
              </div>
            );
          })}

          {/* Add new phone */}
          <div className="flex items-center gap-1.5">
            <Input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="Novo telefone"
              className="h-7 text-xs flex-1"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddPhone())}
            />
            <Button
              type="button"
              size="icon"
              className="h-6 w-6 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleAddPhone}
              disabled={!newPhone.trim()}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* E-mails */}
      <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
        <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5" />
          E-mails
        </label>

        <div className="space-y-1.5">
          {emails.map((em, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              {editingEmailIdx === idx ? (
                <>
                  <Input
                    value={editingEmailValue}
                    onChange={(e) => setEditingEmailValue(e.target.value)}
                    className="h-7 text-xs flex-1"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleEditEmailSave(idx)}
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditEmailSave(idx)}>
                    <Check className="h-3 w-3 text-green-600" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingEmailIdx(null)}>
                    <X className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </>
              ) : (
                <>
                  <Input
                    value={em}
                    readOnly
                    className="h-7 text-xs flex-1 cursor-default bg-background"
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingEmailIdx(idx); setEditingEmailValue(em); }}>
                    <Pencil className="h-3 w-3 text-primary" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemoveEmail(idx)}>
                    <X className="h-3 w-3 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          ))}

          {/* Add new email */}
          <div className="flex items-center gap-1.5">
            <Input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Novo e-mail"
              className="h-7 text-xs flex-1"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddEmail())}
            />
            <Button
              type="button"
              size="icon"
              className="h-6 w-6 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleAddEmail}
              disabled={!newEmail.trim()}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
