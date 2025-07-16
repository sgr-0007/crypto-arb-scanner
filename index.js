const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

const DOCS = {
  name: "cryptoArbitrageScanner",
  description: "Compare a crypto’s ask/bid across exchanges and report best opportunities",
  input: {
    type: "object",
    properties: {
      symbol: {
        type: "string",
        description: "Ticker in the form BASE/QUOTE, e.g. BTC/USD",
        example: "BTC/USD"
      },
      exchanges: {
        type: "array",
        items: { type: "string" },
        description: "List of exchange IDs (binance, kraken)",
        example: ["binance","kraken"]
      }
    },
    required: ["symbol","exchanges"]
  },
  output: {
    type: "object",
    properties: {
      prices: {
        type: "object",
        additionalProperties: {
          type: "object",
          properties: {
            bid: { type: "number" },
            ask: { type: "number" }
          }
        },
        description: "Bid/ask by exchange",
        example: { "binance": { "bid":60000,"ask":60050 } }
      },
      bestBuy: {
        type: "string",
        description: "Exchange with lowest ask",
        example: "kraken"
      },
      bestSell: {
        type: "string",
        description: "Exchange with highest bid",
        example: "binance"
      }
    }
  }
};

async function fetchBinance(base, quote) {
  const pair = `${base}${quote === 'USD' ? 'USDT' : quote}`;
  const url = `https://api.binance.com/api/v3/ticker/bookTicker?symbol=${pair}`;
  const j = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ArbitrageBot/1.0)' }
  }).then(r => r.json());
  if (j.code) return { bid: null, ask: null }; // Binance returns error codes in body
  return {
    bid: j.bidPrice ? parseFloat(j.bidPrice) : null,
    ask: j.askPrice ? parseFloat(j.askPrice) : null
  };
}

async function fetchKraken(base, quote) {
  const mappedBase = (base === "BTC" ? "XBT" : base);
  const pair = `${mappedBase}${quote}`;
  const url = `https://api.kraken.com/0/public/Ticker?pair=${pair}`;
  const j = await fetch(url).then(r => r.json());
  const key = Object.keys(j.result)[0];
  return {
    bid: parseFloat(j.result[key].b[0]),
    ask: parseFloat(j.result[key].a[0])
  };
}

app.get('/functions/cryptoArbitrageScanner', (req, res) => {
  res.json(DOCS);
});

app.post('/functions/cryptoArbitrageScanner', async (req, res) => {
  const { symbol, exchanges } = req.body || {};
  if (!symbol || !Array.isArray(exchanges)) {
    return res.status(400).send({ error: "Missing symbol or exchanges array" });
  }
  const [base, quote] = symbol.split('/');
  const prices = {};
  await Promise.all(exchanges.map(async ex => {
    try {
      let p;
      if (ex === 'binance')   p = await fetchBinance(base, quote);
      else if (ex === 'kraken')   p = await fetchKraken(base, quote);
      else throw new Error(`Unsupported exchange: ${ex}`);
      prices[ex] = p;
    } catch (e) {
      prices[ex] = { error: e.message };
    }
  }));
  let bestBuy = null, bestSell = null;
  let minAsk = Infinity, maxBid = -Infinity;
  for (const [ex, p] of Object.entries(prices)) {
    if (p.ask != null && p.ask < minAsk) {
      minAsk = p.ask; bestBuy = ex;
    }
    if (p.bid != null && p.bid > maxBid) {
      maxBid = p.bid; bestSell = ex;
    }
  }
  res.json({ prices, bestBuy, bestSell });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});
