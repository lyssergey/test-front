import type { Risk, SessionDetection } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";

const SEVERITY_TONE = { low: "low", medium: "medium", high: "high" } as const;

export function Detections({ detections, risk }: { detections: SessionDetection[]; risk: Risk }) {
  if (detections.length === 0 && risk.reasons.length === 0) return null;

  return (
    <div className="flex flex-wrap items-start gap-3">
      {detections.length > 0 ? (
        <div>
          <div className="text-2xs text-ink-faint mb-1 tracking-wide uppercase">Detections</div>
          <ul className="space-y-1">
            {detections.map((detection) => (
              <li key={detection.rule_id} className="flex items-center gap-1.5 text-xs">
                <Badge tone={SEVERITY_TONE[detection.severity]}>{detection.severity}</Badge>
                <span className="text-ink">{detection.rule}</span>
                <span className="text-2xs text-ink-faint">
                  {detection.mitre.technique_id} {detection.mitre.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {risk.reasons.length > 0 ? (
        <div>
          <div className="text-2xs text-ink-faint mb-1 tracking-wide uppercase">
            Why this risk score
          </div>
          <ul className="flex flex-wrap gap-1">
            {risk.reasons.map((reason) => (
              <li key={reason.code}>
                <Badge tone="neutral" title={reason.mitre ?? reason.code}>
                  {reason.label}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
