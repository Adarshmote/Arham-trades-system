# Architecture Note: Resilient Trade Ingestion Engine

## Problem Statement & Constraints
1. **15-Minute Data Pull Window:** BSE full dataset ingestion takes up to 15 minutes.
2. **30-Second Connection Timeout:** Network proxies terminate any idle/active HTTP connection exceeding 30 seconds.
3. **No Polling Loops / Schedulers:** Frontend dashboard cannot query on intervals or use cron schedulers[cite: 1].
4. **Instant View & Seamless Sync:** Cached trades must show immediately; new trades must reflect dynamically without page reloads[cite: 1].

## Architectural Solution

```text
[ Browser / React Dashboard ]
      │ (1) Immediate GET /api/trades (Instant Load)
      ▼
[ Express Backend ] ──(Queries SQLite)──► Instant Response
      │
      │ (2) Persistent WebSocket Handshake (ws://)
      │
      │ (3) Chunked Ingestion Loop (Timeout Protection)
      ▼
[ Ingestion Worker ]
      │
      │ ──► GET /getTrades?batch=1&limit=500  (Executes in 1.5s, <30s wall)
      │ ◄── Returns Batch 1
      │ ──► GET /getTrades?batch=2&limit=500  (Executes in 1.5s, <30s wall)
      │ ◄── Returns Batch 2
      │
      │ (4) Atomically Commit to SQLite
      │
      │ (5) io.emit("trades:pulled", newTrades)
      ▼
[ React Dashboard (State appends in-place, zero refresh) ]
