import { useState, useEffect } from "react";
import { api } from "../api/client";
import { ConfirmModal } from "../components/ConfirmModal";
import { sanitizeText } from "../utils/sanitize";
import type { Threshold, Product, LimitInfo } from "../types";

export function Thresholds() {
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [limits, setLimits] = useState<LimitInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingThreshold, setEditingThreshold] = useState<Threshold | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; thresholdId: string | null }>({
    isOpen: false,
    thresholdId: null,
  });

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [thresholdsData, productsData] = await Promise.all([
          api.getThresholds(),
          api.getProducts(),
        ]);
        setThresholds(thresholdsData.thresholds);
        setProducts(productsData.products);

        // Fetch limits separately - failure shouldn't break the page
        try {
          const limitsData = await api.getLimits();
          setLimits(limitsData);
        } catch {
          // Silently fail - limits are supplementary UI info
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar datos");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  function handleEdit(threshold: Threshold) {
    setEditingThreshold(threshold);
    setShowModal(true);
  }

  function handleCreate() {
    setEditingThreshold(null);
    setShowModal(true);
  }

  function handleDeleteClick(thresholdId: string) {
    setDeleteConfirm({ isOpen: true, thresholdId });
  }

  async function handleDeleteConfirm() {
    const thresholdId = deleteConfirm.thresholdId;
    if (!thresholdId) return;

    try {
      await api.deleteThreshold(thresholdId);
      setThresholds((prev) => prev.filter((t) => t.id !== thresholdId));
    } catch (err) {
      console.error("Error deleting threshold:", err);
    } finally {
      setDeleteConfirm({ isOpen: false, thresholdId: null });
    }
  }

  function handleDeleteCancel() {
    setDeleteConfirm({ isOpen: false, thresholdId: null });
  }

  async function handleSave(data: ThresholdFormData) {
    try {
      if (editingThreshold) {
        const updated = await api.updateThreshold(editingThreshold.id, data);
        setThresholds((prev) =>
          prev.map((t) => (t.id === editingThreshold.id ? updated : t))
        );
      } else {
        const created = await api.createThreshold(data);
        setThresholds((prev) => [...prev, created]);
      }
      setShowModal(false);
    } catch (err) {
      console.error("Error saving threshold:", err);
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Umbrales de Alerta</h2>
            {limits && (
              <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
                {limits.thresholds.max !== null
                  ? `Usando ${limits.thresholds.current} de ${limits.thresholds.max} umbrales`
                  : `Usando ${limits.thresholds.current} umbrales`}
              </p>
            )}
          </div>
          <button className="btn btn-primary" onClick={handleCreate} type="button">
            + Nuevo Umbral
          </button>
        </div>
        {error ? (
          <div className="empty-state">
            <div className="empty-state-title">Error</div>
            <p>{error}</p>
          </div>
        ) : thresholds.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">adjustments</div>
            <div className="empty-state-title">Sin umbrales</div>
            <p>Configure umbrales para recibir alertas cuando el stock baje</p>
            <button className="btn btn-primary" onClick={handleCreate} style={{ marginTop: "1rem" }} type="button">
              Crear primer umbral
            </button>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Umbral Minimo</th>
                  <th>Stock Actual</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {thresholds.map((threshold) => {
                  const product = products.find((p) => p.id === threshold.productId);
                  const isBelowThreshold = product && product.currentStock <= threshold.minQuantity;
                  return (
                    <tr key={threshold.id}>
                      <td>{sanitizeText(threshold.productName)}</td>
                      <td>
                        <strong>{threshold.minQuantity.toLocaleString()}</strong>
                      </td>
                      <td>{product?.currentStock.toLocaleString() ?? "-"}</td>
                      <td>
                        <span className={`badge ${isBelowThreshold ? "badge-danger" : "badge-success"}`}>
                          {isBelowThreshold ? "Alerta" : "OK"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button
                            className="btn btn-secondary"
                            onClick={() => handleEdit(threshold)}
                            type="button"
                          >
                            Editar
                          </button>
                          <button
                            className="btn btn-danger"
                            onClick={() => handleDeleteClick(threshold.id)}
                            type="button"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <ThresholdModal
          threshold={editingThreshold}
          products={products}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}

      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title="Eliminar Umbral"
        message="Esta seguro de eliminar este umbral? Esta accion no se puede deshacer."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  );
}

interface ThresholdFormData {
  productId: string;
  minQuantity: number;
}

interface ThresholdModalProps {
  threshold: Threshold | null;
  products: Product[];
  onSave: (data: ThresholdFormData) => void;
  onClose: () => void;
}

function ThresholdModal({ threshold, products, onSave, onClose }: ThresholdModalProps) {
  const [productId, setProductId] = useState(threshold?.productId ?? "");
  const [minQuantity, setMinQuantity] = useState(threshold?.minQuantity ?? 10);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId) return;
    onSave({ productId, minQuantity });
  }

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 50,
    }}>
      <div className="card" style={{ width: "100%", maxWidth: "400px" }}>
        <div className="card-header">
          <h2 className="card-title">{threshold ? "Editar Umbral" : "Nuevo Umbral"}</h2>
          <button className="btn btn-secondary" onClick={onClose} type="button">X</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Producto</label>
            <select
              className="form-input"
              value={productId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setProductId(e.target.value)}
              disabled={!!threshold}
            >
              <option value="">Seleccionar producto...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Cantidad Minima</label>
            <input
              type="number"
              className="form-input"
              value={minQuantity}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMinQuantity(parseInt(e.target.value, 10) || 0)}
              min="0"
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={!productId}>
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
