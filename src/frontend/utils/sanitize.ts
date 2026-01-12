/**
 * Text sanitization utilities to prevent XSS attacks
 *
 * While React escapes JSX content by default, these utilities provide
 * an additional layer of defense for data from external APIs.
 */

/**
 * HTML entity map for escaping dangerous characters
 */
const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
  "`": "&#x60;",
  "=": "&#x3D;",
};

/**
 * Escapes HTML special characters to prevent XSS
 * Use this for any text that comes from external sources (APIs, user input)
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] ?? char);
}

/**
 * Sanitizes a string by removing potentially dangerous content
 * - Strips HTML tags
 * - Removes javascript: URLs
 * - Removes event handlers
 */
export function sanitizeText(text: string | null | undefined): string {
  if (text === null || text === undefined) {
    return "";
  }

  return text
    // Remove HTML tags
    .replace(/<[^>]*>/g, "")
    // Remove javascript: protocol
    .replace(/javascript:/gi, "")
    // Remove event handlers
    .replace(/on\w+\s*=/gi, "")
    // Trim whitespace
    .trim();
}

/**
 * Validates that a string doesn't contain suspicious patterns
 * Returns true if the string appears safe
 */
export function isCleanText(text: string): boolean {
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /data:/i,
    /vbscript:/i,
  ];

  return !suspiciousPatterns.some((pattern) => pattern.test(text));
}

/**
 * Sanitizes an object's string properties recursively
 * Useful for sanitizing API response data
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = sanitizeText(value);
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = sanitizeObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item: unknown): unknown => {
        if (typeof item === "string") {
          return sanitizeText(item);
        }
        if (item !== null && typeof item === "object") {
          return sanitizeObject(item as Record<string, unknown>);
        }
        return item;
      });
    } else {
      result[key] = value;
    }
  }

  return result as T;
}
