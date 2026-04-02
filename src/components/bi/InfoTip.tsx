import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

export function InfoTip({
  text,
  ariaLabel = "Ver explicação",
}: {
  text: string;
  ariaLabel?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={ariaLabel}
        >
          <Info className="h-4 w-4 text-muted-foreground" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs whitespace-pre-line">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
