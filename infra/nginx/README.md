# nginx SNI router

nginx (host) listens on :443 and routes by TLS SNI:
-  → 127.0.0.1:10443 (xray VLESS+REALITY)
- everything else → 127.0.0.1:8443 (Caddy / modemorph.ru)

## Deploy
```bash
sudo cp infra/nginx/nginx.conf /etc/nginx/nginx.conf
sudo mkdir -p /etc/nginx/stream.d
sudo cp infra/nginx/stream-sni-router.conf /etc/nginx/stream.d/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
```
