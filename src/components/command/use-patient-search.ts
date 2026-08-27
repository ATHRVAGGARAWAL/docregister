"use client";

import { useEffect, useRef, useState } from "react";

import type { PatientMatch } from "@/hooks/use-voice-capture";

/**
 * Long enough that a name typed at speed is one request rather than one per
 * letter. `/api/patients` shares the lookup rate-limit bucket with patient
 * matching, so every keystroke that reaches it is a token the doctor cannot
 * spend on confirming a dictation.
 */
const DEBOUNCE_MS = 260;

/** One letter is not a search — it is a request for the whole clinic. */
const MIN_QUERY_LENGTH = 2;

/** The palette shows a handful of names; asking for more spends the same token for nothing. */
const RESULT_LIMIT = 8;

/**
 * Backspacing through a name walks back over queries that were just asked, and
 * without a cache each step is another request. Kept short: a chart created in
 * the next room should not be missing from the palette a minute later.
 */
const CACHE_TTL_MS = 60_000;
const CACHE_LIMIT = 24;

export interface PatientSearchState {
  patients: PatientMatch[];
  loading: boolean;
  /** Already a sentence for a doctor. Never a status code or a fetch message. */
  error: string | null;
  /** The query `patients` is the answer to, which lags the box while typing. */
  resolvedQuery: string;
}

const IDLE: PatientSearchState = { patients: [], loading: false, error: null, resolvedQuery: "" };

interface CacheEntry {
  at: number;
  patients: PatientMatch[];
}

/**
 * Patient names for the palette, debounced and abortable.
 *
 * The in-flight request is aborted whenever the query moves on or the palette
 * closes: the endpoint is rate limited, and a reply to a query the doctor has
 * already typed past is a token spent on a list nobody will read.
 */
export function usePatientSearch(query: string, enabled: boolean): PatientSearchState {
  const trimmed = query.trim();
  const searchable = enabled && trimmed.length >= MIN_QUERY_LENGTH;

  const [state, setState] = useState<PatientSearchState>(IDLE);
  const cache = useRef<Map<string, CacheEntry>>(new Map());

  useEffect(() => {
    if (!searchable) return;

    const cached = cache.current.get(trimmed);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      setState({ patients: cached.patients, loading: false, error: null, resolvedQuery: trimmed });
      return;
    }

    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));

    const timer = setTimeout(() => {
      void searchPatients(trimmed, controller.signal)
        .then((patients) => {
          remember(cache.current, trimmed, patients);
          setState({ patients, loading: false, error: null, resolvedQuery: trimmed });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setState((current) => ({
            ...current,
            loading: false,
            // The previous names stay on screen beneath the message rather than
            // vanishing: a failed search is not evidence that nobody matched.
            error: error instanceof Error && error.message
              ? error.message
              : "Could not search patients. Try again.",
          }));
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchable, trimmed]);

  // Names are surrendered the moment they stop answering the question on
  // screen. `state.patients` survives a query change — the effect keeps them
  // through the debounce so the list does not flicker, and the catch keeps them
  // indefinitely on a failed request — so without this check the rows under a
  // new query are the rows that matched the old one.
  //
  // That is not cosmetic staleness. Palette rows carry `keepUnmatched`, so a
  // patient row survives any filter, and the highlight resets to index 0 when
  // the query changes: type "sun", select all, type "rajesh", lose the network,
  // and Sunita Devi is the only row on screen and the one under Enter. Opening
  // the wrong chart is the failure this whole app is arranged to prevent, so a
  // stale name is worth less than a flicker.
  if (!searchable || state.resolvedQuery !== trimmed) {
    return { ...IDLE, loading: searchable && state.loading, error: searchable ? state.error : null };
  }
  return state;
}

async function searchPatients(query: string, signal: AbortSignal): Promise<PatientMatch[]> {
  const params = new URLSearchParams({ q: query, limit: String(RESULT_LIMIT) });

  let response: Response;
  try {
    response = await fetch(`/api/patients?${params}`, {
      signal,
      headers: { accept: "application/json" },
    });
  } catch (error) {
    // An aborted fetch rejects here too. It is re-thrown untouched so the caller
    // can tell "the doctor typed another letter" from "the network is down".
    if (signal.aborted) throw error;
    throw new Error("Could not reach the server. Check your connection and try again.");
  }

  const payload = (await readJson(response)) as
    | { patients?: PatientMatch[]; error?: unknown }
    | null;

  if (!response.ok) {
    if (response.status === 401) {
      // The dashboard listens for this and puts the session notice on screen —
      // one message about being signed out, not one per surface.
      window.dispatchEvent(new Event("docregister:session-expired"));
      throw new Error("Your session has expired. Sign in again to search.");
    }
    // The API writes its own doctor-facing sentences, including the one for the
    // rate limit; anything else gets a sentence rather than a status code.
    const message = payload?.error;
    throw new Error(typeof message === "string" ? message : "Could not search patients. Try again.");
  }

  return payload?.patients ?? [];
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Newest wins, oldest evicted. A palette open all day should not grow all day. */
function remember(cache: Map<string, CacheEntry>, query: string, patients: PatientMatch[]): void {
  cache.delete(query);
  cache.set(query, { at: Date.now(), patients });
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}
