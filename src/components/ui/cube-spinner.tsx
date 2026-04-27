import "./cube-spinner.css";

export function CubeSpinner({ className = "" }: { className?: string }) {
  return (
    <div className={`cube-spinner ${className}`.trim()} role="status" aria-label="Carregando">
      <div /><div /><div /><div /><div /><div />
    </div>
  );
}
