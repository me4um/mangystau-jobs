import { useState, useEffect, useCallback, useRef } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
const BOT_NAME = import.meta.env.VITE_BOT_NAME || "MangystauJobsBot";

const SPHERE_LABELS = { cafe:"Общепит", trade:"Торговля", build:"Строительство", beauty:"Красота", it:"IT", delivery:"Доставка", other:"Другое" };
const SPHERE_EMOJI  = { cafe:"☕", trade:"🛒", build:"🔨", beauty:"💅", it:"📱", delivery:"🚗", other:"📋" };
const SPHERE_COLORS = { cafe:["#FFF3E8","#E8541A"], trade:["#E8F5E9","#2E7D32"], build:["#FFF8E1","#F57C00"], beauty:["#FCE4EC","#AD1457"], it:["#EDE7F6","#512DA8"], delivery:["#E3F2FD","#1565C0"], other:["#F3F4F6","#374151"] };

// Координаты районов Актау
const AREA_COORDS = {
  "Центр": [43.6529, 51.1799],
  "5-й мкр": [43.6601, 51.1650],
  "7-й мкр": [43.6480, 51.1720],
  "9-й мкр": [43.6400, 51.1800],
  "11-й мкр": [43.6350, 51.1900],
  "15-й мкр": [43.6250, 51.1950],
  "17-й мкр": [43.6200, 51.2000],
  "Новый город": [43.6700, 51.1600],
  "Весь город": [43.6529, 51.1799],
  "Удалённо": null,
};

// ─── FAKE JOB DETECTOR ───────────────────────────────────────────
const SUSPICIOUS_PATTERNS = [
  { pattern: /быстр|легк|прост/i, label: "Слишком лёгкая работа", weight: 2 },
  { pattern: /без опыта.{0,20}(500|600|700|800|900|1[0-9]{3})\s*000/i, label: "Завышенная зарплата для без опыта", weight: 3 },
  { pattern: /мгновенный|сразу|сегодня.{0,10}(деньги|оплат)/i, label: "Обещание мгновенных денег", weight: 3 },
  { pattern: /предоплат|взнос|залог|регистрационный/i, label: "Требование предоплаты — мошенничество!", weight: 5 },
  { pattern: /telegram|whatsapp.{0,20}(писат|обращат|подробн)/i, label: "Перевод в мессенджеры", weight: 2 },
  { pattern: /нигерия|заграниц|загран|за рубеж/i, label: "Сомнительное зарубежное предложение", weight: 3 },
  { pattern: /работа.{0,15}дома.{0,15}(500|600|700|800)\s*000/i, label: "Нереальная зарплата за удалённую работу", weight: 3 },
  { pattern: /без.{0,10}регистрац|неофициальн|серая/i, label: "Неофициальное трудоустройство", weight: 1 },
  { pattern: /интим|взросл|18\+/i, label: "Подозрительный контент", weight: 5 },
];

function detectFakeJob(formData) {
  const text = `${formData.title} ${formData.description} ${formData.salary} ${formData.company}`.toLowerCase();
  const flags = [];
  let score = 0;

  for (const { pattern, label, weight } of SUSPICIOUS_PATTERNS) {
    if (pattern.test(text)) {
      flags.push(label);
      score += weight;
    }
  }

  // Проверка зарплаты — слишком высокая
  const salaryNum = parseInt(formData.salary?.replace(/\D/g, "")) || 0;
  if (salaryNum > 1000000) {
    flags.push("Зарплата свыше 1 000 000 тг — подозрительно");
    score += 4;
  }
  if (salaryNum > 500000 && formData.experience === "Без опыта") {
    flags.push("Высокая зарплата без опыта");
    score += 2;
  }

  // Слишком короткое описание
  if (formData.description && formData.description.length < 20) {
    flags.push("Слишком короткое описание");
    score += 1;
  }

  return { score, flags, isSuspicious: score >= 3, isDangerous: score >= 5 };
}

// ─── LEAFLET MAP COMPONENT ────────────────────────────────────────
function MapView({ jobs }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (mapInstanceRef.current) return;

    // Динамически загружаем Leaflet CSS
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    // Динамически загружаем Leaflet JS
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      if (!mapRef.current || mapInstanceRef.current) return;
      const L = window.L;
      const map = L.map(mapRef.current).setView([43.6529, 51.1799], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);
      mapInstanceRef.current = map;
      setMapReady(true);
    };
    document.head.appendChild(script);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const L = window.L;
    const map = mapInstanceRef.current;

    // Удаляем старые маркеры
    map.eachLayer(layer => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });

    // Группируем вакансии по районам
    const grouped = {};
    jobs.forEach(job => {
      const coords = AREA_COORDS[job.area];
      if (!coords) return;
      const key = job.area;
      if (!grouped[key]) grouped[key] = { coords, jobs: [] };
      grouped[key].jobs.push(job);
    });

    // Добавляем маркеры
    Object.entries(grouped).forEach(([area, { coords, jobs: areaJobs }]) => {
      const [jbg, jtc] = SPHERE_COLORS[areaJobs[0]?.sphere] || ["#E8541A", "#fff"];
      const icon = L.divIcon({
        html: `<div style="background:${jtc};color:#fff;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid #fff">${areaJobs.length}</div>`,
        className: "",
        iconSize: [36, 36],
      });
      const popup = `
        <div style="font-family:Inter,sans-serif;min-width:180px">
          <div style="font-weight:700;margin-bottom:6px;font-size:14px">${area}</div>
          ${areaJobs.slice(0, 4).map(j => `
            <div style="padding:4px 0;border-bottom:1px solid #eee;font-size:12px">
              <div style="font-weight:600">${j.title}</div>
              <div style="color:#E8541A">${j.salary}</div>
              <div style="color:#888">${j.company}</div>
            </div>
          `).join("")}
          ${areaJobs.length > 4 ? `<div style="font-size:11px;color:#888;margin-top:4px">+${areaJobs.length - 4} ещё</div>` : ""}
        </div>
      `;
      L.marker(coords, { icon }).addTo(map).bindPopup(popup);
    });
  }, [jobs, mapReady]);

  return (
    <div style={{ borderRadius: 16, overflow: "hidden", border: "1.5px solid #F0E8E0", marginBottom: 24 }}>
      <div style={{ background: "#1A1208", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>🗺️</span>
        <span style={{ fontFamily: "'Unbounded',sans-serif", fontSize: 12, color: "#fff" }}>Вакансии на карте Актау</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginLeft: "auto" }}>{jobs.filter(j => AREA_COORDS[j.area]).length} вакансий</span>
      </div>
      <div ref={mapRef} style={{ height: 280, width: "100%" }} />
    </div>
  );
}

// ─── FRAUD WARNING BADGE ──────────────────────────────────────────
function FraudBadge({ job }) {
  const [show, setShow] = useState(false);
  const check = detectFakeJob(job);
  if (!check.isSuspicious) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <div
        onClick={e => { e.stopPropagation(); setShow(s => !s); }}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "4px 10px", borderRadius: 20,
          background: check.isDangerous ? "#FEE2E2" : "#FEF3C7",
          color: check.isDangerous ? "#DC2626" : "#D97706",
          fontSize: 11, fontWeight: 600, cursor: "pointer"
        }}
      >
        {check.isDangerous ? "🚫 Высокий риск" : "⚠️ Проверьте вакансию"}
      </div>
      {show && (
        <div style={{ marginTop: 6, padding: "8px 12px", background: check.isDangerous ? "#FEF2F2" : "#FFFBEB", borderRadius: 10, border: `1px solid ${check.isDangerous ? "#FECACA" : "#FDE68A"}` }}>
          {check.flags.map((f, i) => <div key={i} style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>• {f}</div>)}
          <div style={{ fontSize: 10, color: "#888", marginTop: 6 }}>Если кто-то просит предоплату — это мошенники. Сообщите в поддержку.</div>
        </div>
      )}
    </div>
  );
}

// ─── AI SEARCH (через Anthropic API) ─────────────────────────────
async function runAISearch(query, jobs) {
  const jobsText = jobs.slice(0, 30).map(j =>
    `ID:${j.id} | ${j.title} | ${j.company} | ${j.salary} | ${j.area} | ${j.type} | Опыт: ${j.experience} | ${j.description || ""}`
  ).join("\n");

  const prompt = `Ты AI-ассистент платформы занятости MangystauJobs в Актау, Казахстан.
Соискатель написал: "${query}"

Доступные вакансии:
${jobsText}

Выбери топ-3 наиболее подходящих вакансии. Отвечай ТОЛЬКО JSON без markdown:
{"matches":[{"job_id":1,"match_percent":95,"reason":"краткая причина на русском","tip":"совет соискателю"}],"summary":"общий совет"}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await response.json();
    const text = data.content?.map(c => c.text || "").join("") || "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

// ─── AI VACANCY CHECKER ───────────────────────────────────────────
async function runAIVacancyCheck(formData) {
  const prompt = `Ты эксперт по выявлению мошеннических вакансий в Казахстане.
Проверь вакансию:
- Название: ${formData.title}
- Компания: ${formData.company}
- Зарплата: ${formData.salary}
- Тип: ${formData.type}
- Опыт: ${formData.experience}
- Описание: ${formData.description}
- Контакт: ${formData.contact}

Оцени по шкале 0-10 риск мошенничества (0 = полностью легитимна, 10 = явное мошенничество).
Отвечай ТОЛЬКО JSON:
{"risk_score":3,"verdict":"ok|suspicious|dangerous","issues":["проблема1"],"recommendation":"совет"}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await response.json();
    const text = data.content?.map(c => c.text || "").join("") || "";
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return null;
  }
}

// ─── MAIN APP ─────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]             = useState("seeker");
  const [jobs, setJobs]           = useState([]);
  const [stats, setStats]         = useState({ jobs:0, employers:0, applications:0 });
  const [search, setSearch]       = useState("");
  const [sphereFilter, setSphereFilter] = useState("all");
  const [selectedJob, setSelectedJob]   = useState(null);
  const [applied, setApplied]     = useState([]);
  const [aiQuery, setAiQuery]     = useState("");
  const [aiResult, setAiResult]   = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [toast, setToast]         = useState("");
  const [loading, setLoading]     = useState(true);
  const [showMap, setShowMap]     = useState(false);
  const [postForm, setPostForm]   = useState({ title:"", company:"", salary:"", type:"Полная", sphere:"cafe", area:"Центр", experience:"Без опыта", description:"", contact:"" });
  const [fraudCheck, setFraudCheck] = useState(null);
  const [aiCheckLoading, setAiCheckLoading] = useState(false);

  const [user, setUser]               = useState(null);
  const [token, setToken]             = useState(() => localStorage.getItem("mjToken"));
  const [showLogin, setShowLogin]     = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [applyModal, setApplyModal]   = useState(null);
  const [applyForm, setApplyForm]     = useState({ name:"", phone:"", message:"" });
  const tgWidgetRef = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  // ─── AUTH ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => {
        if (d.success) setUser(d.user);
        else { setToken(null); localStorage.removeItem("mjToken"); }
      }).catch(() => {});
  }, [token]);

  // ─── BOT-BASED AUTH (работает на любом домене, включая localhost) ─
  const [loginCode, setLoginCode]       = useState("");
  const [loginStep, setLoginStep]       = useState("start"); // start | waiting | code
  const [loginPolling, setLoginPolling] = useState(null);

  // Генерируем уникальный код сессии и ждём пока бот его подтвердит
  const startBotLogin = async () => {
    try {
      const res = await fetch(`${API}/api/auth/init-login`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setLoginCode(data.code);
        setLoginStep("waiting");
        // Открываем бота с кодом
        window.open(`https://t.me/${BOT_NAME}?start=login_${data.code}`, "_blank");
        // Начинаем polling — каждые 2 сек проверяем подтверждён ли вход
        const interval = setInterval(async () => {
          try {
            const pollRes = await fetch(`${API}/api/auth/poll-login?code=${data.code}`);
            const pollData = await pollRes.json();
            if (pollData.success && pollData.token) {
              clearInterval(interval);
              setLoginPolling(null);
              setToken(pollData.token);
              localStorage.setItem("mjToken", pollData.token);
              setUser(pollData.user);
              setShowLogin(false);
              setLoginStep("start");
              setLoginCode("");
              showToast("✅ Вы вошли как " + pollData.user.name);
            }
          } catch {}
        }, 2000);
        setLoginPolling(interval);
        // Остановить через 5 минут
        setTimeout(() => { clearInterval(interval); setLoginStep("start"); }, 300000);
      }
    } catch { showToast("Ошибка соединения"); }
  };

  useEffect(() => {
    return () => { if (loginPolling) clearInterval(loginPolling); };
  }, [loginPolling]);

  const cancelLogin = () => {
    if (loginPolling) { clearInterval(loginPolling); setLoginPolling(null); }
    setLoginStep("start");
    setLoginCode("");
    setShowLogin(false);
  };

  const logout = async () => {
    await fetch(`${API}/api/auth/logout`, { method:"DELETE", headers:{ Authorization:`Bearer ${token}` } }).catch(()=>{});
    setToken(null); setUser(null); localStorage.removeItem("mjToken");
    setShowProfile(false); showToast("Вы вышли из аккаунта");
  };

  // ─── JOBS ─────────────────────────────────────────────────────
  const loadJobs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (sphereFilter !== "all") params.set("sphere", sphereFilter);
      if (search) params.set("q", search);
      const res = await fetch(`${API}/api/jobs?${params}`);
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch {}
  }, [sphereFilter, search]);

  const loadStats = async () => {
    try {
      const res = await fetch(`${API}/api/stats`);
      const data = await res.json();
      setStats(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadStats(); }, []);
  useEffect(() => { loadJobs(); }, [loadJobs]);

  // ─── APPLY ────────────────────────────────────────────────────
  const openApply = (job) => {
    if (!user) { setShowLogin(true); return; }
    setApplyForm({ name: user.name || "", phone: user.phone || "", message: "" });
    setApplyModal(job);
    setSelectedJob(null);
  };

  const submitApply = async () => {
    if (!applyForm.name.trim()) return showToast("Введите имя");
    if (!applyForm.phone.trim()) return showToast("Введите телефон");
    if (applied.includes(applyModal.id)) return showToast("Вы уже откликались");
    try {
      const res = await fetch(`${API}/api/jobs/${applyModal.id}/apply`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_tg_id: String(user.tg_id),
          user_name:  applyForm.name,
          user_phone: applyForm.phone,
          message:    applyForm.message,
        })
      });
      const data = await res.json();
      if (data.success) {
        setApplied(a => [...a, applyModal.id]);
        setApplyModal(null);
        showToast("✅ Отклик отправлен! Работодатель получит уведомление в Telegram мгновенно");
      } else { showToast(data.error === "Already applied" ? "Вы уже откликались на эту вакансию" : (data.error || "Ошибка")); }
    } catch { showToast("Ошибка соединения"); }
  };

  // ─── AI MATCH (реальный через Anthropic API) ──────────────────
  const handleAIMatch = async () => {
    if (!aiQuery.trim()) return showToast("Опишите свои навыки");
    setAiLoading(true); setAiResult(null);
    try {
      // Сначала пробуем через бэкенд (Gemini)
      const res = await fetch(`${API}/api/ai/match`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills: aiQuery })
      });
      const backendData = await res.json();

      if (backendData.success && backendData.matches?.length > 0) {
        setAiResult(backendData);
      } else {
        // Fallback на Anthropic API напрямую
        const result = await runAISearch(aiQuery, jobs);
        if (result) {
          const enriched = {
            ...result,
            matches: result.matches?.map(m => ({
              ...m,
              job: jobs.find(j => j.id === m.job_id)
            })).filter(m => m.job)
          };
          setAiResult(enriched);
        } else {
          showToast("Ошибка AI. Попробуйте позже");
        }
      }
    } catch {
      // Fallback на Anthropic API
      const result = await runAISearch(aiQuery, jobs);
      if (result) {
        setAiResult({
          ...result,
          matches: result.matches?.map(m => ({
            ...m,
            job: jobs.find(j => j.id === m.job_id)
          })).filter(m => m.job)
        });
      } else {
        showToast("Ошибка AI матчинга");
      }
    }
    setAiLoading(false);
  };

  // ─── POST JOB с проверкой на фейк ─────────────────────────────
  const handleCheckAndPost = async () => {
    if (!postForm.title || !postForm.company) return showToast("Заполните название и компанию");
    if (!user) { setShowLogin(true); return; }

    // Локальная проверка
    const localCheck = detectFakeJob(postForm);

    if (localCheck.isDangerous) {
      setFraudCheck({ ...localCheck, source: "local" });
      return; // Блокируем публикацию
    }

    // AI проверка через Anthropic
    setAiCheckLoading(true);
    const aiCheck = await runAIVacancyCheck(postForm);
    setAiCheckLoading(false);

    if (aiCheck) {
      const combined = {
        score: Math.max(localCheck.score, aiCheck.risk_score),
        flags: [...localCheck.flags, ...(aiCheck.issues || [])],
        isSuspicious: localCheck.isSuspicious || aiCheck.verdict !== "ok",
        isDangerous: localCheck.isDangerous || aiCheck.verdict === "dangerous",
        aiVerdict: aiCheck.verdict,
        aiRecommendation: aiCheck.recommendation,
        source: "ai",
      };

      if (combined.isDangerous) {
        setFraudCheck(combined);
        return;
      }

      if (combined.isSuspicious) {
        setFraudCheck({ ...combined, needConfirm: true });
        return;
      }
    }

    await doPostJob();
  };

  const doPostJob = async () => {
    setFraudCheck(null);
    try {
      const res = await fetch(`${API}/api/jobs`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...postForm, employer_tg_id: String(user.tg_id) })
      });
      const data = await res.json();
      if (data.success) {
        showToast("✅ Вакансия опубликована! Отклики придут в Telegram");
        setPostForm({ title:"", company:"", salary:"", type:"Полная", sphere:"cafe", area:"Центр", experience:"Без опыта", description:"", contact:"" });
        loadStats(); loadJobs(); setTab("seeker");
      }
    } catch { showToast("Ошибка публикации"); }
  };

  const [bg, tc] = SPHERE_COLORS[selectedJob?.sphere] || ["#F3F4F6","#374151"];

  return (
    <div style={{ fontFamily:"'Inter',sans-serif", background:"#FAF6EF", minHeight:"100vh", maxWidth:480, margin:"0 auto", position:"relative" }}>

      {/* TOPBAR */}
      <div style={{ background:"#1A1208", padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:18, color:"#fff", letterSpacing:-0.5 }}>
          Mangy<span style={{ color:"#E8541A" }}>Jobs</span>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {[["seeker","Ищу работу"],["employer","Работодатель"]].map(([t,label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding:"7px 12px", borderRadius:20, border:"none", cursor:"pointer", fontSize:12, fontWeight:500,
                background:tab===t?"#E8541A":"transparent", color:tab===t?"#fff":"rgba(255,255,255,0.5)" }}>
              {label}
            </button>
          ))}
          {user ? (
            <div onClick={() => setShowProfile(true)} style={{ width:32, height:32, borderRadius:"50%", background:"#E8541A", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", overflow:"hidden", flexShrink:0 }}>
              {user.photo_url
                ? <img src={user.photo_url} style={{ width:"100%", height:"100%" }} alt="" />
                : <span style={{ fontSize:14, color:"#fff", fontWeight:700 }}>{user.name?.[0]}</span>}
            </div>
          ) : (
            <button onClick={() => setShowLogin(true)} style={{ padding:"7px 12px", borderRadius:20, border:"1px solid rgba(255,255,255,0.2)", background:"transparent", color:"rgba(255,255,255,0.7)", fontSize:12, cursor:"pointer" }}>
              Войти
            </button>
          )}
        </div>
      </div>

      {/* SEEKER TAB */}
      {tab === "seeker" && (
        <>
          <div style={{ background:"#1A1208", padding:"24px 16px 36px", color:"#fff" }}>
            <div style={{ fontSize:11, color:"#E8541A", letterSpacing:2, textTransform:"uppercase", marginBottom:10 }}>Мангистауская область</div>
            <h1 style={{ fontFamily:"'Unbounded',sans-serif", fontSize:26, lineHeight:1.2, margin:"0 0 8px" }}>Работа рядом<br/>с тобой</h1>
            <p style={{ fontSize:14, color:"rgba(255,255,255,0.6)", lineHeight:1.6, maxWidth:320, margin:0 }}>Вакансии малого бизнеса Актау — без hh.ru и WhatsApp-чатов</p>
            <div style={{ display:"flex", gap:24, marginTop:20 }}>
              {[[loading?"...":stats.jobs,"вакансий"],[loading?"...":stats.employers||23,"работодателей"],[loading?"...":stats.applications,"откликов"]].map(([n,l]) => (
                <div key={l} style={{ display:"flex", flexDirection:"column" }}>
                  <span style={{ fontFamily:"'Unbounded',sans-serif", fontSize:20, color:"#E8541A" }}>{n}</span>
                  <span style={{ fontSize:11, color:"rgba(255,255,255,0.5)", marginTop:2 }}>{l}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding:"16px 16px 90px" }}>
            {/* Search */}
            <div style={{ display:"flex", gap:8, marginBottom:16 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key==="Enter" && loadJobs()}
                placeholder="Профессия, навык, район..."
                style={{ flex:1, padding:"12px 16px", borderRadius:12, border:"1.5px solid #E8E0D5", fontSize:14, background:"#fff", outline:"none" }} />
              <button onClick={loadJobs} style={{ padding:"12px 18px", background:"#E8541A", border:"none", borderRadius:12, color:"#fff", fontSize:13, cursor:"pointer" }}>Найти</button>
            </div>

            {/* Filter pills */}
            <div style={{ display:"flex", gap:8, marginBottom:16, overflowX:"auto", paddingBottom:4 }}>
              {[["all","Все"],["cafe","Общепит"],["trade","Торговля"],["build","Стройка"],["beauty","Красота"],["it","IT"],["delivery","Доставка"]].map(([val,label]) => (
                <button key={val} onClick={() => setSphereFilter(val)}
                  style={{ padding:"7px 14px", borderRadius:20, border:`1.5px solid ${sphereFilter===val?"#E8541A":"#E8E0D5"}`, background:sphereFilter===val?"#E8541A":"#fff", fontSize:12, fontWeight:500, color:sphereFilter===val?"#fff":"#7A7065", cursor:"pointer", whiteSpace:"nowrap" }}>
                  {label}
                </button>
              ))}
            </div>

            {/* MAP TOGGLE */}
            <button
              onClick={() => setShowMap(s => !s)}
              style={{ width:"100%", padding:"10px 16px", background:showMap?"#1A1208":"#fff", border:"1.5px solid #E8E0D5", borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", gap:8, cursor:"pointer", marginBottom:16, fontSize:13, color:showMap?"#fff":"#555", fontWeight:500 }}
            >
              <span>🗺️</span> {showMap ? "Скрыть карту" : "Показать вакансии на карте"}
            </button>

            {/* MAP */}
            {showMap && <MapView jobs={jobs} />}

            {/* AI MATCH */}
            <div style={{ background:"#1A1208", borderRadius:16, padding:18, marginBottom:24 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, fontFamily:"'Unbounded',sans-serif", fontSize:13, color:"#fff", marginBottom:4 }}>
                <span style={{ width:8, height:8, borderRadius:"50%", background:"#E8541A", display:"inline-block" }}></span> AI-матчинг
                <span style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginLeft:"auto" }}>Claude AI</span>
              </div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.55)", marginBottom:14 }}>Опишите навыки — AI подберёт лучшие вакансии</div>
              <div style={{ display:"flex", gap:8 }}>
                <input value={aiQuery} onChange={e => setAiQuery(e.target.value)} onKeyDown={e => e.key==="Enter" && handleAIMatch()}
                  placeholder="Умею готовить, 2 года опыта..."
                  style={{ flex:1, padding:"10px 14px", borderRadius:10, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.08)", fontSize:13, color:"#fff", outline:"none" }} />
                <button onClick={handleAIMatch} disabled={aiLoading}
                  style={{ padding:"10px 16px", background:"#E8541A", border:"none", borderRadius:10, color:"#fff", fontSize:13, cursor:"pointer", opacity:aiLoading?0.7:1 }}>
                  {aiLoading ? (
                    <span style={{ display:"inline-block", animation:"spin 1s linear infinite" }}>⟳</span>
                  ) : "↗"}
                </button>
              </div>
              {aiLoading && (
                <div style={{ marginTop:12, fontSize:12, color:"rgba(255,255,255,0.5)", textAlign:"center" }}>
                  🤖 Claude анализирует ваш запрос...
                </div>
              )}
              {aiResult && (
                <div style={{ marginTop:14, padding:12, background:"rgba(255,255,255,0.06)", borderRadius:10, border:"1px solid rgba(232,84,26,0.25)" }}>
                  {aiResult.matches?.map((m, i) => (
                    <div key={i} style={{ marginBottom:12, paddingBottom:12, borderBottom:i<aiResult.matches.length-1?"1px solid rgba(255,255,255,0.1)":"none" }}>
                      <div style={{ fontSize:13, fontWeight:500, color:"#fff", marginBottom:4 }}>{m.job?.title} — {m.job?.company}</div>
                      <div style={{ fontSize:12, color:"#E8541A", marginBottom:4 }}>✅ {m.match_percent}% совпадение</div>
                      <div style={{ fontSize:12, color:"rgba(255,255,255,0.6)", marginBottom:4 }}>{m.reason}</div>
                      {m.tip && <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", fontStyle:"italic" }}>💡 {m.tip}</div>}
                      <button onClick={() => setSelectedJob(m.job)}
                        style={{ marginTop:8, padding:"6px 14px", background:"#E8541A", border:"none", borderRadius:8, color:"#fff", fontSize:12, cursor:"pointer" }}>
                        Открыть вакансию
                      </button>
                    </div>
                  ))}
                  {(aiResult.recommendation || aiResult.summary) && (
                    <div style={{ fontSize:12, color:"rgba(255,255,255,0.7)", fontStyle:"italic" }}>
                      💬 {aiResult.recommendation || aiResult.summary}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* JOBS LIST */}
            <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:14, marginBottom:12 }}>Вакансии</div>
            {jobs.length === 0 ? (
              <div style={{ textAlign:"center", padding:32, color:"#7A7065", fontSize:14 }}>Вакансий не найдено</div>
            ) : jobs.map(job => {
              const [jbg, jtc] = SPHERE_COLORS[job.sphere] || ["#F3F4F6","#374151"];
              const check = detectFakeJob(job);
              return (
                <div key={job.id} onClick={() => setSelectedJob(job)}
                  style={{ background:"#fff", borderRadius:16, padding:16, border:`1.5px solid ${check.isDangerous?"#FECACA":check.isSuspicious?"#FDE68A":"#F0E8E0"}`, cursor:"pointer", marginBottom:10 }}>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:10 }}>
                    <div style={{ width:44, height:44, borderRadius:10, background:jbg, color:jtc, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>
                      {SPHERE_EMOJI[job.sphere]||"💼"}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:500, fontSize:15, color:"#1A1208", marginBottom:3 }}>{job.title}</div>
                      <div style={{ fontSize:13, color:"#7A7065" }}>{job.company} • {job.area}</div>
                    </div>
                    <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:13, color:"#E8541A", fontWeight:600, whiteSpace:"nowrap" }}>{job.salary}</div>
                  </div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {[job.type, job.experience, job.area].map(t => (
                      <span key={t} style={{ padding:"4px 10px", borderRadius:20, background:"#F4F1ED", fontSize:11, color:"#7A7065" }}>{t}</span>
                    ))}
                    {applied.includes(job.id) && <span style={{ padding:"4px 10px", borderRadius:20, background:"#EAF3DE", fontSize:11, color:"#3B6D11" }}>✓ Откликнулся</span>}
                  </div>
                  <FraudBadge job={job} />
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* EMPLOYER TAB */}
      {tab === "employer" && (
        <>
          <div style={{ background:"#1A1208", padding:"24px 16px 36px", color:"#fff" }}>
            <div style={{ fontSize:11, color:"#E8541A", letterSpacing:2, textTransform:"uppercase", marginBottom:10 }}>Для работодателей</div>
            <h1 style={{ fontFamily:"'Unbounded',sans-serif", fontSize:24, lineHeight:1.2, margin:"0 0 8px" }}>Найдите<br/>сотрудника<br/>за 24 часа</h1>
            <p style={{ fontSize:14, color:"rgba(255,255,255,0.6)", lineHeight:1.6, margin:0 }}>
              {user ? `Отклики придут в Telegram — @${user.username||user.name}` : "Войдите через Telegram — отклики придут мгновенно"}
            </p>
          </div>

          {!user && (
            <div style={{ margin:"16px 16px 0", padding:16, background:"#fff3e8", borderRadius:12, border:"1.5px solid #E8541A", display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize:24 }}>📬</span>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:14, color:"#1A1208", marginBottom:4 }}>Войдите для публикации</div>
                <div style={{ fontSize:13, color:"#7A7065" }}>Отклики придут в ваш Telegram мгновенно</div>
              </div>
              <button onClick={() => setShowLogin(true)} style={{ padding:"8px 16px", background:"#E8541A", border:"none", borderRadius:10, color:"#fff", fontSize:13, cursor:"pointer", whiteSpace:"nowrap" }}>
                Войти
              </button>
            </div>
          )}

          {/* FRAUD ALERT MODAL */}
          {fraudCheck && (
            <div style={{ margin:"12px 16px 0", padding:16, background:fraudCheck.isDangerous?"#FEF2F2":"#FFFBEB", borderRadius:12, border:`1.5px solid ${fraudCheck.isDangerous?"#FECACA":"#FDE68A"}` }}>
              <div style={{ fontWeight:700, fontSize:15, color:fraudCheck.isDangerous?"#DC2626":"#D97706", marginBottom:8 }}>
                {fraudCheck.isDangerous ? "🚫 Публикация заблокирована" : "⚠️ Возможные проблемы"}
              </div>
              {fraudCheck.flags?.map((f, i) => (
                <div key={i} style={{ fontSize:13, color:"#555", marginBottom:4 }}>• {f}</div>
              ))}
              {fraudCheck.aiRecommendation && (
                <div style={{ fontSize:12, color:"#666", marginTop:8, fontStyle:"italic" }}>
                  💡 {fraudCheck.aiRecommendation}
                </div>
              )}
              {!fraudCheck.isDangerous && fraudCheck.needConfirm && (
                <div style={{ display:"flex", gap:8, marginTop:12 }}>
                  <button onClick={() => doPostJob()}
                    style={{ flex:1, padding:10, background:"#D97706", border:"none", borderRadius:10, color:"#fff", fontSize:13, cursor:"pointer" }}>
                    Всё равно опубликовать
                  </button>
                  <button onClick={() => setFraudCheck(null)}
                    style={{ flex:1, padding:10, background:"#F3F4F6", border:"none", borderRadius:10, color:"#555", fontSize:13, cursor:"pointer" }}>
                    Исправить
                  </button>
                </div>
              )}
              {fraudCheck.isDangerous && (
                <button onClick={() => setFraudCheck(null)}
                  style={{ width:"100%", marginTop:12, padding:10, background:"#F3F4F6", border:"none", borderRadius:10, color:"#555", fontSize:13, cursor:"pointer" }}>
                  Изменить вакансию
                </button>
              )}
            </div>
          )}

          <div style={{ padding:"16px 16px 90px" }}>
            <div style={{ background:"#fff", borderRadius:16, padding:20, border:"1.5px solid #F0E8E0" }}>
              {[["Название вакансии *","title","Бариста, кассир, мастер..."],["Компания / Заведение","company","Название кафе, магазина..."],["Зарплата (тг/мес)","salary","150000 или 'от 120000'"]].map(([label,field,ph]) => (
                <div key={field} style={{ marginBottom:16 }}>
                  <label style={{ fontSize:13, fontWeight:500, color:"#1A1208", marginBottom:6, display:"block" }}>{label}</label>
                  <input value={postForm[field]} onChange={e => setPostForm(f => ({...f,[field]:e.target.value}))} placeholder={ph}
                    style={{ width:"100%", padding:"12px 14px", border:"1.5px solid #E8E0D5", borderRadius:10, fontSize:14, outline:"none", boxSizing:"border-box" }} />
                </div>
              ))}
              <div style={{ display:"flex", gap:10, marginBottom:16 }}>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:13, fontWeight:500, color:"#1A1208", marginBottom:6, display:"block" }}>Тип занятости</label>
                  <select value={postForm.type} onChange={e => setPostForm(f => ({...f,type:e.target.value}))}
                    style={{ width:"100%", padding:"12px 14px", border:"1.5px solid #E8E0D5", borderRadius:10, fontSize:14, background:"#fff", outline:"none" }}>
                    {["Полная","Частичная","Подработка"].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:13, fontWeight:500, color:"#1A1208", marginBottom:6, display:"block" }}>Сфера</label>
                  <select value={postForm.sphere} onChange={e => setPostForm(f => ({...f,sphere:e.target.value}))}
                    style={{ width:"100%", padding:"12px 14px", border:"1.5px solid #E8E0D5", borderRadius:10, fontSize:14, background:"#fff", outline:"none" }}>
                    {Object.entries(SPHERE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display:"flex", gap:10, marginBottom:16 }}>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:13, fontWeight:500, color:"#1A1208", marginBottom:6, display:"block" }}>Район Актау</label>
                  <select value={postForm.area} onChange={e => setPostForm(f => ({...f,area:e.target.value}))}
                    style={{ width:"100%", padding:"12px 14px", border:"1.5px solid #E8E0D5", borderRadius:10, fontSize:14, background:"#fff", outline:"none" }}>
                    {["Центр","5-й мкр","7-й мкр","9-й мкр","11-й мкр","15-й мкр","17-й мкр","Новый город","Весь город","Удалённо"].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:13, fontWeight:500, color:"#1A1208", marginBottom:6, display:"block" }}>Опыт</label>
                  <select value={postForm.experience} onChange={e => setPostForm(f => ({...f,experience:e.target.value}))}
                    style={{ width:"100%", padding:"12px 14px", border:"1.5px solid #E8E0D5", borderRadius:10, fontSize:14, background:"#fff", outline:"none" }}>
                    {["Без опыта","1+ лет","2+ лет","3+ лет"].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:13, fontWeight:500, color:"#1A1208", marginBottom:6, display:"block" }}>Описание и требования</label>
                <textarea value={postForm.description} onChange={e => setPostForm(f => ({...f,description:e.target.value}))} placeholder="Опыт, обязанности, условия, график..."
                  style={{ width:"100%", padding:"12px 14px", border:"1.5px solid #E8E0D5", borderRadius:10, fontSize:14, outline:"none", minHeight:100, resize:"vertical", fontFamily:"inherit", boxSizing:"border-box" }} />
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:13, fontWeight:500, color:"#1A1208", marginBottom:6, display:"block" }}>Контакт для связи</label>
                <input value={postForm.contact} onChange={e => setPostForm(f => ({...f,contact:e.target.value}))} placeholder="@username или +77001234567"
                  style={{ width:"100%", padding:"12px 14px", border:"1.5px solid #E8E0D5", borderRadius:10, fontSize:14, outline:"none", boxSizing:"border-box" }} />
              </div>
              <button onClick={handleCheckAndPost} disabled={aiCheckLoading}
                style={{ width:"100%", padding:16, background: aiCheckLoading ? "#999" : "#E8541A", border:"none", borderRadius:14, color:"#fff", fontFamily:"'Unbounded',sans-serif", fontSize:14, cursor: aiCheckLoading ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                {aiCheckLoading ? (
                  <><span style={{ animation:"spin 1s linear infinite", display:"inline-block" }}>⟳</span> AI проверяет вакансию...</>
                ) : (
                  user ? "🛡️ Проверить и разместить" : "Войти и разместить"
                )}
              </button>
              {user && (
                <div style={{ textAlign:"center", fontSize:12, color:"#7A7065", marginTop:10 }}>
                  🤖 AI проверит вакансию на мошенничество перед публикацией
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* JOB MODAL */}
      {selectedJob && (
        <div onClick={e => e.target===e.currentTarget && setSelectedJob(null)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
          <div style={{ background:"#fff", borderRadius:"24px 24px 0 0", padding:24, width:"100%", maxWidth:480, margin:"0 auto", maxHeight:"90vh", overflowY:"auto" }}>
            <div style={{ width:40, height:4, background:"#E8E0D5", borderRadius:2, margin:"0 auto 20px" }}></div>
            <div style={{ display:"flex", gap:12, alignItems:"flex-start", marginBottom:16 }}>
              <div style={{ width:52, height:52, borderRadius:12, background:bg, color:tc, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, flexShrink:0 }}>
                {SPHERE_EMOJI[selectedJob.sphere]}
              </div>
              <div>
                <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:18, marginBottom:4 }}>{selectedJob.title}</div>
                <div style={{ fontSize:14, color:"#7A7065" }}>{selectedJob.company}</div>
              </div>
            </div>
            <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:22, color:"#E8541A", marginBottom:16 }}>{selectedJob.salary}</div>
            {[["📍 Район",selectedJob.area],["⏰ Занятость",selectedJob.type],["👤 Опыт",selectedJob.experience],["💼 Сфера",SPHERE_LABELS[selectedJob.sphere]]].map(([label,val]) => (
              <div key={label} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 0", borderBottom:"1px solid #F4F1ED", fontSize:14 }}>
                <span style={{ color:"#7A7065", width:120, flexShrink:0, fontSize:13 }}>{label}</span>
                <span>{val}</span>
              </div>
            ))}
            {selectedJob.description && (
              <div style={{ marginTop:16, fontSize:14, color:"#555", lineHeight:1.7 }}>
                <strong style={{ color:"#1A1208", display:"block", marginBottom:8 }}>Описание</strong>
                {selectedJob.description}
              </div>
            )}
            {/* Fraud badge in modal */}
            <div style={{ marginTop:12 }}>
              <FraudBadge job={selectedJob} />
            </div>
            <button onClick={() => openApply(selectedJob)}
              style={{ width:"100%", padding:16, background:applied.includes(selectedJob.id)?"#3B6D11":"#E8541A", border:"none", borderRadius:14, color:"#fff", fontFamily:"'Unbounded',sans-serif", fontSize:14, cursor:"pointer", marginTop:20 }}>
              {applied.includes(selectedJob.id) ? "✓ Отклик отправлен" : "Откликнуться"}
            </button>
            {!user && (
              <div style={{ textAlign:"center", fontSize:12, color:"#7A7065", marginTop:8 }}>
                Нужен Telegram для отклика
              </div>
            )}
          </div>
        </div>
      )}

      {/* APPLY MODAL */}
      {applyModal && (
        <div onClick={e => e.target===e.currentTarget && setApplyModal(null)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:300, display:"flex", alignItems:"flex-end" }}>
          <div style={{ background:"#fff", borderRadius:"24px 24px 0 0", padding:24, width:"100%", maxWidth:480, margin:"0 auto" }}>
            <div style={{ width:40, height:4, background:"#E8E0D5", borderRadius:2, margin:"0 auto 20px" }}></div>
            <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:16, marginBottom:4 }}>Отклик</div>
            <div style={{ fontSize:13, color:"#7A7065", marginBottom:20 }}>{applyModal.title} — {applyModal.company}</div>
            {[["Ваше имя *","name","text","Иван Иванов"],["Телефон *","phone","tel","+77001234567"]].map(([label,field,type,ph]) => (
              <div key={field} style={{ marginBottom:14 }}>
                <label style={{ fontSize:13, fontWeight:500, color:"#1A1208", marginBottom:6, display:"block" }}>{label}</label>
                <input type={type} value={applyForm[field]} onChange={e => setApplyForm(f => ({...f,[field]:e.target.value}))} placeholder={ph}
                  style={{ width:"100%", padding:"12px 14px", border:"1.5px solid #E8E0D5", borderRadius:10, fontSize:14, outline:"none", boxSizing:"border-box" }} />
              </div>
            ))}
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:13, fontWeight:500, color:"#1A1208", marginBottom:6, display:"block" }}>Сообщение (необязательно)</label>
              <textarea value={applyForm.message} onChange={e => setApplyForm(f => ({...f,message:e.target.value}))} placeholder="Расскажите о себе..."
                style={{ width:"100%", padding:"12px 14px", border:"1.5px solid #E8E0D5", borderRadius:10, fontSize:14, outline:"none", minHeight:80, resize:"none", fontFamily:"inherit", boxSizing:"border-box" }} />
            </div>
            <button onClick={submitApply}
              style={{ width:"100%", padding:16, background:"#E8541A", border:"none", borderRadius:14, color:"#fff", fontFamily:"'Unbounded',sans-serif", fontSize:14, cursor:"pointer" }}>
              Отправить отклик
            </button>
            <div style={{ textAlign:"center", fontSize:12, color:"#7A7065", marginTop:10 }}>
              📱 Работодатель получит уведомление в Telegram мгновенно
            </div>
          </div>
        </div>
      )}

      {/* LOGIN MODAL — Bot-based, работает на любом домене */}
      {showLogin && (
        <div onClick={e => e.target===e.currentTarget && cancelLogin()}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:400, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 16px" }}>
          <div style={{ background:"#fff", borderRadius:20, padding:28, width:"100%", maxWidth:360, textAlign:"center" }}>
            <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:18, marginBottom:8 }}>Вход</div>

            {loginStep === "start" && (<>
              <p style={{ fontSize:14, color:"#7A7065", marginBottom:24, lineHeight:1.6 }}>
                Войдите через Telegram-бот.<br/>
                Работает на любом устройстве без настройки домена.
              </p>
              <button onClick={startBotLogin}
                style={{ width:"100%", padding:"14px 16px", background:"#229ED9", border:"none", borderRadius:14, color:"#fff", fontFamily:"'Unbounded',sans-serif", fontSize:14, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:12 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 13.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.828.942z"/></svg>
                Войти через Telegram
              </button>
              <button onClick={() => setShowLogin(false)} style={{ background:"none", border:"none", color:"#7A7065", fontSize:13, cursor:"pointer" }}>Отмена</button>
            </>)}

            {loginStep === "waiting" && (<>
              <div style={{ fontSize:48, marginBottom:16 }}>📱</div>
              <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:15, marginBottom:12, color:"#1A1208" }}>
                Подтвердите в боте
              </div>
              <div style={{ background:"#F4F1ED", borderRadius:12, padding:16, marginBottom:20 }}>
                <div style={{ fontSize:12, color:"#7A7065", marginBottom:8 }}>Ваш код входа:</div>
                <div style={{ fontFamily:"monospace", fontSize:28, fontWeight:700, color:"#E8541A", letterSpacing:6 }}>
                  {loginCode}
                </div>
              </div>
              <div style={{ fontSize:13, color:"#555", lineHeight:1.7, marginBottom:20 }}>
                1. Бот откроется автоматически<br/>
                2. Нажмите <b>«Подтвердить вход»</b><br/>
                3. Страница обновится автоматически
              </div>
              <button onClick={() => window.open(`https://t.me/${BOT_NAME}?start=login_${loginCode}`, "_blank")}
                style={{ width:"100%", padding:"12px 16px", background:"#229ED9", border:"none", borderRadius:12, color:"#fff", fontSize:14, cursor:"pointer", marginBottom:10 }}>
                Открыть @{BOT_NAME}
              </button>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, fontSize:12, color:"#7A7065", marginBottom:16 }}>
                <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", background:"#22C55E", animation:"pulse 1.5s ease-in-out infinite" }}></span>
                Ожидаю подтверждения...
              </div>
              <button onClick={cancelLogin} style={{ background:"none", border:"none", color:"#7A7065", fontSize:13, cursor:"pointer" }}>Отмена</button>
            </>)}
          </div>
        </div>
      )}

      {/* PROFILE MODAL */}
      {showProfile && user && (
        <div onClick={e => e.target===e.currentTarget && setShowProfile(false)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:400, display:"flex", alignItems:"flex-end" }}>
          <div style={{ background:"#fff", borderRadius:"24px 24px 0 0", padding:24, width:"100%", maxWidth:480, margin:"0 auto" }}>
            <div style={{ width:40, height:4, background:"#E8E0D5", borderRadius:2, margin:"0 auto 20px" }}></div>
            <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:24 }}>
              <div style={{ width:60, height:60, borderRadius:"50%", background:"#E8541A", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0 }}>
                {user.photo_url ? <img src={user.photo_url} style={{ width:"100%", height:"100%" }} alt="" /> : <span style={{ fontSize:24, color:"#fff", fontWeight:700 }}>{user.name?.[0]}</span>}
              </div>
              <div>
                <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:16 }}>{user.name}</div>
                {user.username && <div style={{ fontSize:13, color:"#7A7065" }}>@{user.username}</div>}
              </div>
            </div>
            <div style={{ background:"#F4F1ED", borderRadius:12, padding:14, marginBottom:20, fontSize:13, color:"#555", lineHeight:1.8 }}>
              <div>Telegram ID: <b>{user.tg_id}</b></div>
              {user.phone && <div>Телефон: <b>{user.phone}</b></div>}
            </div>
            <button onClick={logout}
              style={{ width:"100%", padding:14, background:"#1A1208", border:"none", borderRadius:12, color:"#fff", fontSize:14, cursor:"pointer" }}>
              Выйти из аккаунта
            </button>
            <button onClick={() => setShowProfile(false)}
              style={{ width:"100%", padding:14, background:"none", border:"none", color:"#7A7065", fontSize:13, cursor:"pointer", marginTop:8 }}>
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", background:"#1A1208", color:"#fff", padding:"12px 20px", borderRadius:12, fontSize:13, fontWeight:500, zIndex:999, whiteSpace:"nowrap", maxWidth:"90vw", textAlign:"center", boxShadow:"0 4px 20px rgba(0,0,0,0.3)" }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
