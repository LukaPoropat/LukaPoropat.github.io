"""Local preview server for the site, like `python -m http.server`, but it tells the browser to
re-check every file on each load, so a normal reload always shows the latest CSS, scripts and data.

    python tools/serve.py          # http://localhost:8765
    python tools/serve.py 9000     # another port
"""
import functools
import http.server
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")  # revalidate each time (cheap 304 when unchanged)
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    print(f"Serving {ROOT} at http://localhost:{port}", flush=True)
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
