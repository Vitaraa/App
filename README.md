# Budget — minimal budgeting dashboard

A small full-stack budgeting app: a React dashboard showing income, spending, and a
6-month chart, backed by an Express + SQLite API with per-user login. Each account's
data lives in the database on the server, so you can sign in from any device on your
network and see the same data.

```
Budgets/
├── server/      Express API + SQLite database + JWT auth
└── client/      React (Vite) dashboard
```

## Prerequisites

- Node.js 18+ (tested with Node 22)
- npm

## 1. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

## 2. Configure the server secret

```bash
cd server
cp .env.example .env
```

Open `.env` and set `JWT_SECRET` to a long random string (this signs login tokens).

## 3. Run it

### Development (two terminals, with hot reload)

```bash
# terminal 1 — API on :4000
cd server && npm run dev

# terminal 2 — dashboard on :5173 (proxies /api to the server)
cd client && npm run dev
```

Open http://localhost:5173, register an account, and you're in.

### Production / hosting on your local server (one process)

Build the frontend once, then run only the server — it serves the built dashboard
**and** the API from a single port:

```bash
cd client && npm run build      # outputs client/dist
cd ../server && npm start        # serves app + API on :4000
```

Open http://localhost:4000.

## Access from other devices on your network

The server listens on `0.0.0.0`, so any device on the same network can reach it:

1. Find your server machine's LAN IP (e.g. `ipconfig` on Windows → something like
   `192.168.1.50`).
2. On another device, visit `http://192.168.1.50:4000`.

Sign in with the same username/password and you'll see the same data, since it's
stored in the server's database.

> If you only ran the dev server (`:5173`), use `http://<ip>:5173` instead — Vite is
> also configured to expose itself on the LAN. For day-to-day use, the production
> single-port setup above is simpler.

## How it works

- **Auth:** passwords are hashed with bcrypt and stored in SQLite. Logging in returns
  a JWT (valid 30 days) that the browser keeps in `localStorage` and sends on every
  request. Each user only sees their own transactions.
- **Data:** the SQLite file is created automatically at `server/budget.db` on first
  run. Back this file up to keep your data.

## API reference

| Method | Path                     | Auth | Body / notes                                   |
| ------ | ------------------------ | ---- | ---------------------------------------------- |
| POST   | `/api/auth/register`     | no   | `{ username, password }` → `{ token }`         |
| POST   | `/api/auth/login`        | no   | `{ username, password }` → `{ token }`         |
| GET    | `/api/transactions`      | yes  | list current user's transactions               |
| POST   | `/api/transactions`      | yes  | `{ type, amount, category?, note?, date? }`    |
| DELETE | `/api/transactions/:id`  | yes  | delete one of your transactions                |

`type` is `"income"` or `"expense"`. Send the token as `Authorization: Bearer <token>`.

## Security notes

This is built for a trusted local network. For exposure beyond your LAN you'd want
HTTPS, rate limiting on the auth routes, and a strong `JWT_SECRET`.
