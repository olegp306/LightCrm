export type OutreachColumnTouch = {
  occurredAt: Date;
};

export function latestOutreachAt<TTouch extends OutreachColumnTouch>(touches: TTouch[], fallback: Date | null = null): Date | null {
  const latest = touches.reduce<Date | null>((current, touch) => {
    if (!current || touch.occurredAt > current) {
      return touch.occurredAt;
    }
    return current;
  }, null);
  return latest ?? fallback;
}

export function outreachTouchLabel(touches: OutreachColumnTouch[]): string | null {
  return touches.length > 0 ? `Touch ${touches.length}` : null;
}
