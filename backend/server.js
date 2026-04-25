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
  CREATE TABLE IF NOT EXISTS login_codes (
    code TEXT PRIMARY KEY, tg_id TEXT, token TEXT,
    created_at INTEGER, expires_at INTEGER
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
    ['Курьер (с авто)','Быстрая Доставка','120 000 + чаевые',120000,'Весь город','Подработка','delivery','Без опыта','Доставка еды. Свободный график.','+77009876543'],
    ['SMM-специалист','Digital Actau','160 000 тг',160000,'Удалённо','Частичная','it','Без опыта','Instagram и TikTok. Казахский и русский.','@digital_actau'],
    ['Повар','Ресторан Каспий','220 000 тг',220000,'Центр','Полная','cafe','2+ лет','Казахская и европейская кухня.','+77771234567'],
    ['Грузчик','Маркет Опт','180 000 тг',180000,'Новый город','Полная','trade','Без опыта','Работа на складе. Официальное оформление.','+77002345678'],
  ].forEach(j => ins.run(...j));
}

// ─── BOT-BASED LOGIN (работает без настройки домена) ──────────────
// Шаг 1: фронт запрашивает одноразовый код
app.post('/api/auth/init-login', (req, res) => {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const now = Date.now();
  db.prepare('DELETE FROM login_codes WHERE expires_at < ?').run(now);
  db.prepare('INSERT INTO login_codes (code, created_at, expires_at) VALUES (?, ?, ?)').run(code, now, now + 5 * 60 * 1000);
  res.json({ success: true, code });
});

// Шаг 2: фронт делает polling — ждёт пока бот подтвердит вход
app.get('/api/auth/poll-login', (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ success: false });
  const row = db.prepare('SELECT * FROM login_codes WHERE code = ? AND expires_at > ?').get(code, Date.now());
  if (!row || !row.token) return res.json({ success: false, pending: true });
  // Код подтверждён ботом — возвращаем токен
  db.prepare('DELETE FROM login_codes WHERE code = ?').run(code);
  const user = db.prepare('SELECT * FROM users WHERE tg_id = ?').get(row.tg_id);
  res.json({ success: true, token: row.token, user });
});

// Шаг 3: бот вызывает этот endpoint когда пользователь подтверждает
app.post('/api/auth/confirm-login', (req, res) => {
  const { code, tg_id, name, username, photo_url } = req.body;
  const row = db.prepare('SELECT * FROM login_codes WHERE code = ? AND expires_at > ?').get(code, Date.now());
  if (!row) return res.status(404).json({ success: false, error: 'Code expired or not found' });
  // Создаём/обновляем пользователя
  db.prepare(`INSERT INTO users (tg_id,name,username,photo_url) VALUES (?,?,?,?) ON CONFLICT(tg_id) DO UPDATE SET name=excluded.name,username=excluded.username,photo_url=excluded.photo_url`)
    .run(tg_id, name, username || null, photo_url || null);
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token,tg_id,expires_at) VALUES (?,?,?)').run(token, tg_id, Date.now() + 7*24*3600*1000);
  db.prepare('UPDATE login_codes SET tg_id = ?, token = ? WHERE code = ?').run(tg_id, token, code);
  res.json({ success: true });
});


  const authData = req.body;
  if (!verifyTelegramAuth(authData)) return res.status(401).json({ success: false, error: 'Invalid auth' });
  const tg_id = String(authData.id);
  const name = [authData.first_name, authData.last_name].filter(Boolean).join(' ');
  db.prepare(`INSERT INTO users (tg_id,name,username,photo_url) VALUES (?,?,?,?) ON CONFLICT(tg_id) DO UPDATE SET name=excluded.name,username=excluded.username,photo_url=excluded.photo_url`)
    .run(tg_id, name, authData.username || null, authData.photo_url || null);
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token,tg_id,expires_at) VALUES (?,?,?)').run(token, tg_id, Date.now() + 7*24*3600*1000);
  res.json({ success: true, token, user: db.prepare('SELECT * FROM users WHERE tg_id=?').get(tg_id) });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'No token' });
  const session = db.prepare('SELECT * FROM sessions WHERE token=? AND expires_at>?').get(token, Date.now());
  if (!session) return res.status(401).json({ success: false, error: 'Session expired' });
  res.json({ success: true, user: db.prepare('SELECT * FROM users WHERE tg_id=?').get(session.tg_id) });
});

app.patch('/api/auth/profile', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const session = db.prepare('SELECT * FROM sessions WHERE token=? AND expires_at>?').get(token, Date.now());
  if (!session) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const { phone, skills, area, role } = req.body;
  db.prepare('UPDATE users SET phone=?,skills=?,area=?,role=? WHERE tg_id=?').run(phone, skills, area, role||'seeker', session.tg_id);
  res.json({ success: true, user: db.prepare('SELECT * FROM users WHERE tg_id=?').get(session.tg_id) });
});

app.delete('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
  res.json({ success: true });
});

app.get('/api/jobs', (req, res) => {
  const { sphere, type, area, q, limit = 50 } = req.query;
  let sql = 'SELECT * FROM jobs WHERE is_active=1'; const params = [];
  if (sphere) { sql += ' AND sphere=?'; params.push(sphere); }
  if (type) { sql += ' AND type=?'; params.push(type); }
  if (area) { sql += ' AND area LIKE ?'; params.push(`%${area}%`); }
  if (q) { sql += ' AND (title LIKE ? OR description LIKE ? OR company LIKE ?)'; params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  sql += ' ORDER BY created_at DESC LIMIT ?'; params.push(parseInt(limit));
  res.json({ success: true, jobs: db.prepare(sql).all(...params) });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=? AND is_active=1').get(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, job });
});

app.post('/api/jobs', (req, res) => {
  const { title, company, salary, area, type, sphere, experience, description, contact, employer_tg_id } = req.body;
  if (!title || !company) return res.status(400).json({ success: false, error: 'Required fields missing' });
  const salaryNum = parseInt(salary?.replace(/\D/g,'')) || 0;
  const result = db.prepare(`INSERT INTO jobs (title,company,salary,salary_num,area,type,sphere,experience,description,contact,employer_tg_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(title, company, salary||'Договорная', salaryNum, area, type||'Полная', sphere, experience||'Без опыта', description, contact, employer_tg_id);
  res.json({ success: true, job: db.prepare('SELECT * FROM jobs WHERE id=?').get(result.lastInsertRowid) });
});

app.post('/api/jobs/:id/apply', async (req, res) => {
  const { user_tg_id, user_name, user_phone, message } = req.body;
  const job = db.prepare('SELECT * FROM jobs WHERE id=? AND is_active=1').get(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  if (user_tg_id && !user_tg_id.startsWith('web_')) {
    const existing = db.prepare('SELECT id FROM applications WHERE job_id=? AND user_tg_id=?').get(req.params.id, user_tg_id);
    if (existing) return res.status(400).json({ success: false, error: 'Already applied' });
  }
  db.prepare(`INSERT INTO applications (job_id,user_tg_id,user_name,user_phone,message) VALUES (?,?,?,?,?)`)
    .run(req.params.id, user_tg_id, user_name, user_phone, message);

  if (job.employer_tg_id) {
    const tgLink = user_tg_id && !user_tg_id.startsWith('web_')
      ? `\nTelegram: <a href="tg://user?id=${user_tg_id}">${user_name}</a>` : '';
    await sendTelegramMessage(job.employer_tg_id,
      `<b>Новый отклик!</b>\n\nВакансия: <b>${job.title}</b>\nКандидат: ${user_name}\nТелефон: ${user_phone}${tgLink}${message ? `\n\n"${message}"` : ''}`
    );
  }
  res.json({ success: true, employer_tg_id: job.employer_tg_id, job_title: job.title });
});

app.get('/api/employer/:tg_id/applications', (req, res) => {
  const apps = db.prepare(`SELECT a.*,j.title as job_title FROM applications a JOIN jobs j ON a.job_id=j.id WHERE j.employer_tg_id=? ORDER BY a.created_at DESC`).all(req.params.tg_id);
  res.json({ success: true, applications: apps });
});

app.patch('/api/applications/:id', (req, res) => {
  db.prepare('UPDATE applications SET status=? WHERE id=?').run(req.body.status, req.params.id);
  res.json({ success: true });
});

app.post('/api/ai/match', async (req, res) => {
  const { skills, area, type } = req.body;
  if (!skills) return res.status(400).json({ success: false, error: 'Skills required' });
  const jobs = db.prepare('SELECT id,title,company,salary,area,type,sphere,experience,description FROM jobs WHERE is_active=1 LIMIT 30').all();
  const jobsText = jobs.map(j => `ID:${j.id} | ${j.title} | ${j.company} | ${j.salary} | ${j.area} | ${j.type} | Опыт: ${j.experience}`).join('\n');
  const prompt = `Ты AI-ассистент платформы занятости MangystauJobs в Актау, Казахстан.\nНавыки соискателя: ${skills}\nРайон: ${area||'любой'}\nТип: ${type||'любой'}\n\nВакансии:\n${jobsText}\n\nПодбери топ-3. Ответ ТОЛЬКО JSON без markdown:\n{"matches":[{"job_id":1,"match_percent":95,"reason":"причина"}],"recommendation":"совет"}`;
  try {
    const text = await geminiGenerate(prompt);
    const parsed = JSON.parse(text.replace(/```json|```/g,'').trim());
    parsed.matches = parsed.matches.map(m => ({ ...m, job: jobs.find(j => j.id === m.job_id) })).filter(m => m.job);
    res.json({ success: true, ...parsed });
  } catch {
    const matches = jobs.slice(0,3).map((j,i) => ({ job_id:j.id, match_percent:85-i*7, reason:'Подходит по общим параметрам', job:j }));
    res.json({ success: true, matches, recommendation: 'Рекомендуем просмотреть все доступные вакансии.' });
  }
});

app.get('/api/stats', (req, res) => {
  res.json({ success: true,
    jobs: db.prepare('SELECT COUNT(*) as c FROM jobs WHERE is_active=1').get().c,
    employers: db.prepare('SELECT COUNT(DISTINCT employer_tg_id) as c FROM jobs WHERE is_active=1 AND employer_tg_id IS NOT NULL').get().c,
    applications: db.prepare('SELECT COUNT(*) as c FROM applications').get().c,
    users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
  });
});

app.post('/api/users', (req, res) => {
  const { tg_id, name, phone, skills, area, role } = req.body;
  db.prepare(`INSERT INTO users (tg_id,name,phone,skills,area,role) VALUES (?,?,?,?,?,?) ON CONFLICT(tg_id) DO UPDATE SET name=excluded.name,phone=excluded.phone,skills=excluded.skills,area=excluded.area,role=excluded.role`)
    .run(tg_id, name, phone, skills, area, role||'seeker');
  res.json({ success: true });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.listen(PORT, () => console.log(`MangystauJobs API on port ${PORT}`));  const { hash, ...rest } = authData;
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
    ['Курьер (с авто)','Быстрая Доставка','120 000 + чаевые',120000,'Весь город','Подработка','delivery','Без опыта','Доставка еды. Свободный график.','+77009876543'],
    ['SMM-специалист','Digital Actau','160 000 тг',160000,'Удалённо','Частичная','it','Без опыта','Instagram и TikTok. Казахский и русский.','@digital_actau'],
    ['Повар','Ресторан Каспий','220 000 тг',220000,'Центр','Полная','cafe','2+ лет','Казахская и европейская кухня.','+77771234567'],
    ['Грузчик','Маркет Опт','180 000 тг',180000,'Новый город','Полная','trade','Без опыта','Работа на складе. Официальное оформление.','+77002345678'],
  ].forEach(j => ins.run(...j));
}

app.post('/api/auth/telegram', (req, res) => {
  const authData = req.body;
  if (!verifyTelegramAuth(authData)) return res.status(401).json({ success: false, error: 'Invalid auth' });
  const tg_id = String(authData.id);
  const name = [authData.first_name, authData.last_name].filter(Boolean).join(' ');
  db.prepare(`INSERT INTO users (tg_id,name,username,photo_url) VALUES (?,?,?,?) ON CONFLICT(tg_id) DO UPDATE SET name=excluded.name,username=excluded.username,photo_url=excluded.photo_url`)
    .run(tg_id, name, authData.username || null, authData.photo_url || null);
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token,tg_id,expires_at) VALUES (?,?,?)').run(token, tg_id, Date.now() + 7*24*3600*1000);
  res.json({ success: true, token, user: db.prepare('SELECT * FROM users WHERE tg_id=?').get(tg_id) });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'No token' });
  const session = db.prepare('SELECT * FROM sessions WHERE token=? AND expires_at>?').get(token, Date.now());
  if (!session) return res.status(401).json({ success: false, error: 'Session expired' });
  res.json({ success: true, user: db.prepare('SELECT * FROM users WHERE tg_id=?').get(session.tg_id) });
});

app.patch('/api/auth/profile', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const session = db.prepare('SELECT * FROM sessions WHERE token=? AND expires_at>?').get(token, Date.now());
  if (!session) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const { phone, skills, area, role } = req.body;
  db.prepare('UPDATE users SET phone=?,skills=?,area=?,role=? WHERE tg_id=?').run(phone, skills, area, role||'seeker', session.tg_id);
  res.json({ success: true, user: db.prepare('SELECT * FROM users WHERE tg_id=?').get(session.tg_id) });
});

app.delete('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
  res.json({ success: true });
});

app.get('/api/jobs', (req, res) => {
  const { sphere, type, area, q, limit = 50 } = req.query;
  let sql = 'SELECT * FROM jobs WHERE is_active=1'; const params = [];
  if (sphere) { sql += ' AND sphere=?'; params.push(sphere); }
  if (type) { sql += ' AND type=?'; params.push(type); }
  if (area) { sql += ' AND area LIKE ?'; params.push(`%${area}%`); }
  if (q) { sql += ' AND (title LIKE ? OR description LIKE ? OR company LIKE ?)'; params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  sql += ' ORDER BY created_at DESC LIMIT ?'; params.push(parseInt(limit));
  res.json({ success: true, jobs: db.prepare(sql).all(...params) });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=? AND is_active=1').get(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, job });
});

app.post('/api/jobs', (req, res) => {
  const { title, company, salary, area, type, sphere, experience, description, contact, employer_tg_id } = req.body;
  if (!title || !company) return res.status(400).json({ success: false, error: 'Required fields missing' });
  const salaryNum = parseInt(salary?.replace(/\D/g,'')) || 0;
  const result = db.prepare(`INSERT INTO jobs (title,company,salary,salary_num,area,type,sphere,experience,description,contact,employer_tg_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(title, company, salary||'Договорная', salaryNum, area, type||'Полная', sphere, experience||'Без опыта', description, contact, employer_tg_id);
  res.json({ success: true, job: db.prepare('SELECT * FROM jobs WHERE id=?').get(result.lastInsertRowid) });
});

app.post('/api/jobs/:id/apply', async (req, res) => {
  const { user_tg_id, user_name, user_phone, message } = req.body;
  const job = db.prepare('SELECT * FROM jobs WHERE id=? AND is_active=1').get(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  if (user_tg_id && !user_tg_id.startsWith('web_')) {
    const existing = db.prepare('SELECT id FROM applications WHERE job_id=? AND user_tg_id=?').get(req.params.id, user_tg_id);
    if (existing) return res.status(400).json({ success: false, error: 'Already applied' });
  }
  db.prepare(`INSERT INTO applications (job_id,user_tg_id,user_name,user_phone,message) VALUES (?,?,?,?,?)`)
    .run(req.params.id, user_tg_id, user_name, user_phone, message);

  if (job.employer_tg_id) {
    const tgLink = user_tg_id && !user_tg_id.startsWith('web_')
      ? `\nTelegram: <a href="tg://user?id=${user_tg_id}">${user_name}</a>` : '';
    await sendTelegramMessage(job.employer_tg_id,
      `<b>Новый отклик!</b>\n\nВакансия: <b>${job.title}</b>\nКандидат: ${user_name}\nТелефон: ${user_phone}${tgLink}${message ? `\n\n"${message}"` : ''}`
    );
  }
  res.json({ success: true, employer_tg_id: job.employer_tg_id, job_title: job.title });
});

app.get('/api/employer/:tg_id/applications', (req, res) => {
  const apps = db.prepare(`SELECT a.*,j.title as job_title FROM applications a JOIN jobs j ON a.job_id=j.id WHERE j.employer_tg_id=? ORDER BY a.created_at DESC`).all(req.params.tg_id);
  res.json({ success: true, applications: apps });
});

app.patch('/api/applications/:id', (req, res) => {
  db.prepare('UPDATE applications SET status=? WHERE id=?').run(req.body.status, req.params.id);
  res.json({ success: true });
});

app.post('/api/ai/match', async (req, res) => {
  const { skills, area, type } = req.body;
  if (!skills) return res.status(400).json({ success: false, error: 'Skills required' });
  const jobs = db.prepare('SELECT id,title,company,salary,area,type,sphere,experience,description FROM jobs WHERE is_active=1 LIMIT 30').all();
  const jobsText = jobs.map(j => `ID:${j.id} | ${j.title} | ${j.company} | ${j.salary} | ${j.area} | ${j.type} | Опыт: ${j.experience}`).join('\n');
  const prompt = `Ты AI-ассистент платформы занятости MangystauJobs в Актау, Казахстан.\nНавыки соискателя: ${skills}\nРайон: ${area||'любой'}\nТип: ${type||'любой'}\n\nВакансии:\n${jobsText}\n\nПодбери топ-3. Ответ ТОЛЬКО JSON без markdown:\n{"matches":[{"job_id":1,"match_percent":95,"reason":"причина"}],"recommendation":"совет"}`;
  try {
    const text = await geminiGenerate(prompt);
    const parsed = JSON.parse(text.replace(/```json|```/g,'').trim());
    parsed.matches = parsed.matches.map(m => ({ ...m, job: jobs.find(j => j.id === m.job_id) })).filter(m => m.job);
    res.json({ success: true, ...parsed });
  } catch {
    const matches = jobs.slice(0,3).map((j,i) => ({ job_id:j.id, match_percent:85-i*7, reason:'Подходит по общим параметрам', job:j }));
    res.json({ success: true, matches, recommendation: 'Рекомендуем просмотреть все доступные вакансии.' });
  }
});

app.get('/api/stats', (req, res) => {
  res.json({ success: true,
    jobs: db.prepare('SELECT COUNT(*) as c FROM jobs WHERE is_active=1').get().c,
    employers: db.prepare('SELECT COUNT(DISTINCT employer_tg_id) as c FROM jobs WHERE is_active=1 AND employer_tg_id IS NOT NULL').get().c,
    applications: db.prepare('SELECT COUNT(*) as c FROM applications').get().c,
    users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
  });
});

app.post('/api/users', (req, res) => {
  const { tg_id, name, phone, skills, area, role } = req.body;
  db.prepare(`INSERT INTO users (tg_id,name,phone,skills,area,role) VALUES (?,?,?,?,?,?) ON CONFLICT(tg_id) DO UPDATE SET name=excluded.name,phone=excluded.phone,skills=excluded.skills,area=excluded.area,role=excluded.role`)
    .run(tg_id, name, phone, skills, area, role||'seeker');
  res.json({ success: true });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.listen(PORT, () => console.log(`MangystauJobs API on port ${PORT}`));
