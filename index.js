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
        description: "List of exchange IDs (kraken, bitstamp)",
        example: ["kraken","bitstamp"]
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
        example: { "kraken": { "bid":60000,"ask":60050 } }
      },
      bestBuy: {
        type: "string",
        description: "Exchange with lowest ask",
        example: "bitstamp"
      },
      bestSell: {
        type: "string",
        description: "Exchange with highest bid",
        example: "kraken"
      }
    }
  }
};

// Helper to fetch ticker from Kraken
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

// Helper to fetch ticker from Bitstamp
async function fetchBitstamp(base, quote) {
  // Bitstamp uses lowercase pair, e.g. btcusd
  const pair = `${base}${quote}`.toLowerCase();
  const url = `https://www.bitstamp.net/api/v2/ticker/${pair}/`;
  const j = await fetch(url).then(r => r.json());
  return {
    bid: parseFloat(j.bid),
    ask: parseFloat(j.ask)
  };
}

app.get('/functions/cryptoArbitrageScanner', (req, res) => {
  res.json(DOCS);
});

app.post('/functions/cryptoArbitrageScanner', async (req, res) => {
  // Always expect input under the "input" key
  const { input } = req.body;
  if (!input) {
    return res.status(400).send({ error: "Missing input property in request body" });
  }
  const { symbol, exchanges } = input;
  if (!symbol || !Array.isArray(exchanges)) {
    return res.status(400).send({ error: "Missing symbol or exchanges array" });
  }
  const [base, quote] = symbol.split('/');
  const prices = {};
  await Promise.all(exchanges.map(async ex => {
    try {
      let p;
      if (ex === 'kraken')   p = await fetchKraken(base, quote);
      else if (ex === 'bitstamp') p = await fetchBitstamp(base, quote);
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
  // Return under output key as required by func.live
  res.json({ output: { prices, bestBuy, bestSell } });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});
