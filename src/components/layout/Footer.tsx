export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-card/30 backdrop-blur-sm mt-auto">
      <div className="container mx-auto px-6 py-3">
        <div className="flex items-center justify-end text-right">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-primary">Sistema Integrado de Gestão Médica</span>
            {' '}&mdash; GSS &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </footer>
  );
}
