import { useEffect, useState } from "react";

/**
 * Retorna o valor após esperar `ms` sem mudanças.
 * Útil pra evitar dispara queries a cada keystroke / mudança de filtro.
 */
export function useDebouncedValue<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
