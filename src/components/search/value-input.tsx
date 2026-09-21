"use client";

import { useEnum } from "@/lib/api/queries";
import type { FieldDef } from "@/lib/api/types";
import { arityOf } from "@/lib/filter";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/** Enum labels come from `/v1/meta/enums/{enum_name}`; `sensor` has none, so its own list is used. */
export function ValueInput({
  field,
  op,
  values,
  onChange,
  disabled,
}: {
  field: FieldDef | undefined;
  op: FieldDef["operators"][number];
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}) {
  const enumQuery = useEnum(field?.enum_name);
  const arity = arityOf(op);

  if (arity === "none") {
    return <span className="text-ink-faint self-center text-xs">no value needed</span>;
  }

  const options =
    enumQuery.data?.values.map((value) => ({
      value: value.value,
      label: value.label,
      ...(value.description !== undefined ? { hint: value.value } : {}),
    })) ?? field?.enum?.map((value) => ({ value, label: value }));

  if (arity === "one" && options && op === "eq") {
    return (
      <Select
        ariaLabel="Value"
        value={values[0] ?? ""}
        onValueChange={(next) => onChange([next])}
        options={options}
        disabled={disabled}
        className="min-w-44 flex-1"
      />
    );
  }

  if (arity === "two") {
    return (
      <div className="flex flex-1 items-center gap-1.5">
        <Input
          aria-label="Lower bound"
          placeholder="from"
          value={values[0] ?? ""}
          disabled={disabled}
          onChange={(event) => onChange([event.target.value, values[1] ?? ""])}
          className="tabular flex-1"
        />
        <span className="text-ink-faint text-xs">…</span>
        <Input
          aria-label="Upper bound"
          placeholder="to"
          value={values[1] ?? ""}
          disabled={disabled}
          onChange={(event) => onChange([values[0] ?? "", event.target.value])}
          className="tabular flex-1"
        />
      </div>
    );
  }

  if (arity === "many") {
    return (
      <Input
        aria-label="Values, comma separated"
        placeholder={`${field?.example ?? "value"}, …`}
        value={values.join(", ")}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.split(",").map((part) => part.trim()))}
        className="flex-1"
      />
    );
  }

  return (
    <Input
      aria-label="Value"
      placeholder={field?.example ?? "value"}
      value={values[0] ?? ""}
      disabled={disabled}
      onChange={(event) => onChange([event.target.value])}
      className="flex-1"
    />
  );
}
