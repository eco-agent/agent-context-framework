import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { pageMessage, pageTitle } from "./site-copy.mjs";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(sourceDirectory, "..");

export function renderPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${pageTitle}</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <main>
      <h1>${pageTitle}</h1>
      <p>${pageMessage}</p>
    </main>
  </body>
</html>`;
}

export function createApplicationServer() {
  return createServer(async (request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end('{"ok":true}\n');
      return;
    }
    if (request.url === "/styles.css") {
      const stylesheet = await readFile(path.join(projectRoot, "public", "styles.css"), "utf8");
      response.writeHead(200, { "content-type": "text/css; charset=utf-8" });
      response.end(stylesheet);
      return;
    }
    if (request.url === "/" || request.url === undefined) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(renderPage());
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
  });
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(path.resolve(entrypoint)).href) {
  const port = Number(process.env.PORT ?? "4173");
  createApplicationServer().listen(port, "127.0.0.1", () => {
    process.stdout.write(`ACF test application listening on http://127.0.0.1:${port}\n`);
  });
}
