const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ===== GEMINI API =====
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyAgtSc2E9tAXMkNrbnOkJvq-dswyAd167w';

async function geminiGenerate(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
    });
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
          resolve(text);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ===== DATABASE =====
const db = new Database(path.join(__dirname, 'jobs.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    salary TEXT,
    salary_num INTEGER DEFAULT 0,
    area TEXT,
    type TEXT DEFAULT 'Полная',
    sphere TEXT,
    experience TEXT DEFAULT 'Без опыта',
    description TEXT,
    contact TEXT,
    employer_tg_id TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_id TEXT UNIQUE,
    name TEXT,
    phone TEXT,
    skills TEXT,
    area TEXT,
    role TEXT DEFAULT 'seeker',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER,
    user_tg_id TEXT,
    user_name TEXT,
    user_phone TEXT,
    message TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
  );
`);

const count = db.prepare('SELECT COUNT(*) as c FROM jobs').get();
if (count.c === 0) {
  const insert = db.prepare(`INSERT INTO jobs (title, company, salary, salary_num, area, type, sphere, experience, description, contact) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  [
    ['Бариста', 'Coffee Time', '180 000 тг', 180000, '7-й мкр', 'Полная', 'cafe', 'Без опыта', 'Приготовление кофе и напитков. Обучим с нуля. График 5/2.', '@coffeetime_aktau'],
    ['Продавец-консультант', 'Магазин Алем', '150 000 тг', 150000, '9-й мкр', 'Полная', 'trade', 'Без опыта', 'Консультирование покупателей, работа с кассой. Стабильная зарплата + бонусы.', '+77001234567'],
    ['Разнорабочий', 'СтройМонтаж КЗ', '250 000 тг', 250000, '15-й мкр', 'Полная', 'build', '1+ лет', 'Общестроительные работы. Жильё предоставляется. Выплаты каждые 2 недели.', '@stroymontag_kz'],
    ['Мастер маникюра', 'Beauty Studio Актау', '200 000+ тг', 200000, 'Центр', 'Частичная', 'beauty', '1+ лет', 'Работа на своём месте. % от клиентов + оклад.', '@beauty_aktau'],
    ['Курьер (с авто)', 'Быстрая Доставка', '120 000 + чаевые', 120000, 'Весь город', 'Подработка', 'delivery', 'Без опыта', 'Доставка еды и товаров. Свободный график. Нужен автомобиль.', '+77009876543'],
    ['SMM-специалист', 'Digital Actau', '160 000 тг', 160000, 'Удалённо', 'Частичная', 'it', 'Без опыта', 'Ведение Instagram и TikTok. Знание казахского и русского обязательно.', '@digital_actau'],
    ['Повар', 'Ресторан Каспий', '220 000 тг', 220000, 'Центр', 'Полная', 'cafe', '2+ лет', 'Казахская и европейская кухня. Корпоративное питание. 2 выходных.', '+77771234567'],
    ['Грузчик', 'Маркет Опт', '180 000 тг', 180000, 'Новый город', 'Полная', 'trade', 'Без опыта', 'Работа на складе. Сменный график. Официальное оформление.', '+77002345678'],
  ].forEach(j => insert.run(...j));
}

// ===== ROUTES =====
app.get('/api/jobs', (req, res) => {
  const { sphere, type, area, q, limit = 50 } = req.query;
  let sql = 'SELECT * FROM jobs WHERE is_active = 1';
  const params = [];
  if (sphere) { sql += ' AND sphere = ?'; params.push(sphere); }
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (area) { sql += ' AND area LIKE ?'; params.push(`%${area}%`); }
  if (q) { sql += ' AND (title LIKE ? OR description LIKE ? OR company LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit));
  res.json({ success: true, jobs: db.prepare(sql).all(...params) });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, job });
});

app.post('/api/jobs', (req, res) => {
  const { title, company, salary, area, type, sphere, experience, description, contact, employer_tg_id } = req.body;
  if (!title || !company) return res.status(400).json({ success: false, error: 'Title and company required' });
  const salaryNum = parseInt(salary?.replace(/\D/g, '')) || 0;
  const result = db.prepare(`INSERT INTO jobs (title,company,salary,salary_num,area,type,sphere,experience,description,contact,employer_tg_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(title, company, salary || 'Договорная', salaryNum, area, type || 'Полная', sphere, experience || 'Без опыта', description, contact, employer_tg_id);
  res.json({ success: true, job: db.prepare('SELECT * FROM jobs WHERE id = ?').get(result.lastInsertRowid) });
});

app.delete('/api/jobs/:id', (req, res) => {
  db.prepare('UPDATE jobs SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/jobs/:id/apply', (req, res) => {
  const { user_tg_id, user_name, user_phone, message } = req.body;
  const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  const existing = db.prepare('SELECT id FROM applications WHERE job_id = ? AND user_tg_id = ?').get(req.params.id, user_tg_id);
  if (existing) return res.status(400).json({ success: false, error: 'Already applied' });
  const result = db.prepare(`INSERT INTO applications (job_id,user_tg_id,user_name,user_phone,message) VALUES (?,?,?,?,?)`)
    .run(req.params.id, user_tg_id, user_name, user_phone, message);
  res.json({ success: true, application_id: result.lastInsertRowid, employer_tg_id: job.employer_tg_id, job_title: job.title });
});

app.get('/api/employer/:tg_id/applications', (req, res) => {
  const apps = db.prepare(`SELECT a.*, j.title as job_title FROM applications a JOIN jobs j ON a.job_id = j.id WHERE j.employer_tg_id = ? ORDER BY a.created_at DESC`).all(req.params.tg_id);
  res.json({ success: true, applications: apps });
});

app.patch('/api/applications/:id', (req, res) => {
  db.prepare('UPDATE applications SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
  res.json({ success: true });
});

app.post('/api/ai/match', async (req, res) => {
  const { skills, area, type } = req.body;
  if (!skills) return res.status(400).json({ success: false, error: 'Skills required' });

  const jobs = db.prepare('SELECT id,title,company,salary,area,type,sphere,experience,description FROM jobs WHERE is_active = 1 LIMIT 30').all();
  const jobsText = jobs.map(j => `ID:${j.id} | ${j.title} | ${j.company} | ${j.salary} | ${j.area} | ${j.type} | Опыт: ${j.experience}`).join('\n');

  const prompt = `Ты AI-ассистент платформы занятости MangystauJobs в Актау, Казахстан.
Навыки соискателя: ${skills}
Район: ${area || 'любой'}
Тип занятости: ${type || 'любой'}

Вакансии:
${jobsText}

Подбери топ-3 подходящих. Ответ ТОЛЬКО в JSON без markdown:
{"matches": [{"job_id": 1, "match_percent": 95, "reason": "причина"}], "recommendation": "совет"}`;

  try {
    const text = await geminiGenerate(prompt);
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    parsed.matches = parsed.matches.map(m => ({ ...m, job: jobs.find(j => j.id === m.job_id) })).filter(m => m.job);
    res.json({ success: true, ...parsed });
  } catch (err) {
    console.error('AI error:', err.message);
    const matches = jobs.slice(0, 3).map((j, i) => ({ job_id: j.id, match_percent: 85 - i * 7, reason: 'Подходит по общим параметрам', job: j }));
    res.json({ success: true, matches, recommendation: 'Рекомендуем просмотреть все доступные вакансии.' });
  }
});

app.get('/api/stats', (req, res) => {
  res.json({
    success: true,
    jobs: db.prepare('SELECT COUNT(*) as c FROM jobs WHERE is_active = 1').get().c,
    employers: db.prepare('SELECT COUNT(DISTINCT employer_tg_id) as c FROM jobs WHERE is_active = 1 AND employer_tg_id IS NOT NULL').get().c,
    applications: db.prepare('SELECT COUNT(*) as c FROM applications').get().c,
    users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
  });
});

app.post('/api/users', (req, res) => {
  const { tg_id, name, phone, skills, area, role } = req.body;
  db.prepare(`INSERT INTO users (tg_id,name,phone,skills,area,role) VALUES (?,?,?,?,?,?) ON CONFLICT(tg_id) DO UPDATE SET name=excluded.name,phone=excluded.phone,skills=excluded.skills,area=excluded.area,role=excluded.role`)
    .run(tg_id, name, phone, skills, area, role || 'seeker');
  res.json({ success: true });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`MangystauJobs API on port ${PORT}`));
