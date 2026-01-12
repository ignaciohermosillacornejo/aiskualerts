import { GlobalWindow } from "happy-dom";

// Set NODE_ENV to test for the test environment
process.env.NODE_ENV = "test";

// Preserve native fetch before HappyDOM setup (HappyDOM has its own fetch that doesn't work for real HTTP)
const nativeFetch = globalThis.fetch;

// Set up a DOM environment for React testing using HappyDOM
// Do this at module load time so it's available before any test runs
const window = new GlobalWindow({ url: "http://localhost" });

// @ts-expect-error - Adding DOM globals for testing
global.window = window;
// @ts-expect-error - Adding DOM globals for testing
global.document = window.document;
// @ts-expect-error - Adding DOM globals for testing
global.navigator = window.navigator;
// Adding DOM globals for testing (sessionStorage and localStorage)
global.sessionStorage = window.sessionStorage;
global.localStorage = window.localStorage;
// @ts-expect-error - Adding DOM globals for testing
global.HTMLElement = window.HTMLElement;
// @ts-expect-error - Adding DOM globals for testing
global.customElements = window.customElements;

// Restore native fetch to ensure real HTTP requests work (must be after setting global.window)
globalThis.fetch = nativeFetch;
