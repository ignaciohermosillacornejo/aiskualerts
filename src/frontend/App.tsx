import { Router, Route, Switch } from "wouter";
import { AuthProvider } from "./contexts/AuthContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";
import { Alerts } from "./pages/Alerts";
import { Products } from "./pages/Products";
import { Thresholds } from "./pages/Thresholds";
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
            <Route path="/app/alerts">
              <ProtectedRoute>
                <Layout>
                  <Alerts />
                </Layout>
              </ProtectedRoute>
            </Route>
            <Route path="/app/products">
              <ProtectedRoute>
                <Layout>
                  <Products />
                </Layout>
              </ProtectedRoute>
            </Route>
            <Route path="/app/thresholds">
              <ProtectedRoute>
                <Layout>
                  <Thresholds />
                </Layout>
              </ProtectedRoute>
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
