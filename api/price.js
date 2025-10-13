// Vercel Serverless Function: /api/price
// Use like: https://YOUR-APP.vercel.app/api/price?name=Snakebite%20Case
export default async function handler(req, res) {
  try {
    const { name, currency = "3", appid = "730" } = req.query;
    if (!name) {
      res.status(400).json({ ok: false, error: "missing ?name=" });
      return;
    }

    const url = `https://steamcommunity.com/market/priceoverview/?currency=${currency}&appid=${appid}&market_hash_name=${encodeURIComponent(
      name
    )}`;

    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
        Accept: "application/json,text/plain,*/*"
      }
    });

    const status = r.status;
    let data = null;
    try {
      data = await r.json();
    } catch (e) {
      res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=30");
      res.status(200).json({ ok: false, status, error: "bad json" });
      return;
    }

    if (status !== 200 || !data || data.success !== true) {
      // cache short for failures so we don’t hammer Steam
      res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=30");
      res.status(200).json({ ok: false, status, body: data || null });
      return;
    }

    // convert "0,73 €" → 0.73
    const toNum = (s) => {
      if (!s) return null;
      s = String(s).replace(/[^\d,.\-]/g, "");
      if (s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".")) {
        s = s.replace(/\./g, "").replace(",", ".");
      }
      const n = Number(s);
      return Number.isNaN(n) || n === 0.25 ? null : n; // filter bogus 0.25
    };

    const lowest = toNum(data.lowest_price);
    const median = toNum(data.median_price);

    // cache OK responses for 5 minutes at the CDN (Vercel Edge)
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=300");
    res.status(200).json({ ok: true, lowest, median, name, currency, appid, ts: Date.now() });
  } catch (err) {
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=30");
    res.status(200).json({ ok: false, error: String(err) });
  }
}
