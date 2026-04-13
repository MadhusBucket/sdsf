"use client";

import type { DocumentType } from "@/lib/types/database";
import { cn } from "@/lib/utils";

interface DocumentToggleProps {
  value: DocumentType;
  onChange: (value: DocumentType) => void;
}

export function DocumentToggle({ value, onChange }: DocumentToggleProps) {
  return (
    <div className="grid h-11 w-full grid-cols-2 rounded-full border bg-muted p-1">
      <button
        type="button"
        onClick={() => onChange("quotation")}
        className={cn(
          "rounded-full px-6 py-2 text-sm font-medium transition-colors",
          value === "quotation"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground"
        )}
      >
        Quotations
      </button>
      <button
        type="button"
        onClick={() => onChange("invoice")}
        className={cn(
          "rounded-full px-6 py-2 text-sm font-medium transition-colors",
          value === "invoice"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground"
        )}
      >
        Invoices
      </button>
    </div>
  );
}
