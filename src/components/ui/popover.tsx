"use client";

import { Popover as RadixPopover } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "./cn";

export function Popover({
  trigger,
  children,
  className,
  align = "start",
}: {
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
}) {
  return (
    <RadixPopover.Root>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          align={align}
          sideOffset={6}
          className={cn(
            "border-line bg-surface-2 z-50 rounded-md border p-2 shadow-xl shadow-black/40",
            className,
          )}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
