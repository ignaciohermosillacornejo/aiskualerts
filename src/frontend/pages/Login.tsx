import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../api/client";

type LoginState = "idle" | "loading" | "sent" | "error";

export function Login() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { loading: authLoading, user } = useAuth();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<LoginState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Parse URL parameters
  const params = new URLSearchParams(searchString);
  const urlError = params.get("error");

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      const redirectPath = sessionStorage.getItem("redirect_after_login") ?? "/app";
      sessionStorage.removeItem("redirect_after_login");
      setLocation(redirectPath);
    }
  }, [user, setLocation]);

  // Handle URL error parameters
  useEffect(() => {
    if (urlError === "invalid_token") {
      setError("El enlace de acceso es invalido o ha expirado. Por favor solicita uno nuevo.");
    } else if (urlError === "server_error") {
      setError("Hubo un error al verificar el enlace. Por favor intenta nuevamente.");
    }
  }, [urlError]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      setError("Por favor ingresa tu correo electronico");
      return;
    }

    try {
      setState("loading");
      setError(null);
      await api.requestMagicLink(email);
      setState("sent");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Error al enviar el enlace");
    }
  }

  function handleReset() {
    setState("idle");
    setEmail("");
    setError(null);
  }

  if (authLoading) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <p style={{ color: "#64748b" }}>Verificando sesion...</p>
          </div>
        </div>
      </div>
    );
  }

  // Success state - email sent
  if (state === "sent") {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-logo">
            <h1>AISku Alerts</h1>
          </div>

          <div
            data-testid="success-message"
            style={{
              backgroundColor: "#dcfce7",
              color: "#166534",
              padding: "1rem",
              borderRadius: "0.5rem",
              marginBottom: "1.5rem",
              textAlign: "center",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ margin: "0 auto 1rem" }}
            >
              <path d="M22 10.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h12.5" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              <path d="m16 19 2 2 4-4" />
            </svg>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Revisa tu correo
            </h2>
            <p style={{ fontSize: "0.875rem" }}>
              Hemos enviado un enlace de acceso a <strong>{email}</strong>
            </p>
            <p style={{ fontSize: "0.75rem", marginTop: "0.5rem", opacity: 0.8 }}>
              El enlace expira en 15 minutos
            </p>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="btn btn-secondary"
            style={{ width: "100%", padding: "0.75rem" }}
          >
            Usar otro correo
          </button>
        </div>
      </div>
    );
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
            <label className="form-label">Correo electronico</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              placeholder="usuario@empresa.cl"
              autoComplete="email"
              disabled={state === "loading"}
            />
          </div>

          {error && (
            <div
              data-testid="error-message"
              style={{
                backgroundColor: "#fee2e2",
                color: "#991b1b",
                padding: "0.75rem",
                borderRadius: "0.5rem",
                marginBottom: "1rem",
                fontSize: "0.875rem",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", padding: "0.75rem" }}
            disabled={state === "loading"}
          >
            {state === "loading" ? "Enviando..." : "Enviar enlace de acceso"}
          </button>
        </form>

        <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
          <p style={{ color: "#64748b", fontSize: "0.875rem" }}>
            Te enviaremos un enlace para iniciar sesion sin contrasena
          </p>
        </div>
      </div>
    </div>
  );
}
