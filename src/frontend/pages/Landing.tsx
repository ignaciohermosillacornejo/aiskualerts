import { Link } from "wouter";

export function Landing() {
  return (
    <div className="landing-container">
      {/* Header */}
      <header className="landing-header">
        <span className="landing-logo">AISku Alerts</span>
        <nav className="landing-nav">
          <Link href="/login" className="btn btn-secondary">
            Iniciar Sesion
          </Link>
          <Link href="/login" className="btn btn-primary">
            Comenzar Gratis
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="landing-hero-content">
          <h1>Nunca pierdas una venta por falta de stock</h1>
          <p>
            Sistema inteligente de alertas de inventario para Bsale. Recibe
            notificaciones automaticas cuando tus productos estan por agotarse.
          </p>
          <div className="landing-hero-buttons">
            <Link href="/login" className="btn btn-white btn-lg">
              Comenzar Ahora
            </Link>
            <Link href="/login" className="btn btn-outline btn-lg">
              Ver Demo
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="landing-features">
        <h2 className="landing-features-title">
          Todo lo que necesitas para controlar tu inventario
        </h2>
        <div className="landing-features-grid">
          <FeatureCard
            icon={<BellIcon />}
            title="Alertas en Tiempo Real"
            description="Recibe notificaciones instantaneas cuando el stock de tus productos alcance niveles criticos."
          />
          <FeatureCard
            icon={<ChartIcon />}
            title="Dashboard Intuitivo"
            description="Visualiza el estado de tu inventario en un panel de control facil de entender."
          />
          <FeatureCard
            icon={<AdjustmentsIcon />}
            title="Umbrales Personalizados"
            description="Configura niveles de alerta unicos para cada producto segun tus necesidades."
          />
          <FeatureCard
            icon={<SyncIcon />}
            title="Sincronizacion Automatica"
            description="Conecta tu cuenta Bsale y mantente actualizado sin esfuerzo adicional."
          />
        </div>
      </section>

      {/* CTA Section */}
      <section className="landing-cta">
        <h2>Comienza a proteger tu inventario hoy</h2>
        <p>
          Unete a los negocios que ya confian en AISku Alerts para evitar
          quiebres de stock.
        </p>
        <Link href="/login" className="btn btn-white btn-lg">
          Comenzar Ahora
        </Link>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <p>AISku Alerts - Sistema de alertas de inventario para Bsale</p>
      </footer>
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="landing-feature-card">
      <div className="landing-feature-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      width="24"
      height="24"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      width="24"
      height="24"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    </svg>
  );
}

function AdjustmentsIcon() {
  return (
    <svg
      width="24"
      height="24"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
      />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg
      width="24"
      height="24"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}
