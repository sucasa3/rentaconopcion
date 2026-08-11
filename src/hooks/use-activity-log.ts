import { useCallback, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { logHomeownerActivity } from "@/lib/activity.functions";

type EventType =
  | "value_viewed"
  | "value_refreshed"
  | "equity_opened"
  | "refi_opened"
  | "home_score_opened"
  | "maintenance_opened"
  | "document_uploaded"
  | "maintenance_logged"
  | "service_request_submitted";

/**
 * Fire-and-forget behavioral logging from the homeowner dashboard.
 * Never blocks the UI and never surfaces an error to the user.
 */
export function useActivityLog() {
  const log = useServerFn(logHomeownerActivity);

  return useCallback(
    (eventType: EventType, context?: Record<string, unknown>) => {
      void log({ data: { eventType, context } }).catch(() => {});
    },
    [log],
  );
}

/** Log a single event once per mount (e.g. a panel becoming visible). */
export function useLogOnMount(eventType: EventType, context?: Record<string, unknown>) {
  const log = useActivityLog();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    log(eventType, context);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
