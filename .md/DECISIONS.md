# Architecture Decisions

## ADR-001
Decision: Move database from Render (Cloud) to Local PostgreSQL 18.
Reason: Cloud UTC timeframes caused critical bugs with daily streaks rolling over at the wrong time for the user's local timezone. Local DB ensures the server matches the user's machine time.

## ADR-002
Decision: Use raw `pg` library instead of an ORM.
Reason: Reduces overhead and keeps query logic transparent and easy to debug for a simple schema.