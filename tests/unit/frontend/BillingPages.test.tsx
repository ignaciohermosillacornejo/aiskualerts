import { test, expect, describe, mock, beforeEach } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { BillingSuccess } from "@/frontend/pages/BillingSuccess";
import { BillingCancel } from "@/frontend/pages/BillingCancel";

// Mock wouter
const mockSetLocation = mock(() => undefined);
void mock.module("wouter", () => ({
  useLocation: () => ["/billing/success", mockSetLocation],
}));

describe("BillingSuccess", () => {
  beforeEach(() => {
    mockSetLocation.mockClear();
  });

  test("renders success message", () => {
    render(<BillingSuccess />);

    expect(screen.getByText("Pago Exitoso")).toBeTruthy();
    expect(screen.getByText(/Tu suscripcion a AI SKU Alerts Pro/)).toBeTruthy();
  });

  test("shows redirect message", () => {
    render(<BillingSuccess />);

    expect(screen.getByText(/Seras redirigido a configuracion/)).toBeTruthy();
  });

  test("has button to go to settings", () => {
    render(<BillingSuccess />);

    const button = screen.getByRole("button", { name: /Ir a Configuracion/i });
    expect(button).toBeTruthy();
  });

  test("clicking button navigates to settings", () => {
    render(<BillingSuccess />);

    const button = screen.getByRole("button", { name: /Ir a Configuracion/i });
    fireEvent.click(button);

    expect(mockSetLocation).toHaveBeenCalledWith("/app/settings");
  });

  test("auto-redirects after timeout", () => {
    const originalSetTimeout = globalThis.setTimeout;
    const callbacks: (() => void)[] = [];

    globalThis.setTimeout = ((cb: () => void) => {
      callbacks.push(cb);
      return 1;
    }) as typeof setTimeout;

    render(<BillingSuccess />);

    // Simulate timeout by calling captured callback
    const [callback] = callbacks;
    callback?.();

    expect(mockSetLocation).toHaveBeenCalledWith("/app/settings");

    globalThis.setTimeout = originalSetTimeout;
  });
});

describe("BillingCancel", () => {
  beforeEach(() => {
    mockSetLocation.mockClear();
  });

  test("renders cancel message", () => {
    render(<BillingCancel />);

    expect(screen.getByText("Pago Cancelado")).toBeTruthy();
    expect(screen.getByText(/El proceso de pago fue cancelado/)).toBeTruthy();
  });

  test("shows no charge message", () => {
    render(<BillingCancel />);

    expect(screen.getByText(/No se realizo ningun cargo/)).toBeTruthy();
  });

  test("has button to go to dashboard", () => {
    render(<BillingCancel />);

    const button = screen.getByRole("button", { name: /Ir al Dashboard/i });
    expect(button).toBeTruthy();
  });

  test("has button to go to settings", () => {
    render(<BillingCancel />);

    const button = screen.getByRole("button", { name: /Ir a Configuracion/i });
    expect(button).toBeTruthy();
  });

  test("clicking dashboard button navigates to dashboard", () => {
    render(<BillingCancel />);

    const button = screen.getByRole("button", { name: /Ir al Dashboard/i });
    fireEvent.click(button);

    expect(mockSetLocation).toHaveBeenCalledWith("/app");
  });

  test("clicking settings button navigates to settings", () => {
    render(<BillingCancel />);

    const button = screen.getByRole("button", { name: /Ir a Configuracion/i });
    fireEvent.click(button);

    expect(mockSetLocation).toHaveBeenCalledWith("/app/settings");
  });
});
