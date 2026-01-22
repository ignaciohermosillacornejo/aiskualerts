import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../api/client";
import { ConfirmModal } from "../components/ConfirmModal";
import type { Product, Threshold, LimitInfo, CreateThresholdInput } from "../types";

type FilterType = "all" | "with_threshold" | "no_threshold" | "low_stock" | "ok" | "dismissed";
type ThresholdType = "quantity" | "days";

interface ProductWithThreshold extends Product {
  thresholdData: Threshold | undefined;
}

export function Products() {
  const [products, setProducts] = useState<ProductWithThreshold[]>([]);
  const [limits, setLimits] = useState<LimitInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [bsaleConnected, setBsaleConnected] = useState(false);

  // Selection state for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Inline edit state
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [editThresholdType, setEditThresholdType] = useState<ThresholdType>("quantity");

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; productId: string | null }>({
    isOpen: false,
    productId: null,
  });

  // Bulk threshold modal
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkThresholdValue, setBulkThresholdValue] = useState("10");
  const [bulkThresholdType, setBulkThresholdType] = useState<ThresholdType>("quantity");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [settingsData, productsData, thresholdsData] = await Promise.all([
        api.getSettings().catch(() => ({ bsaleConnected: false })),
        api.getProducts().catch(() => ({ products: [] })),
        api.getThresholds().catch(() => ({ thresholds: [] })),
      ]);

      const isConnected = "bsaleConnected" in settingsData && settingsData.bsaleConnected;
      setBsaleConnected(isConnected);

      if (isConnected) {
        const thresholdsList = "thresholds" in thresholdsData ? thresholdsData.thresholds : [];

        // Merge products with their thresholds
        const productsList = "products" in productsData ? productsData.products : [];
        const thresholdMap = new Map(thresholdsList.map(t => [t.productId, t]));
        const merged = productsList.map(p => ({
          ...p,
          thresholdData: thresholdMap.get(p.id),
        }));
        setProducts(merged);
      }

      // Load limits
      try {
        const limitsData = await api.getLimits();
        setLimits(limitsData);
      } catch {
        // Silently fail
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Search filter
      const matchesSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      // Status filter
      switch (filter) {
        case "with_threshold":
          return p.thresholdData != null;
        case "no_threshold":
          return p.thresholdData == null;
        case "low_stock":
          return p.alertState === "alert";
        case "dismissed":
          return p.alertState === "dismissed";
        case "ok":
          return p.thresholdData == null || p.alertState === "ok";
        default:
          return true;
      }
    });
  }, [products, search, filter]);

  // Selection handlers
  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map(p => p.id)));
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Threshold handlers
  const handleSetThreshold = async (input: CreateThresholdInput) => {
    const product = products.find(p => p.id === input.productId);
    if (!product) return;

    try {
      if (product.thresholdData) {
        // Update existing - only pass defined values
        const updateData: Parameters<typeof api.updateThreshold>[1] = {
          thresholdType: input.thresholdType,
        };
        if (input.minQuantity !== undefined) updateData.minQuantity = input.minQuantity;
        if (input.minDays !== undefined) updateData.minDays = input.minDays;
        const updated = await api.updateThreshold(product.thresholdData.id, updateData);
        setProducts(prev => prev.map(p =>
          p.id === input.productId ? { ...p, thresholdData: updated } : p
        ));
      } else {
        // Create new
        const created = await api.createThreshold(input);
        setProducts(prev => prev.map(p =>
          p.id === input.productId ? { ...p, thresholdData: created } : p
        ));
      }
    } catch (err) {
      console.error("Error saving threshold:", err);
    }

    setEditingProductId(null);
    setEditValue("");
    setEditThresholdType("quantity");
  };

  // Dismiss alert handler
  const handleDismissAlert = async (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    try {
      await api.dismissAlert(productId);
      // Update local state to reflect dismissed status
      setProducts(prev => prev.map(p =>
        p.id === productId ? { ...p, alertState: "dismissed" as const } : p
      ));
    } catch (err) {
      console.error("Error dismissing alert:", err);
    }
  };

  const handleRemoveThreshold = async (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product?.thresholdData) return;

    try {
      await api.deleteThreshold(product.thresholdData.id);
      setProducts(prev => prev.map(p =>
        p.id === productId ? { ...p, thresholdData: undefined } : p
      ));
    } catch (err) {
      console.error("Error deleting threshold:", err);
    }

    setDeleteConfirm({ isOpen: false, productId: null });
  };

  // Bulk threshold handler
  const handleBulkSetThreshold = async () => {
    const value = parseInt(bulkThresholdValue, 10);
    if (isNaN(value) || value < 0) return;

    const selectedProducts = products.filter(p => selectedIds.has(p.id));

    for (const product of selectedProducts) {
      const input: CreateThresholdInput = {
        productId: product.id,
        thresholdType: bulkThresholdType,
        ...(bulkThresholdType === "quantity" ? { minQuantity: value } : { minDays: value }),
      };
      await handleSetThreshold(input);
    }

    setShowBulkModal(false);
    setBulkThresholdType("quantity");
    clearSelection();
  };

  // Inline edit handlers
  const startEdit = (product: ProductWithThreshold) => {
    setEditingProductId(product.id);
    const type = product.thresholdData?.thresholdType ?? "quantity";
    setEditThresholdType(type);
    setEditValue(
      type === "days"
        ? (product.thresholdData?.minDays ?? 7).toString()
        : (product.thresholdData?.minQuantity ?? 10).toString()
    );
  };

  const saveEdit = () => {
    if (!editingProductId) return;
    const value = parseInt(editValue, 10);
    if (!isNaN(value) && value >= 0) {
      const input: CreateThresholdInput = {
        productId: editingProductId,
        thresholdType: editThresholdType,
        ...(editThresholdType === "quantity" ? { minQuantity: value } : { minDays: value }),
      };
      handleSetThreshold(input);
    } else {
      setEditingProductId(null);
      setEditValue("");
      setEditThresholdType("quantity");
    }
  };

  const cancelEdit = () => {
    setEditingProductId(null);
    setEditValue("");
    setEditThresholdType("quantity");
  };

  // Get stock status based on alert state and threshold
  const getStockStatus = (product: ProductWithThreshold): "no_threshold" | "out_of_stock" | "low_stock" | "dismissed" | "ok" => {
    if (!product.thresholdData) return "no_threshold";
    if (product.alertState === "dismissed") return "dismissed";
    if (product.alertState === "alert") {
      if (product.currentStock <= 0) return "out_of_stock";
      return "low_stock";
    }
    return "ok";
  };


  if (loading) {
    return (
      <div className="products-loading">
        <div className="products-spinner" />
        <span>Cargando productos...</span>
      </div>
    );
  }

  if (!bsaleConnected) {
    return (
      <div className="products-empty-state">
        <div className="products-empty-icon">📦</div>
        <h2>Conecta tu cuenta de Bsale</h2>
        <p>Conecta tu cuenta de Bsale en Configuración para ver y gestionar tus productos.</p>
        <a href="/app/settings" className="products-btn products-btn-primary">
          Ir a Configuración
        </a>
      </div>
    );
  }

  const filterCounts = {
    all: products.length,
    with_threshold: products.filter(p => p.thresholdData != null).length,
    no_threshold: products.filter(p => p.thresholdData == null).length,
    low_stock: products.filter(p => p.alertState === "alert").length,
    dismissed: products.filter(p => p.alertState === "dismissed").length,
    ok: products.filter(p => p.thresholdData == null || p.alertState === "ok").length,
  };

  return (
    <div className="products-container">
      {/* Header with limits info */}
      <div className="products-header">
        <div className="products-header-left">
          <h1>Inventario</h1>
          {limits && (
            <span className="products-limit-badge">
              {limits.thresholds.current}/{limits.thresholds.max ?? "∞"} alertas configuradas
            </span>
          )}
        </div>

        {selectedIds.size > 0 && (
          <div className="products-bulk-actions">
            <span className="products-selection-count">
              {selectedIds.size} seleccionados
            </span>
            <button
              className="products-btn products-btn-primary"
              onClick={() => setShowBulkModal(true)}
              type="button"
            >
              Configurar alerta
            </button>
            <button
              className="products-btn products-btn-ghost"
              onClick={clearSelection}
              type="button"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Search and filters */}
      <div className="products-toolbar">
        <div className="products-search">
          <span className="products-search-icon">🔍</span>
          <input
            type="text"
            placeholder="Buscar por nombre o SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="products-filters">
          <button
            className={`products-filter-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
            type="button"
          >
            Todos <span className="products-filter-count">{filterCounts.all}</span>
          </button>
          <button
            className={`products-filter-btn filter-alert ${filter === "low_stock" ? "active" : ""}`}
            onClick={() => setFilter("low_stock")}
            type="button"
          >
            ⚠️ Stock bajo <span className="products-filter-count">{filterCounts.low_stock}</span>
          </button>
          <button
            className={`products-filter-btn filter-configured ${filter === "with_threshold" ? "active" : ""}`}
            onClick={() => setFilter("with_threshold")}
            type="button"
          >
            Con alerta <span className="products-filter-count">{filterCounts.with_threshold}</span>
          </button>
          <button
            className={`products-filter-btn filter-unconfigured ${filter === "no_threshold" ? "active" : ""}`}
            onClick={() => setFilter("no_threshold")}
            type="button"
          >
            Sin alerta <span className="products-filter-count">{filterCounts.no_threshold}</span>
          </button>
          {filterCounts.dismissed > 0 && (
            <button
              className={`products-filter-btn filter-dismissed ${filter === "dismissed" ? "active" : ""}`}
              onClick={() => setFilter("dismissed")}
              type="button"
            >
              📦 Pedido en camino <span className="products-filter-count">{filterCounts.dismissed}</span>
            </button>
          )}
        </div>
      </div>

      {/* Products table */}
      {error ? (
        <div className="products-error">
          <span>❌</span> {error}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="products-empty-state small">
          <div className="products-empty-icon">🔍</div>
          <h3>No se encontraron productos</h3>
          <p>Intenta con otros términos de búsqueda o filtros</p>
        </div>
      ) : (
        <div className="products-table-wrapper">
          <table className="products-table">
            <thead>
              <tr>
                <th className="col-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredProducts.length && filteredProducts.length > 0}
                    onChange={selectAll}
                    className="products-checkbox"
                  />
                </th>
                <th className="col-product">Producto</th>
                <th className="col-sku">SKU</th>
                <th className="col-stock">Stock actual</th>
                <th className="col-threshold">Alerta cuando</th>
                <th className="col-status">Estado</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const status = getStockStatus(product);
                const isSelected = selectedIds.has(product.id);
                const isEditing = editingProductId === product.id;

                return (
                  <tr
                    key={product.id}
                    className={`${isSelected ? "selected" : ""} ${status === "low_stock" || status === "out_of_stock" ? "alert-row" : ""}`}
                  >
                    <td className="col-checkbox">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(product.id)}
                        className="products-checkbox"
                      />
                    </td>
                    <td className="col-product">
                      <div className="product-name">{product.name}</div>
                    </td>
                    <td className="col-sku">
                      <code className="sku-badge">{product.sku}</code>
                    </td>
                    <td className="col-stock">
                      <div className="stock-display">
                        <span className={`stock-value ${status === "low_stock" || status === "out_of_stock" ? "low" : ""}`}>
                          {product.currentStock.toLocaleString()}
                        </span>
                        {product.thresholdData && (
                          <div className="stock-bar-container">
                            <div
                              className={`stock-bar ${status}`}
                              style={{
                                width: `${Math.min(100, (product.currentStock / ((product.thresholdData.minQuantity ?? 0) * 2 || 1)) * 100)}%`
                              }}
                            />
                            <div
                              className="threshold-marker"
                              style={{ left: "50%" }}
                            />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="col-threshold">
                      {isEditing ? (
                        <div className="threshold-edit">
                          <select
                            value={editThresholdType}
                            onChange={(e) => {
                              setEditThresholdType(e.target.value as ThresholdType);
                              setEditValue(e.target.value === "days" ? "7" : "10");
                            }}
                            className="threshold-type-select"
                          >
                            <option value="quantity">Cantidad</option>
                            <option value="days">Días</option>
                          </select>
                          <span className="threshold-edit-prefix">≤</span>
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit();
                              if (e.key === "Escape") cancelEdit();
                            }}
                            autoFocus
                            min="0"
                            className="threshold-input"
                          />
                          <span className="threshold-edit-suffix">
                            {editThresholdType === "days" ? "días" : "uds"}
                          </span>
                          <button type="button" onClick={saveEdit} className="threshold-save-btn">✓</button>
                          <button type="button" onClick={cancelEdit} className="threshold-cancel-btn">✕</button>
                        </div>
                      ) : product.thresholdData ? (
                        <div className="threshold-chip-container">
                          <button
                            className={`threshold-chip ${status === "low_stock" || status === "out_of_stock" ? "alert-active" : status === "dismissed" ? "alert-dismissed" : "configured"}`}
                            onClick={() => startEdit(product)}
                            type="button"
                          >
                            {status === "low_stock" || status === "out_of_stock" ? (
                              <>
                                ⚠️ {product.thresholdData.thresholdType === "days"
                                  ? `${product.velocityInfo?.daysLeft ?? "?"} días restantes`
                                  : `Stock ${product.currentStock}/${product.thresholdData.minQuantity}`}
                              </>
                            ) : status === "dismissed" ? (
                              <>
                                📦 Pedido en camino
                                <span className="chip-subtext">
                                  {product.thresholdData.thresholdType === "days"
                                    ? `${product.velocityInfo?.daysLeft ?? "?"} días`
                                    : `${product.currentStock}/${product.thresholdData.minQuantity} uds`}
                                </span>
                              </>
                            ) : (
                              <>
                                ✓ {product.thresholdData.thresholdType === "days"
                                  ? `≤${product.thresholdData.minDays} días`
                                  : `≤${(product.thresholdData.minQuantity ?? 0).toLocaleString()} uds`}
                              </>
                            )}
                          </button>
                          {(status === "low_stock" || status === "out_of_stock") && (
                            <button
                              className="dismiss-btn"
                              onClick={(e) => { e.stopPropagation(); handleDismissAlert(product.id); }}
                              title="Marcar como pedido"
                              type="button"
                            >
                              ✓ Pedido
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          className="threshold-chip unconfigured"
                          onClick={() => startEdit(product)}
                          type="button"
                        >
                          + Configurar
                        </button>
                      )}
                    </td>
                    <td className="col-status">
                      {status === "out_of_stock" && (
                        <span className="status-badge danger">Sin stock</span>
                      )}
                      {status === "low_stock" && (
                        <span className="status-badge warning">Stock bajo</span>
                      )}
                      {status === "dismissed" && (
                        <span className="status-badge dismissed">📦 En camino</span>
                      )}
                      {status === "ok" && (
                        <span className="status-badge success">OK</span>
                      )}
                      {status === "no_threshold" && (
                        <span className="status-badge neutral">—</span>
                      )}
                    </td>
                    <td className="col-actions">
                      {product.thresholdData && (
                        <button
                          className="action-btn danger"
                          onClick={() => setDeleteConfirm({ isOpen: true, productId: product.id })}
                          title="Eliminar alerta"
                          type="button"
                        >
                          🗑️
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk threshold modal */}
      {showBulkModal && (
        <div className="products-modal-overlay" onClick={() => setShowBulkModal(false)}>
          <div className="products-modal" onClick={(e) => e.stopPropagation()}>
            <div className="products-modal-header">
              <h2>Configurar alerta para {selectedIds.size} productos</h2>
              <button
                className="products-modal-close"
                onClick={() => setShowBulkModal(false)}
                type="button"
              >
                ✕
              </button>
            </div>
            <div className="products-modal-body">
              <div className="bulk-form-group">
                <label>Tipo de umbral</label>
                <select
                  value={bulkThresholdType}
                  onChange={(e) => {
                    setBulkThresholdType(e.target.value as ThresholdType);
                    setBulkThresholdValue(e.target.value === "days" ? "7" : "10");
                  }}
                  className="bulk-type-select"
                >
                  <option value="quantity">Cantidad mínima (unidades)</option>
                  <option value="days">Días de stock mínimo</option>
                </select>
              </div>
              <p>
                {bulkThresholdType === "quantity"
                  ? "Se enviará una alerta cuando el stock sea igual o menor a:"
                  : "Se enviará una alerta cuando el stock dure menos de:"}
              </p>
              <div className="bulk-input-group">
                <input
                  type="number"
                  value={bulkThresholdValue}
                  onChange={(e) => setBulkThresholdValue(e.target.value)}
                  min="0"
                  className="bulk-threshold-input"
                  autoFocus
                />
                <span>{bulkThresholdType === "days" ? "días" : "unidades"}</span>
              </div>
            </div>
            <div className="products-modal-footer">
              <button
                className="products-btn products-btn-ghost"
                onClick={() => setShowBulkModal(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="products-btn products-btn-primary"
                onClick={handleBulkSetThreshold}
                type="button"
              >
                Aplicar a {selectedIds.size} productos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title="Eliminar alerta"
        message="¿Estás seguro de eliminar esta alerta? Ya no recibirás notificaciones cuando el stock baje."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={() => deleteConfirm.productId && handleRemoveThreshold(deleteConfirm.productId)}
        onCancel={() => setDeleteConfirm({ isOpen: false, productId: null })}
      />

      <style>{`
        /* Airtable-inspired Products Page */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        .products-container {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          max-width: 100%;
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Header */
        .products-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .products-header-left {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .products-header h1 {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1f2937;
          margin: 0;
        }

        .products-limit-badge {
          background: linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%);
          color: #0369a1;
          padding: 0.375rem 0.75rem;
          border-radius: 9999px;
          font-size: 0.8125rem;
          font-weight: 500;
        }

        .products-bulk-actions {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          padding: 0.5rem 1rem;
          border-radius: 0.75rem;
          animation: slideIn 0.2s ease;
        }

        @keyframes slideIn {
          from { opacity: 0; transform: translateX(10px); }
          to { opacity: 1; transform: translateX(0); }
        }

        .products-selection-count {
          font-weight: 600;
          color: #92400e;
        }

        /* Buttons */
        .products-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          border: none;
        }

        .products-btn-primary {
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
          color: white;
          box-shadow: 0 2px 4px rgba(139, 92, 246, 0.3);
        }

        .products-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(139, 92, 246, 0.4);
        }

        .products-btn-ghost {
          background: transparent;
          color: #6b7280;
        }

        .products-btn-ghost:hover {
          background: #f3f4f6;
        }

        /* Toolbar */
        .products-toolbar {
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }

        .products-search {
          flex: 1;
          min-width: 250px;
          position: relative;
        }

        .products-search-icon {
          position: absolute;
          left: 0.875rem;
          top: 50%;
          transform: translateY(-50%);
          font-size: 0.875rem;
          opacity: 0.5;
        }

        .products-search input {
          width: 100%;
          padding: 0.625rem 1rem 0.625rem 2.5rem;
          border: 2px solid #e5e7eb;
          border-radius: 0.5rem;
          font-size: 0.9375rem;
          transition: all 0.15s ease;
          background: white;
        }

        .products-search input:focus {
          outline: none;
          border-color: #8b5cf6;
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
        }

        .products-filters {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .products-filter-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.875rem;
          border: 2px solid #e5e7eb;
          border-radius: 9999px;
          background: white;
          font-size: 0.8125rem;
          font-weight: 500;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .products-filter-btn:hover {
          border-color: #d1d5db;
          background: #f9fafb;
        }

        .products-filter-btn.active {
          border-color: #8b5cf6;
          background: #f5f3ff;
          color: #7c3aed;
        }

        .products-filter-btn.filter-alert.active {
          border-color: #f59e0b;
          background: #fffbeb;
          color: #b45309;
        }

        .products-filter-btn.filter-configured.active {
          border-color: #10b981;
          background: #ecfdf5;
          color: #059669;
        }

        .products-filter-btn.filter-unconfigured.active {
          border-color: #6b7280;
          background: #f9fafb;
          color: #4b5563;
        }

        .products-filter-count {
          background: rgba(0, 0, 0, 0.08);
          padding: 0.125rem 0.5rem;
          border-radius: 9999px;
          font-size: 0.75rem;
        }

        .products-filter-btn.active .products-filter-count {
          background: rgba(0, 0, 0, 0.1);
        }

        /* Table */
        .products-table-wrapper {
          background: white;
          border-radius: 0.75rem;
          border: 1px solid #e5e7eb;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }

        .products-table {
          width: 100%;
          border-collapse: collapse;
        }

        .products-table th {
          padding: 0.75rem 1rem;
          text-align: left;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b7280;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
          position: sticky;
          top: 0;
        }

        .products-table td {
          padding: 0.875rem 1rem;
          border-bottom: 1px solid #f3f4f6;
          vertical-align: middle;
        }

        .products-table tbody tr {
          transition: background 0.1s ease;
        }

        .products-table tbody tr:hover {
          background: #fafafa;
        }

        .products-table tbody tr.selected {
          background: #f5f3ff;
        }

        .products-table tbody tr.alert-row {
          background: #fffbeb;
        }

        .products-table tbody tr.alert-row:hover {
          background: #fef3c7;
        }

        .products-table tbody tr:last-child td {
          border-bottom: none;
        }

        /* Column widths */
        .col-checkbox { width: 48px; }
        .col-product { min-width: 200px; }
        .col-sku { width: 140px; }
        .col-stock { width: 160px; }
        .col-threshold { width: 180px; }
        .col-status { width: 120px; }
        .col-actions { width: 60px; }

        /* Checkbox */
        .products-checkbox {
          width: 18px;
          height: 18px;
          border-radius: 4px;
          cursor: pointer;
          accent-color: #8b5cf6;
        }

        /* Product name */
        .product-name {
          font-weight: 500;
          color: #1f2937;
        }

        /* SKU badge */
        .sku-badge {
          background: #f3f4f6;
          padding: 0.25rem 0.625rem;
          border-radius: 0.375rem;
          font-size: 0.8125rem;
          font-family: 'SF Mono', 'Fira Code', monospace;
          color: #4b5563;
        }

        /* Stock display */
        .stock-display {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }

        .stock-value {
          font-weight: 600;
          font-size: 1rem;
          color: #1f2937;
        }

        .stock-value.low {
          color: #dc2626;
        }

        .stock-bar-container {
          position: relative;
          height: 6px;
          background: #e5e7eb;
          border-radius: 3px;
          overflow: visible;
        }

        .stock-bar {
          height: 100%;
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        .stock-bar.ok {
          background: linear-gradient(90deg, #10b981 0%, #34d399 100%);
        }

        .stock-bar.low_stock {
          background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%);
        }

        .stock-bar.out_of_stock {
          background: linear-gradient(90deg, #ef4444 0%, #f87171 100%);
        }

        .threshold-marker {
          position: absolute;
          top: -2px;
          width: 2px;
          height: 10px;
          background: #6b7280;
          border-radius: 1px;
          transform: translateX(-50%);
        }

        /* Threshold chip */
        .threshold-chip {
          display: inline-flex;
          align-items: center;
          padding: 0.375rem 0.75rem;
          border-radius: 9999px;
          font-size: 0.8125rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          border: 2px solid transparent;
        }

        .threshold-chip.configured {
          background: #ecfdf5;
          color: #059669;
          border-color: #a7f3d0;
        }

        .threshold-chip.configured:hover {
          background: #d1fae5;
          border-color: #6ee7b7;
        }

        .threshold-chip.unconfigured {
          background: #f9fafb;
          color: #6b7280;
          border-color: #e5e7eb;
          border-style: dashed;
        }

        .threshold-chip.unconfigured:hover {
          background: #f3f4f6;
          border-color: #d1d5db;
          color: #4b5563;
        }

        .threshold-chip.alert-active {
          background: #fee2e2;
          color: #991b1b;
          border-color: #f87171;
          animation: pulse 2s infinite;
        }

        .threshold-chip.alert-active:hover {
          background: #fecaca;
          border-color: #ef4444;
        }

        .threshold-chip.alert-dismissed {
          background: #fef3c7;
          color: #92400e;
          border-color: #fbbf24;
          flex-direction: column;
          align-items: flex-start;
          line-height: 1.2;
        }

        .threshold-chip.alert-dismissed:hover {
          background: #fde68a;
          border-color: #f59e0b;
        }

        .threshold-chip-container {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .chip-subtext {
          display: block;
          font-size: 0.7rem;
          opacity: 0.8;
        }

        .dismiss-btn {
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
          background: #10b981;
          color: white;
          border: none;
          border-radius: 0.375rem;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }

        .dismiss-btn:hover {
          background: #059669;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }

        /* Threshold edit */
        .threshold-edit {
          display: flex;
          align-items: center;
          gap: 0.375rem;
        }

        .threshold-edit-prefix,
        .threshold-edit-suffix {
          font-size: 0.8125rem;
          color: #6b7280;
        }

        .threshold-input {
          width: 70px;
          padding: 0.375rem 0.5rem;
          border: 2px solid #8b5cf6;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          text-align: center;
          outline: none;
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
        }

        .threshold-type-select {
          padding: 0.375rem 0.5rem;
          border: 2px solid #e5e7eb;
          border-radius: 0.375rem;
          font-size: 0.75rem;
          background: white;
          cursor: pointer;
        }

        .threshold-type-select:focus {
          outline: none;
          border-color: #8b5cf6;
        }

        .threshold-save-btn,
        .threshold-cancel-btn {
          padding: 0.25rem 0.5rem;
          border: none;
          border-radius: 0.25rem;
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .threshold-save-btn {
          background: #10b981;
          color: white;
        }

        .threshold-save-btn:hover {
          background: #059669;
        }

        .threshold-cancel-btn {
          background: #e5e7eb;
          color: #6b7280;
        }

        .threshold-cancel-btn:hover {
          background: #d1d5db;
        }

        /* Status badge */
        .status-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.25rem 0.625rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .status-badge.success {
          background: #d1fae5;
          color: #065f46;
        }

        .status-badge.warning {
          background: #fef3c7;
          color: #92400e;
        }

        .status-badge.danger {
          background: #fee2e2;
          color: #991b1b;
        }

        .status-badge.neutral {
          background: #f3f4f6;
          color: #9ca3af;
        }

        .status-badge.dismissed {
          background: #fef3c7;
          color: #92400e;
        }

        /* Filter dismissed */
        .products-filter-btn.filter-dismissed.active {
          border-color: #f59e0b;
          background: #fffbeb;
          color: #b45309;
        }

        /* Bulk form group */
        .bulk-form-group {
          margin-bottom: 1rem;
        }

        .bulk-form-group label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          margin-bottom: 0.375rem;
        }

        .bulk-type-select {
          width: 100%;
          padding: 0.625rem 0.875rem;
          border: 2px solid #e5e7eb;
          border-radius: 0.5rem;
          font-size: 0.9375rem;
          background: white;
          cursor: pointer;
        }

        .bulk-type-select:focus {
          outline: none;
          border-color: #8b5cf6;
        }

        /* Action button */
        .action-btn {
          padding: 0.375rem;
          border: none;
          background: transparent;
          cursor: pointer;
          border-radius: 0.375rem;
          opacity: 0.5;
          transition: all 0.15s ease;
        }

        .action-btn:hover {
          opacity: 1;
          background: #fee2e2;
        }

        /* Loading */
        .products-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          padding: 4rem;
          color: #6b7280;
        }

        .products-spinner {
          width: 2.5rem;
          height: 2.5rem;
          border: 3px solid #e5e7eb;
          border-top-color: #8b5cf6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Empty state */
        .products-empty-state {
          text-align: center;
          padding: 4rem 2rem;
          background: white;
          border-radius: 1rem;
          border: 2px dashed #e5e7eb;
        }

        .products-empty-state.small {
          padding: 3rem 2rem;
        }

        .products-empty-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .products-empty-state h2,
        .products-empty-state h3 {
          color: #1f2937;
          margin: 0 0 0.5rem 0;
        }

        .products-empty-state p {
          color: #6b7280;
          margin: 0 0 1.5rem 0;
        }

        /* Error */
        .products-error {
          background: #fee2e2;
          color: #991b1b;
          padding: 1rem;
          border-radius: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        /* Modal */
        .products-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.15s ease;
        }

        .products-modal {
          background: white;
          border-radius: 1rem;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          animation: scaleIn 0.2s ease;
        }

        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }

        .products-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .products-modal-header h2 {
          font-size: 1.125rem;
          font-weight: 600;
          color: #1f2937;
          margin: 0;
        }

        .products-modal-close {
          background: none;
          border: none;
          font-size: 1.25rem;
          color: #9ca3af;
          cursor: pointer;
          padding: 0.25rem;
          line-height: 1;
        }

        .products-modal-close:hover {
          color: #6b7280;
        }

        .products-modal-body {
          padding: 1.5rem;
        }

        .products-modal-body p {
          color: #6b7280;
          margin: 0 0 1rem 0;
        }

        .bulk-input-group {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .bulk-threshold-input {
          width: 100px;
          padding: 0.75rem 1rem;
          border: 2px solid #e5e7eb;
          border-radius: 0.5rem;
          font-size: 1.25rem;
          font-weight: 600;
          text-align: center;
        }

        .bulk-threshold-input:focus {
          outline: none;
          border-color: #8b5cf6;
        }

        .products-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          padding: 1rem 1.5rem;
          border-top: 1px solid #e5e7eb;
          background: #f9fafb;
          border-radius: 0 0 1rem 1rem;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .products-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .products-toolbar {
            flex-direction: column;
          }

          .products-search {
            min-width: 100%;
          }

          .products-filters {
            overflow-x: auto;
            flex-wrap: nowrap;
            padding-bottom: 0.5rem;
          }

          .products-table-wrapper {
            overflow-x: auto;
          }

          .col-sku,
          .col-actions {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
