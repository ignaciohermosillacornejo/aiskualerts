import { $ } from "bun";

// Build Tailwind CSS
await $`bunx tailwindcss -i ./src/frontend/styles/index.css -o ./src/frontend/styles/output.css --minify`;

console.info("✅ CSS built successfully");
