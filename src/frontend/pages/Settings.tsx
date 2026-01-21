import { useState, useEffect, useCallback } from "react";
import { useSearch } from "wouter";
import { api } from "../api/client";
import type { TenantSettings, SyncStatus, LimitInfo } from "../types";
import { ApiError } from "../api/client";
import { ConfirmModal } from "../components/ConfirmModal";

// Validate MercadoPago URLs to prevent open redirect attacks
function isValidMercadoPagoUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.protocol === "https:" &&
      (parsedUrl.hostname === "www.mercadopago.cl" ||
        parsedUrl.hostname === "www.mercadopago.com" ||
        parsedUrl.hostname.endsWith(".mercadopago.cl") ||
        parsedUrl.hostname.endsWith(".mercadopago.com"))
    );
  } catch {
    return false;
  }
}

// Sanitize error messages for user display
function getSafeErrorMessage(err: unknown, defaultMessage: string): string {
  if (err instanceof ApiError) {
    // Only show safe, known error messages
    const safeMessages: Record<number, string> = {
      400: "No se pudo procesar la solicitud",
      401: "Sesion expirada, por favor inicia sesion nuevamente",
      404: "Recurso no encontrado",
      500: "Error del servidor, intenta nuevamente",
    };
    return safeMessages[err.status] ?? defaultMessage;
  }
  return defaultMessage;
}

// Get human-readable sync status
function getSyncStatusText(status: SyncStatus): string {
  const statusMap: Record<SyncStatus, string> = {
    not_connected: "Sin conexion",
    pending: "Pendiente",
    syncing: "Sincronizando...",
    success: "Sincronizado",
    failed: "Error en sincronizacion",
  };
  // eslint-disable-next-line security/detect-object-injection -- Safe: status is a validated SyncStatus enum value
  return statusMap[status];
}

function getSyncStatusBadgeClass(status: SyncStatus): string {
  switch (status) {
    case "success":
      return "badge-success";
    case "syncing":
    case "pending":
      return "badge-warning";
    case "failed":
      return "badge-danger";
    default:
      return "badge-secondary";
  }
}

export function Settings() {
  const searchString = useSearch();
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [bsaleLoading, setBsaleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [clientCode, setClientCode] = useState("");
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [showAddAccountForm, setShowAddAccountForm] = useState(false);
  const [addAccountClientCode, setAddAccountClientCode] = useState("");
  const [upgradeConfirm, setUpgradeConfirm] = useState(false);
  const [limits, setLimits] = useState<LimitInfo | null>(null);

  // Parse URL parameters
  const params = new URLSearchParams(searchString);
  const urlConnected = params.get("connected");
  const urlError = params.get("error");

  useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true);
        const data = await api.getSettings();
        setSettings(data);

        // Fetch limits separately - failure shouldn't break the page
        try {
          const limitsData = await api.getLimits();
          setLimits(limitsData);
        } catch {
          // Silently fail - limits are supplementary UI info
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar configuracion");
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  // Handle URL parameters from OAuth callback
  useEffect(() => {
    if (urlConnected === "true") {
      setSuccess("Bsale conectado exitosamente. La sincronizacion comenzara en breve.");
      // Reload settings to get updated connection status
      api.getSettings().then(setSettings).catch((err: unknown) => {
        // Log error but don't show to user - they already see success message
        console.error("Failed to reload settings after Bsale connection:", err);
      });
    } else if (urlError) {
      setError(decodeURIComponent(urlError));
    }
  }, [urlConnected, urlError]);

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

  const handleConnectBsale = useCallback(() => {
    if (!clientCode.trim()) {
      setError("Por favor ingresa el RUT/RUC/RFC de tu empresa");
      return;
    }
    setBsaleLoading(true);
    // Redirect to OAuth flow
    window.location.href = `/api/bsale/connect?client_code=${encodeURIComponent(clientCode.trim())}`;
  }, [clientCode]);

  const handleAddAccount = useCallback(() => {
    if (!addAccountClientCode.trim()) {
      setError("Por favor ingresa el RUT/RUC/RFC de la empresa a agregar");
      return;
    }
    setBsaleLoading(true);
    // Redirect to OAuth flow - the callback will detect the existing session
    // and add the new tenant to the current user instead of creating a new user
    window.location.href = `/api/bsale/connect?client_code=${encodeURIComponent(addAccountClientCode.trim())}`;
  }, [addAccountClientCode]);

  const handleDisconnectBsale = useCallback(async () => {
    if (!window.confirm("Esta seguro de desconectar Bsale? Tus datos historicos se conservaran.")) {
      return;
    }

    try {
      setBsaleLoading(true);
      setError(null);
      await api.disconnectBsale();
      setSuccess("Bsale desconectado exitosamente");
      // Reload settings
      const data = await api.getSettings();
      setSettings(data);
    } catch (err) {
      setError(getSafeErrorMessage(err, "Error al desconectar Bsale"));
    } finally {
      setBsaleLoading(false);
    }
  }, []);

  const handleUpgrade = useCallback(async () => {
    try {
      setBillingLoading(true);
      setError(null);
      const { url } = await api.createCheckoutSession();

      // Validate URL before redirect to prevent open redirect attacks
      if (!isValidMercadoPagoUrl(url)) {
        throw new Error("Invalid redirect URL");
      }

      window.location.href = url;
    } catch (err) {
      setError(getSafeErrorMessage(err, "Error al iniciar el proceso de pago"));
      setBillingLoading(false);
    }
  }, []);

  const handleCancelSubscription = useCallback(async () => {
    try {
      setBillingLoading(true);
      setError(null);
      const result = await api.cancelSubscription();

      setSuccess(`Suscripcion cancelada. Tendras acceso hasta ${new Date(result.endsAt).toLocaleDateString()}`);
    } catch (err) {
      setError(getSafeErrorMessage(err, "Error al cancelar la suscripcion"));
    } finally {
      setBillingLoading(false);
    }
  }, []);

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
      {/* Bsale Connection Card */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-header">
          <h2 className="card-title">Conexion Bsale</h2>
        </div>

        {settings.bsaleConnected ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <div className="form-label">Empresa</div>
                <div style={{ fontWeight: 500 }}>{settings.companyName ?? "Sin nombre"}</div>
              </div>
              <div>
                <div className="form-label">Estado</div>
                <span className={`badge ${getSyncStatusBadgeClass(settings.syncStatus)}`}>
                  {getSyncStatusText(settings.syncStatus)}
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

            {/* Add Account Form */}
            {showAddAccountForm ? (
              <div style={{ marginBottom: "1rem", padding: "1rem", backgroundColor: "#f8fafc", borderRadius: "0.5rem" }}>
                <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                  <label className="form-label">RUT / RUC / RFC de la nueva empresa</label>
                  <input
                    type="text"
                    className="form-input"
                    value={addAccountClientCode}
                    onChange={(e) => setAddAccountClientCode(e.target.value)}
                    placeholder="ej: 12.345.678-9"
                    disabled={bsaleLoading}
                  />
                  <p style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.5rem" }}>
                    Agrega otra empresa o sucursal conectada a Bsale.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleAddAccount}
                    disabled={bsaleLoading || !addAccountClientCode.trim()}
                  >
                    {bsaleLoading ? "Conectando..." : "Agregar Cuenta"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowAddAccountForm(false);
                      setAddAccountClientCode("");
                    }}
                    disabled={bsaleLoading}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}

            <div style={{ display: "flex", gap: "0.5rem" }}>
              {!showAddAccountForm && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setShowAddAccountForm(true)}
                  disabled={bsaleLoading}
                >
                  Agregar Otra Cuenta
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleDisconnectBsale}
                disabled={bsaleLoading}
              >
                {bsaleLoading ? "Desconectando..." : "Desconectar Bsale"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ color: "#64748b", marginBottom: "1rem" }}>
              Conecta tu cuenta de Bsale para comenzar a sincronizar tu inventario y recibir alertas.
            </p>

            {showConnectForm ? (
              <div>
                <div className="form-group">
                  <label className="form-label">RUT / RUC / RFC de tu empresa</label>
                  <input
                    type="text"
                    className="form-input"
                    value={clientCode}
                    onChange={(e) => setClientCode(e.target.value)}
                    placeholder="ej: 12.345.678-9"
                    disabled={bsaleLoading}
                  />
                  <p style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.5rem" }}>
                    Ingresa el identificador tributario de tu empresa registrado en Bsale (RUT en Chile, RUC en Peru, RFC en Mexico).
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleConnectBsale}
                    disabled={bsaleLoading || !clientCode.trim()}
                  >
                    {bsaleLoading ? "Conectando..." : "Conectar"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowConnectForm(false);
                      setClientCode("");
                    }}
                    disabled={bsaleLoading}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowConnectForm(true)}
              >
                Conectar Bsale
              </button>
            )}
          </>
        )}
      </div>

      {/* Account Info Card */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-header">
          <h2 className="card-title">Mi Cuenta</h2>
        </div>
        <div>
          <div className="form-label">Email</div>
          <div>{settings.email}</div>
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
          <div className="form-group">
            <label className="form-label">Frecuencia de resumen por email</label>
            <select
              className="form-input"
              value={settings.digestFrequency}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setSettings({ ...settings, digestFrequency: e.target.value as TenantSettings["digestFrequency"] })
              }
            >
              <option value="daily">Diario</option>
              <option value="weekly">Semanal</option>
              <option value="none">No enviar resumen</option>
            </select>
            <p style={{ fontSize: "0.875rem", color: "#6b7280", marginTop: "0.5rem" }}>
              Recibe un resumen de todas las alertas pendientes con la frecuencia seleccionada.
            </p>
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

        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div className="card-header">
            <h2 className="card-title">Suscripcion</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="form-label">Estado</div>
              <span className={`badge ${settings.subscriptionStatus === "active" ? "badge-success" : "badge-warning"}`}>
                {settings.subscriptionStatus === "active" ? "Plan Pro" : "Plan Gratuito"}
              </span>
            </div>
            {settings.subscriptionStatus === "active" ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCancelSubscription}
                disabled={billingLoading}
              >
                {billingLoading ? "Cargando..." : "Cancelar Suscripcion"}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setUpgradeConfirm(true)}
                disabled={billingLoading}
              >
                {billingLoading ? "Cargando..." : "Actualizar a Pro"}
              </button>
            )}
          </div>
          {/* Usage meter */}
          {limits && (
            <div style={{ marginTop: "1rem" }}>
              <div className="form-label">Uso de Umbrales</div>
              {limits.thresholds.max !== null ? (
                <>
                  <div style={{
                    backgroundColor: "#e2e8f0",
                    borderRadius: "9999px",
                    height: "0.5rem",
                    overflow: "hidden",
                    marginBottom: "0.5rem"
                  }}>
                    <div style={{
                      backgroundColor: limits.thresholds.isOverLimit ? "#ef4444" : "#3b82f6",
                      height: "100%",
                      width: `${Math.min((limits.thresholds.current / limits.thresholds.max) * 100, 100)}%`,
                      transition: "width 0.3s ease"
                    }} />
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
                    {limits.thresholds.current} de {limits.thresholds.max} umbrales (en todas tus cuentas)
                  </div>
                </>
              ) : (
                <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
                  Umbrales ilimitados
                </div>
              )}
            </div>
          )}
          {settings.subscriptionStatus !== "active" && (
            <p style={{ marginTop: "1rem", color: "#64748b", fontSize: "0.875rem" }}>
              Actualiza a Pro para acceder a alertas ilimitadas.
            </p>
          )}
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

      <ConfirmModal
        isOpen={upgradeConfirm}
        title="Actualizar a Plan Pro"
        message="Seras redirigido a MercadoPago para completar tu suscripcion al Plan Pro (precio mensual). ¿Deseas continuar?"
        confirmLabel="Continuar"
        cancelLabel="Cancelar"
        onConfirm={() => {
          setUpgradeConfirm(false);
          handleUpgrade();
        }}
        onCancel={() => setUpgradeConfirm(false)}
      />
    </div>
  );
}
