# MangystauJobs

Платформа занятости для молодёжи Мангистауской области.

## Стек
- Frontend: React + Vite (Vercel)
- Backend: Node.js + Express + SQLite (Railway)
- Telegram Bot: node-telegram-bot-api (Railway)
- AI: Google Gemini 1.5 Flash

## Деплой за 20 минут

### 1. Backend → Railway
1. railway.app → New Project → Deploy from GitHub
2. Укажи папку `backend/`
3. Переменная окружения: `GEMINI_API_KEY=AIzaSyAgtSc2E9tAXMkNrbnOkJvq-dswyAd167w`
4. Скопируй URL (например: `https://mangystau-backend.up.railway.app`)

### 2. Frontend → Vercel
1. vercel.com → Import GitHub
2. Укажи папку `frontend/`
3. Переменная: `VITE_API_URL=https://mangystau-backend.up.railway.app`

### 3. Telegram Bot → Railway
1. New Service → укажи папку `telegram-bot/`
2. Переменные:
   - `API_URL=https://mangystau-backend.up.railway.app`
   - `WEB_URL=https://your-frontend.vercel.app`

Токен бота уже вшит в bot.js.

## Локальный запуск

```bash
# Backend
cd backend && npm install && node server.js

# Frontend
cd frontend && npm install && npm run dev

# Bot
cd telegram-bot && npm install && node bot.js
```
