import { useEffect } from "react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../contexts/AuthContext";

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      // Store attempted URL for post-login redirect
      sessionStorage.setItem("redirect_after_login", location);
      setLocation("/login");
    }
  }, [loading, user, location, setLocation]);

  if (loading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontSize: "1.25rem",
        color: "#64748b"
      }}>
        Verificando sesion...
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
