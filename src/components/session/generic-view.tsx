"use client";

import type { ProtocolSchema } from "@/lib/api/types";
import { buildSchemaView } from "@/lib/decoded/schema-view";

import { DecodedValue } from "./value";

/**
 * The view every protocol without a hand-written one gets.
 *
 * Nothing here knows any protocol: sections come from `/v1/meta/schema/{protocol}`,
 * so a decoder that grows a field shows it without a UI change.
 */
export function GenericProtocolView({
  decoded,
  schema,
}: {
  decoded: Record<string, unknown>;
  schema: ProtocolSchema;
}) {
  const view = buildSchemaView(decoded, schema);

  return (
    <div data-testid="generic-view" className="space-y-3 p-3">
      <p className="text-2xs text-ink-faint">
        Laid out from the schema at{" "}
        <code className="font-mono">/v1/meta/schema/{schema.protocol}</code>
        {" · "}decoders {schema.decoder_versions.join(", ")}
      </p>

      {view.sections.map((section) =>
        section.kind === "fields" ? (
          <section key={section.key}>
            <h3 className="text-2xs text-ink-faint mb-1 tracking-wide uppercase">
              {section.title}
            </h3>
            <dl className="grid grid-cols-[minmax(8rem,14rem)_1fr] gap-x-3 gap-y-1 text-xs">
              {section.entries
                .filter((entry) => entry.values.length > 0)
                .map((entry) => (
                  <div
                    key={entry.path}
                    className="col-span-2 grid grid-cols-subgrid items-baseline"
                  >
                    <dt className="text-ink-faint" title={entry.path}>
                      {entry.title}
                    </dt>
                    <dd className="text-ink min-w-0">
                      {entry.isList ? (
                        <span className="flex flex-wrap gap-1">
                          {entry.values.map((value, index) => (
                            <span
                              key={index}
                              className="bg-surface-2 text-2xs rounded px-1.5 py-0.5 font-mono"
                            >
                              <DecodedValue
                                value={value}
                                type={entry.type}
                                {...(entry.unit !== undefined ? { unit: entry.unit } : {})}
                                sensitive={entry.sensitive}
                              />
                            </span>
                          ))}
                        </span>
                      ) : (
                        <DecodedValue
                          value={entry.values[0]}
                          type={entry.type}
                          {...(entry.unit !== undefined ? { unit: entry.unit } : {})}
                          sensitive={entry.sensitive}
                        />
                      )}
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
        ) : (
          <section key={section.key}>
            <h3 className="text-2xs text-ink-faint mb-1 tracking-wide uppercase">
              {section.title} <span className="text-ink-faint">({section.rows.length})</span>
            </h3>
            <div className="border-line scrollbar-thin overflow-x-auto rounded border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-line bg-surface-2 border-b">
                    {section.columns.map((column) => (
                      <th
                        key={column.path}
                        title={column.path}
                        className="text-2xs text-ink-faint px-2 py-1 text-left font-medium tracking-wide uppercase"
                      >
                        {column.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-line/50 border-b last:border-0">
                      {row.map((cell, cellIndex) => {
                        const column = section.columns[cellIndex];
                        return (
                          <td
                            key={cellIndex}
                            className="text-ink max-w-[22rem] px-2 py-1 align-top"
                          >
                            <DecodedValue
                              value={cell}
                              type={column?.type}
                              {...(column?.unit !== undefined ? { unit: column.unit } : {})}
                              sensitive={column?.sensitive}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ),
      )}

      {view.undocumented.length > 0 ? (
        <section>
          <h3 className="text-2xs text-medium mb-1 tracking-wide uppercase">
            Not in the schema ({view.undocumented.length})
          </h3>
          <dl className="grid grid-cols-[minmax(8rem,14rem)_1fr] gap-x-3 gap-y-1 text-xs">
            {view.undocumented.map((entry) => (
              <div key={entry.key} className="col-span-2 grid grid-cols-subgrid items-baseline">
                <dt className="text-ink-faint font-mono">{entry.key}</dt>
                <dd className="text-ink min-w-0">
                  <DecodedValue value={entry.value} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {view.mismatched.length > 0 ? (
        <section>
          <h3 className="text-2xs text-medium mb-1 tracking-wide uppercase">
            Shape differs from the schema ({view.mismatched.length})
          </h3>
          <p className="text-2xs text-ink-faint mb-1">
            This decoder version publishes these keys differently from the declared paths, so they
            are shown as they arrived.
          </p>
          <dl className="grid grid-cols-[minmax(8rem,14rem)_1fr] gap-x-3 gap-y-1 text-xs">
            {view.mismatched.map((entry) => (
              <div key={entry.key} className="col-span-2 grid grid-cols-subgrid items-baseline">
                <dt className="text-ink-faint font-mono">{entry.key}</dt>
                <dd className="text-ink min-w-0">
                  <DecodedValue value={entry.value} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {view.sections.length === 0 ? (
        <p className="text-ink-faint text-xs">The decoder returned nothing for this session.</p>
      ) : null}
    </div>
  );
}
