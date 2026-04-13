"use client";

import { Badge } from "@/components/ui/badge";
import type { DocumentStatus } from "@/lib/types/database";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

export type StatusFilterValue = "all" | DocumentStatus;

interface StatusFilterProps {
  value: StatusFilterValue;
  onChange: (value: StatusFilterValue) => void;
}

const STATUS_BADGE_CLASS: Record<DocumentStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700 border-zinc-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  void: "bg-red-100 text-red-700 border-red-200",
  replaced: "bg-purple-100 text-purple-700 border-purple-200",
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Cancelled",
  replaced: "Replaced",
};

export function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as StatusFilterValue)}>
      <SelectTrigger className="h-11 w-36 gap-1.5 border-gray-300 bg-white">
        {value === "all" ? (
          <span>All</span>
        ) : (
          <Badge variant="outline" className={STATUS_BADGE_CLASS[value as DocumentStatus]}>
            {STATUS_LABELS[value as DocumentStatus]}
          </Badge>
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All</SelectItem>
        <SelectItem value="draft">
          <Badge variant="outline" className={STATUS_BADGE_CLASS.draft}>Draft</Badge>
        </SelectItem>
        <SelectItem value="sent">
          <Badge variant="outline" className={STATUS_BADGE_CLASS.sent}>Sent</Badge>
        </SelectItem>
        <SelectItem value="paid">
          <Badge variant="outline" className={STATUS_BADGE_CLASS.paid}>Paid</Badge>
        </SelectItem>
        <SelectItem value="void">
          <Badge variant="outline" className={STATUS_BADGE_CLASS.void}>Cancelled</Badge>
        </SelectItem>
        <SelectItem value="replaced">
          <Badge variant="outline" className={STATUS_BADGE_CLASS.replaced}>Replaced</Badge>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
