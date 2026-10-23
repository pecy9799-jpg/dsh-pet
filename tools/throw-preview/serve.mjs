import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";

const root = await realpath(fileURLToPath(new URL("../../", import.meta.url)));
const allowed = [
  "/tools/throw-preview/",
  "/dsh-pet/runtime/electron-helper/",
  "/dsh-pet/assets/webm/",
];
const types = {
  ".js": "text/javascript",
  ".html": "text/html; charset=utf-8",
  ".webm": "video/webm",
};
const port = Number(process.env.PET_PREVIEW_PORT || 18847);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("Invalid preview port");
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://127.0.0.1").pathname,
    );
    if (
      !["GET", "HEAD"].includes(req.method) ||
      !allowed.some((prefix) => pathname.startsWith(prefix))
    ) {
      res.writeHead(404).end();
      return;
    }
    const file = await realpath(resolve(root, "." + pathname));
    if (
      !allowed.some((prefix) =>
        file.startsWith(resolve(root, "." + prefix) + sep),
      )
    ) {
      res.writeHead(404).end();
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      res.writeHead(404).end();
      return;
    }
    let start = 0,
      end = info.size - 1,
      status = 200;
    if (req.headers.range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      if (!match) {
        res.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end();
        return;
      }
      start = Number(match[1]);
      end = match[2] ? Math.min(Number(match[2]), end) : end;
      if (start > end || start >= info.size) {
        res.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end();
        return;
      }
      status = 206;
    }
    res.writeHead(status, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Content-Length": end - start + 1,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      ...(status === 206
        ? { "Content-Range": `bytes ${start}-${end}/${info.size}` }
        : {}),
    });
    if (req.method === "HEAD") res.end();
    else
      createReadStream(file, { start, end })
        .on("error", () => res.destroy())
        .pipe(res);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, "127.0.0.1", () =>
  console.log(
    `Preview: http://127.0.0.1:${port}/tools/throw-preview/index.html`,
  ),
);
