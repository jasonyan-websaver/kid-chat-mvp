# Reverse Proxy Examples

This document provides practical Nginx and Caddy examples for running Kid Chat MVP behind HTTPS and a standard public port.

Assumptions used below:

- app runs on the same host as the reverse proxy
- app listens on `127.0.0.1:3000` or `0.0.0.0:3000`
- PM2 manages the Node process
- your domain is `kidchat.example.com`

If you use a different domain or port, adjust accordingly.

---

## 1. Recommended architecture

Preferred production flow:

```text
Internet
  -> HTTPS :443
  -> Nginx or Caddy
  -> http://127.0.0.1:3000
  -> Kid Chat MVP (Next.js + PM2)
```

Why this is better than exposing Node directly:

- HTTPS termination is easier
- standard port 443 works cleanly
- reverse proxies handle headers and timeouts better
- restarts are safer and easier to isolate
- optional IP restriction / extra auth can be added later

---

## 2. Before using a reverse proxy

Make sure the app itself is healthy first.

Recommended checks:

```bash
cd /path/to/kid-chat-mvp
npm install
npm run build
pm2 start ecosystem.config.cjs
pm2 status
curl http://127.0.0.1:3000
```

Do not set up Nginx or Caddy first if the app itself is not already responding locally.

---

## 3. Nginx example

### 3.1 Basic server block

Example file:

```text
/etc/nginx/sites-available/kid-chat-mvp.conf
```

Example config:

```nginx
server {
    listen 80;
    server_name kidchat.example.com;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/kid-chat-mvp.conf /etc/nginx/sites-enabled/kid-chat-mvp.conf
sudo nginx -t
sudo systemctl reload nginx
```

### 3.2 Add HTTPS with Certbot

If using Let's Encrypt:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d kidchat.example.com
```

Certbot will usually update the config for HTTPS automatically.

### 3.3 Recommended HTTPS form

A typical final setup becomes:

```nginx
server {
    listen 80;
    server_name kidchat.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name kidchat.example.com;

    ssl_certificate /etc/letsencrypt/live/kidchat.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kidchat.example.com/privkey.pem;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

---

## 4. Caddy example

Caddy is simpler if you want automatic HTTPS with less manual config.

Example `Caddyfile`:

```caddy
kidchat.example.com {
    reverse_proxy 127.0.0.1:3000

    encode gzip zstd

    header {
        X-Content-Type-Options nosniff
        X-Frame-Options SAMEORIGIN
        Referrer-Policy strict-origin-when-cross-origin
    }
}
```

Then reload:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

What Caddy gives you automatically in most normal setups:

- HTTPS certificates
- certificate renewal
- HTTP to HTTPS redirects
- sane reverse proxy defaults

---

## 5. Local/LAN-only reverse proxy example

If you only use this inside the home network and do not want public HTTPS yet, you can still use a reverse proxy on plain HTTP.

### Nginx LAN example

```nginx
server {
    listen 80;
    server_name 192.168.x.x;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

This is acceptable for private LAN testing, but not the preferred public deployment model.

---

## 6. PM2 + reverse proxy workflow

Recommended app lifecycle:

```bash
cd /path/to/kid-chat-mvp
npm install
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

Then verify locally before testing from outside:

```bash
curl http://127.0.0.1:3000
pm2 status
pm2 logs kid-chat-mvp
```

Then verify through the proxy:

```bash
curl -I http://kidchat.example.com
curl -I https://kidchat.example.com
```

---

## 7. Security suggestions

If this is family-only and exposed beyond the LAN, strongly consider adding one outer protection layer in addition to the app PINs.

Examples:

- Tailscale or VPN-only access
- Nginx IP allowlist
- Caddy + private network only
- Cloudflare Access or another front-door auth layer

Why:

- child/admin PINs are app-level controls
- they are not a full replacement for network-level protection on a public internet service

### Example Nginx IP allowlist

```nginx
location / {
    allow 1.2.3.4;
    deny all;

    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Only use this if your public IPs are stable enough.

---

## 8. Troubleshooting

### Problem: 502 Bad Gateway

Check:

```bash
pm2 status
pm2 logs kid-chat-mvp
curl http://127.0.0.1:3000
```

Usually means:

- app is not running
- app crashed
- proxy points to wrong host/port

### Problem: HTTPS works but app redirects oddly

Check:

- `X-Forwarded-Proto` is being set by the proxy
- domain and cookie behavior are correct
- app is being accessed consistently through the same host name

### Problem: static assets do not load

Check:

- proxy is forwarding all paths, including `/_next/*`
- there is no conflicting static-site rule in Nginx/Caddy

### Problem: admin works locally but not through the public domain

Check:

- secure cookies are expected in production
- HTTPS is actually enabled
- you are not mixing `http://` and `https://`

---

## 9. Quick recommendation

If you want the least operational friction:

- use PM2 for the app
- use Caddy for the reverse proxy
- keep the Node app on `127.0.0.1:3000`
- expose only the proxy

If you prefer maximum familiarity and manual control:

- use PM2 + Nginx + Certbot

Both are fine. Caddy is just simpler.
