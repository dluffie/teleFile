# ☁️ TeleFile — Telegram-Backed Cloud Drive

A Google Drive–style cloud storage application that uses **Telegram as the file storage backend**, bypassing the 2GB per-file limit via automatic chunking.

## 🏗️ Architecture

```
React (Frontend) → Express API → MongoDB (metadata) → Telegram Bot (storage)
```

## ✨ Features

- **Unlimited storage** — Files stored as chunks on Telegram
- **Chunked upload** — Auto-splits files into 20MB parts
- **Stream download** — Reassembles and streams from Telegram on-the-fly
- **Folder system** — Nested folder tree like Google Drive
- **Trash & restore** — Soft delete with permanent delete option
- **File sharing** — Generate public download links
- **Dark glassmorphism UI** — Premium, modern interface
- **Mobile responsive** — Works on all screen sizes

## 🚀 Quick Start

### Prerequisites

1. **MongoDB Atlas** — Free cluster at [mongodb.com](https://www.mongodb.com/atlas)
2. **Telegram Bot** — Create via [@BotFather](https://t.me/BotFather)
3. **Storage Channel** — Create a private Telegram channel, add your bot as admin

### Setup

```bash
# Clone and install
cd teleFile

# Server
cd server
npm install
cp .env.example .env
# Fill in your MONGODB_URI, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

# Client
cd ../client
npm install
```

### Configure `.env`

```
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/telefile
JWT_SECRET=your-secret-key
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHI...
TELEGRAM_CHAT_ID=-1001234567890
PORT=5000
NODE_ENV=development
```

> **How to get TELEGRAM_CHAT_ID:**
> 1. Add your bot to a private channel as admin
> 2. Send a message in the channel
> 3. Visit `https://api.telegram.org/bot<TOKEN>/getUpdates`
> 4. Find `chat.id` (it starts with `-100`)

### Run

```bash
# Terminal 1 — Backend
cd server
npm run dev

# Terminal 2 — Frontend
cd client
npm run dev
```

Open http://localhost:5173

## 📦 Deploy to Render

1. Push to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com)
3. New → Blueprint → Connect your repo
4. It will auto-detect `render.yaml`
5. Add environment variables:
   - `MONGODB_URI`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
6. Deploy!

## 🔒 Security Notes

- JWT tokens expire in 30 days
- Passwords hashed with bcrypt (10 rounds)
- Rate limited: 200 requests per 15 min
- Telegram uploads queued with 350ms delay to avoid bans
- Helmet.js security headers enabled

## ⚠️ Limitations

- Telegram bot download limit: 20MB per file via `getFile` API
- Render free tier: 512MB RAM, spins down after 15min idle
- No client-side encryption (Phase 2)
- Files tied to bot token — backup your token!
