import { useState, useEffect } from "react";
import { api } from "../api/client";
import { sanitizeText } from "../utils/sanitize";
import type { Alert } from "../types";

export function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "threshold_breach" | "low_velocity">("all");
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    async function loadAlerts() {
      try {
        setLoading(true);
        const options: { type?: "threshold_breach" | "low_velocity"; status?: "pending" | "sent" | "dismissed" } = {};

        if (filter !== "all") {
          options.type = filter;
        }

        // When showing history, filter by dismissed status
        // When showing active, filter by pending status
        options.status = showHistory ? "dismissed" : "pending";

        const data = await api.getAlerts(options);
        setAlerts(data.alerts);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar alertas");
      } finally {
        setLoading(false);
      }
    }
    loadAlerts();
  }, [filter, showHistory]);

  async function handleDismiss(alertId: string) {
    try {
      await api.dismissAlert(alertId);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch (err) {
      console.error("Error dismissing alert:", err);
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-header">
          <h2 className="card-title">Vista</h2>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button
            className={`btn ${!showHistory ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setShowHistory(false)}
            type="button"
          >
            Activas
          </button>
          <button
            className={`btn ${showHistory ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setShowHistory(true)}
            type="button"
          >
            Historial
          </button>
        </div>
        <div className="card-header" style={{ paddingTop: "1rem", borderTop: "1px solid var(--border-color, #e5e7eb)" }}>
          <h2 className="card-title">Filtrar por Tipo</h2>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className={`btn ${filter === "all" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setFilter("all")}
            type="button"
          >
            Todas
          </button>
          <button
            className={`btn ${filter === "threshold_breach" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setFilter("threshold_breach")}
            type="button"
          >
            Umbral Excedido
          </button>
          <button
            className={`btn ${filter === "low_velocity" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setFilter("low_velocity")}
            type="button"
          >
            Baja Velocidad
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            {showHistory ? "Historial de Alertas" : "Alertas Activas"} ({alerts.length})
          </h2>
        </div>
        {error ? (
          <div className="empty-state">
            <div className="empty-state-title">Error</div>
            <p>{error}</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">{showHistory ? "history" : "check"}</div>
            <div className="empty-state-title">{showHistory ? "Sin historial" : "Sin alertas"}</div>
            <p>
              {showHistory
                ? "No hay alertas descartadas que coincidan con el filtro seleccionado"
                : "No hay alertas activas que coincidan con el filtro seleccionado"}
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Producto</th>
                  <th>Mensaje</th>
                  <th>Fecha</th>
                  {showHistory ? <th>Estado</th> : <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id} style={showHistory ? { opacity: 0.7 } : undefined}>
                    <td>
                      <span className={`badge ${alert.type === "threshold_breach" ? "badge-danger" : "badge-warning"}`}>
                        {alert.type === "threshold_breach" ? "Umbral" : "Velocidad"}
                      </span>
                    </td>
                    <td>{sanitizeText(alert.productName)}</td>
                    <td>{sanitizeText(alert.message)}</td>
                    <td>{new Date(alert.createdAt).toLocaleDateString("es-CL")}</td>
                    {showHistory ? (
                      <td>
                        <span className="badge" style={{ backgroundColor: "#6b7280", color: "white" }}>
                          Descartada
                        </span>
                      </td>
                    ) : (
                      <td>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleDismiss(alert.id)}
                          type="button"
                          data-testid="dismiss-alert"
                        >
                          Descartar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
