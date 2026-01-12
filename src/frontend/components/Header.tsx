import { useLocation } from "wouter";
import { useAuth } from "../contexts/AuthContext";

const pageTitles: Record<string, string> = {
  "/app": "Dashboard",
  "/app/alerts": "Alertas",
  "/app/products": "Productos",
  "/app/thresholds": "Umbrales",
  "/app/settings": "Configuracion",
};

export function Header() {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  // eslint-disable-next-line security/detect-object-injection -- location is from wouter router, not user input; fallback handles missing keys
  const title = pageTitles[location] ?? "AISku Alerts";

  async function handleLogout() {
    await logout();
    setLocation("/login");
  }

  return (
    <header className="header">
      <h1 className="header-title">{title}</h1>
      <div className="header-actions">
        {user && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            marginRight: "1rem"
          }}>
            <span style={{
              fontSize: "0.875rem",
              color: "#64748b"
            }}>
              {user.email}
            </span>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={handleLogout}
              style={{
                padding: "0.5rem 1rem",
                fontSize: "0.875rem"
              }}
            >
              Cerrar Sesion
            </button>
          </div>
        )}
        <button className="btn btn-secondary" type="button">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </button>
      </div>
    </header>
  );
}
