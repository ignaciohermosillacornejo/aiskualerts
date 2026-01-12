import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { Product } from "../types";

export function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadProducts() {
      try {
        setLoading(true);
        const data = await api.getProducts();
        setProducts(data.products);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar productos");
      } finally {
        setLoading(false);
      }
    }
    loadProducts();
  }, []);

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <input
            type="text"
            className="form-input"
            placeholder="Buscar por nombre o SKU..."
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Productos ({filteredProducts.length})</h2>
        </div>
        {error ? (
          <div className="empty-state">
            <div className="empty-state-title">Error</div>
            <p>{error}</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">cube</div>
            <div className="empty-state-title">Sin productos</div>
            <p>No se encontraron productos</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Nombre</th>
                  <th>Stock Actual</th>
                  <th>Estado</th>
                  <th>Ultima Sync</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <code style={{ backgroundColor: "#f1f5f9", padding: "0.25rem 0.5rem", borderRadius: "0.25rem" }}>
                        {product.sku}
                      </code>
                    </td>
                    <td>{product.name}</td>
                    <td>
                      <strong>{product.currentStock.toLocaleString()}</strong>
                    </td>
                    <td>
                      <StockBadge stock={product.currentStock} threshold={product.threshold} />
                    </td>
                    <td>{new Date(product.lastSyncAt).toLocaleDateString("es-CL")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StockBadge({ stock, threshold }: { stock: number; threshold: number | null }) {
  if (threshold === null) {
    return <span className="badge badge-info">Sin umbral</span>;
  }
  if (stock <= threshold) {
    return <span className="badge badge-danger">Stock bajo</span>;
  }
  if (stock <= threshold * 1.5) {
    return <span className="badge badge-warning">Precaucion</span>;
  }
  return <span className="badge badge-success">OK</span>;
}
