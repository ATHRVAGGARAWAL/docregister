import "server-only";

import type { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Minimal structural type for RPCs introduced by migrations newer than the
 * checked-in generated database types. Keeping the escape hatch in one
 * server-only module avoids scattering `any` casts through route handlers; the
 * normal type generator can learn these functions without changing callers.
 */
export interface WorkflowError {
  code: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

type WorkflowResult<T> = {
  data: T | null;
  error: WorkflowError | null;
};

type WorkflowRpc = <T>(
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<WorkflowResult<T>>;

export async function callWorkflow<T>(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  name: string,
  args: Record<string, unknown>,
): Promise<WorkflowResult<T>> {
  const rpc = supabase.rpc.bind(supabase) as unknown as WorkflowRpc;
  return rpc<T>(name, args);
}
