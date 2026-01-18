import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { Product } from "../types";

export function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [bsaleConnected, setBsaleConnected] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [settingsData, productsData] = await Promise.all([
          api.getSettings().catch(() => ({ bsaleConnected: false })),
          api.getProducts().catch(() => ({ products: [] })),
        ]);
        const isConnected = "bsaleConnected" in settingsData && settingsData.bsaleConnected;
        setBsaleConnected(isConnected);
        if (isConnected && "products" in productsData) {
          setProducts(productsData.products);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar datos");
      } finally {
        setLoading(false);
      }
    }
    loadData();
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

  if (!bsaleConnected) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon">cube</div>
          <div className="empty-state-title">Conecta tu cuenta de Bsale</div>
          <p>Conecta tu cuenta de Bsale en Configuración para ver y gestionar tus productos.</p>
          <a href="/app/settings" className="btn btn-primary" style={{ marginTop: "1rem" }}>
            Ir a Configuración
          </a>
        </div>
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
                  <th>Nombre</th>
                  <th>SKU</th>
                  <th>Stock</th>
                  <th>Precio Unit.</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>
                      <code style={{ backgroundColor: "#f1f5f9", padding: "0.25rem 0.5rem", borderRadius: "0.25rem" }}>
                        {product.sku}
                      </code>
                    </td>
                    <td>
                      <strong>{product.currentStock.toLocaleString()}</strong>
                    </td>
                    <td>
                      {product.unitPrice !== null
                        ? `$ ${product.unitPrice.toLocaleString("es-CL")}`
                        : "-"}
                    </td>
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
