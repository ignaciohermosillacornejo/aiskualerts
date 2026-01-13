import { useEffect } from "react";
import { useLocation } from "wouter";

export function BillingSuccess() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Redirect to settings after 3 seconds
    const timer = setTimeout(() => {
      setLocation("/app/settings");
    }, 3000);

    return () => clearTimeout(timer);
  }, [setLocation]);

  return (
    <div className="card" style={{ textAlign: "center", maxWidth: "500px", margin: "2rem auto" }}>
      <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>&#10003;</div>
      <h1 style={{ color: "#166534", marginBottom: "1rem" }}>Pago Exitoso</h1>
      <p style={{ color: "#64748b", marginBottom: "1.5rem" }}>
        Tu suscripcion a AI SKU Alerts Pro ha sido activada exitosamente.
        Ahora tienes acceso a todas las funcionalidades premium.
      </p>
      <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
        Seras redirigido a configuracion en unos segundos...
      </p>
      <button
        className="btn btn-primary"
        onClick={() => setLocation("/app/settings")}
        style={{ marginTop: "1rem" }}
      >
        Ir a Configuracion
      </button>
    </div>
  );
}
