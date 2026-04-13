"use client";

import type { DocumentStatus } from "@/lib/types/database";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type StatusFilterValue = "all" | DocumentStatus;

interface StatusFilterProps {
  value: StatusFilterValue;
  onChange: (value: StatusFilterValue) => void;
}

export function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as StatusFilterValue)}>
      <SelectTrigger className="h-11 gap-1.5 border-gray-300 bg-white">
        <span className="text-muted-foreground">Status:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All</SelectItem>
        <SelectItem value="draft">Draft</SelectItem>
        <SelectItem value="sent">Sent</SelectItem>
        <SelectItem value="paid">Paid</SelectItem>
        <SelectItem value="void">Cancelled</SelectItem>
        <SelectItem value="superseded">Superseded</SelectItem>
        <SelectItem value="replaced">Replaced</SelectItem>
      </SelectContent>
    </Select>
  );
}
