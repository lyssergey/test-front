"use client";

import { Plus, Trash2 } from "lucide-react";

import type { FieldDef, FilterOp } from "@/lib/api/types";
import {
  arityOf,
  type ConditionDraft,
  type FilterDraft,
  type GroupDraft,
  newCondition,
  newGroup,
  validateCondition,
} from "@/lib/filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

import { ValueInput } from "./value-input";

const OP_LABEL: Record<FilterOp, string> = {
  eq: "is",
  in: "is one of",
  cidr: "in subnet",
  glob: "matches",
  gte: "≥",
  lte: "≤",
  between: "between",
  exists: "exists",
};

function replaceChild(group: GroupDraft, id: string, next: FilterDraft | null): GroupDraft {
  return {
    ...group,
    children: group.children.flatMap((child) => {
      if (child.id === id) return next === null ? [] : [next];
      if (child.kind === "group") return [replaceChild(child, id, next)];
      return [child];
    }),
  };
}

function addToGroup(group: GroupDraft, id: string, child: FilterDraft): GroupDraft {
  if (group.id === id) return { ...group, children: [...group.children, child] };
  return {
    ...group,
    children: group.children.map((current) =>
      current.kind === "group" ? addToGroup(current, id, child) : current,
    ),
  };
}

export function FilterBuilder({
  draft,
  fields,
  onChange,
  disabled,
}: {
  draft: GroupDraft;
  fields: FieldDef[];
  onChange: (next: GroupDraft) => void;
  disabled?: boolean;
}) {
  const byName = new Map(fields.map((field) => [field.name, field]));

  return (
    <GroupEditor
      group={draft}
      depth={0}
      fields={fields}
      byName={byName}
      disabled={disabled}
      onUpdate={(id, next) =>
        onChange(id === draft.id ? (next as GroupDraft) : replaceChild(draft, id, next))
      }
      onAdd={(id, child) => onChange(addToGroup(draft, id, child))}
    />
  );
}

interface EditorProps {
  fields: FieldDef[];
  byName: Map<string, FieldDef>;
  disabled?: boolean;
  onUpdate: (id: string, next: FilterDraft | null) => void;
  onAdd: (groupId: string, child: FilterDraft) => void;
}

function GroupEditor({
  group,
  depth,
  ...rest
}: EditorProps & { group: GroupDraft; depth: number }) {
  const { onUpdate, onAdd, disabled } = rest;

  return (
    <div className={depth > 0 ? "border-line bg-surface-2/50 rounded border p-2" : "space-y-1.5"}>
      <div className="flex items-center gap-1.5">
        <Select
          ariaLabel="Combine conditions with"
          value={group.mode}
          onValueChange={(mode) => onUpdate(group.id, { ...group, mode: mode as "all" | "any" })}
          options={[
            { value: "all", label: "Match all" },
            { value: "any", label: "Match any" },
          ]}
          disabled={disabled}
          className="w-28"
        />
        <Button
          size="sm"
          variant={group.negated ? "danger" : "ghost"}
          disabled={disabled}
          onClick={() => onUpdate(group.id, { ...group, negated: !group.negated })}
          title="Invert this group"
        >
          not
        </Button>
        <span className="text-2xs text-ink-faint">
          {group.children.length === 0
            ? "no conditions — matches everything in the window"
            : `${String(group.children.length)} ${group.children.length === 1 ? "entry" : "entries"}`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => onAdd(group.id, newCondition(rest.fields[0]))}
          >
            <Plus className="size-3" /> condition
          </Button>
          {depth < 2 ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => onAdd(group.id, newGroup(group.mode === "all" ? "any" : "all"))}
            >
              <Plus className="size-3" /> group
            </Button>
          ) : null}
          {depth > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => onUpdate(group.id, null)}
              aria-label="Remove group"
            >
              <Trash2 className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5 pl-1">
        {group.children.map((child) =>
          child.kind === "group" ? (
            <GroupEditor key={child.id} group={child} depth={depth + 1} {...rest} />
          ) : (
            <ConditionEditor key={child.id} condition={child} {...rest} />
          ),
        )}
      </div>
    </div>
  );
}

function ConditionEditor({
  condition,
  fields,
  byName,
  disabled,
  onUpdate,
}: EditorProps & { condition: ConditionDraft }) {
  const field = byName.get(condition.field);
  const problem = validateCondition(condition, field);
  const touched = condition.field !== "" && condition.values.some((value) => value.trim() !== "");

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Select
          ariaLabel="Field"
          value={condition.field}
          onValueChange={(name) => {
            const next = byName.get(name);
            onUpdate(condition.id, {
              ...condition,
              field: name,
              op: next?.operators.includes(condition.op)
                ? condition.op
                : (next?.operators[0] ?? "eq"),
              values: [""],
            });
          }}
          options={fields.map((current) => ({
            value: current.name,
            label: current.label,
            hint: current.name,
          }))}
          disabled={disabled}
          className="w-52"
        />

        <Select
          ariaLabel="Operator"
          value={condition.op}
          onValueChange={(op) =>
            onUpdate(condition.id, {
              ...condition,
              op: op as FilterOp,
              values: arityOf(op as FilterOp) === "two" ? ["", ""] : [""],
            })
          }
          options={(field?.operators ?? ["eq"]).map((op) => ({
            value: op,
            label: OP_LABEL[op],
            hint: op,
          }))}
          disabled={disabled}
          className="w-36"
        />

        <ValueInput
          field={field}
          op={condition.op}
          values={condition.values}
          onChange={(values) => onUpdate(condition.id, { ...condition, values })}
          disabled={disabled}
        />

        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => onUpdate(condition.id, null)}
          aria-label="Remove condition"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      {problem !== null && touched ? (
        <Badge tone="medium" className="ml-1">
          {problem}
        </Badge>
      ) : null}
    </div>
  );
}
