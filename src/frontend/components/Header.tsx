import { useLocation } from "wouter";
import { useAuth } from "../contexts/AuthContext";
import { TenantSwitcher } from "./TenantSwitcher";

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
            <TenantSwitcher />
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
      </div>
    </header>
  );
}
