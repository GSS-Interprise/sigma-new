import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeToDigitsOnly } from "@/lib/phoneUtils";

interface ContactsProviderOptions {
  especialidade?: string;
  estado?: string;
  incluirLeads: boolean;
  incluirClinico: boolean;
}

interface Contact {
  phone_e164: string;
  nome: string;
  especialidade: string | string[];
  origem: 'lead' | 'clinico';
}

export function useContactsProvider(options: ContactsProviderOptions) {
  return useQuery({
    queryKey: ['contacts-provider', options],
    queryFn: async () => {
      const toPhoneKey = (phone: string | null | undefined): string | null => {
        if (!phone) return null;
        return normalizeToDigitsOnly(phone) ?? String(phone).replace(/\D/g, "");
      };

      const contacts: Contact[] = [];

      // Buscar blacklist primeiro
      const { data: blacklist } = await supabase
        .from("blacklist")
        .select("phone_e164");

      const blacklistedPhones = new Set(
        (blacklist || [])
          .map((b) => toPhoneKey(b.phone_e164))
          .filter(Boolean) as string[]
      );

      // Buscar leads se incluído
      if (options.incluirLeads) {
        let leadsQuery = supabase
          .from("leads")
          .select("phone_e164, nome, especialidade, uf")
          .eq("status", "Qualificado")
          .not("phone_e164", "is", null);

        if (options.especialidade) {
          leadsQuery = leadsQuery.eq("especialidade", options.especialidade);
        }

        if (options.estado) {
          leadsQuery = leadsQuery.eq("uf", options.estado);
        }

        const { data: leads } = await leadsQuery;

        leads?.forEach((lead) => {
          const key = toPhoneKey(lead.phone_e164);
          if (!key) return;
          if (blacklistedPhones.has(key)) return;

          contacts.push({
            phone_e164: key,
            nome: lead.nome,
            especialidade: lead.especialidade || "",
            origem: "lead",
          });
        });
      }

      // Buscar médicos se incluído
      if (options.incluirClinico) {
        let medicosQuery = supabase
          .from("medicos")
          .select("phone_e164, nome_completo, especialidade, estado")
          .eq("status_medico", "Ativo")
          .not("phone_e164", "is", null);

        if (options.especialidade) {
          medicosQuery = medicosQuery.contains("especialidade", [options.especialidade]);
        }

        if (options.estado) {
          medicosQuery = medicosQuery.eq("estado", options.estado);
        }

        const { data: medicos } = await medicosQuery;

        medicos?.forEach((medico) => {
          const key = toPhoneKey(medico.phone_e164);
          if (!key) return;
          if (blacklistedPhones.has(key)) return;

          contacts.push({
            phone_e164: key,
            nome: medico.nome_completo,
            especialidade: medico.especialidade,
            origem: "clinico",
          });
        });
      }

      // Remover duplicatas por telefone normalizado (priorizar clinico sobre lead)
      const uniqueContacts = Array.from(
        new Map(
          contacts
            .sort((a) => (a.origem === "clinico" ? -1 : 1))
            .map((c) => [c.phone_e164, c])
        ).values()
      );

      return uniqueContacts;
    },
    enabled: options.incluirLeads || options.incluirClinico,
  });
}
