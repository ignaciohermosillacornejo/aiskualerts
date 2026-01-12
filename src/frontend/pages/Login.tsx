import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../contexts/AuthContext";

export function Login() {
  const [, setLocation] = useLocation();
  const { login, loading: authLoading, error: authError, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      const redirectPath = sessionStorage.getItem("redirect_after_login") ?? "/app";
      sessionStorage.removeItem("redirect_after_login");
      setLocation(redirectPath);
    }
  }, [user, setLocation]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Por favor complete todos los campos");
      return;
    }

    try {
      setError(null);
      await login(email, password);
      // Redirect happens in useEffect above after user state updates
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesion");
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <h1>AISku Alerts</h1>
          <p>Sistema de alertas de inventario para Bsale</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              placeholder="usuario@empresa.cl"
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Contrasena</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              placeholder="********"
              autoComplete="current-password"
            />
          </div>

          {(error || authError) && (
            <div style={{
              backgroundColor: "#fee2e2",
              color: "#991b1b",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              marginBottom: "1rem",
              fontSize: "0.875rem",
            }}>
              {error || authError}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", padding: "0.75rem" }}
            disabled={authLoading}
          >
            {authLoading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
          <p style={{ color: "#64748b", fontSize: "0.875rem" }}>
            Conecte su cuenta Bsale para comenzar
          </p>
          <a
            href="/api/auth/bsale/start"
            className="btn btn-secondary"
            style={{ marginTop: "0.5rem" }}
          >
            Conectar con Bsale
          </a>
        </div>
      </div>
    </div>
  );
}
