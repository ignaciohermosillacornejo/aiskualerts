import { useState, useRef, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";

export function TenantSwitcher() {
  const { currentTenant, tenants, switchTenant, loading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Don't show if user has no tenants or only one tenant
  if (tenants.length <= 1) {
    return currentTenant ? (
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.5rem 0.75rem",
        backgroundColor: "#f1f5f9",
        borderRadius: "0.375rem",
        fontSize: "0.875rem",
        color: "#475569",
      }}>
        <span style={{ fontWeight: 500 }}>
          {currentTenant.name ?? currentTenant.bsaleClientCode ?? "Cuenta"}
        </span>
      </div>
    ) : null;
  }

  async function handleSwitchTenant(tenantId: string) {
    if (tenantId === currentTenant?.id || switching) return;

    try {
      setSwitching(true);
      await switchTenant(tenantId);
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to switch tenant:", error);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading || switching}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 0.75rem",
          backgroundColor: isOpen ? "#e2e8f0" : "#f1f5f9",
          border: "1px solid #e2e8f0",
          borderRadius: "0.375rem",
          fontSize: "0.875rem",
          color: "#475569",
          cursor: "pointer",
          transition: "background-color 0.15s",
        }}
      >
        <span style={{ fontWeight: 500, maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {currentTenant?.name ?? currentTenant?.bsaleClientCode ?? "Seleccionar cuenta"}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        >
          <path
            d="M2.5 4.5L6 8L9.5 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            minWidth: "200px",
            backgroundColor: "white",
            border: "1px solid #e2e8f0",
            borderRadius: "0.375rem",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "0.5rem 0" }}>
            {tenants.map((tenant) => (
              <button
                key={tenant.id}
                type="button"
                onClick={() => handleSwitchTenant(tenant.id)}
                disabled={switching}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "0.5rem 1rem",
                  backgroundColor: tenant.id === currentTenant?.id ? "#f1f5f9" : "transparent",
                  border: "none",
                  fontSize: "0.875rem",
                  color: "#1e293b",
                  cursor: tenant.id === currentTenant?.id ? "default" : "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: tenant.id === currentTenant?.id ? 600 : 400,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {tenant.name ?? tenant.bsaleClientCode ?? "Sin nombre"}
                  </div>
                  <div style={{
                    fontSize: "0.75rem",
                    color: "#64748b",
                    marginTop: "0.125rem",
                  }}>
                    {tenant.role === "owner" ? "Propietario" : tenant.role === "admin" ? "Admin" : "Miembro"}
                  </div>
                </div>
                {tenant.id === currentTenant?.id && (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    style={{ flexShrink: 0, marginLeft: "0.5rem" }}
                  >
                    <path
                      d="M13.5 4.5L6 12L2.5 8.5"
                      stroke="#22c55e"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
