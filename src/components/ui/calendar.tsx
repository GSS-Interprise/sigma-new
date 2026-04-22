import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  fromYear?: number;
  toYear?: number;
};

type ViewMode = "days" | "months" | "years";

const MONTHS_PT = [
  "JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
  "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"
];

const MONTHS_FULL_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

function Calendar({ 
  className, 
  classNames, 
  showOutsideDays = true, 
  fromYear = 2000,
  toYear = new Date().getFullYear(),
  month: controlledMonth,
  onMonthChange,
  ...props 
}: CalendarProps) {
  const selectedValue = (props as any).selected;
  const [viewMode, setViewMode] = React.useState<ViewMode>("days");
  const [decadeStart, setDecadeStart] = React.useState<number>(() => {
    const year = controlledMonth?.getFullYear() || new Date().getFullYear();
    return Math.floor(year / 10) * 10;
  });
  const [internalMonth, setInternalMonth] = React.useState<Date>(() => {
    if (controlledMonth) return controlledMonth;
    if (selectedValue instanceof Date) return selectedValue;
    if (selectedValue?.from instanceof Date) return selectedValue.from;
    return new Date();
  });

  React.useEffect(() => {
    if (controlledMonth) {
      setInternalMonth(controlledMonth);
      return;
    }

    if (selectedValue instanceof Date) {
      setInternalMonth(selectedValue);
      return;
    }

    if (selectedValue?.from instanceof Date) {
      setInternalMonth(selectedValue.from);
    }
  }, [controlledMonth, selectedValue]);

  const currentMonth = controlledMonth || internalMonth;
  const currentYear = currentMonth.getFullYear();
  const currentMonthIndex = currentMonth.getMonth();

  const handleMonthChange = (newMonth: Date) => {
    setInternalMonth(newMonth);
    onMonthChange?.(newMonth);
  };

  const handlePrevious = () => {
    if (viewMode === "days") {
      const newDate = new Date(currentYear, currentMonthIndex - 1, 1);
      handleMonthChange(newDate);
    } else if (viewMode === "months") {
      const newDate = new Date(currentYear - 1, currentMonthIndex, 1);
      handleMonthChange(newDate);
    } else if (viewMode === "years") {
      setDecadeStart(prev => prev - 10);
    }
  };

  const handleNext = () => {
    if (viewMode === "days") {
      const newDate = new Date(currentYear, currentMonthIndex + 1, 1);
      handleMonthChange(newDate);
    } else if (viewMode === "months") {
      const newDate = new Date(currentYear + 1, currentMonthIndex, 1);
      handleMonthChange(newDate);
    } else if (viewMode === "years") {
      setDecadeStart(prev => prev + 10);
    }
  };

  const handleHeaderClick = () => {
    if (viewMode === "days") {
      setViewMode("months");
    } else if (viewMode === "months") {
      setDecadeStart(Math.floor(currentYear / 10) * 10);
      setViewMode("years");
    }
  };

  const handleMonthSelect = (monthIndex: number) => {
    const newDate = new Date(currentYear, monthIndex, 1);
    handleMonthChange(newDate);
    setViewMode("days");
  };

  const handleYearSelect = (year: number) => {
    const newDate = new Date(year, currentMonthIndex, 1);
    handleMonthChange(newDate);
    setViewMode("months");
  };

  // Get years for current decade (10 years)
  const getDecadeYears = () => {
    const years: number[] = [];
    const decadeEnd = decadeStart + 9;
    for (let year = decadeStart; year <= decadeEnd; year++) {
      if (year >= fromYear && year <= toYear) {
        years.push(year);
      }
    }
    return years;
  };

  // Check if can navigate to previous/next decade
  const canGoPrevDecade = decadeStart > fromYear;
  const canGoNextDecade = decadeStart + 10 <= toYear;

  const getHeaderText = () => {
    if (viewMode === "days") {
      return `${MONTHS_FULL_PT[currentMonthIndex]} ${currentYear}`;
    } else if (viewMode === "months") {
      return `${currentYear}`;
    } else {
      const decadeEnd = Math.min(decadeStart + 9, toYear);
      return `${decadeStart} - ${decadeEnd}`;
    }
  };

  // Fixed container dimensions for consistent sizing
  const containerClass = "w-[280px] min-h-[300px] p-3 pointer-events-auto";

  // Render months grid (3 cols x 4 rows = 12)
  if (viewMode === "months") {
    return (
      <div className={cn(containerClass, className)}>
        <div className="flex justify-center pt-1 relative items-center mb-4">
          <button
            type="button"
            onClick={handlePrevious}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute left-1"
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleHeaderClick}
            className="text-sm font-medium hover:bg-accent px-3 py-1 rounded-md transition-colors cursor-pointer"
          >
            {getHeaderText()}
          </button>
          <button
            type="button"
            onClick={handleNext}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute right-1"
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {MONTHS_PT.map((month, index) => (
            <button
              key={month}
              type="button"
              onClick={() => handleMonthSelect(index)}
              className={cn(
                "h-[52px] w-full rounded-md border border-input text-sm font-medium transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                "focus:outline-none focus:ring-2 focus:ring-ring",
                index === currentMonthIndex && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
              )}
            >
              {month}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Render years grid (5 cols x 2 rows = 10)
  if (viewMode === "years") {
    const years = getDecadeYears();
    return (
      <div className={cn(containerClass, className)}>
        <div className="flex justify-center pt-1 relative items-center mb-4">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={!canGoPrevDecade}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute left-1",
              !canGoPrevDecade && "opacity-20 cursor-not-allowed hover:opacity-20"
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium px-3 py-1">
            {getHeaderText()}
          </span>
          <button
            type="button"
            onClick={handleNext}
            disabled={!canGoNextDecade}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute right-1",
              !canGoNextDecade && "opacity-20 cursor-not-allowed hover:opacity-20"
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {years.map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => handleYearSelect(year)}
              className={cn(
                "h-[52px] w-full rounded-md border border-input text-sm font-medium transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                "focus:outline-none focus:ring-2 focus:ring-ring",
                year === currentYear && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
              )}
            >
              {year}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Render days (default DayPicker)
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      month={currentMonth}
      onMonthChange={handleMonthChange}
      className={cn(containerClass, className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium hidden",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(buttonVariants({ variant: "ghost" }), "h-9 w-9 p-0 font-normal aria-selected:opacity-100"),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
        Caption: ({ displayMonth }) => (
          <div className="flex justify-center pt-1 relative items-center w-full">
            <button
              type="button"
              onClick={handlePrevious}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute left-1"
              )}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleHeaderClick}
              className="text-sm font-medium hover:bg-accent px-3 py-1 rounded-md transition-colors cursor-pointer"
            >
              {MONTHS_FULL_PT[displayMonth.getMonth()]} {displayMonth.getFullYear()}
            </button>
            <button
              type="button"
              onClick={handleNext}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute right-1"
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
