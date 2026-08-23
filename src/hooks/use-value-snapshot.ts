import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { captureValueSnapshot } from "@/lib/home-timeline.functions";

/**
 * Quietly records today's estimated value so the home builds a value history
 * over time. It writes a number already on screen — never an extra property
 * lookup — and at most once per day per home.
 */
export function useValueSnapshot(value: number | null | undefined, address: string | null) {
  const capture = useServerFn(captureValueSnapshot);
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !value || value <= 0) return;
    done.current = true;
    void capture({
      data: { value, source: "dashboard", addressNormalized: address ?? null },
    }).catch(() => {
      /* history is a nicety — never block the dashboard on it */
    });
  }, [value, address, capture]);
}
