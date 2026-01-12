import { Router, Route, Switch } from "wouter";
import { Layout } from "./components/Layout";
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
        <Route path="/login" component={Login} />
        <Route path="/">
          <Layout>
            <Dashboard />
          </Layout>
        </Route>
        <Route path="/alerts">
          <Layout>
            <Alerts />
          </Layout>
        </Route>
        <Route path="/products">
          <Layout>
            <Products />
          </Layout>
        </Route>
        <Route path="/thresholds">
          <Layout>
            <Thresholds />
          </Layout>
        </Route>
        <Route path="/settings">
          <Layout>
            <Settings />
          </Layout>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Router>
  );
}
