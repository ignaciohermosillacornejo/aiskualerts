export interface MagicLinkEmailParams {
  email: string;
  magicLinkUrl: string;
  expiresInMinutes: number;
}

export function renderMagicLinkEmail(params: MagicLinkEmailParams): string {
  const { magicLinkUrl, expiresInMinutes } = params;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Inicia sesion en AISku Alerts</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center;">
              <h1 style="margin: 0; color: #111827; font-size: 24px; font-weight: 700;">
                AISku Alerts
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 20px 40px;">
              <h2 style="margin: 0 0 16px 0; color: #111827; font-size: 20px; font-weight: 600;">
                Inicia sesion en tu cuenta
              </h2>
              <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                Haz clic en el siguiente boton para iniciar sesion en AISku Alerts. Este enlace expira en ${String(expiresInMinutes)} minutos.
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td style="text-align: center; padding: 16px 0;">
                    <a href="${magicLinkUrl}"
                       style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 6px;">
                      Iniciar Sesion
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Si no puedes hacer clic en el boton, copia y pega este enlace en tu navegador:
              </p>
              <p style="margin: 8px 0 0 0; word-break: break-all;">
                <a href="${magicLinkUrl}" style="color: #2563eb; font-size: 14px;">
                  ${magicLinkUrl}
                </a>
              </p>
            </td>
          </tr>

          <!-- Security Notice -->
          <tr>
            <td style="padding: 20px 40px 40px 40px;">
              <div style="padding: 16px; background-color: #f9fafb; border-radius: 6px; border-left: 4px solid #9ca3af;">
                <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                  <strong>Nota de seguridad:</strong> Si no solicitaste este enlace, puedes ignorar este correo de forma segura. Tu cuenta permanecera protegida.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                Este es un correo automatico de AISku Alerts.
                <br>
                Por favor no respondas a este mensaje.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
