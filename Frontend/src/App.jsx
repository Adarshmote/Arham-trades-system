import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000');

export default function App() {
  // Trading states
  const [stocks, setStocks] = useState([]);
  const [account, setAccount] = useState({ user: null, holdings: [], orders: [] });
  const [selectedStock, setSelectedStock] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [tradeAction, setTradeAction] = useState('BUY');
  const [message, setMessage] = useState(null);

  // Assessment Ledger & Pull States
  const [trades, setTrades] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [progress, setProgress] = useState(null);
  const [statusMessage, setStatusMessage] = useState('IDLE');

  const refreshAccount = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/account');
      if (res.ok) {
        const data = await res.json();
        setAccount(data);
      }
    } catch (e) {
      console.error('Account refresh error:', e);
    }
  };

  const triggerBsePull = async () => {
    try {
      setPulling(true);
      setStatusMessage('PULLING');
      await fetch('http://localhost:5000/api/pull-trades', { method: 'POST' });
    } catch (err) {
      console.error('Error triggering pull:', err);
      setPulling(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const accountRes = await fetch('http://localhost:5000/api/account');
        if (accountRes.ok) {
          const accountData = await accountRes.json();
          setAccount(accountData);
        }

        const tradesRes = await fetch('http://localhost:5000/api/trades');
        if (tradesRes.ok) {
          const data = await tradesRes.json();
          const safeTrades = Array.isArray(data?.trades) ? data.trades : [];
          setTrades(safeTrades);
          setTotalCount(data?.totalCount || 0);
          setPulling(Boolean(data?.isPullInProgress));
          setStatusMessage(data?.syncStatus?.status || (data?.isPullInProgress ? 'PULLING' : 'IDLE'));

          if ((data?.totalCount === 0 || safeTrades.length === 0) && !data?.isPullInProgress) {
            triggerBsePull();
          }
        }
      } catch (err) {
        console.error('Error loading dashboard trades:', err);
        setTrades([]);
      }
    };

    init();

    const handleMarketUpdate = (updatedStocks) => {
      setStocks(updatedStocks);
      setSelectedStock((current) => {
        if (!current && updatedStocks.length > 0) return updatedStocks[0];
        if (current) {
          const matched = updatedStocks.find((s) => s.symbol === current.symbol);
          return matched || current;
        }
        return current;
      });
    };

    const handleTradeExecuted = () => {
      refreshAccount();
    };

    const handleStatusChange = (payload) => {
      if (payload?.status) {
        setStatusMessage(payload.status);
        setPulling(payload.status === 'PULLING');
      }
    };

    const handlePullProgress = (payload) => {
      if (payload) {
        setProgress({ imported: payload.imported, total: payload.total });
      }
    };

    const handlePullCompleted = (payload) => {
      setTrades(Array.isArray(payload?.trades) ? payload.trades : []);
      setTotalCount(payload?.totalCount || 0);
      setPulling(false);
      setProgress(null);
      setStatusMessage('COMPLETED');
    };

    socket.on('market_update', handleMarketUpdate);
    socket.on('trade_executed', handleTradeExecuted);
    socket.on('pull_status_change', handleStatusChange);
    socket.on('pull_progress', handlePullProgress);
    socket.on('pull_completed', handlePullCompleted);

    return () => {
      socket.off('market_update', handleMarketUpdate);
      socket.off('trade_executed', handleTradeExecuted);
      socket.off('pull_status_change', handleStatusChange);
      socket.off('pull_progress', handlePullProgress);
      socket.off('pull_completed', handlePullCompleted);
    };
  }, []);

  const handleExecuteTrade = async () => {
    if (!selectedStock) return;
    try {
      const res = await fetch('http://localhost:5000/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedStock.symbol,
          order_type: tradeAction,
          quantity: parseInt(quantity, 10),
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: result.error || 'Trade rejected' });
      } else {
        setMessage({ type: 'success', text: result.message });
        await refreshAccount();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Network trade error' });
    }

    setTimeout(() => setMessage(null), 4000);
  };

  const activeHolding = account.holdings?.find((h) => h.symbol === selectedStock?.symbol);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-slate-800 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-emerald-400">Arham Trades</h1>
          <p className="text-sm text-slate-400">BSE Live Simulation & Order Engine</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-right">
            <span className="text-xs text-slate-400">Total Indexed Trades</span>
            <p className="text-lg font-mono font-bold text-emerald-400">
              {(totalCount || 0).toLocaleString('en-IN')}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-right">
            <p className="text-xs text-slate-400">Available Balance</p>
            <p className="text-lg font-mono font-semibold text-emerald-300">
              ₹{account.user?.cash_balance ? account.user.cash_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
            </p>
          </div>
        </div>
      </header>

      {/* Sync Status Banner */}
      <div className="mt-4 bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2.5 font-sans">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              pulling ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'
            }`}
          />
          <span className="text-slate-300">
            Sync Status: <span className="font-mono uppercase font-bold text-white">{statusMessage}</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          {progress && (
            <span className="text-emerald-400 bg-emerald-950/50 border border-emerald-800 px-2.5 py-1 rounded">
              Ingesting: {progress.imported} / {progress.total}
            </span>
          )}
          <button
            type="button"
            onClick={triggerBsePull}
            disabled={pulling}
            className={`px-3 py-1 rounded font-sans font-semibold transition ${
              pulling
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
            }`}
          >
            {pulling ? 'Pulling...' : 'Sync BSE'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${message.type === 'error' ? 'bg-rose-950/80 text-rose-300 border border-rose-800' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'}`}>
          {message.text}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Market Watch */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col h-[540px]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-semibold text-slate-300">BSE Market Watch</h2>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 px-2.5 py-0.5 rounded border border-emerald-800/60">
              {stocks.length} Live
            </span>
          </div>

          <div 
            tabIndex={0}
            className="space-y-3 overflow-y-scroll pr-1.5 flex-1 focus:outline-none [scrollbar-width:thin] [scrollbar-color:#334155_transparent]"
            style={{ maxHeight: '440px' }}
          >
            {stocks.map((s) => (
              <div
                key={s.symbol}
                onClick={() => setSelectedStock(s)}
                className={`p-3 rounded-xl cursor-pointer flex justify-between items-center transition border ${
                  selectedStock?.symbol === s.symbol
                    ? 'bg-slate-800 border-emerald-500/50'
                    : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/50'
                }`}
              >
                <div>
                  <p className="font-bold text-sm text-slate-200">{s.symbol}</p>
                  <p className="text-xs text-slate-400 truncate max-w-[130px]">{s.name}</p>
                </div>
                <div className="text-right font-mono">
                  <p className="font-semibold text-sm">₹{s.price.toFixed(2)}</p>
                  <p className={`text-xs ${s.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {s.change >= 0 ? `+${s.change.toFixed(2)}` : s.change.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Order Terminal */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between h-[540px]">
          <div>
            <h2 className="text-base font-semibold mb-4 text-slate-300">Terminal Order Form</h2>
            {selectedStock ? (
              <div className="space-y-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex justify-between items-center">
                  <div>
                    <span className="text-xs text-slate-400">Selected Stock</span>
                    <h3 className="text-lg font-bold text-white">{selectedStock.symbol}</h3>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400">Current Tick</span>
                    <p className="text-xl font-mono font-bold text-emerald-400">₹{selectedStock.price.toFixed(2)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTradeAction('BUY')}
                    className={`py-2 rounded-lg font-semibold text-sm transition ${
                      tradeAction === 'BUY' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    BUY
                  </button>
                  <button
                    type="button"
                    onClick={() => setTradeAction('SELL')}
                    className={`py-2 rounded-lg font-semibold text-sm transition ${
                      tradeAction === 'SELL' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    SELL
                  </button>
                </div>

                <div>
                  <label className="text-xs text-slate-400">Order Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 mt-1 font-mono text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 text-xs space-y-1.5 font-mono text-slate-300">
                  <div className="flex justify-between">
                    <span>Holding Quantity:</span>
                    <span>{activeHolding ? activeHolding.quantity : 0} shares</span>
                  </div>
                  <div className="flex justify-between font-bold text-white pt-1 border-t border-slate-800">
                    <span>Estimated Total:</span>
                    <span>₹{(selectedStock.price * (quantity || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Select a security from the watchlist</p>
            )}
          </div>

          <button
            type="button"
            onClick={handleExecuteTrade}
            className={`w-full py-3 mt-6 rounded-xl font-bold tracking-wide uppercase text-sm transition shadow-md ${
              tradeAction === 'BUY'
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                : 'bg-rose-500 hover:bg-rose-400 text-white'
            }`}
          >
            Submit {tradeAction} Order
          </button>
        </div>

        {/* Portfolio & Holdings */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col h-[540px]">
          <h2 className="text-base font-semibold mb-4 text-slate-300">Your Portfolio Holdings</h2>
          {account.holdings?.length === 0 ? (
            <p className="text-sm text-slate-500">No open holdings yet.</p>
          ) : (
            <div 
              tabIndex={0}
              className="space-y-3 overflow-y-scroll pr-1.5 flex-1 focus:outline-none [scrollbar-width:thin] [scrollbar-color:#334155_transparent]"
              style={{ maxHeight: '440px' }}
            >
              {account.holdings?.map((h) => {
                const current = stocks.find((s) => s.symbol === h.symbol)?.price || h.average_buy_price;
                const pnl = (current - h.average_buy_price) * h.quantity;
                return (
                  <div key={h.id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs">
                    <div className="flex justify-between font-sans font-bold text-sm text-slate-200">
                      <span>{h.symbol}</span>
                      <span className={pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        ₹{pnl.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400 mt-2">
                      <span>Qty: {h.quantity}</span>
                      <span>Avg: ₹{h.average_buy_price.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Trades Ledger Table (Resolves 'trades' unused variable issue) */}
      <div className="mt-8 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h2 className="font-semibold text-sm text-slate-300">BSE Ingested Trades Ledger (Latest 100)</h2>
          <span className="text-xs text-slate-500 font-mono">Real-time Push via Socket.IO</span>
        </div>

        <div className="overflow-x-auto max-h-[460px] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#334155_transparent]">
          <table className="w-full text-left text-sm font-mono">
            <thead className="bg-slate-950 text-slate-400 text-xs uppercase sticky top-0 border-b border-slate-800 z-10">
              <tr>
                <th className="py-3 px-4">Trade ID</th>
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Symbol</th>
                <th className="py-3 px-4 text-right">Qty</th>
                <th className="py-3 px-4 text-right">Price</th>
                <th className="py-3 px-4 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-500 font-sans">
                    {pulling ? 'Pulling trades from BSE in background...' : 'No trades found. Click "Sync BSE" above to begin ingestion.'}
                  </td>
                </tr>
              ) : (
                trades.map((t) => (
                  <tr key={t.trade_id} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-4 text-emerald-400 font-semibold">{t.trade_id}</td>
                    <td className="py-2.5 px-4 text-slate-300 font-sans">{t.client}</td>
                    <td className="py-2.5 px-4 text-white font-bold">{t.symbol}</td>
                    <td className="py-2.5 px-4 text-right text-slate-300">{t.quantity}</td>
                    <td className="py-2.5 px-4 text-right text-white">
                      ₹{typeof t.price === 'number' ? t.price.toFixed(2) : t.price}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-400 text-xs font-sans">
                      {new Date(t.timestamp).toLocaleTimeString('en-IN', { hour12: false })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}