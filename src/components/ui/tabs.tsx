"use client";

import { Tabs as RadixTabs } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "./cn";

export function Tabs({
  value,
  onValueChange,
  items,
  children,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  items: { value: string; label: ReactNode; disabled?: boolean }[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RadixTabs.List className="border-line flex items-center gap-0.5 border-b px-1">
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className={cn(
              "text-ink-muted -mb-px border-b-2 border-transparent px-3 py-2 text-xs",
              "hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {children}
    </RadixTabs.Root>
  );
}

export const TabPanel = RadixTabs.Content;
