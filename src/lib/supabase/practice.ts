import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any -- These tables are introduced by migrations 0029+; generated Supabase types are refreshed after deployment. */

/** Keep the temporary untyped escape hatch for new practice tables in one place. */
export function practiceTable(supabase: unknown, table: string): any {
  return (supabase as { from: (relation: string) => any }).from(table);
}

