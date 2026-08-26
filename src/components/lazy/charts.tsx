"use client";

import dynamic from "next/dynamic";
import type { ComponentProps, ComponentType } from "react";

import type { MixChart as MixChartImpl } from "@/components/charts/mix-chart";
import type { VolumeChart as VolumeChartImpl } from "@/components/charts/volume-chart";
import { ChartPending } from "@/components/lazy/pending";

/**
 * The two analytics charts, deferred off the first load.
 *
 * `next experimental-analyze` puts recharts and the d3, decimal.js-light,
 * immer and redux-toolkit modules it drags behind it as the largest single
 * dependency in this app's client bundle — larger than the Supabase client,
 * larger than motion. Nothing on the dictation path touches any of it. It was
 * on the critical path only because these two cards happen to sit on the same
 * screen as the record key.
 *
 * `ssr: false` rather than a server-rendered dynamic import, for two reasons
 * that both point the same way. Recharts sizes itself from a measured DOM box,
 * so its server render is an empty frame either way — the SSR pass buys no
 * pixels. And a dynamic import that *is* server-rendered has its chunk
 * preloaded alongside the document, which is the cost we are trying to move.
 *
 * Deliberately not gated on scroll position. These load as soon as hydration is
 * done, while the page is fresh and the network is known good, rather than at
 * whatever moment the doctor scrolls — which on a clinic phone may be after the
 * signal has gone.
 */

const loadVolumeChart = () => import("@/components/charts/volume-chart");
const loadMixChart = () => import("@/components/charts/mix-chart");

export const VolumeChart: ComponentType<ComponentProps<typeof VolumeChartImpl>> = dynamic(
  () => loadVolumeChart().then((mod) => mod.VolumeChart),
  {
    ssr: false,
    // One series, so `ChartFrame` draws no legend; the chart trails its own
    // "N today" line. Both flags are here to make the placeholder the same
    // height as what replaces it.
    loading: () => <ChartPending title="patient volume" footer />,
  },
);

export const MixChart: ComponentType<ComponentProps<typeof MixChartImpl>> = dynamic(
  () => loadMixChart().then((mod) => mod.MixChart),
  {
    ssr: false,
    loading: () => <ChartPending title="patient mix" legend />,
  },
);

/**
 * Start both chart chunks without rendering either.
 *
 * For a caller that knows the doctor is heading for the overview — a tab about
 * to be switched to, a prefetch on hover — and would rather the cards were
 * already there.
 */
export function preloadCharts(): void {
  void loadVolumeChart();
  void loadMixChart();
}
