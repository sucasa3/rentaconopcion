UPDATE public.attom_endpoint_health
SET enabled = false,
    note = COALESCE(note, '') || ' Disabled while account entitlement is restored.',
    updated_at = now()
WHERE enabled = true;