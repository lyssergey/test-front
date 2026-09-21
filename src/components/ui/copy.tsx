"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { cn } from "./cn";

export function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      title="Copy"
      aria-label="Copy"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className={cn("text-ink-faint hover:text-ink transition-colors", className)}
    >
      {copied ? <Check className="text-low size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}
