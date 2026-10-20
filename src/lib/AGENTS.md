# src/lib rules
- Multi-property CSV import (household-import.ts planner + import_household_batch RPC) stays behind HOUSEHOLD_IMPORT_ENABLED until its review SQL is applied; imports hold enrichment server-side via enrichment_intake_holds and rollback = flag off, never purge — keeps evidence and spend explicit.
