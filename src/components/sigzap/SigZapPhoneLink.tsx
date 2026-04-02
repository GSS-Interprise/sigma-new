import React, { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { MessageCircle, Copy, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { normalizeToE164 } from "@/lib/phoneUtils";

interface PhonePopoverProps {
  phone: string; // raw phone string from the message
  isFromMe: boolean;
  currentInstanceId?: string | null; // instance_id from the current conversation
}

/**
 * Detects Brazilian phone numbers in message text and renders them as clickable with a popover.
 */
const PHONE_REGEX = /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}[\s.-]?\d{4}/g;

type PhoneCheckState = "idle" | "checking" | "found" | "not_found" | "has_whatsapp" | "disconnected";

function SigZapPhonePopover({ phone, isFromMe, currentInstanceId }: PhonePopoverProps) {
  const [open, setOpen] = useState(false);
  const [checkState, setCheckState] = useState<PhoneCheckState>("idle");
  const [foundConversaId, setFoundConversaId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const digits = phone.replace(/\D/g, "");
  const e164 = normalizeToE164(digits);
  const displayPhone = e164 || `+55${digits}`;

  const handleOpen = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setCheckState("idle");
      setFoundConversaId(null);
      return;
    }

    setCheckState("checking");

    try {
      // Normalize phone for search
      const searchDigits = digits.startsWith("55") && digits.length > 11 
        ? digits.slice(2) 
        : digits;

      // Try multiple phone variations for DB lookup
      const variations = [
        searchDigits,
        `55${searchDigits}`,
        searchDigits.length === 10 
          ? searchDigits.slice(0, 2) + "9" + searchDigits.slice(2) 
          : null,
        searchDigits.length === 11 && searchDigits[2] === "9"
          ? searchDigits.slice(0, 2) + searchDigits.slice(3)
          : null,
      ].filter(Boolean) as string[];

      const allVariations = [
        ...variations,
        ...variations.map(v => `55${v}`).filter(v => !variations.includes(v)),
      ];

      // 1. Check if contact exists in DB
      const { data: contacts } = await supabase
        .from("sigzap_contacts")
        .select("id, contact_phone, contact_name")
        .in("contact_phone", allVariations)
        .limit(1);

      if (contacts && contacts.length > 0) {
        const { data: conversation } = await supabase
          .from("sigzap_conversations")
          .select("id")
          .eq("contact_id", contacts[0].id)
          .neq("status", "inactive")
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (conversation) {
          setFoundConversaId(conversation.id);
          setCheckState("found");
          return;
        }
      }

      // 2. Contact not in DB — check via Evolution API
      const { data: activeInstance } = await supabase
        .from("sigzap_instances")
        .select("name")
        .eq("status", "connected")
        .limit(1)
        .maybeSingle();

      if (!activeInstance?.name) {
        setCheckState("disconnected");
        return;
      }

      const numberToCheck = e164 ? e164.replace("+", "") : `55${searchDigits.length === 10 ? searchDigits.slice(0, 2) + "9" + searchDigits.slice(2) : searchDigits}`;
      
      const { data: apiResult, error: apiError } = await supabase.functions.invoke("evolution-api-proxy", {
        body: {
          action: "checkIsOnWhatsapp",
          instanceName: activeInstance.name,
          data: { numbers: [numberToCheck] },
        },
      });

      if (!apiError && Array.isArray(apiResult) && apiResult.length > 0 && apiResult[0]?.exists) {
        setCheckState("has_whatsapp");
        return;
      }

      setCheckState("not_found");
    } catch (err) {
      console.error("Erro ao verificar WhatsApp:", err);
      setCheckState("not_found");
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(displayPhone);
    toast.success("Número copiado!");
    setOpen(false);
  };

  const handleStartChat = (conversaId?: string) => {
    const id = conversaId || foundConversaId;
    if (!id) return;
    window.dispatchEvent(
      new CustomEvent("sigzap-open-conversa", { detail: { conversaId: id } })
    );
    setOpen(false);
  };

  const handleCreateAndChat = async () => {
    setCreating(true);
    try {
      const phoneDigits = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
      const fullPhone = `55${phoneDigits.length === 10 ? phoneDigits.slice(0, 2) + "9" + phoneDigits.slice(2) : phoneDigits}`;
      const jid = `${fullPhone}@s.whatsapp.net`;

      // Create contact
      const { data: contact, error: contactErr } = await supabase
        .from("sigzap_contacts")
        .insert({ contact_jid: jid, contact_phone: fullPhone, contact_name: displayPhone })
        .select("id")
        .single();

      if (contactErr || !contact) throw contactErr;

      // Use current conversation's instance, fallback to first connected
      let instId = currentInstanceId || null;
      if (!instId) {
        const { data: inst } = await supabase
          .from("sigzap_instances")
          .select("id")
          .eq("status", "connected")
          .limit(1)
          .maybeSingle();
        instId = inst?.id || null;
      }

      // Create conversation
      const { data: conversa, error: convErr } = await supabase
        .from("sigzap_conversations")
        .insert({
          contact_id: contact.id,
          instance_id: instId,
          status: "pending",
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (convErr || !conversa) throw convErr;

      handleStartChat(conversa.id);
    } catch (err) {
      console.error("Erro ao criar conversa:", err);
      toast.error("Erro ao iniciar conversa");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <span
          className={`cursor-pointer underline font-medium ${
            isFromMe 
              ? "text-green-200 hover:text-green-100" 
              : "text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {phone}
        </span>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-2"
        side="top"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        {checkState === "checking" ? (
          <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verificando WhatsApp...
          </div>
        ) : checkState === "found" ? (
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-2 h-9"
              onClick={() => handleStartChat()}
            >
              <MessageCircle className="h-4 w-4" />
              Conversar com {displayPhone}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-2 h-9"
              onClick={handleCopy}
            >
              <Copy className="h-4 w-4" />
              Copiar número de telefone
            </Button>
          </div>
        ) : checkState === "has_whatsapp" ? (
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-2 h-9"
              onClick={handleCreateAndChat}
              disabled={creating}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              Conversar com {displayPhone}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-2 h-9"
              onClick={handleCopy}
            >
              <Copy className="h-4 w-4" />
              Copiar número de telefone
            </Button>
          </div>
        ) : checkState === "disconnected" ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 p-2 text-sm text-destructive">
              <XCircle className="h-4 w-4" />
              WhatsApp desconectado! Favor conecte o QR Code.
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-2 h-9"
              onClick={handleCopy}
            >
              <Copy className="h-4 w-4" />
              Copiar número de telefone
            </Button>
          </div>
        ) : checkState === "not_found" ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
              <XCircle className="h-4 w-4 text-destructive" />
              Este contato não tem WhatsApp
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-2 h-9"
              onClick={handleCopy}
            >
              <Copy className="h-4 w-4" />
              Copiar número de telefone
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Takes a message text string and returns React nodes with phone numbers
 * rendered as clickable SigZapPhonePopover components.
 */
export function renderMessageWithPhoneLinks(
  text: string,
  isFromMe: boolean,
  currentInstanceId?: string | null
): React.ReactNode {
  if (!text) return null;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex
  PHONE_REGEX.lastIndex = 0;

  while ((match = PHONE_REGEX.exec(text)) !== null) {
    const phone = match[0];
    const digits = phone.replace(/\D/g, "");

    // Only treat as phone if it has at least 10 digits (DDD + number)
    if (digits.length < 10) continue;

    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    parts.push(
      <SigZapPhonePopover
        key={`phone-${match.index}`}
        phone={phone}
        isFromMe={isFromMe}
        currentInstanceId={currentInstanceId}
      />
    );

    lastIndex = match.index + phone.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  // If no phones found, return original text
  if (parts.length === 0) return text;

  return <>{parts}</>;
}
