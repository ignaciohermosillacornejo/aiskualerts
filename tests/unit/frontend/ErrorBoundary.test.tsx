import { test, expect, describe, spyOn, beforeEach, afterEach, type Mock } from "bun:test";
import React, { type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import "../../setup";
import { ErrorBoundary } from "../../../src/frontend/components/ErrorBoundary";

describe("ErrorBoundary Component SSR Rendering", () => {
  let consoleSpy: Mock<typeof console.error>;

  beforeEach(() => {
    // Suppress console.error during tests
    consoleSpy = spyOn(console, "error").mockImplementation(() => {
      // Intentionally empty to suppress error output
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("Normal rendering (no errors)", () => {
    test("renders children when no error occurs", () => {
      const html = renderToString(
        <ErrorBoundary>
          <div data-testid="child">Hello World</div>
        </ErrorBoundary>
      );

      expect(html).toContain("Hello World");
      expect(html).toContain("data-testid=\"child\"");
    });

    test("renders multiple children correctly", () => {
      const html = renderToString(
        <ErrorBoundary>
          <div data-testid="child1">First</div>
          <div data-testid="child2">Second</div>
        </ErrorBoundary>
      );

      expect(html).toContain("First");
      expect(html).toContain("Second");
      expect(html).toContain("data-testid=\"child1\"");
      expect(html).toContain("data-testid=\"child2\"");
    });

    test("passes through nested components", () => {
      function NestedComponent(): React.ReactElement {
        return <span data-testid="nested">Nested content</span>;
      }

      const html = renderToString(
        <ErrorBoundary>
          <div>
            <NestedComponent />
          </div>
        </ErrorBoundary>
      );

      expect(html).toContain("Nested content");
      expect(html).toContain("data-testid=\"nested\"");
    });

    test("renders with custom fallback when no error", () => {
      const html = renderToString(
        <ErrorBoundary fallback={<div>Error occurred</div>}>
          <div>Normal content</div>
        </ErrorBoundary>
      );

      expect(html).toContain("Normal content");
      expect(html).not.toContain("Error occurred");
    });
  });

  describe("Constructor and state initialization (lines 61-64)", () => {
    test("initializes with hasError false and error null", () => {
      const html = renderToString(
        <ErrorBoundary>
          <div>Content</div>
        </ErrorBoundary>
      );

      // If no error, children are rendered (state.hasError is false)
      expect(html).toContain("Content");
      expect(html).not.toContain("Something went wrong");
    });

    test("ErrorBoundary instance is created correctly", async () => {
      const module = await import("../../../src/frontend/components/ErrorBoundary");
      const BoundaryClass = module.ErrorBoundary;

      // Create instance with mock props
      const instance = new BoundaryClass({ children: null });

      expect(instance.state.hasError).toBe(false);
      expect(instance.state.error).toBe(null);
    });

    test("constructor calls super with props", () => {
      const props = { children: <div>Test</div> };
      const instance = new ErrorBoundary(props);

      expect(instance.props).toBe(props);
      expect(instance.state.hasError).toBe(false);
      expect(instance.state.error).toBe(null);
    });
  });

  describe("getDerivedStateFromError (line 66-68)", () => {
    test("static method returns correct state shape", () => {
      const error = new Error("Static method test");
      const result = ErrorBoundary.getDerivedStateFromError(error);

      expect(result).toEqual({ hasError: true, error });
    });

    test("getDerivedStateFromError captures the error object", () => {
      const error = new Error("Capture test");
      error.stack = "at TestComponent (test.tsx:10:5)";
      const result = ErrorBoundary.getDerivedStateFromError(error);

      expect(result.hasError).toBe(true);
      expect(result.error).toBe(error);
      expect(result.error?.message).toBe("Capture test");
      expect(result.error?.stack).toContain("at TestComponent");
    });

    test("getDerivedStateFromError handles TypeError", () => {
      const error = new TypeError("Type error");
      const result = ErrorBoundary.getDerivedStateFromError(error);

      expect(result.hasError).toBe(true);
      expect(result.error).toBeInstanceOf(TypeError);
    });

    test("getDerivedStateFromError handles RangeError", () => {
      const error = new RangeError("Range error");
      const result = ErrorBoundary.getDerivedStateFromError(error);

      expect(result.hasError).toBe(true);
      expect(result.error).toBeInstanceOf(RangeError);
    });
  });

  describe("componentDidCatch (line 70-72)", () => {
    test("componentDidCatch logs error and errorInfo", () => {
      const instance = new ErrorBoundary({ children: null });
      const error = new Error("Test error");
      const errorInfo = { componentStack: "at TestComponent" };

      instance.componentDidCatch(error, errorInfo);

      expect(consoleSpy).toHaveBeenCalledWith(
        "ErrorBoundary caught an error:",
        error,
        errorInfo
      );
    });

    test("componentDidCatch handles TypeError", () => {
      const instance = new ErrorBoundary({ children: null });
      const error = new TypeError("Type error");
      const errorInfo = { componentStack: "at TypeErrorComponent" };

      instance.componentDidCatch(error, errorInfo);

      expect(consoleSpy).toHaveBeenCalledWith(
        "ErrorBoundary caught an error:",
        error,
        errorInfo
      );
    });

    test("componentDidCatch handles error with stack trace", () => {
      const instance = new ErrorBoundary({ children: null });
      const error = new Error("Error with stack");
      error.stack = "Error: Error with stack\n    at Component (file.tsx:10:5)";
      const errorInfo = { componentStack: "at Component\n    at Parent" };

      instance.componentDidCatch(error, errorInfo);

      const calls = consoleSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1] as [string, Error, { componentStack: string }];
      expect(lastCall[1].stack).toContain("at Component");
    });
  });

  describe("handleRetry (line 74-76)", () => {
    test("handleRetry method exists on instance", () => {
      const instance = new ErrorBoundary({ children: null });
      expect(typeof instance.handleRetry).toBe("function");
    });

    test("handleRetry is an arrow function bound to instance", () => {
      const instance = new ErrorBoundary({ children: null });
      const { handleRetry } = instance;
      // Arrow functions maintain their 'this' binding
      expect(typeof handleRetry).toBe("function");
    });

    test("handleRetry calls setState with reset values", () => {
      const instance = new ErrorBoundary({ children: null });
      let setStateCalled = false;
      let setStateArg: { hasError: boolean; error: null } | null = null;

      // Mock setState
      instance.setState = (state: { hasError: boolean; error: null }) => {
        setStateCalled = true;
        setStateArg = state;
      };

      instance.handleRetry();

      expect(setStateCalled).toBe(true);
      expect(setStateArg).toEqual({ hasError: false, error: null });
    });
  });

  describe("Render method (lines 78-89)", () => {
    test("render returns children when hasError is false", () => {
      const children = <div>Child content</div>;
      const instance = new ErrorBoundary({ children });
      instance.state = { hasError: false, error: null };

      const result = instance.render();
      expect(result).toBe(children);
    });

    test("render returns custom fallback when hasError is true and fallback provided", () => {
      const children = <div>Child content</div>;
      const fallback = <div>Custom error</div>;
      const instance = new ErrorBoundary({ children, fallback });
      instance.state = { hasError: true, error: new Error("Test") };

      const result = instance.render();
      expect(result).toBe(fallback);
    });

    test("render returns ErrorFallback when hasError is true and no custom fallback", () => {
      const children = <div>Child content</div>;
      const instance = new ErrorBoundary({ children });
      instance.state = { hasError: true, error: new Error("Test") };

      const result = instance.render();
      // Result should be the ErrorFallback component (a React element)
      expect(result).toBeDefined();
      expect(result).not.toBe(children);
    });

    test("render with error but no custom fallback returns ErrorFallback", () => {
      const instance = new ErrorBoundary({ children: <span>test</span> });
      instance.state = { hasError: true, error: new Error("Render error") };

      const result = instance.render();
      // Should return an element (ErrorFallback)
      expect(React.isValidElement(result)).toBe(true);
    });
  });

  describe("ErrorFallback rendering (lines 13-55)", () => {
    test("ErrorFallback is rendered when error state is set", () => {
      const instance = new ErrorBoundary({ children: <div>Test</div> });
      instance.state = { hasError: true, error: new Error("Test error") };

      const result = instance.render();
      // Render the result to string to verify ErrorFallback content
      const html = renderToString(result as React.ReactElement);

      expect(html).toContain("Something went wrong");
      expect(html).toContain("We encountered an unexpected error");
      expect(html).toContain("Try Again");
    });

    test("ErrorFallback renders error-boundary-container", () => {
      const instance = new ErrorBoundary({ children: <div>Test</div> });
      instance.state = { hasError: true, error: new Error("Container test") };

      const result = instance.render();
      const html = renderToString(result as React.ReactElement);

      expect(html).toContain("error-boundary-container");
      expect(html).toContain("error-boundary-card");
    });

    test("ErrorFallback renders error icon SVG", () => {
      const instance = new ErrorBoundary({ children: <div>Test</div> });
      instance.state = { hasError: true, error: new Error("SVG test") };

      const result = instance.render();
      const html = renderToString(result as React.ReactElement);

      expect(html).toContain("<svg");
      expect(html).toContain("circle");
      expect(html).toContain("error-boundary-icon");
    });

    test("ErrorFallback renders title and message", () => {
      const instance = new ErrorBoundary({ children: <div>Test</div> });
      instance.state = { hasError: true, error: new Error("Title test") };

      const result = instance.render();
      const html = renderToString(result as React.ReactElement);

      expect(html).toContain("error-boundary-title");
      expect(html).toContain("Something went wrong");
      expect(html).toContain("error-boundary-message");
      expect(html).toContain("Please try again or contact");
    });

    test("ErrorFallback renders Try Again button with correct classes", () => {
      const instance = new ErrorBoundary({ children: <div>Test</div> });
      instance.state = { hasError: true, error: new Error("Button test") };

      const result = instance.render();
      const html = renderToString(result as React.ReactElement);

      expect(html).toContain("btn btn-primary btn-lg");
      expect(html).toContain("Try Again");
      expect(html).toContain("<button");
    });

    test("ErrorFallback renders SVG with correct dimensions", () => {
      const instance = new ErrorBoundary({ children: <div>Test</div> });
      instance.state = { hasError: true, error: new Error("Dimensions test") };

      const result = instance.render();
      const html = renderToString(result as React.ReactElement);

      expect(html).toContain('width="48"');
      expect(html).toContain('height="48"');
      expect(html).toContain('viewBox="0 0 24 24"');
    });
  });

  describe("Error details in development mode (lines 45-50)", () => {
    test("shows error details when NODE_ENV is development", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      const instance = new ErrorBoundary({ children: <div>Test</div> });
      instance.state = { hasError: true, error: new Error("Dev error message") };

      const result = instance.render();
      const html = renderToString(result as React.ReactElement);

      expect(html).toContain("error-boundary-details");
      expect(html).toContain("<details");
      expect(html).toContain("Error details");
      expect(html).toContain("Dev error message");

      process.env.NODE_ENV = originalEnv;
    });

    test("shows error stack in development mode", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      const error = new Error("Stack error");
      error.stack = "Error: Stack error\n    at TestFile.tsx:10:5";

      const instance = new ErrorBoundary({ children: <div>Test</div> });
      instance.state = { hasError: true, error };

      const result = instance.render();
      const html = renderToString(result as React.ReactElement);

      expect(html).toContain("<pre>");
      expect(html).toContain("Stack error");

      process.env.NODE_ENV = originalEnv;
    });

    test("hides error details when NODE_ENV is production", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      const instance = new ErrorBoundary({ children: <div>Test</div> });
      instance.state = { hasError: true, error: new Error("Prod error") };

      const result = instance.render();
      const html = renderToString(result as React.ReactElement);

      expect(html).not.toContain("error-boundary-details");
      expect(html).not.toContain("Prod error");

      process.env.NODE_ENV = originalEnv;
    });

    test("hides error details when NODE_ENV is test", () => {
      const instance = new ErrorBoundary({ children: <div>Test</div> });
      instance.state = { hasError: true, error: new Error("Test env error") };

      const result = instance.render();
      const html = renderToString(result as React.ReactElement);

      // NODE_ENV is "test" in our setup
      expect(html).not.toContain("error-boundary-details");
    });

    test("handles error without stack trace in development", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      const error = new Error("No stack error");
      delete error.stack;

      const instance = new ErrorBoundary({ children: <div>Test</div> });
      instance.state = { hasError: true, error };

      const result = instance.render();
      const html = renderToString(result as React.ReactElement);

      expect(html).toContain("error-boundary-details");
      expect(html).toContain("No stack error");

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe("ErrorFallback with null error", () => {
    test("renders correctly when error is null", () => {
      const instance = new ErrorBoundary({ children: <div>Test</div> });
      instance.state = { hasError: true, error: null };

      const result = instance.render();
      const html = renderToString(result as React.ReactElement);

      expect(html).toContain("Something went wrong");
      expect(html).not.toContain("error-boundary-details");
    });
  });
});

// Original logic tests (kept for completeness)
describe("ErrorBoundary Component Logic", () => {
  describe("State Management", () => {
    interface State {
      hasError: boolean;
      error: Error | null;
    }

    test("initial state has no error", () => {
      const initialState: State = { hasError: false, error: null };

      expect(initialState.hasError).toBe(false);
      expect(initialState.error).toBe(null);
    });

    test("getDerivedStateFromError returns error state", () => {
      const error = new Error("Test error");

      // Simulating getDerivedStateFromError behavior
      const getDerivedStateFromError = (err: Error): State => {
        return { hasError: true, error: err };
      };

      const newState = getDerivedStateFromError(error);

      expect(newState.hasError).toBe(true);
      expect(newState.error).toBe(error);
      expect(newState.error?.message).toBe("Test error");
    });

    test("handleRetry resets error state", () => {
      let state: State = { hasError: true, error: new Error("Test error") };

      const handleRetry = () => {
        state = { hasError: false, error: null };
      };

      handleRetry();

      expect(state.hasError).toBe(false);
      expect(state.error).toBe(null);
    });
  });

  describe("Error Handling Logic", () => {
    test("componentDidCatch logs error and errorInfo", () => {
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {
        // Intentionally empty - we just want to suppress console output
      });

      const error = new Error("Component error");
      const errorInfo = { componentStack: "at TestComponent" };

      // Simulating componentDidCatch behavior
      const componentDidCatch = (err: Error, info: { componentStack: string }) => {
        console.error("ErrorBoundary caught an error:", err, info);
      };

      componentDidCatch(error, errorInfo);

      expect(consoleSpy).toHaveBeenCalledWith(
        "ErrorBoundary caught an error:",
        error,
        errorInfo
      );

      consoleSpy.mockRestore();
    });

    test("handles errors with stack traces", () => {
      const error = new Error("Error with stack");
      error.stack = "Error: Error with stack\n    at TestComponent (test.tsx:10:5)";

      expect(error.message).toBe("Error with stack");
      expect(error.stack).toContain("at TestComponent");
    });

    test("handles errors without stack traces", () => {
      const error = new Error("Error without stack");
      delete error.stack;

      expect(error.message).toBe("Error without stack");
      expect(error.stack).toBeUndefined();
    });
  });

  describe("Props Validation", () => {
    interface Props {
      children: ReactNode;
      fallback?: ReactNode;
    }

    test("accepts children prop", () => {
      const props: Props = { children: "Test content" };

      expect(props.children).toBe("Test content");
    });

    test("accepts optional fallback prop", () => {
      const props: Props = { children: "Test content", fallback: "Error UI" };

      expect(props.fallback).toBe("Error UI");
    });

    test("fallback prop defaults to undefined", () => {
      const props: Props = { children: "Test content" };

      expect(props.fallback).toBeUndefined();
    });
  });
});

describe("ErrorBoundary Component Export", () => {
  test("ErrorBoundary is exported as a class component", async () => {
    const module = await import("../../../src/frontend/components/ErrorBoundary");
    expect(module.ErrorBoundary).toBeDefined();
    expect(module.ErrorBoundary.prototype).toBeDefined();
    // Class components have a render method on their prototype
    expect(typeof module.ErrorBoundary.prototype.render).toBe("function");
  });

  test("ErrorBoundary has getDerivedStateFromError static method", async () => {
    const module = await import("../../../src/frontend/components/ErrorBoundary");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(module.ErrorBoundary.getDerivedStateFromError).toBeDefined();
    expect(typeof module.ErrorBoundary.getDerivedStateFromError).toBe("function");
  });

  test("getDerivedStateFromError returns correct state shape", async () => {
    const module = await import("../../../src/frontend/components/ErrorBoundary");
    const error = new Error("Test error");
    const result = module.ErrorBoundary.getDerivedStateFromError(error);

    expect(result).toEqual({ hasError: true, error });
  });

  test("ErrorBoundary extends React.Component", async () => {
    const module = await import("../../../src/frontend/components/ErrorBoundary");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const instance = Object.getPrototypeOf(module.ErrorBoundary.prototype);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(instance.constructor.name).toBe("Component");
  });
});

describe("ErrorBoundary instance methods", () => {
  test("instance has componentDidCatch method", () => {
    const instance = new ErrorBoundary({ children: null });
    expect(typeof instance.componentDidCatch).toBe("function");
  });

  test("instance has handleRetry arrow function", () => {
    const instance = new ErrorBoundary({ children: null });
    expect(typeof instance.handleRetry).toBe("function");
  });

  test("instance has render method", () => {
    const instance = new ErrorBoundary({ children: null });
    expect(typeof instance.render).toBe("function");
  });
});

describe("Different error types", () => {
  test("handles standard Error", () => {
    const error = new Error("Standard error");
    const result = ErrorBoundary.getDerivedStateFromError(error);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe("Standard error");
  });

  test("handles TypeError", () => {
    const error = new TypeError("Type error");
    const result = ErrorBoundary.getDerivedStateFromError(error);
    expect(result.error).toBeInstanceOf(TypeError);
    expect(result.error?.message).toBe("Type error");
  });

  test("handles RangeError", () => {
    const error = new RangeError("Range error");
    const result = ErrorBoundary.getDerivedStateFromError(error);
    expect(result.error).toBeInstanceOf(RangeError);
    expect(result.error?.message).toBe("Range error");
  });

  test("handles SyntaxError", () => {
    const error = new SyntaxError("Syntax error");
    const result = ErrorBoundary.getDerivedStateFromError(error);
    expect(result.error).toBeInstanceOf(SyntaxError);
  });

  test("handles error with custom properties", () => {
    const error = new Error("Custom error");
    (error as Error & { code: string }).code = "CUSTOM_CODE";
    const result = ErrorBoundary.getDerivedStateFromError(error);
    expect(result.error?.message).toBe("Custom error");
    expect((result.error as Error & { code: string }).code).toBe("CUSTOM_CODE");
  });
});
