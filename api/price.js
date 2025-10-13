export default async function handler(req, res) {
  const { name } = req.query;

  if (!name) {
    return res.status(400).json({ ok: false, error: "Missing ?name=" });
  }

  const url = `https://steamcommunity.com/market/priceoverview/?currency=3&appid=730&market_hash_name=${encodeURIComponent(name)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CS2PriceBot/1.0)",
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ ok: false, error: `Steam HTTP ${response.status}` });
    }

    const data = await response.json();

    if (!data.success) {
      return res.status(404).json({ ok: false, error: "Not found on Steam Market" });
    }

    const parsePrice = (price) => {
      if (!price) return null;
      const cleaned = price.replace(/[^\d,.-]/g, "").replace(",", ".");
      return parseFloat(cleaned);
    };

    const lowest = parsePrice(data.lowest_price);
    const median = parsePrice(data.median_price);

    res.status(200).json({
      ok: true,
      name,
      lowest,
      median,
      currency: "EUR",
      appid: "730",
      ts: Date.now(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
