export interface AlertSummary {
  sku: string;
  productName: string;
  currentStock: number;
  threshold: number | null;
  alertType: "low_stock" | "out_of_stock" | "low_velocity";
}

export interface DigestEmailParams {
  tenantName: string;
  date: Date;
  alerts: AlertSummary[];
  skippedThresholdCount?: number;
  upgradeUrl?: string;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-CL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getAlertTypeBadge(alertType: AlertSummary["alertType"]): string {
  const badges: Record<AlertSummary["alertType"], { label: string; color: string }> = {
    out_of_stock: { label: "Sin Stock", color: "#dc2626" },
    low_stock: { label: "Stock Bajo", color: "#f59e0b" },
    low_velocity: { label: "Baja Rotacion", color: "#6366f1" },
  };

  // eslint-disable-next-line security/detect-object-injection -- alertType is a 3-value union type, not user input
  const badge = badges[alertType];
  return `<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; color: white; background-color: ${badge.color};">${badge.label}</span>`;
}

function getAlertTypeRowColor(alertType: AlertSummary["alertType"]): string {
  const colors: Record<AlertSummary["alertType"], string> = {
    out_of_stock: "#fef2f2",
    low_stock: "#fffbeb",
    low_velocity: "#eef2ff",
  };
  // eslint-disable-next-line security/detect-object-injection -- alertType is a 3-value union type, not user input
  return colors[alertType];
}

function renderSkippedThresholdsSection(
  skippedCount: number,
  upgradeUrl?: string
): string {
  if (skippedCount <= 0) {
    return "";
  }

  const isSingular = skippedCount === 1;
  const umbralWord = isSingular ? "umbral" : "umbrales";
  const estaWord = isSingular ? "no esta" : "no estan";

  const upgradeButton = upgradeUrl
    ? `
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top: 12px;">
                <tr>
                  <td style="background-color: #f59e0b; border-radius: 4px;">
                    <a href="${escapeHtml(upgradeUrl)}"
                       style="display: inline-block; padding: 8px 16px;
                              color: white; text-decoration: none;
                              font-weight: 500; font-size: 14px;">
                      Actualizar a Pro
                    </a>
                  </td>
                </tr>
              </table>`
    : "";

  return `
          <!-- Skipped Thresholds Section -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <div style="padding: 16px; background-color: #fef3c7; border-radius: 8px;">
                <h3 style="margin: 0 0 8px 0; color: #92400e; font-size: 14px; font-weight: 600;">
                  Omitidos por Limite del Plan Gratuito
                </h3>
                <p style="margin: 0; color: #78350f; font-size: 14px;">
                  Tienes ${String(skippedCount)} ${umbralWord} que ${estaWord} generando alertas.
                  Actualiza a Pro para monitoreo ilimitado de umbrales.
                </p>
                ${upgradeButton}
              </div>
            </td>
          </tr>`;
}

export function renderDailyDigestEmail(params: DigestEmailParams): string {
  const { tenantName, date, alerts, skippedThresholdCount, upgradeUrl } = params;

  if (alerts.length === 0) {
    return "";
  }

  const outOfStockCount = alerts.filter((a) => a.alertType === "out_of_stock").length;
  const lowStockCount = alerts.filter((a) => a.alertType === "low_stock").length;
  const lowVelocityCount = alerts.filter((a) => a.alertType === "low_velocity").length;

  const alertRows = alerts
    .map(
      (alert) => `
      <tr style="background-color: ${getAlertTypeRowColor(alert.alertType)};">
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-family: monospace; font-size: 14px;">${escapeHtml(alert.sku)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(alert.productName)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; font-weight: 600;">${String(alert.currentStock)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${alert.threshold !== null ? String(alert.threshold) : "-"}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${getAlertTypeBadge(alert.alertType)}</td>
      </tr>
    `
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Resumen de Alertas - ${escapeHtml(tenantName)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px; background-color: #0ea5e9; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">AISku Alerts</h1>
              <p style="margin: 8px 0 0; color: #e0f2fe; font-size: 14px;">Resumen de Inventario</p>
            </td>
          </tr>

          <!-- Company & Date -->
          <tr>
            <td style="padding: 24px 32px 16px;">
              <h2 style="margin: 0; color: #1f2937; font-size: 20px; font-weight: 600;">${escapeHtml(tenantName)}</h2>
              <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">${formatDate(date)}</p>
            </td>
          </tr>

          <!-- Summary Stats -->
          <tr>
            <td style="padding: 16px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 16px; background-color: #fef2f2; border-radius: 8px; text-align: center; width: 33%;">
                    <div style="font-size: 28px; font-weight: 700; color: #dc2626;">${String(outOfStockCount)}</div>
                    <div style="font-size: 12px; color: #991b1b; margin-top: 4px;">Sin Stock</div>
                  </td>
                  <td style="width: 16px;"></td>
                  <td style="padding: 16px; background-color: #fffbeb; border-radius: 8px; text-align: center; width: 33%;">
                    <div style="font-size: 28px; font-weight: 700; color: #f59e0b;">${String(lowStockCount)}</div>
                    <div style="font-size: 12px; color: #92400e; margin-top: 4px;">Stock Bajo</div>
                  </td>
                  <td style="width: 16px;"></td>
                  <td style="padding: 16px; background-color: #eef2ff; border-radius: 8px; text-align: center; width: 33%;">
                    <div style="font-size: 28px; font-weight: 700; color: #6366f1;">${String(lowVelocityCount)}</div>
                    <div style="font-size: 12px; color: #4338ca; margin-top: 4px;">Baja Rotacion</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Alert Table -->
          <tr>
            <td style="padding: 24px 32px;">
              <h3 style="margin: 0 0 16px; color: #1f2937; font-size: 16px; font-weight: 600;">Detalle de Alertas (${String(alerts.length)})</h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px;">
                <thead>
                  <tr style="background-color: #f9fafb;">
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">SKU</th>
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Producto</th>
                    <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Stock</th>
                    <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Umbral</th>
                    <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  ${alertRows}
                </tbody>
              </table>
            </td>
          </tr>

          ${renderSkippedThresholdsSection(skippedThresholdCount ?? 0, upgradeUrl)}

          <!-- CTA Button -->
          <tr>
            <td style="padding: 16px 32px 32px;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background-color: #0ea5e9; border-radius: 6px;">
                    <a href="https://app.aiskualerts.com/app/alerts" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600;">Ver Todas las Alertas</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; text-align: center;">
                Este correo fue enviado automaticamente por AISku Alerts.<br>
                Para cambiar tus preferencias de notificacion, visita la seccion de Configuracion.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  const htmlEscapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  // eslint-disable-next-line security/detect-object-injection -- char comes from regex [&<>"'], not user input
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char] ?? char);
}
