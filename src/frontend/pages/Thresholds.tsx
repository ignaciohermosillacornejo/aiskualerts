import { useState, useEffect } from "react";
import { api } from "../api/client";
import { ConfirmModal } from "../components/ConfirmModal";
import { sanitizeText } from "../utils/sanitize";
import type { Threshold, Product, LimitInfo } from "../types";

const BANNER_DISMISS_KEY = "limitBannerDismissedAt";
const BANNER_DISMISS_DAYS = 7;

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

  function shouldShowOverLimitBanner(): boolean {
    if (!limits?.thresholds.isOverLimit) return false;

    const dismissedAt = localStorage.getItem(BANNER_DISMISS_KEY);
    if (!dismissedAt) return true;

    const dismissDate = new Date(dismissedAt);
    const daysSince = (Date.now() - dismissDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= BANNER_DISMISS_DAYS;
  }

  function handleDismissBanner() {
    localStorage.setItem(BANNER_DISMISS_KEY, new Date().toISOString());
    // Force re-render by updating limits state
    setLimits(limits ? { ...limits } : null);
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
              <p data-testid="usage-counter" style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
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

        {/* Approaching limit banner (40-49) */}
        {limits && limits.thresholds.max !== null &&
         limits.thresholds.current >= 40 &&
         limits.thresholds.current < 50 && (
          <div data-testid="approaching-limit-banner" style={{
            backgroundColor: "#fef3c7",
            padding: "0.75rem 1rem",
            borderRadius: "0.375rem",
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem"
          }}>
            <span style={{ color: "#92400e" }}>
              Te estas acercando a tu limite gratuito de {limits.thresholds.max} umbrales.
            </span>
            <a href="/settings" style={{ color: "#92400e", fontWeight: 500 }}>
              Actualizar a Pro
            </a>
          </div>
        )}

        {/* Over limit banner (50+) */}
        {shouldShowOverLimitBanner() && limits && (
          <div data-testid="over-limit-banner" style={{
            backgroundColor: "#fee2e2",
            padding: "0.75rem 1rem",
            borderRadius: "0.375rem",
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ color: "#991b1b" }}>
                {limits.thresholds.current - (limits.thresholds.max ?? 0)} umbrales estan inactivos.
              </span>
              <a href="/settings" style={{ color: "#991b1b", fontWeight: 500 }}>
                Actualiza a Pro para alertas ilimitadas
              </a>
            </div>
            <button
              onClick={handleDismissBanner}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#991b1b",
                fontSize: "1.25rem",
                lineHeight: 1
              }}
              type="button"
              aria-label="Cerrar"
            >
              &times;
            </button>
          </div>
        )}

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
                  const isInactive = !threshold.isActive;

                  return (
                    <tr key={threshold.id} style={isInactive ? { opacity: 0.6 } : undefined}>
                      <td>{sanitizeText(threshold.productName)}</td>
                      <td>
                        <strong>{threshold.minQuantity.toLocaleString()}</strong>
                      </td>
                      <td>{product?.currentStock.toLocaleString() ?? "-"}</td>
                      <td>
                        {isInactive ? (
                          <span className="badge badge-secondary" title="Actualiza a Pro para activar">
                            Inactivo
                          </span>
                        ) : (
                          <span className={`badge ${isBelowThreshold ? "badge-danger" : "badge-success"}`}>
                            {isBelowThreshold ? "Alerta" : "OK"}
                          </span>
                        )}
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
          limits={limits}
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
        data-testid="confirm-modal"
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
  limits: LimitInfo | null;
  onSave: (data: ThresholdFormData) => void;
  onClose: () => void;
}

function ThresholdModal({ threshold, products, limits, onSave, onClose }: ThresholdModalProps) {
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
      <div className="card" style={{ width: "100%", maxWidth: "400px" }} data-testid="threshold-modal">
        <div className="card-header">
          <h2 className="card-title">{threshold ? "Editar Umbral" : "Nuevo Umbral"}</h2>
          <button className="btn btn-secondary" onClick={onClose} type="button">X</button>
        </div>
        <form onSubmit={handleSubmit}>
          {/* Show warning if creating new threshold and over limit */}
          {!threshold && limits?.thresholds.isOverLimit && (
            <div data-testid="limit-warning" style={{
              backgroundColor: "#fef3c7",
              padding: "0.75rem",
              borderRadius: "0.375rem",
              marginBottom: "1rem",
              fontSize: "0.875rem",
              color: "#92400e"
            }}>
              Este umbral no generara alertas hasta que actualices a Pro.
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Producto</label>
            <select
              className="form-input"
              value={productId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setProductId(e.target.value)}
              disabled={!!threshold}
              data-testid="product-select"
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
