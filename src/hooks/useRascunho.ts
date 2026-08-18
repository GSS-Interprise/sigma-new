import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Rascunho automático de formulário.
 *
 * Nasceu do relato da equipe (10/08): a sessão cai — por inatividade, pelo corte de 13h
 * ou por queda de rede — e o que estava sendo digitado se perde, obrigando a refazer.
 * Guardar em localStorage sobrevive a logout, F5, fechar aba e queda do navegador,
 * porque nada disso limpa o storage.
 *
 * Uso:
 *   const rascunho = useRascunho("nova-demanda", form, { ativo: aberto });
 *   ...
 *   {rascunho.temRascunho && <RascunhoAviso rascunho={rascunho} onRestaurar={setForm} />}
 *   // ao salvar com sucesso:
 *   rascunho.descartar();
 */

const PREFIXO = "sigma_rascunho:";
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000; // rascunho velho não serve e só polui
const DEBOUNCE_MS = 800;

type Guardado<T> = { valor: T; em: number };

function vazio(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v as object).every(vazio);
  return false;
}

/** Remove rascunhos vencidos — roda uma vez por sessão do app. */
function limparVencidos() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIXO)) continue;
      const bruto = localStorage.getItem(k);
      if (!bruto) continue;
      const { em } = JSON.parse(bruto) as Guardado<unknown>;
      if (!em || Date.now() - em > VALIDADE_MS) localStorage.removeItem(k);
    }
  } catch { /* storage cheio ou bloqueado: rascunho é melhor-esforço */ }
}
let jaLimpou = false;

export function useRascunho<T>(
  chave: string | null,
  valor: T,
  opcoes?: { ativo?: boolean; debounceMs?: number },
) {
  const ativo = opcoes?.ativo ?? true;
  const debounce = opcoes?.debounceMs ?? DEBOUNCE_MS;
  const storageKey = chave ? PREFIXO + chave : null;

  const [guardado, setGuardado] = useState<Guardado<T> | null>(null);
  const [salvoEm, setSalvoEm] = useState<number | null>(null);
  const [ignorado, setIgnorado] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // o que havia no storage quando o formulário abriu — é isso que se oferece restaurar
  const inicial = useRef(true);
  // Estado do formulário no momento em que abriu. Sem esta referência, um formulário
  // intocado com qualquer default ("urgencia: media") já era gravado como rascunho e a
  // faixa de restaurar aparecia sem ninguém ter digitado nada.
  const base = useRef<string | null>(null);

  useEffect(() => {
    if (!jaLimpou) { jaLimpou = true; limparVencidos(); }
  }, []);

  // lê o rascunho existente ao abrir
  useEffect(() => {
    if (!storageKey || !ativo) return;
    inicial.current = true;
    base.current = null;
    setIgnorado(false);
    try {
      const bruto = localStorage.getItem(storageKey);
      if (!bruto) { setGuardado(null); return; }
      const g = JSON.parse(bruto) as Guardado<T>;
      if (!g?.em || Date.now() - g.em > VALIDADE_MS) {
        localStorage.removeItem(storageKey);
        setGuardado(null);
        return;
      }
      setGuardado(g);
    } catch {
      setGuardado(null);
    }
  }, [storageKey, ativo]);

  // grava enquanto digita, com folga para não escrever a cada tecla
  useEffect(() => {
    if (!storageKey || !ativo) return;
    const atual = JSON.stringify(valor);
    // o primeiro valor é o estado inicial do formulário, não uma edição
    if (inicial.current) { inicial.current = false; base.current = atual; return; }
    if (base.current === null) { base.current = atual; return; }
    // nada mudou em relação a como o formulário abriu: não é rascunho
    if (atual === base.current || vazio(valor)) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        const em = Date.now();
        localStorage.setItem(storageKey, JSON.stringify({ valor, em }));
        setSalvoEm(em);
      } catch { /* storage cheio: não vale quebrar o formulário por causa disso */ }
    }, debounce);

    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [storageKey, ativo, valor, debounce]);

  const descartar = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (storageKey) { try { localStorage.removeItem(storageKey); } catch { /* ignore */ } }
    setGuardado(null);
    setSalvoEm(null);
  }, [storageKey]);

  const restaurar = useCallback(() => {
    const v = guardado?.valor ?? null;
    setGuardado(null);
    return v;
  }, [guardado]);

  const temRascunho = useMemo(() => {
    if (!guardado || ignorado || vazio(guardado.valor)) return false;
    // guardado igual ao formulário atual não é novidade nenhuma para oferecer
    return JSON.stringify(guardado.valor) !== JSON.stringify(valor);
  }, [guardado, ignorado, valor]);

  return {
    /** há um rascunho anterior para oferecer */
    temRascunho,
    /** conteúdo do rascunho anterior */
    rascunho: guardado?.valor ?? null,
    /** quando o rascunho anterior foi guardado */
    rascunhoEm: guardado?.em ?? null,
    /** quando este formulário foi salvo pela última vez */
    salvoEm,
    /** devolve o conteúdo e para de oferecer */
    restaurar,
    /** para de oferecer sem apagar */
    ignorar: () => setIgnorado(true),
    /** apaga de vez — chamar ao salvar com sucesso */
    descartar,
  };
}
