import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { Alert } from "../types";

export function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "threshold_breach" | "low_velocity">("all");

  useEffect(() => {
    async function loadAlerts() {
      try {
        setLoading(true);
        const data = filter === "all"
          ? await api.getAlerts({})
          : await api.getAlerts({ type: filter });
        setAlerts(data.alerts);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar alertas");
      } finally {
        setLoading(false);
      }
    }
    loadAlerts();
  }, [filter]);

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
          <h2 className="card-title">Filtrar Alertas</h2>
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
          <h2 className="card-title">Alertas ({alerts.length})</h2>
        </div>
        {error ? (
          <div className="empty-state">
            <div className="empty-state-title">Error</div>
            <p>{error}</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">check</div>
            <div className="empty-state-title">Sin alertas</div>
            <p>No hay alertas que coincidan con el filtro seleccionado</p>
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
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>
                      <span className={`badge ${alert.type === "threshold_breach" ? "badge-danger" : "badge-warning"}`}>
                        {alert.type === "threshold_breach" ? "Umbral" : "Velocidad"}
                      </span>
                    </td>
                    <td>{alert.productName}</td>
                    <td>{alert.message}</td>
                    <td>{new Date(alert.createdAt).toLocaleDateString("es-CL")}</td>
                    <td>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleDismiss(alert.id)}
                        type="button"
                      >
                        Descartar
                      </button>
                    </td>
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
