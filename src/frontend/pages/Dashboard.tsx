import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { DashboardStats, Alert } from "../types";

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        const [statsData, alertsData] = await Promise.all([
          api.getDashboardStats(),
          api.getAlerts({ limit: 5 }),
        ]);
        setStats(statsData);
        setRecentAlerts(alertsData.alerts);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar datos");
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

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

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Alertas Recientes</h2>
          <a href="/alerts" className="btn btn-secondary">Ver todas</a>
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
        <div className="alert-title">{alert.productName}</div>
        <div className="alert-description">{alert.message}</div>
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
