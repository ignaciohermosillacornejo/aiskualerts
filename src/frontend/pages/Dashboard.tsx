import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import { sanitizeText } from "../utils/sanitize";
import type { DashboardStats, Alert } from "../types";

interface SyncResult {
  success: boolean;
  productsUpdated: number;
  alertsGenerated: number;
  duration: number;
  error?: string;
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [bsaleConnected, setBsaleConnected] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const [statsData, alertsData, settingsData] = await Promise.all([
        api.getDashboardStats(),
        api.getAlerts({ limit: 5 }),
        api.getSettings(),
      ]);
      setStats(statsData);
      setRecentAlerts(alertsData.alerts);
      setLastSyncAt(settingsData.lastSyncAt ?? null);
      setBsaleConnected(settingsData.bsaleConnected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await api.triggerSync();
      setSyncResult(result);
      if (result.success) {
        setLastSyncAt(new Date().toISOString());
        // Reload dashboard data after successful sync
        await loadDashboard();
      }
    } catch (err) {
      setSyncResult({
        success: false,
        productsUpdated: 0,
        alertsGenerated: 0,
        duration: 0,
        error: err instanceof Error ? err.message : "Error al sincronizar",
      });
    } finally {
      setSyncing(false);
    }
  }, [loadDashboard]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-title">Error</div>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="stats-grid">
        <StatCard
          label="Productos Totales"
          value={stats?.totalProducts ?? 0}
        />
        <StatCard
          label="Alertas Activas"
          value={stats?.activeAlerts ?? 0}
          highlight={stats?.activeAlerts ? "danger" : undefined}
        />
        <StatCard
          label="Stock Bajo"
          value={stats?.lowStockProducts ?? 0}
          highlight={stats?.lowStockProducts ? "warning" : undefined}
        />
        <StatCard
          label="Umbrales Configurados"
          value={stats?.configuredThresholds ?? 0}
        />
      </div>

      {bsaleConnected ? (
        <SyncCard
          syncing={syncing}
          syncResult={syncResult}
          lastSyncAt={lastSyncAt}
          onSync={handleSync}
        />
      ) : (
        <ConnectBsaleCard />
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Alertas Recientes</h2>
          <a href="/app/alerts" className="btn btn-secondary">Ver todas</a>
        </div>
        {recentAlerts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">bell</div>
            <div className="empty-state-title">Sin alertas</div>
            <p>No hay alertas activas en este momento</p>
          </div>
        ) : (
          <div>
            {recentAlerts.map((alert) => (
              <AlertItem key={alert.id} alert={alert} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface SyncCardProps {
  syncing: boolean;
  syncResult: SyncResult | null;
  lastSyncAt: string | null;
  onSync: () => void;
}

function SyncCard({ syncing, syncResult, lastSyncAt, onSync }: SyncCardProps) {
  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <div className="card-header">
        <div>
          <h2 className="card-title">Sincronizacion</h2>
          {lastSyncAt && (
            <p style={{ color: "#64748b", fontSize: "0.875rem", margin: "0.25rem 0 0 0" }}>
              Ultima sincronizacion: {formatRelativeTime(lastSyncAt)}
            </p>
          )}
        </div>
        <button
          className="btn btn-primary"
          onClick={onSync}
          disabled={syncing}
          style={{ minWidth: "120px" }}
        >
          {syncing ? (
            <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className="spinner" style={{ width: "16px", height: "16px" }} />
              Sincronizando...
            </span>
          ) : (
            "Sincronizar Ahora"
          )}
        </button>
      </div>
      {syncResult && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: syncResult.success ? "#f0fdf4" : "#fef2f2",
            borderRadius: "0.5rem",
            marginTop: "1rem",
          }}
        >
          {syncResult.success ? (
            <div style={{ color: "#166534" }}>
              <strong>Sincronizacion exitosa</strong>
              <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.875rem" }}>
                {syncResult.productsUpdated} productos actualizados, {syncResult.alertsGenerated} alertas generadas
                ({Math.round(syncResult.duration / 1000)}s)
              </p>
            </div>
          ) : (
            <div style={{ color: "#991b1b" }}>
              <strong>Error en sincronizacion</strong>
              <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.875rem" }}>
                {syncResult.error ?? "Error desconocido"}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConnectBsaleCard() {
  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <div className="empty-state">
        <div className="empty-state-icon">link</div>
        <div className="empty-state-title">Conecta Bsale para sincronizar</div>
        <p>Conecta tu cuenta de Bsale para sincronizar tu inventario y recibir alertas de stock bajo.</p>
        <a href="/app/settings" className="btn btn-primary" style={{ marginTop: "1rem" }}>
          Ir a Configuracion
        </a>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  highlight?: "warning" | "danger" | undefined;
}

function StatCard({ label, value, highlight }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={highlight === "danger" ? { color: "#ef4444" } : highlight === "warning" ? { color: "#f59e0b" } : undefined}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function AlertItem({ alert }: { alert: Alert }) {
  const isWarning = alert.type === "low_velocity";
  return (
    <div className="alert-item">
      <div className={`alert-icon ${isWarning ? "warning" : "danger"}`}>
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <div className="alert-content">
        <div className="alert-title">{sanitizeText(alert.productName)}</div>
        <div className="alert-description">{sanitizeText(alert.message)}</div>
      </div>
      <div className="alert-time">{formatRelativeTime(alert.createdAt)}</div>
    </div>
  );
}

function formatRelativeTime(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `hace ${diffMins} min`;
  if (diffHours < 24) return `hace ${diffHours}h`;
  return `hace ${diffDays}d`;
}
