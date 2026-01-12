import { Router, Route, Switch } from "wouter";
import { Layout } from "./components/Layout";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";
import { Alerts } from "./pages/Alerts";
import { Products } from "./pages/Products";
import { Thresholds } from "./pages/Thresholds";
import { Settings } from "./pages/Settings";
import { Login } from "./pages/Login";
import { NotFound } from "./pages/NotFound";

export function App() {
  return (
    <Router>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/login" component={Login} />
        <Route path="/app">
          <Layout>
            <Dashboard />
          </Layout>
        </Route>
        <Route path="/app/alerts">
          <Layout>
            <Alerts />
          </Layout>
        </Route>
        <Route path="/app/products">
          <Layout>
            <Products />
          </Layout>
        </Route>
        <Route path="/app/thresholds">
          <Layout>
            <Thresholds />
          </Layout>
        </Route>
        <Route path="/app/settings">
          <Layout>
            <Settings />
          </Layout>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Router>
  );
}
