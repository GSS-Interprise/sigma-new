import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Copy, CheckCircle2 } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Identificador opcional pra logs (ex: "AcompanhamentoView") */
  label?: string;
  /** Fallback custom. Se não passar, usa padrão amigável */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

/**
 * Error Boundary global. Captura exceções de render em componentes filhos
 * e mostra fallback amigável em vez de tela branca.
 *
 * Sem isso, qualquer bug em render derruba o app inteiro pra branco —
 * operador comum não abre DevTools e não vê o erro real.
 *
 * Uso:
 *   <ErrorBoundary label="AcompanhamentoView">
 *     <AcompanhamentoView />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    const tag = this.props.label ? `[${this.props.label}]` : "[ErrorBoundary]";
    // Log detalhado no console pra dev/suporte conseguir investigar
    // eslint-disable-next-line no-console
    console.error(`${tag} erro capturado:`, error);
    // eslint-disable-next-line no-console
    console.error(`${tag} component stack:`, errorInfo.componentStack);
  }

  reset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
  };

  copyError = async () => {
    const text = this.formatErrorText();
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // Fallback se clipboard API falha
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  formatErrorText(): string {
    const { error, errorInfo } = this.state;
    const lines = [
      `Local: ${this.props.label || "(global)"}`,
      `URL: ${window.location.href}`,
      `Quando: ${new Date().toISOString()}`,
      `User-Agent: ${navigator.userAgent}`,
      "",
      `Mensagem: ${error?.message || "(sem mensagem)"}`,
      "",
      "Stack trace:",
      error?.stack || "(sem stack)",
      "",
      "Component stack:",
      errorInfo?.componentStack || "(sem component stack)",
    ];
    return lines.join("\n");
  }

  render() {
    if (this.state.hasError && this.state.error) {
      // Fallback custom passado por props
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }

      // Fallback padrão
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="max-w-2xl w-full bg-white border border-amber-300 rounded-lg shadow-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-amber-900">
                  Algo deu errado
                  {this.props.label && (
                    <span className="text-sm font-normal text-amber-700 ml-2">
                      em {this.props.label}
                    </span>
                  )}
                </h2>
                <p className="text-sm text-amber-800 mt-1">
                  Encontramos um erro inesperado. Você pode tentar recarregar essa parte da página
                  ou voltar pra tela inicial. Os dados estão seguros — o erro é só na exibição.
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-4">
              <div className="text-xs font-semibold text-amber-900 uppercase tracking-wider mb-1">
                Mensagem do erro
              </div>
              <code className="text-sm text-amber-900 font-mono break-all">
                {this.state.error.message || "(sem mensagem)"}
              </code>
            </div>

            <details className="mb-4">
              <summary className="text-sm text-amber-700 cursor-pointer hover:text-amber-900">
                Detalhes técnicos (pro suporte)
              </summary>
              <pre className="mt-2 p-3 bg-slate-900 text-slate-100 text-xs rounded overflow-auto max-h-64 font-mono">
                {this.formatErrorText()}
              </pre>
            </details>

            <div className="flex flex-wrap gap-2">
              <Button onClick={this.reset} size="sm">
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Tentar de novo
              </Button>
              <Button
                onClick={() => window.location.reload()}
                size="sm"
                variant="outline"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Recarregar página
              </Button>
              <Button onClick={this.copyError} size="sm" variant="outline">
                {this.state.copied ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-green-600" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Copiar erro pro suporte
                  </>
                )}
              </Button>
              <Button
                onClick={() => (window.location.href = "/")}
                size="sm"
                variant="ghost"
              >
                Voltar ao início
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
