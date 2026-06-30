/** Salary payment advance preview (FS — mirrors backend posting). */

export function advanceAppliedPreview(
  cashMinor: number,
  remainingAccrualMinor: number,
  outstandingAdvanceMinor: number,
): number {
  if (outstandingAdvanceMinor <= 0 || remainingAccrualMinor <= 0) return 0;
  const room = remainingAccrualMinor - cashMinor;
  if (room <= 0) return 0;
  return Math.min(outstandingAdvanceMinor, room);
}

export function payableClearedPreview(
  cashMinor: number,
  remainingAccrualMinor: number,
  outstandingAdvanceMinor: number,
): number {
  return (
    cashMinor +
    advanceAppliedPreview(cashMinor, remainingAccrualMinor, outstandingAdvanceMinor)
  );
}
