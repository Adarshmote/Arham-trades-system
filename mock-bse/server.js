import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = 4000;

// 1. Live Tickers Basket (10 Stocks)
let stocks = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', price: 2980.50, change: 0 },
  { symbol: 'TCS', name: 'Tata Consultancy Services', price: 4210.00, change: 0 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', price: 1640.25, change: 0 },
  { symbol: 'INFY', name: 'Infosys Ltd', price: 1890.80, change: 0 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', price: 1260.10, change: 0 },
  { symbol: 'TATAMOTORS', name: 'Tata Motors Ltd', price: 975.40, change: 0 },
  { symbol: 'SBIN', name: 'State Bank of India', price: 812.30, change: 0 },
  { symbol: 'ITC', name: 'ITC Ltd', price: 495.60, change: 0 },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', price: 1680.40, change: 0 },
  { symbol: 'LT', name: 'Larsen & Toubro Ltd', price: 3620.00, change: 0 }
];

setInterval(() => {
  stocks = stocks.map((stock) => {
    const deltaPercent = (Math.random() * 0.7 - 0.35) / 100;
    const oldPrice = stock.price;
    const newPrice = parseFloat((oldPrice * (1 + deltaPercent)).toFixed(2));
    const change = parseFloat((newPrice - oldPrice).toFixed(2));
    return { ...stock, price: newPrice, change };
  });
  io.emit('bse_ticker_update', stocks);
}, 1500);

// 2. Seed 2,500 Trade Records for Assessment Ingestion
const CLIENTS = ['Arham Capital', 'Motilal Oswal', 'Zerodha', 'Groww', 'Kotak Sec', 'HDFC Sec', 'ICICI Direct'];
const mockTrades = Array.from({ length: 2500 }, (_, i) => {
  const stock = stocks[Math.floor(Math.random() * stocks.length)];
  const client = CLIENTS[Math.floor(Math.random() * CLIENTS.length)];
  const quantity = Math.floor(Math.random() * 400) + 1;
  const price = parseFloat((stock.price + (Math.random() * 20 - 10)).toFixed(2));
  const timestamp = new Date(Date.now() - Math.floor(Math.random() * 86400000)).toISOString();
  return {
    trade_id: `BSE-${100000 + i}`,
    client,
    symbol: stock.symbol,
    quantity,
    price,
    timestamp
  };
});

// 3. Chunked /getTrades API Endpoint (prevents 30s timeout)
app.get('/getTrades', async (req, res) => {
  const offset = parseInt(req.query.offset || '0', 10);
  const limit = parseInt(req.query.limit || '500', 10);

  // Short delay per batch to simulate processing
  await new Promise((resolve) => setTimeout(resolve, 300));

  const slice = mockTrades.slice(offset, offset + limit);
  const hasMore = offset + limit < mockTrades.length;

  res.json({
    total: mockTrades.length,
    offset,
    limit,
    hasMore,
    trades: slice
  });
});

app.get('/stocks', (req, res) => res.json(stocks));

server.listen(PORT, () => {
  console.log(`Mock BSE Exchange running on http://localhost:${PORT}`);
});