import { Router, Route, Switch, Redirect } from "wouter";
import { AuthProvider } from "./contexts/AuthContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";
import { Products } from "./pages/Products";
import { Settings } from "./pages/Settings";
import { Login } from "./pages/Login";
import { NotFound } from "./pages/NotFound";
import { BillingSuccess } from "./pages/BillingSuccess";
import { BillingCancel } from "./pages/BillingCancel";

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <Switch>
            <Route path="/" component={Landing} />
            <Route path="/login" component={Login} />
            <Route path="/app">
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            </Route>
{/* Redirect alerts to products (alerts now integrated into products) */}
            <Route path="/app/alerts">
              <Redirect to="/app/products" />
            </Route>
            <Route path="/app/products">
              <ProtectedRoute>
                <Layout>
                  <Products />
                </Layout>
              </ProtectedRoute>
            </Route>
{/* Redirect old thresholds URL to products (thresholds now integrated) */}
            <Route path="/app/thresholds">
              <Redirect to="/app/products" />
            </Route>
            <Route path="/app/settings">
              <ProtectedRoute>
                <Layout>
                  <Settings />
                </Layout>
              </ProtectedRoute>
            </Route>
            <Route path="/billing/success">
              <ProtectedRoute>
                <Layout>
                  <BillingSuccess />
                </Layout>
              </ProtectedRoute>
            </Route>
            <Route path="/billing/cancel">
              <ProtectedRoute>
                <Layout>
                  <BillingCancel />
                </Layout>
              </ProtectedRoute>
            </Route>
            <Route component={NotFound} />
          </Switch>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}
