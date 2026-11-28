// Local preview for Infinity Quest: `node ai-quest/dev-server.js` then open http://localhost:3300
// Wraps index.html in the same minimal skeleton the Artifact host adds when the page is published.
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT) || 3300;
const skeleton = (body) =>
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
  "<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}" +
  "body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>" +
  "</head><body>" + body + "</body></html>";

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(skeleton(fs.readFileSync(path.join(root, "index.html"), "utf8")));
    }
    if (url === "/content.json") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(fs.readFileSync(path.join(root, "content.json")));
    }
    res.writeHead(404);
    res.end("Not found");
  })
  .listen(port, () => console.log("Infinity Quest on http://localhost:" + port));
