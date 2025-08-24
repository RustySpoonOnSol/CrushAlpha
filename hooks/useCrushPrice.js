// hooks/useCrushPrice.js
import { useEffect, useState } from 'react';

export function useCrushPrice(pollMs = 30000) {
  const [price, setPrice] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const r = await fetch('/api/price/crush');
      const j = await r.json();
      setPrice(typeof j?.price === 'number' ? j.price : null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [pollMs]);

  return { price, loading };
}
