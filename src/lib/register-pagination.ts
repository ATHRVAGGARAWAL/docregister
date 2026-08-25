/** Pagination copy used by the UI and kept pure so boundary cases stay tested. */
export function registerPageRange(totalCount: number, offset: number, pageLength: number): {
  from: number;
  to: number;
  hasMore: boolean;
} {
  const total = Math.max(0, Math.floor(totalCount));
  const start = Math.max(0, Math.floor(offset));
  const length = Math.max(0, Math.floor(pageLength));
  return {
    from: total === 0 || start >= total ? 0 : start + 1,
    to: total === 0 || start >= total ? 0 : Math.min(start + length, total),
    hasMore: start + length < total,
  };
}
