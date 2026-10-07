import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, 'trades.db'));
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    cash_balance REAL DEFAULT 100000.00
  );

  CREATE TABLE IF NOT EXISTS holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    symbol TEXT,
    quantity INTEGER,
    average_buy_price REAL,
    UNIQUE(user_id, symbol),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    symbol TEXT,
    order_type TEXT CHECK(order_type IN ('BUY', 'SELL')),
    quantity INTEGER,
    price REAL,
    total_amount REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  -- Assessment trade ingestion table for BSE data
  CREATE TABLE IF NOT EXISTS trades (
    trade_id TEXT PRIMARY KEY,
    client TEXT,
    symbol TEXT,
    quantity INTEGER,
    price REAL,
    timestamp DATETIME,
    pulled_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Tracks status of background sync ('IDLE', 'PULLING', 'COMPLETED', 'FAILED')
  CREATE TABLE IF NOT EXISTS pull_sync_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    status TEXT,
    total_records INTEGER DEFAULT 0,
    last_pulled_at DATETIME
  );

  INSERT OR IGNORE INTO pull_sync_meta (id, status, total_records) VALUES (1, 'IDLE', 0);
`);

// Insert default user if not already present
const userCount = db.prepare('SELECT count(*) as count FROM users').get();
if (userCount.count === 0) {
  db.prepare('INSERT INTO users (id, username, cash_balance) VALUES (1, ?, ?)').run('Adarsh', 500000.00);
}

export default db;