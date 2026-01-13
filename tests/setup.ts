import { GlobalWindow } from "happy-dom";

// Set NODE_ENV to test for the test environment
process.env.NODE_ENV = "test";

// Store Bun's native fetch before any DOM setup
const bunFetch = globalThis.fetch;

// Set up a DOM environment for React testing using HappyDOM
// Do this at module load time so it's available before any test runs
const happyWindow = new GlobalWindow({ url: "http://localhost" });

// @ts-expect-error - Adding DOM globals for testing
global.document = happyWindow.document;
// @ts-expect-error - Adding DOM globals for testing
global.navigator = happyWindow.navigator;
// Adding DOM globals for testing (sessionStorage and localStorage)
global.sessionStorage = happyWindow.sessionStorage;
global.localStorage = happyWindow.localStorage;
// @ts-expect-error - Adding DOM globals for testing
global.HTMLElement = happyWindow.HTMLElement;
// @ts-expect-error - Adding DOM globals for testing
global.HTMLInputElement = happyWindow.HTMLInputElement;
// @ts-expect-error - Adding DOM globals for testing
global.customElements = happyWindow.customElements;
// @ts-expect-error - Adding DOM globals for testing
global.Event = happyWindow.Event;

// Create a window object for React DOM client that doesn't override Bun's fetch
// React DOM needs window.event for update priority resolution
const windowProxy = new Proxy(happyWindow, {
  get(target: GlobalWindow, prop: string | symbol): unknown {
    // Preserve Bun's native fetch
    if (prop === "fetch") {
      return bunFetch;
    }
    // eslint-disable-next-line security/detect-object-injection -- Proxy handler for happy-dom window object
    return (target as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// @ts-expect-error - Adding window for React DOM client
global.window = windowProxy;

// Add location global for wouter (browsers have location as alias for window.location)
// @ts-expect-error - Adding location for wouter
global.location = happyWindow.location;

// Add history global for wouter navigation
global.history = happyWindow.history;

// Ensure fetch is still Bun's fetch after window setup
globalThis.fetch = bunFetch;
