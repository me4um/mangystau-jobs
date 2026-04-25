import { useState, useEffect, useCallback, useRef } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
const BOT_NAME = import.meta.env.VITE_BOT_NAME || "MangystauJobsBot";

const SPHERE_LABELS = { cafe:"Общепит", trade:"Торговля", build:"Строительство", beauty:"Красота", it:"IT", delivery:"Доставка", other:"Другое" };
const SPHERE_EMOJI  = { cafe:"☕", trade:"🛒", build:"🔨", beauty:"💅", it:"📱", delivery:"🚗", other:"📋" };
const SPHERE_COLORS = { cafe:["#FFF3E8","#E8541A"], trade:["#E8F5E9","#2E7D32"], build:["#FFF8E1","#F57C00"], beauty:["#FCE4EC","#AD1457"], it:["#EDE7F6","#512DA8"], delivery:["#E3F2FD","#1565C0"], other:["#F3F4F6","#374151"] };

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
  const [postForm, setPostForm]   = useState({ title:"", company:"", salary:"", type:"Полная", sphere:"cafe", area:"Центр", experience:"Без опыта", description:"", contact:"" });

  const [user, setUser]               = useState(null);
  const [token, setToken]             = useState(() => localStorage.getItem("mjToken"));
  const [showLogin, setShowLogin]     = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [applyModal, setApplyModal]   = useState(null);
  const [applyForm, setApplyForm]     = useState({ name:"", phone:"", message:"" });
  const tgWidgetRef = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => {
        if (d.success) setUser(d.user);
        else { setToken(null); localStorage.removeItem("mjToken"); }
      }).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!showLogin || !tgWidgetRef.current) return;
    tgWidgetRef.current.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", BOT_NAME);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "12");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    script.async = true;
    tgWidgetRef.current.appendChild(script);
    window.onTelegramAuth = async (tgUser) => {
      try {
        const res = await fetch(`${API}/api/auth/telegram`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tgUser)
        });
        const data = await res.json();
        if (data.success) {
          setToken(data.token);
          localStorage.setItem("mjToken", data.token);
          setUser(data.user);
          setShowLogin(false);
          showToast("Вы вошли как " + data.user.name);
        } else { showToast("Ошибка входа"); }
      } catch { showToast("Ошибка соединения"); }
    };
    return () => { delete window.onTelegramAuth; };
  }, [showLogin]);

  const logout = async () => {
    await fetch(`${API}/api/auth/logout`, { method:"DELETE", headers:{ Authorization:`Bearer ${token}` } }).catch(()=>{});
    setToken(null); setUser(null); localStorage.removeItem("mjToken");
    setShowProfile(false); showToast("Вы вышли из аккаунта");
  };

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
        showToast("✅ Отклик отправлен! Работодатель получит уведомление в Telegram");
      } else { showToast(data.error || "Ошибка"); }
    } catch { showToast("Ошибка соединения"); }
  };

  const handleAIMatch = async () => {
    if (!aiQuery.trim()) return showToast("Опишите свои навыки");
    setAiLoading(true); setAiResult(null);
    try {
      const res = await fetch(`${API}/api/ai/match`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ skills: aiQuery }) });
      setAiResult(await res.json());
    } catch { showToast("Ошибка AI матчинга"); }
    setAiLoading(false);
  };

  const handlePostJob = async () => {
    if (!postForm.title || !postForm.company) return showToast("Заполните название и компанию");
    if (!user) { setShowLogin(true); return; }
    try {
      const res = await fetch(`${API}/api/jobs`, {
        method:"POST", headers:{"Content-Type":"application/json"},
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

      {/* SEEKER */}
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
            <div style={{ display:"flex", gap:8, marginBottom:16 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key==="Enter" && loadJobs()}
                placeholder="Профессия, навык, район..."
                style={{ flex:1, padding:"12px 16px", borderRadius:12, border:"1.5px solid #E8E0D5", fontSize:14, background:"#fff", outline:"none" }} />
              <button onClick={loadJobs} style={{ padding:"12px 18px", background:"#E8541A", border:"none", borderRadius:12, color:"#fff", fontSize:13, cursor:"pointer" }}>Найти</button>
            </div>

            <div style={{ display:"flex", gap:8, marginBottom:20, overflowX:"auto", paddingBottom:4 }}>
              {[["all","Все"],["cafe","Общепит"],["trade","Торговля"],["build","Стройка"],["beauty","Красота"],["it","IT"],["delivery","Доставка"]].map(([val,label]) => (
                <button key={val} onClick={() => setSphereFilter(val)}
                  style={{ padding:"7px 14px", borderRadius:20, border:`1.5px solid ${sphereFilter===val?"#E8541A":"#E8E0D5"}`, background:sphereFilter===val?"#E8541A":"#fff", fontSize:12, fontWeight:500, color:sphereFilter===val?"#fff":"#7A7065", cursor:"pointer", whiteSpace:"nowrap" }}>
                  {label}
                </button>
              ))}
            </div>

            {/* AI */}
            <div style={{ background:"#1A1208", borderRadius:16, padding:18, marginBottom:24 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, fontFamily:"'Unbounded',sans-serif", fontSize:13, color:"#fff", marginBottom:4 }}>
                <span style={{ width:8, height:8, borderRadius:"50%", background:"#E8541A", display:"inline-block" }}></span> AI-матчинг
              </div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.55)", marginBottom:14 }}>Опишите навыки — AI подберёт лучшие вакансии</div>
              <div style={{ display:"flex", gap:8 }}>
                <input value={aiQuery} onChange={e => setAiQuery(e.target.value)} onKeyDown={e => e.key==="Enter" && handleAIMatch()}
                  placeholder="Умею готовить, 2 года опыта..."
                  style={{ flex:1, padding:"10px 14px", borderRadius:10, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.08)", fontSize:13, color:"#fff", outline:"none" }} />
                <button onClick={handleAIMatch} disabled={aiLoading}
                  style={{ padding:"10px 16px", background:"#E8541A", border:"none", borderRadius:10, color:"#fff", fontSize:13, cursor:"pointer", opacity:aiLoading?0.7:1 }}>
                  {aiLoading?"...":"↗"}
                </button>
              </div>
              {aiResult && (
                <div style={{ marginTop:14, padding:12, background:"rgba(255,255,255,0.06)", borderRadius:10, border:"1px solid rgba(232,84,26,0.25)" }}>
                  {aiResult.matches?.map((m,i) => (
                    <div key={i} style={{ marginBottom:12, paddingBottom:12, borderBottom:i<aiResult.matches.length-1?"1px solid rgba(255,255,255,0.1)":"none" }}>
                      <div style={{ fontSize:13, fontWeight:500, color:"#fff", marginBottom:4 }}>{m.job?.title} — {m.job?.company}</div>
                      <div style={{ fontSize:12, color:"#E8541A", marginBottom:4 }}>✅ {m.match_percent}% совпадение</div>
                      <div style={{ fontSize:12, color:"rgba(255,255,255,0.6)" }}>{m.reason}</div>
                      <button onClick={() => setSelectedJob(m.job)}
                        style={{ marginTop:8, padding:"6px 14px", background:"#E8541A", border:"none", borderRadius:8, color:"#fff", fontSize:12, cursor:"pointer" }}>
                        Открыть вакансию
                      </button>
                    </div>
                  ))}
                  {aiResult.recommendation && <div style={{ fontSize:12, color:"rgba(255,255,255,0.7)", fontStyle:"italic" }}>💬 {aiResult.recommendation}</div>}
                </div>
              )}
            </div>

            <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:14, marginBottom:12 }}>Вакансии</div>
            {jobs.length === 0 ? (
              <div style={{ textAlign:"center", padding:32, color:"#7A7065", fontSize:14 }}>Вакансий не найдено</div>
            ) : jobs.map(job => {
              const [jbg, jtc] = SPHERE_COLORS[job.sphere] || ["#F3F4F6","#374151"];
              return (
                <div key={job.id} onClick={() => setSelectedJob(job)}
                  style={{ background:"#fff", borderRadius:16, padding:16, border:"1.5px solid #F0E8E0", cursor:"pointer", marginBottom:10 }}>
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
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* EMPLOYER */}
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
              <button onClick={handlePostJob}
                style={{ width:"100%", padding:16, background:"#E8541A", border:"none", borderRadius:14, color:"#fff", fontFamily:"'Unbounded',sans-serif", fontSize:14, cursor:"pointer" }}>
                {user ? "Разместить вакансию" : "Войти и разместить"}
              </button>
              {user && <div style={{ textAlign:"center", fontSize:12, color:"#7A7065", marginTop:10 }}>Отклики придут в Telegram мгновенно</div>}
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
            <button onClick={() => openApply(selectedJob)}
              style={{ width:"100%", padding:16, background:applied.includes(selectedJob.id)?"#3B6D11":"#E8541A", border:"none", borderRadius:14, color:"#fff", fontFamily:"'Unbounded',sans-serif", fontSize:14, cursor:"pointer", marginTop:20 }}>
              {applied.includes(selectedJob.id) ? "✓ Отклик отправлен" : "Откликнуться"}
            </button>
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
            <div style={{ textAlign:"center", fontSize:12, color:"#7A7065", marginTop:10 }}>Работодатель получит уведомление в Telegram мгновенно</div>
          </div>
        </div>
      )}

      {/* LOGIN MODAL */}
      {showLogin && (
        <div onClick={e => e.target===e.currentTarget && setShowLogin(false)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:400, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#fff", borderRadius:20, padding:32, width:"90%", maxWidth:360, textAlign:"center" }}>
            <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:18, marginBottom:8 }}>Вход</div>
            <p style={{ fontSize:14, color:"#7A7065", marginBottom:24, lineHeight:1.6 }}>
              Войдите через Telegram — быстро и безопасно.<br/>Отклики придут вам в бот.
            </p>
            <div ref={tgWidgetRef} style={{ display:"flex", justifyContent:"center", marginBottom:16 }}></div>
            <button onClick={() => setShowLogin(false)} style={{ background:"none", border:"none", color:"#7A7065", fontSize:13, cursor:"pointer" }}>Отмена</button>
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
        <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", background:"#1A1208", color:"#fff", padding:"12px 20px", borderRadius:12, fontSize:13, fontWeight:500, zIndex:999, whiteSpace:"nowrap", maxWidth:"90vw", textAlign:"center" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
