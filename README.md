# BSE Trades Real-Time Ingestion Engine & Dashboard

An event-driven trade synchronization dashboard designed to solve the 30-second network proxy wall during 15-minute simulated BSE exchange pulls without polling loops or page refreshes.

---

## Technical Stack
- **Mock Exchange API:** Node.js, Express (Chunked batch cursor ingestion)
- **Backend Service:** Node.js, Express, SQLite (`better-sqlite3`), Socket.IO
- **Frontend Dashboard:** React (Vite), Tailwind CSS, Socket.IO-Client, Lucide Icons

---

## Key Constraints Solved
1. **Handling 15-Minute BSE Ingestion vs. 30-Second Timeout Wall:**
   Instead of a blocking monolithic HTTP call that gets killed after 30s by network proxies, the backend worker queries `GET /getTrades` using cursor-based batches (e.g., 500 records per call). Each request finishes in 1–2 seconds, staying safely under the 30-second limit while scaling to multi-minute sync pipelines.
2. **Instant Dashboard Open:**
   On mount, the React client instantly reads previously synced trades from SQLite via `GET /api/trades`.
3. **Zero Polling / Zero Cron Jobs:**
   Updates are pushed from server to client over a persistent WebSocket (`Socket.IO`) connection upon completion of the ingestion job. No `setInterval` loops or cron jobs.

---

## Quickstart Guide

### Prerequisites
- Node.js (v18 or higher)
- npm

### Installation & Launch

1. **Clone the repository:**
   ```bash
   git clone [[(https://github.com/Adarshmote/Arham-trades-system)]

2.**Install all dependencies:**
npm run install:all

3.**Run all services concurrently:**
npm run dev
