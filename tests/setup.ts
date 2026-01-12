import { beforeAll } from "bun:test";
import { GlobalWindow } from "happy-dom";

// Set up a DOM environment for React testing using HappyDOM
beforeAll(() => {
  const window = new GlobalWindow({ url: "http://localhost" });

  // @ts-expect-error - Adding DOM globals for testing
  global.window = window;
  // @ts-expect-error - Adding DOM globals for testing
  global.document = window.document;
  // @ts-expect-error - Adding DOM globals for testing
  global.navigator = window.navigator;
  // @ts-expect-error - Adding DOM globals for testing
  global.sessionStorage = window.sessionStorage;
  // @ts-expect-error - Adding DOM globals for testing
  global.localStorage = window.localStorage;
  // @ts-expect-error - Adding DOM globals for testing
  global.HTMLElement = window.HTMLElement;
  // @ts-expect-error - Adding DOM globals for testing
  global.customElements = window.customElements;
});
