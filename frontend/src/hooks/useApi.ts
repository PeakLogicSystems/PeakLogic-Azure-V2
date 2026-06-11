import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApi<T>(path: string | null): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    if (!pathRef.current) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get<T>(pathRef.current)
      .then(d  => { if (!cancelled) setData(d);          })
      .catch(e => { if (!cancelled) setError(String(e));  })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick]);

  return { data, loading, error, refetch: () => setTick(t => t + 1) };
}
