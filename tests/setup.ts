import { GlobalWindow } from "happy-dom";

// Set NODE_ENV to test for the test environment
process.env.NODE_ENV = "test";

// Set up a DOM environment for React testing using HappyDOM
// Do this at module load time so it's available before any test runs
const happyWindow = new GlobalWindow({ url: "http://localhost" });

// Only set specific DOM globals we need - DON'T set global.window as it interferes with Bun's fetch
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
global.customElements = happyWindow.customElements;
