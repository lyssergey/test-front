"use client";

import { Select as RadixSelect } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "./cn";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  disabled,
  className,
  ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RadixSelect.Trigger
        aria-label={ariaLabel}
        className={cn(
          "border-line inline-flex h-8 min-w-0 items-center justify-between gap-1.5 rounded border",
          "bg-surface text-ink hover:border-line-strong px-2 text-sm",
          "data-[placeholder]:text-ink-faint disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        <RadixSelect.Value placeholder={placeholder} className="truncate" />
        <RadixSelect.Icon>
          <ChevronDown className="text-ink-faint size-3.5 shrink-0" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className={cn(
            "border-line z-50 max-h-72 scrollbar-thin overflow-y-auto rounded-md border",
            "bg-surface-2 p-1 shadow-xl shadow-black/40",
          )}
        >
          <RadixSelect.Viewport>
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                className={cn(
                  "text-ink flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm",
                  "data-[highlighted]:bg-surface-3 data-[highlighted]:outline-none",
                )}
              >
                <RadixSelect.ItemIndicator>
                  <Check className="text-accent size-3.5" />
                </RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                {option.hint ? (
                  <span className="text-2xs text-ink-faint ml-auto font-mono">{option.hint}</span>
                ) : null}
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
