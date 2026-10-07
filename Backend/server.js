import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';
import cors from 'cors';
import dotenv from 'dotenv';
import db from './database.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = 5000;
let liveStockPrices = {};
let isPullInProgress = false;

// 1. Ingest live prices from Mock BSE (port 4000)
const bseSocket = ClientIO('http://localhost:4000');

bseSocket.on('connect', () => {
  console.log('Connected to Mock BSE Exchange Feed');
});

bseSocket.on('bse_ticker_update', (stocks) => {
  stocks.forEach((s) => {
    liveStockPrices[s.symbol] = s.price;
  });
  // Broadcast ticker updates to connected clients
  io.emit('market_update', stocks);
});

// Root Health Route
app.get('/', (req, res) => {
  res.send('Arham Trades Backend & Socket Engine is running.');
});

// REST Endpoints: Portfolio & Account
app.get('/api/account', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = 1').get();
  const holdings = db.prepare('SELECT * FROM holdings WHERE user_id = 1').all();
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = 1 ORDER BY timestamp DESC LIMIT 20').all();

  res.json({ user, holdings, orders });
});

// REST Endpoints: Assessment Trades Ledger
app.get('/api/trades', (req, res) => {
  try {
    // Check if trades table exists; fallback gracefully if schema is still creating
    const trades = db.prepare('SELECT * FROM trades ORDER BY timestamp DESC LIMIT 100').all();
    const countRow = db.prepare('SELECT count(*) as count FROM trades').get();
    const statusRow = db.prepare('SELECT * FROM pull_sync_meta WHERE id = 1').get();

    res.json({
      totalCount: countRow?.count || 0,
      isPullInProgress,
      syncStatus: statusRow || { status: isPullInProgress ? 'PULLING' : 'IDLE' },
      trades: trades || []
    });
  } catch (err) {
    // Fallback if table not queried yet
    res.json({
      totalCount: 0,
      isPullInProgress,
      syncStatus: { status: 'IDLE' },
      trades: []
    });
  }
});

// Asynchronous Chunked BSE Pull (Avoids 30s timeout)
app.post('/api/pull-trades', async (req, res) => {
  if (isPullInProgress) {
    return res.status(409).json({ message: 'A pull operation is already in progress.' });
  }

  isPullInProgress = true;
  try {
    db.prepare("UPDATE pull_sync_meta SET status = 'PULLING' WHERE id = 1").run();
  } catch (e) {
    // table check safeguard
  }

  io.emit('pull_status_change', { status: 'PULLING' });

  // Respond immediately so HTTP connection is never held open
  res.json({ status: 'initiated', message: 'Pull initiated in background' });

  // Background worker loop
  (async () => {
    try {
      let offset = 0;
      const limit = 500;
      let hasMore = true;
      let imported = 0;

      const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO trades (trade_id, client, symbol, quantity, price, timestamp)
        VALUES (@trade_id, @client, @symbol, @quantity, @price, @timestamp)
      `);

      while (hasMore) {
        const response = await fetch(`http://localhost:4000/getTrades?offset=${offset}&limit=${limit}`);
        if (!response.ok) throw new Error(`BSE API returned ${response.status}`);
        const data = await response.json();

        const insertBatch = db.transaction((rows) => {
          for (const row of rows) insertStmt.run(row);
        });
        insertBatch(data.trades);

        imported += data.trades.length;
        offset += limit;
        hasMore = data.hasMore;

        io.emit('pull_progress', { imported, total: data.total });
      }

      db.prepare(`
        UPDATE pull_sync_meta 
        SET status = 'COMPLETED', total_records = (SELECT count(*) FROM trades), last_pulled_at = CURRENT_TIMESTAMP 
        WHERE id = 1
      `).run();

      const latestTrades = db.prepare('SELECT * FROM trades ORDER BY timestamp DESC LIMIT 100').all();
      const totalCount = db.prepare('SELECT count(*) as count FROM trades').get().count;

      io.emit('pull_completed', { totalCount, trades: latestTrades });
    } catch (err) {
      console.error('BSE Pull failed:', err);
      try {
        db.prepare("UPDATE pull_sync_meta SET status = 'FAILED' WHERE id = 1").run();
      } catch (e) {}
      io.emit('pull_status_change', { status: 'FAILED', error: err.message });
    } finally {
      isPullInProgress = false;
    }
  })();
});

// Execute BUY or SELL order with SQLite transaction safety
app.post('/api/trade', (req, res) => {
  const { symbol, order_type, quantity } = req.body;
  const qty = parseInt(quantity, 10);
  const currentPrice = liveStockPrices[symbol];

  if (!currentPrice || qty <= 0) {
    return res.status(400).json({ error: 'Invalid trade request or stock price unavailable' });
  }

  const totalAmount = parseFloat((currentPrice * qty).toFixed(2));

  const executeTrade = db.transaction(() => {
    const user = db.prepare('SELECT * FROM users WHERE id = 1').get();

    if (order_type === 'BUY') {
      if (user.cash_balance < totalAmount) {
        throw new Error('Insufficient funds to complete order');
      }
      db.prepare('UPDATE users SET cash_balance = cash_balance - ? WHERE id = 1').run(totalAmount);

      const existing = db.prepare('SELECT * FROM holdings WHERE user_id = 1 AND symbol = ?').get(symbol);
      if (existing) {
        const newQty = existing.quantity + qty;
        const newAvg = ((existing.quantity * existing.average_buy_price) + totalAmount) / newQty;
        db.prepare('UPDATE holdings SET quantity = ?, average_buy_price = ? WHERE id = ?')
          .run(newQty, parseFloat(newAvg.toFixed(2)), existing.id);
      } else {
        db.prepare('INSERT INTO holdings (user_id, symbol, quantity, average_buy_price) VALUES (1, ?, ?, ?)')
          .run(symbol, qty, currentPrice);
      }
    } else if (order_type === 'SELL') {
      const existing = db.prepare('SELECT * FROM holdings WHERE user_id = 1 AND symbol = ?').get(symbol);
      if (!existing || existing.quantity < qty) {
        throw new Error('Insufficient shares to sell');
      }
      db.prepare('UPDATE users SET cash_balance = cash_balance + ? WHERE id = 1').run(totalAmount);

      if (existing.quantity === qty) {
        db.prepare('DELETE FROM holdings WHERE id = ?').run(existing.id);
      } else {
        db.prepare('UPDATE holdings SET quantity = quantity - ? WHERE id = ?').run(qty, existing.id);
      }
    }

    db.prepare('INSERT INTO orders (user_id, symbol, order_type, quantity, price, total_amount) VALUES (1, ?, ?, ?, ?, ?)')
      .run(symbol, order_type, qty, currentPrice, totalAmount);
  });

  try {
    executeTrade();
    io.emit('trade_executed', { symbol, order_type, quantity: qty, price: currentPrice });
    res.json({ success: true, message: `${order_type} order executed for ${qty} shares of ${symbol}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});