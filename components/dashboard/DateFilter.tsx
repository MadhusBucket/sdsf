"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateFilterProps {
  selectedDate: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
}

export function DateFilter({ selectedDate, onDateChange }: DateFilterProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={`h-11 w-11 border-gray-300 bg-white${selectedDate ? " border-blue-400 text-blue-600" : ""}`}
        >
          <CalendarIcon className="h-4 w-4 shrink-0" />
          <span className="sr-only">
            {selectedDate ? format(selectedDate, "dd MMM yyyy") : "Filter by Date"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            onDateChange(date);
            setOpen(false);
          }}
          initialFocus
        />
        {selectedDate && (
          <div className="border-t p-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onDateChange(undefined);
                setOpen(false);
              }}
            >
              <X className="mr-2 h-4 w-4" />
              Clear Filter
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
