"use client";

import { Checkbox as RadixCheckbox } from "radix-ui";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "./cn";

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "text-ink flex cursor-pointer items-center gap-2 text-sm select-none",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <RadixCheckbox.Root
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        disabled={disabled}
        className={cn(
          "border-line-strong flex size-4 shrink-0 items-center justify-center rounded border",
          "bg-surface data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        )}
      >
        <RadixCheckbox.Indicator>
          <Check className="text-bg size-3" strokeWidth={3} />
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      {label}
    </label>
  );
}
