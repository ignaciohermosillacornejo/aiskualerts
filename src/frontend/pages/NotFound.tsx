import { Link } from "wouter";

export function NotFound() {
  return (
    <div className="login-container">
      <div className="login-card" style={{ textAlign: "center" }}>
        <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>404</div>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Pagina no encontrada</h1>
        <p style={{ color: "#64748b", marginBottom: "1.5rem" }}>
          La pagina que buscas no existe o fue movida.
        </p>
        <Link href="/" className="btn btn-primary">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
