import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { TenantSettings } from "../types";

export function Settings() {
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true);
        const data = await api.getSettings();
        setSettings(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar configuracion");
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      await api.updateSettings(settings);
      setSuccess("Configuracion guardada exitosamente");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-title">Error</div>
          <p>No se pudo cargar la configuracion</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-header">
          <h2 className="card-title">Cuenta Bsale</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <div className="form-label">Empresa</div>
            <div style={{ fontWeight: 500 }}>{settings.companyName}</div>
          </div>
          <div>
            <div className="form-label">Email</div>
            <div>{settings.email}</div>
          </div>
          <div>
            <div className="form-label">Estado Conexion</div>
            <span className={`badge ${settings.bsaleConnected ? "badge-success" : "badge-danger"}`}>
              {settings.bsaleConnected ? "Conectado" : "Desconectado"}
            </span>
          </div>
          <div>
            <div className="form-label">Ultima Sincronizacion</div>
            <div>
              {settings.lastSyncAt
                ? new Date(settings.lastSyncAt).toLocaleString("es-CL")
                : "Nunca"}
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div className="card-header">
            <h2 className="card-title">Notificaciones</h2>
          </div>
          <div className="form-group">
            <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={settings.emailNotifications}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSettings({ ...settings, emailNotifications: e.target.checked })
                }
                style={{ width: "1.25rem", height: "1.25rem" }}
              />
              <span>Recibir alertas por email</span>
            </label>
          </div>
          <div className="form-group">
            <label className="form-label">Email para notificaciones</label>
            <input
              type="email"
              className="form-input"
              value={settings.notificationEmail}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setSettings({ ...settings, notificationEmail: e.target.value })
              }
              placeholder="alerts@empresa.cl"
            />
          </div>
        </div>

        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div className="card-header">
            <h2 className="card-title">Sincronizacion</h2>
          </div>
          <div className="form-group">
            <label className="form-label">Frecuencia de sincronizacion</label>
            <select
              className="form-input"
              value={settings.syncFrequency}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setSettings({ ...settings, syncFrequency: e.target.value as TenantSettings["syncFrequency"] })
              }
            >
              <option value="hourly">Cada hora</option>
              <option value="daily">Diaria</option>
              <option value="weekly">Semanal</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="card" style={{ backgroundColor: "#fee2e2", marginBottom: "1rem" }}>
            <p style={{ color: "#991b1b", margin: 0 }}>{error}</p>
          </div>
        )}

        {success && (
          <div className="card" style={{ backgroundColor: "#dcfce7", marginBottom: "1rem" }}>
            <p style={{ color: "#166534", margin: 0 }}>{success}</p>
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Guardando..." : "Guardar Cambios"}
        </button>
      </form>
    </div>
  );
}
