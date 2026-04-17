"use client";

import { Copy, Trash2 } from "lucide-react";

import { useDocumentStore } from "@/lib/stores/documentStore";
import type { Unit } from "@/lib/types/database";
import { formatIndianCurrency } from "@/lib/utils/formatting";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const UNIT_OPTIONS: Unit[] = [
  "SFT",
  "RFT",
  "KG",
  "NOS",
  "MT",
  "LTR",
  "BOX",
  "CFT",
  "CUM",
  "TRIP",
];

interface ItemCardProps {
  slNo: number;
}

export function ItemCard({ slNo }: ItemCardProps) {
  const item = useDocumentStore((s) =>
    s.draft.line_items.find((i) => i.sl_no === slNo)
  );
  const updateLineItem = useDocumentStore((s) => s.updateLineItem);
  const duplicateLineItem = useDocumentStore((s) => s.duplicateLineItem);
  const removeLineItem = useDocumentStore((s) => s.removeLineItem);

  if (!item) return null;

  const lumpsum = item.is_lumpsum;
  const greyOut = lumpsum;

  return (
    <Card className="border">
      <CardContent className="space-y-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-muted-foreground">
            #{item.sl_no}
          </span>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => duplicateLineItem(slNo)}
              aria-label="Duplicate line item"
            >
              <Copy className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => removeLineItem(slNo)}
              aria-label="Delete line item"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Input
            placeholder="Item title (e.g., Site Clearance & Debris Removal)"
            value={item.description}
            onChange={(e) =>
              updateLineItem(slNo, { description: e.target.value })
            }
            className="text-sm font-medium"
          />
          <Textarea
            placeholder="Description (optional - e.g., Manual collection and shifting...)"
            value={item.subtext || ""}
            onChange={(e) =>
              updateLineItem(slNo, { subtext: e.target.value })
            }
            rows={2}
            className="text-sm text-muted-foreground"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end sm:gap-2">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Qty</span>
            {lumpsum ? (
              <div className="flex h-12 w-full items-center rounded-md border border-input bg-muted px-3 text-base text-muted-foreground select-none">
                -
              </div>
            ) : (
              <Input
                type="number"
                inputMode="decimal"
                className="h-12 min-w-0 flex-1 text-base"
                value={item.qty || ""}
                onChange={(e) =>
                  updateLineItem(slNo, {
                    qty: Number.parseFloat(e.target.value) || 0,
                  })
                }
              />
            )}
          </div>

          <div className="space-y-1.5 sm:min-w-0">
            <span className="text-xs font-medium text-muted-foreground">Unit</span>
            {lumpsum ? (
              <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 text-base text-muted-foreground select-none">
                -
              </div>
            ) : (
              <Select
                value={item.unit}
                onValueChange={(value) =>
                  updateLineItem(slNo, { unit: value as Unit })
                }
              >
                <SelectTrigger className="w-full text-base">
                  <SelectValue placeholder="Unit" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {UNIT_OPTIONS.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Rate</span>
            {lumpsum ? (
              <div className="flex h-12 w-full items-center rounded-md border border-input bg-muted px-3 text-base text-muted-foreground select-none">
                -
              </div>
            ) : (
              <Input
                type="number"
                inputMode="decimal"
                className="h-12 text-base"
                value={item.rate || ""}
                onChange={(e) =>
                  updateLineItem(slNo, {
                    rate: Number.parseFloat(e.target.value) || 0,
                  })
                }
              />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <div className="flex items-center gap-2">
            <Switch
              id={`lumpsum-${slNo}`}
              checked={lumpsum}
              onCheckedChange={(checked) =>
                updateLineItem(slNo, { is_lumpsum: checked })
              }
            />
            <Label
              htmlFor={`lumpsum-${slNo}`}
              className="text-sm font-medium leading-none"
            >
              Lumpsum
            </Label>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Amount</p>
            {lumpsum ? (
              <Input
                type="number"
                inputMode="decimal"
                className="mt-1 h-12 w-36 text-right text-base font-bold"
                value={item.amount || ""}
                onChange={(e) =>
                  updateLineItem(slNo, {
                    amount: Number.parseFloat(e.target.value) || 0,
                  })
                }
              />
            ) : (
              <p className="text-lg font-bold tabular-nums sm:text-xl">
                {formatIndianCurrency(item.amount)}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
