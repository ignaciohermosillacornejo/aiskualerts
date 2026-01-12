import { beforeAll } from "bun:test";
import { GlobalWindow } from "happy-dom";

// Set up a DOM environment for React testing using HappyDOM
beforeAll(() => {
  const window = new GlobalWindow({ url: "http://localhost" });

  // @ts-ignore
  global.window = window;
  // @ts-ignore
  global.document = window.document;
  // @ts-ignore
  global.navigator = window.navigator;
  // @ts-ignore
  global.sessionStorage = window.sessionStorage;
  // @ts-ignore
  global.localStorage = window.localStorage;
  // @ts-ignore
  global.HTMLElement = window.HTMLElement;
  // @ts-ignore
  global.customElements = window.customElements;
});
