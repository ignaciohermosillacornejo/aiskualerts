import { useLocation } from "wouter";

export function BillingCancel() {
  const [, setLocation] = useLocation();

  return (
    <div className="card" style={{ textAlign: "center", maxWidth: "500px", margin: "2rem auto" }}>
      <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>&#10005;</div>
      <h1 style={{ color: "#991b1b", marginBottom: "1rem" }}>Pago Cancelado</h1>
      <p style={{ color: "#64748b", marginBottom: "1.5rem" }}>
        El proceso de pago fue cancelado. No se realizo ningun cargo a tu tarjeta.
      </p>
      <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Puedes intentar nuevamente cuando lo desees desde la pagina de configuracion.
      </p>
      <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
        <button
          className="btn btn-secondary"
          onClick={() => setLocation("/app")}
        >
          Ir al Dashboard
        </button>
        <button
          className="btn btn-primary"
          onClick={() => setLocation("/app/settings")}
        >
          Ir a Configuracion
        </button>
      </div>
    </div>
  );
}
