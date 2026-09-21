/**
 * Square-root scale for count bars: one outlier bucket no longer flattens every
 * other one to nothing. Heights are not proportional, so a chart using this must
 * say so.
 */
export function barHeight(value: number, peak: number, maxHeight: number): number {
  if (value <= 0 || peak <= 0 || maxHeight <= 0) return 0;
  const scaled = Math.sqrt(Math.min(value, peak) / peak) * maxHeight;
  // Whatever was counted stays visible, however small its share of the peak.
  return Math.max(1, scaled);
}
