import { test, expect, describe } from "bun:test";
import { extractSessionToken } from "@/utils/cookies";

describe("extractSessionToken", () => {
  test("extracts session token from single cookie", () => {
    const token = extractSessionToken("session_token=abc123");
    expect(token).toBe("abc123");
  });

  test("extracts session token from multiple cookies", () => {
    const token = extractSessionToken(
      "other=value; session_token=xyz789; another=cookie"
    );
    expect(token).toBe("xyz789");
  });

  test("handles cookies with whitespace", () => {
    const token = extractSessionToken(
      "  session_token=token123  ;  other=value  "
    );
    expect(token).toBe("token123");
  });

  test("returns null when session_token is not present", () => {
    const token = extractSessionToken("other=value; another=cookie");
    expect(token).toBeNull();
  });

  test("returns null for empty cookie header", () => {
    const token = extractSessionToken("");
    expect(token).toBeNull();
  });

  test("handles cookie with empty value", () => {
    const token = extractSessionToken("session_token=");
    // Empty string is returned, which is a valid value
    expect(token).toBe("");
  });

  test("handles complex token values", () => {
    const complexToken = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYWJjIn0.signature";
    const token = extractSessionToken(`session_token=${complexToken}`);
    expect(token).toBe(complexToken);
  });
});
