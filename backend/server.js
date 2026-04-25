const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN || '8489505819:AAGPIl_Gxy7Q_EyRfS82Zr_SpkxssUPAf5E';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyAgtSc2E9tAXMkNrbnOkJvq-dswyAd167w';

function sendTelegramMessage(chatId, text) {
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

function verifyTelegramAuth(authData) {
  const { hash, ...rest } = authData;
  if (!hash) return false;
  if (Date.now() / 1000 - parseInt(rest.auth_date) > 86400) return false;
  const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();
  const checkString = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join('\n');
  const hmac = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  return hmac === hash;
}

async function geminiGenerate(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 1024 } });
    const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data).candidates?.[0]?.content?.parts?.[0]?.text || ''); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const db = new Database(path.join(__dirname, 'jobs.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, company TEXT NOT NULL, salary TEXT, salary_num INTEGER DEFAULT 0,
    area TEXT, type TEXT DEFAULT 'Полная', sphere TEXT, experience TEXT DEFAULT 'Без опыта',
    description TEXT, contact TEXT, employer_tg_id TEXT, is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id TEXT UNIQUE, name TEXT, phone TEXT,
    username TEXT, photo_url TEXT, skills TEXT, area TEXT, role TEXT DEFAULT 'seeker',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, tg_id TEXT, expires_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, user_tg_id TEXT,
    user_name TEXT, user_phone TEXT, message TEXT, status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (job_id) REFERENCES jobs(id)
  );
`);

const count = db.prepare('SELECT COUNT(*) as c FROM jobs').get();
if (count.c === 0) {
  const ins = db.prepare(`INSERT INTO jobs (title,company,salary,salary_num,area,type,sphere,experience,description,contact) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  [
    ['Бариста','Coffee Time','180 000 тг',180000,'7-й мкр','Полная','cafe','Без опыта','Приготовление кофе. Обучим с нуля. График 5/2.','@coffeetime_aktau'],
    ['Продавец-консультант','Магазин Алем','150 000 тг',150000,'9-й мкр','Полная','trade','Без опыта','Консультирование, работа с кассой. Бонусы.','+77001234567'],
    ['Разнорабочий','СтройМонтаж КЗ','250 000 тг',250000,'15-й мкр','Полная','build','1+ лет','Общестроительные работы. Жильё предоставляется.','@stroymontag_kz'],
    ['Мастер маникюра','Beauty Studio Актау','200 000+ тг',200000,'Центр','Частичная','beauty','1+ лет','% от клиентов + оклад.','@beauty_aktau'],
    ['Курьер (с авто)','Быстрая Доставка','120 000 + чаевые',120000,'Весь город','Подработка','delivery'
