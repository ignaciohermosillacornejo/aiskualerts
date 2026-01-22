import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { api } from "../api/client";

interface NavItem {
  path: string;
  label: string;
  icon: string;
  showBadge?: boolean;
}

const navItems: NavItem[] = [
  { path: "/app", label: "Dashboard", icon: "chart-bar" },
  { path: "/app/products", label: "Inventario", icon: "cube", showBadge: true },
  { path: "/app/settings", label: "Configuracion", icon: "cog" },
];

function NavIcon({ icon }: { icon: string }) {
  const icons: Record<string, ReactNode> = {
    "chart-bar": (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    bell: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
    cube: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    adjustments: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
    cog: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  };
  // eslint-disable-next-line security/detect-object-injection -- icon comes from hardcoded navItems array, not user input
  return <>{icons[icon] ?? null}</>;
}

import type { ReactNode } from "react";

export function Sidebar() {
  const [location] = useLocation();
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    function fetchAlertCount() {
      api.getAlerts({ status: "pending", limit: 0 })
        .then(({ total }) => setAlertCount(total))
        .catch(() => {
          // Silently fail
        });
    }
    fetchAlertCount();

    // Refresh every 30 seconds
    const interval = setInterval(fetchAlertCount, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">AISku Alerts</div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            className={`sidebar-link ${location === item.path ? "active" : ""}`}
          >
            <NavIcon icon={item.icon} />
            <span>{item.label}</span>
            {item.showBadge && alertCount > 0 && (
              <span className="alert-badge">{alertCount}</span>
            )}
          </Link>
        ))}
      </nav>

      <style>{`
        .alert-badge {
          background: #ef4444;
          color: white;
          font-size: 0.7rem;
          font-weight: 600;
          padding: 0.15rem 0.4rem;
          border-radius: 9999px;
          margin-left: auto;
          min-width: 1.25rem;
          text-align: center;
        }
      `}</style>
    </aside>
  );
}
