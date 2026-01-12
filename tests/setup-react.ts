import { JSDOM } from "jsdom";

// Set NODE_ENV to test for the test environment
process.env.NODE_ENV = "test";

// Preserve Bun's native fetch before setting up JSDOM
const bunFetch = globalThis.fetch;

// Set up a DOM environment for React testing using JSDOM
const dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", {
  url: "http://localhost",
  pretendToBeVisual: true,
});

const { window: jsdomWindow } = dom;

// Set window globally - this is required for React Testing Library
// @ts-expect-error - Adding DOM globals for testing
global.window = jsdomWindow;
// @ts-expect-error - Adding DOM globals for testing
global.document = jsdomWindow.document;
// @ts-expect-error - Adding DOM globals for testing
global.navigator = jsdomWindow.navigator;
// @ts-expect-error - Adding DOM globals for testing
global.HTMLElement = jsdomWindow.HTMLElement;
// @ts-expect-error - Adding DOM globals for testing
global.Element = jsdomWindow.Element;
// @ts-expect-error - Adding DOM globals for testing
global.Node = jsdomWindow.Node;
// @ts-expect-error - Adding DOM globals for testing
global.Text = jsdomWindow.Text;
// @ts-expect-error - Adding DOM globals for testing
global.DocumentFragment = jsdomWindow.DocumentFragment;
// @ts-expect-error - Adding DOM globals for testing
global.MutationObserver = jsdomWindow.MutationObserver;
// @ts-expect-error - Adding DOM globals for testing
global.getComputedStyle = jsdomWindow.getComputedStyle;
// @ts-expect-error - Adding DOM globals for testing
global.requestAnimationFrame = jsdomWindow.requestAnimationFrame;
// @ts-expect-error - Adding DOM globals for testing
global.cancelAnimationFrame = jsdomWindow.cancelAnimationFrame;

// Storage
global.sessionStorage = jsdomWindow.sessionStorage;
global.localStorage = jsdomWindow.localStorage;

// Ensure fetch is still Bun's fetch (not jsdom's)
global.fetch = bunFetch;
// @ts-expect-error - Restore fetch on window too
global.window.fetch = bunFetch;

// Set IS_REACT_ACT_ENVIRONMENT for React Testing Library
// @ts-expect-error - React Testing Library environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
