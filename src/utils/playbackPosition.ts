/** Metadata may be absent, zero, NaN, or Infinity while a source is loading. */
export function getPlaybackDuration(...candidates: Array<number | undefined>): number {
  return candidates.find(value => value !== undefined && Number.isFinite(value) && value > 0) ?? 0;
}
