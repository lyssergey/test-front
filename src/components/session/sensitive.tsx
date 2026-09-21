"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

/** Fields the schema marks `sensitive` stay masked until asked for. */
export function SensitiveValue({ value }: { value: string }) {
  const [shown, setShown] = useState(false);

  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <span className={shown ? "break-all" : "text-ink-faint font-mono select-none"}>
        {shown ? value : "•".repeat(Math.min(value.length, 16))}
      </span>
      <button
        type="button"
        onClick={() => setShown(!shown)}
        aria-label={shown ? "Hide value" : "Reveal value"}
        className="text-ink-faint hover:text-ink shrink-0"
      >
        {shown ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
      </button>
    </span>
  );
}
