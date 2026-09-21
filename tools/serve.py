#!/usr/bin/env python3
"""Done Right dev server: static files with caching disabled (so code edits are always picked up).

Usage: python3 tools/serve.py [port]   (default 5173)
"""
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.webmanifest': 'application/manifest+json', '.js': 'text/javascript'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def log_message(self, fmt, *args):
        if os.environ.get('VERBOSE'):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    with http.server.ThreadingHTTPServer(('', port), NoCacheHandler) as httpd:
        print(f'Done Right dev server on http://localhost:{port}  (tests: http://localhost:{port}/tests/)')
        httpd.serve_forever()
