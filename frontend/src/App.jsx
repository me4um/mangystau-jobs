import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

const SPHERE_LABELS = { cafe: "Общепит", trade: "Торговля", build: "Строительство", beauty: "Красота", it: "IT", delivery: "Доставка", other: "Другое" };
const SPHERE_EMOJI = { cafe: "☕", trade: "🛒", build: "🔨", beauty: "💅", it: "📱", delivery: "🚗", other: "📋" };
const SPHERE_COLORS = { cafe: ["#FFF3E8","#E8541A"], trade: ["#E8F5E9","#2E7D32"], build: ["#FFF8E1","#F57C00"], beauty: ["#FCE4EC","#AD1457"], it: ["#EDE7F6","#512DA8"], delivery: ["#E3F2FD","#1565C0"], other: ["#F3F4F6","#374151"] };

export default function App() {
  const [tab, setTab] = useState("seeker");
  const [page, setPage] = useState("home");
  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState({ jobs: 0, employers: 0, applications: 0 });
  const [search, setSearch] = useState("");
  const [sphereFilter, setSphereFilter] = useState("all");
  const [selectedJob, setSelectedJob] = useState(null);
  const [applied, setApplied] = useState([]);
  const [aiQuery, setAiQuery] = useState("");
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [postForm, setPostForm] = useState({ title: "", company: "", salary: "", type: "Полная", sphere: "cafe", area: "Центр", experience: "Без опыта", description: "", contact: "" });
  const [loading, setLoading] = useState(true);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const loadJobs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (sphereFilter !== "all") params.set("sphere", sphereFilter);
      if (search) params.set("q", search);
      const res = await fetch(`${API}/api/jobs?${params}`);
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch { }
  }, [sphereFilter, search]);

  const loadStats = async () => {
    try {
      const res = await fetch(`${API}/api/stats`);
      const data = await res.json();
      setStats(data);
    } catch { }
    setLoading(false);
  };

  useEffect(() => { loadStats(); }, []);
  useEffect(() => { loadJobs(); }, [loadJobs]);

  const handleApply = async (jobId) => {
    if (applied.includes(jobId)) return showToast("Вы уже откликались на эту вакансию");
    try {
      const res = await fetch(`${API}/api/jobs/${jobId}/apply`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_tg_id: "web_user_" + Date.now(), user_name: "Соискатель", user_phone: "Не указан", message: "" })
      });
      const data = await res.json();
      if (data.success) {
        setApplied(a => [...a, jobId]);
        showToast("✅ Отклик отправлен! Работодатель получит уведомление в Telegram");
        setSelectedJob(null);
        loadJobs();
      } else { showToast(data.error || "Ошибка"); }
    } catch { showToast("Ошибка соединения"); }
  };

  const handleAIMatch = async () => {
    if (!aiQuery.trim()) return showToast("Опишите свои навыки");
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await fetch(`${API}/api/ai/match`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills: aiQuery })
      });
      const data = await res.json();
      setAiResult(data);
    } catch { showToast("Ошибка AI матчинга"); }
    setAiLoading(false);
  };

  const handlePostJob = async () => {
    if (!postForm.title || !postForm.company) return showToast("Заполните название и компанию");
    try {
      const res = await fetch(`${API}/api/jobs`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...postForm, employer_tg_id: null })
      });
      const data = await res.json();
      if (data.success) {
        showToast("✅ Вакансия опубликована!");
        setPostForm({ title: "", company: "", salary: "", type: "Полная", sphere: "cafe", area: "Центр", experience: "Без опыта", description: "", contact: "" });
        loadStats();
        setTab("seeker");
        setPage("home");
        loadJobs();
      }
    } catch { showToast("Ошибка публикации"); }
  };

  const [bg, tc] = SPHERE_COLORS[selectedJob?.sphere] || ["#F3F4F6", "#374151"];

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#FAF6EF", minHeight: "100vh", maxWidth: 480, margin: "0 auto", position: "relative" }}>
      {/* TOPBAR */}
      <div style={{ background: "#1A1208", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, color: "#fff", letterSpacing: -0.5 }}>
          Mangy<span style={{ color: "#E8541A" }}>Jobs</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["seeker", "employer"].map((t, i) => (
            <button key={t} onClick={() => { setTab(t); setPage(i === 1 ? "post" : "home"); }}
              style={{ padding: "7px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, background: tab === t ? "#E8541A" : "transparent", color: tab === t ? "#fff" : "rgba(255,255,255,0.5)", transition: "all .2s" }}>
              {i === 0 ? "Ищу работу" : "Работодатель"}
            </button>
          ))}
        </div>
      </div>

      {/* SEEKER VIEW */}
      {tab === "seeker" && (
        <>
          {/* HERO */}
          <div style={{ background: "#1A1208", padding: "24px 16px 36px", color: "#fff", position: "relative", overflow: "hidden" }}>
            <div style={{ fontSize: 11, color: "#E8541A", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>Мангистауская область</div>
            <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 26, lineHeight: 1.2, margin: "0 0 8px" }}>Работа рядом<br />с тобой</h1>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, maxWidth: 320, margin: 0 }}>Вакансии малого бизнеса Актау — без hh.ru и WhatsApp-чатов</p>
            <div style={{ display: "flex", gap: 24, marginTop: 20 }}>
              {[
                [loading ? "..." : stats.jobs, "вакансий"],
                [loading ? "..." : stats.employers || 23, "работодателей"],
                [loading ? "..." : stats.applications, "откликов"]
              ].map(([n, l]) => (
                <div key={l} style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 20, color: "#E8541A" }}>{n}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* MAIN */}
          <div style={{ padding: "16px 16px 90px" }}>
            {/* Search */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && loadJobs()}
                placeholder="Профессия, навык, район..."
                style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: "1.5px solid #E8E0D5", fontSize: 14, background: "#fff", color: "#1A1208", outline: "none" }} />
              <button onClick={loadJobs} style={{ padding: "12px 18px", background: "#E8541A", border: "none", borderRadius: 12, color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Найти</button>
            </div>

            {/* Sphere filters */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
              {[["all", "Все"], ["cafe", "Общепит"], ["trade", "Торговля"], ["build", "Стройка"], ["beauty", "Красота"], ["it", "IT"], ["delivery", "Доставка"]].map(([val, label]) => (
                <button key={val} onClick={() => setSphereFilter(val)}
                  style={{ padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${sphereFilter === val ? "#E8541A" : "#E8E0D5"}`, background: sphereFilter === val ? "#E8541A" : "#fff", fontSize: 12, fontWeight: 500, color: sphereFilter === val ? "#fff" : "#7A7065", cursor: "pointer", whiteSpace: "nowrap" }}>
                  {label}
                </button>
              ))}
            </div>

            {/* AI Section */}
            <div style={{ background: "#1A1208", borderRadius: 16, padding: 18, marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'Unbounded', sans-serif", fontSize: 13, color: "#fff", marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#E8541A", display: "inline-block" }}></span> AI-матчинг
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 14, lineHeight: 1.5 }}>Опишите навыки — AI подберёт лучшие вакансии</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={aiQuery} onChange={e => setAiQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAIMatch()}
                  placeholder="Умею готовить, 2 года опыта..."
                  style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", fontSize: 13, color: "#fff", outline: "none" }} />
                <button onClick={handleAIMatch} disabled={aiLoading}
                  style={{ padding: "10px 16px", background: "#E8541A", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: aiLoading ? 0.7 : 1 }}>
                  {aiLoading ? "..." : "↗"}
                </button>
              </div>
              {aiResult && (
                <div style={{ marginTop: 14, padding: 12, background: "rgba(255,255,255,0.06)", borderRadius: 10, border: "1px solid rgba(232,84,26,0.25)" }}>
                  {aiResult.matches?.map((m, i) => (
                    <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < aiResult.matches.length - 1 ? "1px solid rgba(255,255,255,0.1)" : "none" }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#fff", marginBottom: 4 }}>
                        {m.job?.title} — {m.job?.company}
                      </div>
                      <div style={{ fontSize: 12, color: "#E8541A", marginBottom: 4 }}>✅ {m.match_percent}% совпадение</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{m.reason}</div>
                      <button onClick={() => setSelectedJob(m.job)}
                        style={{ marginTop: 8, padding: "6px 14px", background: "#E8541A", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, cursor: "pointer" }}>
                        Открыть вакансию
                      </button>
                    </div>
                  ))}
                  {aiResult.recommendation && (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontStyle: "italic" }}>💬 {aiResult.recommendation}</div>
                  )}
                </div>
              )}
            </div>

            {/* Jobs list */}
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 14, marginBottom: 12 }}>Вакансии</div>
            {jobs.length === 0 ? (
              <div style={{ textAlign: "center", padding: 32, color: "#7A7065", fontSize: 14 }}>Вакансий не найдено</div>
            ) : (
              jobs.map(job => {
                const [bg, tc] = SPHERE_COLORS[job.sphere] || ["#F3F4F6", "#374151"];
                const isApplied = applied.includes(job.id);
                return (
                  <div key={job.id} onClick={() => setSelectedJob(job)}
                    style={{ background: "#fff", borderRadius: 16, padding: 16, border: "1.5px solid #F0E8E0", cursor: "pointer", marginBottom: 10, transition: "all .2s" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 10, background: bg, color: tc, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                        {SPHERE_EMOJI[job.sphere] || "💼"}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 15, color: "#1A1208", marginBottom: 3 }}>{job.title}</div>
                        <div style={{ fontSize: 13, color: "#7A7065" }}>{job.company} • {job.area}</div>
                      </div>
                      <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 13, color: "#E8541A", fontWeight: 600, whiteSpace: "nowrap" }}>{job.salary}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[job.type, job.experience, job.area].map(t => (
                        <span key={t} style={{ padding: "4px 10px", borderRadius: 20, background: "#F4F1ED", fontSize: 11, fontWeight: 500, color: "#7A7065" }}>{t}</span>
                      ))}
                      {isApplied && <span style={{ padding: "4px 10px", borderRadius: 20, background: "#EAF3DE", fontSize: 11, fontWeight: 500, color: "#3B6D11" }}>✓ Отклик отправлен</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* EMPLOYER VIEW */}
      {tab === "employer" && (
        <>
          <div style={{ background: "#1A1208", padding: "24px 16px 36px", color: "#fff" }}>
            <div style={{ fontSize: 11, color: "#E8541A", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>Для работодателей</div>
            <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 24, lineHeight: 1.2, margin: "0 0 8px" }}>Найдите<br />сотрудника<br />за 24 часа</h1>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, margin: 0 }}>Разместите вакансию — AI подберёт подходящих кандидатов</p>
          </div>
          <div style={{ padding: "20px 16px 90px" }}>
            <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: "1.5px solid #F0E8E0" }}>
              {[
                ["Название вакансии *", "title", "text", "Бариста, кассир, мастер..."],
                ["Компания / Заведение", "company", "text", "Название кафе, магазина..."],
                ["Зарплата (тг/мес)", "salary", "text", "150000 или 'от 120000'"],
              ].map(([label, field, type, ph]) => (
                <div key={field} style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#1A1208", marginBottom: 6, display: "block" }}>{label}</label>
                  <input type={type} value={postForm[field]} onChange={e => setPostForm(f => ({ ...f, [field]: e.target.value }))}
                    placeholder={ph}
                    style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #E8E0D5", borderRadius: 10, fontSize: 14, color: "#1A1208", background: "#fff", outline: "none", boxSizing: "border-box" }} />
                </div>
              ))}
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#1A1208", marginBottom: 6, display: "block" }}>Тип занятости</label>
                  <select value={postForm.type} onChange={e => setPostForm(f => ({ ...f, type: e.target.value }))}
                    style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #E8E0D5", borderRadius: 10, fontSize: 14, background: "#fff", outline: "none" }}>
                    {["Полная", "Частичная", "Подработка"].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#1A1208", marginBottom: 6, display: "block" }}>Сфера</label>
                  <select value={postForm.sphere} onChange={e => setPostForm(f => ({ ...f, sphere: e.target.value }))}
                    style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #E8E0D5", borderRadius: 10, fontSize: 14, background: "#fff", outline: "none" }}>
                    {Object.entries(SPHERE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#1A1208", marginBottom: 6, display: "block" }}>Район Актау</label>
                  <select value={postForm.area} onChange={e => setPostForm(f => ({ ...f, area: e.target.value }))}
                    style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #E8E0D5", borderRadius: 10, fontSize: 14, background: "#fff", outline: "none" }}>
                    {["Центр", "5-й мкр", "7-й мкр", "9-й мкр", "11-й мкр", "15-й мкр", "17-й мкр", "Новый город", "Весь город", "Удалённо"].map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#1A1208", marginBottom: 6, display: "block" }}>Опыт</label>
                  <select value={postForm.experience} onChange={e => setPostForm(f => ({ ...f, experience: e.target.value }))}
                    style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #E8E0D5", borderRadius: 10, fontSize: 14, background: "#fff", outline: "none" }}>
                    {["Без опыта", "1+ лет", "2+ лет", "3+ лет"].map(e => <option key={e}>{e}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#1A1208", marginBottom: 6, display: "block" }}>Описание и требования</label>
                <textarea value={postForm.description} onChange={e => setPostForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Опыт, обязанности, условия работы, график..."
                  style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #E8E0D5", borderRadius: 10, fontSize: 14, color: "#1A1208", background: "#fff", outline: "none", minHeight: 100, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#1A1208", marginBottom: 6, display: "block" }}>Telegram / WhatsApp для связи</label>
                <input value={postForm.contact} onChange={e => setPostForm(f => ({ ...f, contact: e.target.value }))}
                  placeholder="@username или +77001234567"
                  style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #E8E0D5", borderRadius: 10, fontSize: 14, color: "#1A1208", background: "#fff", outline: "none", boxSizing: "border-box" }} />
              </div>
              <button onClick={handlePostJob}
                style={{ width: "100%", padding: 16, background: "#E8541A", border: "none", borderRadius: 14, color: "#fff", fontFamily: "'Unbounded', sans-serif", fontSize: 14, cursor: "pointer" }}>
                Разместить вакансию
              </button>
            </div>
          </div>
        </>
      )}

      {/* JOB MODAL */}
      {selectedJob && (
        <div onClick={e => e.target === e.currentTarget && setSelectedJob(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: 24, width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ width: 40, height: 4, background: "#E8E0D5", borderRadius: 2, margin: "0 auto 20px" }}></div>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: 12, background: bg, color: tc, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>
                {SPHERE_EMOJI[selectedJob.sphere]}
              </div>
              <div>
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, marginBottom: 4 }}>{selectedJob.title}</div>
                <div style={{ fontSize: 14, color: "#7A7065" }}>{selectedJob.company}</div>
              </div>
            </div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, color: "#E8541A", marginBottom: 16 }}>{selectedJob.salary} тг</div>
            {[["📍 Район", selectedJob.area], ["⏰ Занятость", selectedJob.type], ["👤 Опыт", selectedJob.experience], ["💼 Сфера", SPHERE_LABELS[selectedJob.sphere]]].map(([label, val]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "1px solid #F4F1ED", fontSize: 14 }}>
                <span style={{ color: "#7A7065", width: 120, flexShrink: 0, fontSize: 13 }}>{label}</span>
                <span>{val}</span>
              </div>
            ))}
            {selectedJob.description && (
              <div style={{ marginTop: 16, fontSize: 14, color: "#555", lineHeight: 1.7 }}>
                <strong style={{ color: "#1A1208", display: "block", marginBottom: 8 }}>Описание</strong>
                {selectedJob.description}
              </div>
            )}
            <button onClick={() => handleApply(selectedJob.id)}
              style={{ width: "100%", padding: 16, background: applied.includes(selectedJob.id) ? "#3B6D11" : "#E8541A", border: "none", borderRadius: 14, color: "#fff", fontFamily: "'Unbounded', sans-serif", fontSize: 14, cursor: "pointer", marginTop: 20 }}>
              {applied.includes(selectedJob.id) ? "✓ Отклик отправлен" : "Откликнуться"}
            </button>
            <div style={{ textAlign: "center", fontSize: 12, color: "#7A7065", marginTop: 10 }}>
              Уведомление придёт в <a href="https://t.me/MangystauJobsBot" style={{ color: "#E8541A" }}>@MangystauJobsBot</a>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "#1A1208", color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 13, fontWeight: 500, zIndex: 999, whiteSpace: "nowrap", maxWidth: "90vw", textAlign: "center" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
