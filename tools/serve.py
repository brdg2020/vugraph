# Yerel test sunucusu: Firebase'e benzer (cleanUrls + /app.html yedeği)
import http.server, os, sys
ROOT = sys.argv[1]
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def send_head(s):
        path = s.path.split('?')[0]
        p = s.translate_path(path)
        if os.path.isfile(p): return super().send_head()
        if os.path.isfile(p + '.html'): s.path = path + '.html'
        elif path in ('', '/'): s.path = '/index.html'
        else: s.path = '/app.html'
        return super().send_head()
    def log_message(s, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', 8088), H).serve_forever()
