import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const ESPECIALIDADES_MEDICAS = [
  "Alergologia e Imunologia",
  "Anestesiologista",
  "Angiologia",
  "Cardiologia",
  "Cirurgia Cardiovascular",
  "Cirurgia da Mão",
  "Cirurgia de Cabeça e Pescoço",
  "Cirurgia do Aparelho Digestivo",
  "Cirurgia Geral",
  "Cirurgia Oncológica",
  "Cirurgia Pediátrica",
  "Cirurgia Plástica",
  "Cirurgia Torácica",
  "Cirurgia Vascular",
  "Clínica Médica",
  "Coloproctologia",
  "Dermatologia",
  "Endocrinologia e Metabologia",
  "Endoscopia Digestiva",
  "Gastroenterologia",
  "Genética Médica",
  "Geriatria",
  "Ginecologia e Obstetrícia",
  "Hematologia e Hemoterapia",
  "Homeopatia",
  "Infectologia",
  "Mastologia",
  "Medicina de Emergência",
  "Medicina de Família e Comunidade",
  "Medicina do Trabalho",
  "Medicina Esportiva",
  "Medicina Física e Reabilitação",
  "Medicina Generalista",
  "Medicina Intensiva",
  "Medicina Intensiva Pediátrica",
  "Medicina Legal e Perícia Médica",
  "Medicina Nuclear",
  "Medicina Preventiva e Social",
  "Nefrologia",
  "Neonatologia",
  "Neurocirurgia",
  "Neurologia",
  "Nutrologia",
  "Oftalmologia",
  "Oncologia Clínica",
  "Oncologia Pediátrica",
  "Ortopedia e Traumatologia",
  "Otorrinolaringologia",
  "Patologia",
  "Patologia Clínica / Medicina Laboratorial",
  "Pediatria",
  "Pneumologia",
  "Psiquiatria",
  "Radiologia e Diagnóstico por Imagem",
  "Radioterapia",
  "Reumatologia",
  "Urologia",
  // Residentes
  "Residente de Alergologia e Imunologia",
  "Residente de Anestesiologista",
  "Residente de Angiologia",
  "Residente de Cardiologia",
  "Residente de Cirurgia Cardiovascular",
  "Residente de Cirurgia da Mão",
  "Residente de Cirurgia de Cabeça e Pescoço",
  "Residente de Cirurgia do Aparelho Digestivo",
  "Residente de Cirurgia Geral",
  "Residente de Cirurgia Oncológica",
  "Residente de Cirurgia Pediátrica",
  "Residente de Cirurgia Plástica",
  "Residente de Cirurgia Torácica",
  "Residente de Cirurgia Vascular",
  "Residente de Clínica Médica",
  "Residente de Coloproctologia",
  "Residente de Dermatologia",
  "Residente de Endocrinologia e Metabologia",
  "Residente de Endoscopia Digestiva",
  "Residente de Gastroenterologia",
  "Residente de Genética Médica",
  "Residente de Geriatria",
  "Residente de Ginecologia e Obstetrícia",
  "Residente de Hematologia e Hemoterapia",
  "Residente de Homeopatia",
  "Residente de Infectologia",
  "Residente de Mastologia",
  "Residente de Medicina de Emergência",
  "Residente de Medicina de Família e Comunidade",
  "Residente de Medicina do Trabalho",
  "Residente de Medicina Esportiva",
  "Residente de Medicina Física e Reabilitação",
  "Residente de Medicina Intensiva",
  "Residente de Medicina Intensiva Pediátrica",
  "Residente de Medicina Legal e Perícia Médica",
  "Residente de Medicina Nuclear",
  "Residente de Medicina Preventiva e Social",
  "Residente de Nefrologia",
  "Residente de Neonatologia",
  "Residente de Neurocirurgia",
  "Residente de Neurologia",
  "Residente de Nutrologia",
  "Residente de Oftalmologia",
  "Residente de Oncologia Clínica",
  "Residente de Oncologia Pediátrica",
  "Residente de Ortopedia e Traumatologia",
  "Residente de Otorrinolaringologia",
  "Residente de Patologia",
  "Residente de Patologia Clínica / Medicina Laboratorial",
  "Residente de Pediatria",
  "Residente de Pneumologia",
  "Residente de Psiquiatria",
  "Residente de Radiologia e Diagnóstico por Imagem",
  "Residente de Radioterapia",
  "Residente de Reumatologia",
  "Residente de Urologia",
];

interface EspecialidadeMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

export function EspecialidadeMultiSelect({
  value = [],
  onChange,
  disabled = false,
}: EspecialidadeMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (especialidade: string) => {
    if (value.includes(especialidade)) {
      onChange(value.filter((item) => item !== especialidade));
    } else {
      onChange([...value, especialidade]);
    }
  };

  const handleRemove = (especialidade: string) => {
    onChange(value.filter((item) => item !== especialidade));
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled}
          >
            <span className="truncate">
              {value.length === 0
                ? "Selecione especialidades..."
                : `${value.length} especialidade(s) selecionada(s)`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0 bg-popover" align="start">
          <Command>
            <CommandInput placeholder="Buscar especialidade..." />
            <CommandList>
              <CommandEmpty>Nenhuma especialidade encontrada.</CommandEmpty>
              <CommandGroup className="max-h-64 overflow-auto">
                {ESPECIALIDADES_MEDICAS.map((especialidade) => (
                  <CommandItem
                    key={especialidade}
                    value={especialidade}
                    onSelect={() => handleSelect(especialidade)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value.includes(especialidade)
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                    {especialidade}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((especialidade) => (
            <Badge
              key={especialidade}
              variant="secondary"
              className="gap-1"
            >
              {especialidade}
              <button
                type="button"
                onClick={() => handleRemove(especialidade)}
                disabled={disabled}
                className="ml-1 rounded-full hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
