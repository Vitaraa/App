# Deploying Budget on Ubuntu Server with nginx

Architecture:

```
browser ──> nginx :80 ──> static React build (client/dist)
                      └──> /api/  ──> Node API (systemd, 127.0.0.1:4000) ──> SQLite
```

nginx serves the frontend and proxies API calls to a Node process managed by
systemd. The Node port (4000) is only bound to localhost — nginx is the only thing
exposed to the network.

These steps assume the app lives at `/opt/budget`. Adjust paths if you choose
another location (and update the two config files to match).

## 1. Install Node.js and nginx

```bash
sudo apt update
# Node 20 LTS from NodeSource (or use 22):
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx
```

## 2. Put the app on the server

Copy this whole project to `/opt/budget` (via `git clone`, `scp`, or `rsync`).
You should end up with `/opt/budget/server` and `/opt/budget/client`.

## 3. Create a service user that owns the files

```bash
sudo useradd --system --home /opt/budget --shell /usr/sbin/nologin budget
sudo chown -R budget:budget /opt/budget
```

## 4. Install dependencies and build the frontend

```bash
cd /opt/budget/server && sudo -u budget npm install --omit=dev
cd /opt/budget/client && sudo -u budget npm install && sudo -u budget npm run build
```

`npm run build` produces `/opt/budget/client/dist`, which nginx will serve.

## 5. Configure the server secret

```bash
cd /opt/budget/server
sudo -u budget cp .env.example .env
sudo -u budget nano .env
```

Set a long random `JWT_SECRET` (generate one with `openssl rand -hex 32`).
Keep `PORT=4000`.

## 6. Install the systemd service

```bash
sudo cp /opt/budget/deploy/budget-api.service /etc/systemd/system/budget-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now budget-api
sudo systemctl status budget-api      # should show "active (running)"
```

Logs: `journalctl -u budget-api -f`

## 7. Install the nginx site

```bash
sudo cp /opt/budget/deploy/nginx-budget.conf /etc/nginx/sites-available/budget
sudo ln -s /etc/nginx/sites-available/budget /etc/nginx/sites-enabled/budget
# Optional: remove the default site so it doesn't shadow yours
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t          # test config
sudo systemctl reload nginx
```

## 8. Open the firewall (if ufw is on)

```bash
sudo ufw allow 'Nginx HTTP'
```

## 9. Use it

From any device on the network, visit `http://<server-ip>/` (port 80, no `:4000`).
Register an account and you're in. Everyone hits the same server, so accounts and
data are shared across devices.

## Updating after code changes

```bash
cd /opt/budget && git pull          # or re-copy files
cd client && sudo -u budget npm install && sudo -u budget npm run build
sudo systemctl restart budget-api   # only needed if server/ changed
sudo systemctl reload nginx         # only needed if nginx config changed
```

## Optional hardening

- **HTTPS:** if you have a domain pointing at the server, run
  `sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx`.
  For a LAN-only IP you can't use Let's Encrypt; use a self-signed cert if you
  need TLS internally.
- **Backups:** the database is a single file at `/opt/budget/server/budget.db`
  (plus `-wal`/`-shm`). Copy it somewhere safe periodically.
- **Auth rate limiting:** for anything beyond a trusted LAN, add nginx
  `limit_req` on `/api/auth/`.
