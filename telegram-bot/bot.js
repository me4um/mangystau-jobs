const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const BOT_TOKEN = '8489505819:AAGPIl_Gxy7Q_EyRfS82Zr_SpkxssUPAf5E';
const API_URL = process.env.API_URL || 'http://localhost:3001';
const WEB_URL = process.env.WEB_URL || 'https://mangystau-jobs.vercel.app';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const userState = {};
function setState(chatId, state) { userState[chatId] = { ...userState[chatId], ...state }; }
function getState(chatId) { return userState[chatId] || {}; }
function clearState(chatId) { userState[chatId] = {}; }

const mainKeyboard = {
  reply_markup: {
    keyboard: [
      ['Найти работу', 'Мои отклики'],
      ['Разместить вакансию', 'AI подбор'],
      ['Поддержка', 'Открыть сайт']
    ],
    resize_keyboard: true,
    persistent: true
  }
};

const cancelKeyboard = {
  reply_markup: {
    keyboard: [['Отмена']],
    resize_keyboard: true
  }
};

const sphereKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: 'Общепит', callback_data: 'sphere_cafe' }, { text: 'Торговля', callback_data: 'sphere_trade' }],
      [{ text: 'Строительство', callback_data: 'sphere_build' }, { text: 'Красота', callback_data: 'sphere_beauty' }],
      [{ text: 'IT', callback_data: 'sphere_it' }, { text: 'Доставка', callback_data: 'sphere_delivery' }],
      [{ text: 'Другое', callback_data: 'sphere_other' }]
    ]
  }
};

const typeKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: 'Полная занятость', callback_data: 'type_full' }],
      [{ text: 'Частичная занятость', callback_data: 'type_part' }],
      [{ text: 'Подработка', callback_data: 'type_gig' }]
    ]
  }
};

const areaKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '5-й мкр', callback_data: 'area_5' }, { text: '7-й мкр', callback_data: 'area_7' }],
      [{ text: '9-й мкр', callback_data: 'area_9' }, { text: '11-й мкр', callback_data: 'area_11' }],
      [{ text: '15-й мкр', callback_data: 'area_15' }, { text: '17-й мкр', callback_data: 'area_17' }],
      [{ text: 'Центр', callback_data: 'area_center' }, { text: 'Новый город', callback_data: 'area_new' }],
      [{ text: 'Весь город', callback_data: 'area_all' }, { text: 'Удалённо', callback_data: 'area_remote' }]
    ]
  }
};

function formatJob(job, index = null) {
  const prefix = index !== null ? `${index + 1}. ` : '';
  return `${prefix}*${job.title}*\n${job.company}\n${job.salary}\n${job.area} | ${job.type}\nОпыт: ${job.experience}${job.description ? `\n\n${job.description.substring(0, 150)}${job.description.length > 150 ? '...' : ''}` : ''}`;
}

// /start — обычный или с кодом входа
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const param = match?.[1] || '';

  // Обработка входа с кодом: /start login_ABCDEF
  if (param.startsWith('login_')) {
    const code = param.replace('login_', '').toUpperCase();
    const name = [msg.from.first_name || '', msg.from.last_name || ''].filter(Boolean).join(' ');

    try {
      const { data } = await axios.post(`${API_URL}/api/auth/confirm-login`, {
        code,
        tg_id: String(chatId),
        name,
        username: msg.from.username || null,
        photo_url: null,
      });

      if (data.success) {
        await bot.sendMessage(chatId,
          `✅ *Вход подтверждён!*\n\nДобро пожаловать, ${msg.from.first_name}!\n\nВозвращайтесь на сайт — вы уже вошли.`,
          { parse_mode: 'Markdown', ...mainKeyboard }
        );
      } else {
        await bot.sendMessage(chatId, '❌ Код недействителен или истёк. Попробуйте войти снова.', mainKeyboard);
      }
    } catch (e) {
      await bot.sendMessage(chatId, '❌ Ошибка подтверждения. Попробуйте ещё раз.', mainKeyboard);
    }
    return;
  }


  // Обычный /start
  try {
    await axios.post(`${API_URL}/api/users`, {
      tg_id: String(chatId),
      name: `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim(),
      role: 'seeker'
    });
  } catch (e) {}

  let statsText = '';
  try {
    const { data } = await axios.get(`${API_URL}/api/stats`);
    statsText = `\n\nСейчас на платформе:\n- ${data.jobs} активных вакансий\n- ${data.employers} работодателей\n- ${data.applications} откликов`;
  } catch (e) {}

  await bot.sendMessage(chatId,
    `Привет, ${msg.from.first_name}!\n\nMangystauJobs — платформа занятости для молодёжи и малого бизнеса Мангистауской области.${statsText}\n\nAI подбирает вакансии по вашим навыкам.\nРаботодатели публикуют вакансии прямо здесь.`,
    { parse_mode: 'Markdown', ...mainKeyboard }
  );
});

bot.onText(/Найти работу/, (msg) => {
  setState(msg.chat.id, { action: 'browse' });
  bot.sendMessage(msg.chat.id, 'Выберите сферу:', sphereKeyboard);
});

bot.onText(/AI подбор/, (msg) => {
  setState(msg.chat.id, { action: 'ai_match' });
  bot.sendMessage(msg.chat.id,
    'AI-подбор вакансий\n\nОпишите свои навыки, опыт и пожелания — AI подберёт лучшие варианты.\n\nПример: "Умею готовить, работал поваром 1 год, ищу полную занятость в центре Актау"',
    { parse_mode: 'Markdown', ...cancelKeyboard }
  );
});

bot.onText(/Разместить вакансию/, (msg) => {
  setState(msg.chat.id, { action: 'post_job', step: 'title', job: {} });
  bot.sendMessage(msg.chat.id, 'Публикация вакансии\n\nШаг 1/7: Введите название вакансии\n\nПример: Бариста, Продавец, Разнорабочий', { parse_mode: 'Markdown', ...cancelKeyboard });
});

bot.onText(/Мои отклики/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const { data } = await axios.get(`${API_URL}/api/employer/${chatId}/applications`);
    if (!data.applications.length) return bot.sendMessage(chatId, 'У вас пока нет откликов.', mainKeyboard);
    const text = data.applications.slice(0, 10).map((a, i) =>
      `${i + 1}. *${a.job_title}*\n${a.user_name || 'Аноним'} | ${a.status === 'pending' ? 'Ожидает' : 'Просмотрен'}\nТелефон: ${a.user_phone || 'Не указан'}${a.message ? `\n${a.message}` : ''}`
    ).join('\n\n---\n\n');
    bot.sendMessage(chatId, `Отклики на ваши вакансии:\n\n${text}`, { parse_mode: 'Markdown', ...mainKeyboard });
  } catch (e) {
    bot.sendMessage(chatId, 'Не удалось загрузить отклики.', mainKeyboard);
  }
});

bot.onText(/Открыть сайт/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Открыть платформу:', {
    reply_markup: { inline_keyboard: [[{ text: 'Открыть MangystauJobs', url: WEB_URL }]] }
  });
});

bot.onText(/Поддержка/, (msg) => {
  bot.sendMessage(msg.chat.id,
    'Поддержка MangystauJobs\n\nПо вопросам работы платформы:\nTelegram: @mangystau_hub\nEmail: jobs@mangystau.kz\n\nОфис: Mangystau Hub, Актау',
    { parse_mode: 'Markdown', ...mainKeyboard }
  );
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const state = getState(chatId);
  await bot.answerCallbackQuery(query.id);

  if (data.startsWith('sphere_') && state.action === 'browse') {
    const sphere = data.replace('sphere_', '');
    try {
      const { data: res } = await axios.get(`${API_URL}/api/jobs?sphere=${sphere}&limit=5`);
      if (!res.jobs.length) return bot.sendMessage(chatId, 'Вакансий в этой сфере пока нет.', mainKeyboard);
      const text = res.jobs.map((j, i) => formatJob(j, i)).join('\n\n---\n\n');
      bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: res.jobs.map(j => [{ text: `Откликнуться: ${j.title}`, callback_data: `apply_${j.id}` }])
        }
      });
    } catch (e) {
      bot.sendMessage(chatId, 'Ошибка загрузки.', mainKeyboard);
    }
  }

  if (data.startsWith('apply_')) {
    const jobId = data.replace('apply_', '');
    setState(chatId, { action: 'apply', job_id: jobId, step: 'name' });
    bot.sendMessage(chatId, 'Отклик на вакансию\n\nВведите ваше имя и фамилию:', { parse_mode: 'Markdown', ...cancelKeyboard });
  }

  if (data.startsWith('sphere_') && state.action === 'post_job') {
    const sphere = data.replace('sphere_', '');
    setState(chatId, { job: { ...state.job, sphere }, step: 'area' });
    bot.sendMessage(chatId, 'Шаг 5/7: Выберите район:', { ...areaKeyboard });
  }

  if (data.startsWith('type_') && state.action === 'post_job') {
    const typeMap = { type_full: 'Полная', type_part: 'Частичная', type_gig: 'Подработка' };
    setState(chatId, { job: { ...state.job, type: typeMap[data] }, step: 'sphere' });
    bot.sendMessage(chatId, 'Шаг 4/7: Выберите сферу:', sphereKeyboard);
  }

  if (data.startsWith('area_') && state.action === 'post_job') {
    const areaMap = { area_5: '5-й мкр', area_7: '7-й мкр', area_9: '9-й мкр', area_11: '11-й мкр', area_15: '15-й мкр', area_17: '17-й мкр', area_center: 'Центр', area_new: 'Новый город', area_all: 'Весь город', area_remote: 'Удалённо' };
    setState(chatId, { job: { ...state.job, area: areaMap[data] }, step: 'description' });
    bot.sendMessage(chatId, 'Шаг 6/7: Опишите требования и условия (или напишите "пропустить"):', cancelKeyboard);
  }
});

bot.on('message', async (msg) => {
  if (!msg.text) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const state = getState(chatId);

  if (text === 'Отмена') {
    clearState(chatId);
    return bot.sendMessage(chatId, 'Отменено.', mainKeyboard);
  }

  const triggers = ['Найти работу', 'Мои отклики', 'Разместить вакансию', 'AI подбор', 'Поддержка', 'Открыть сайт'];
  if (text.startsWith('/') || triggers.includes(text)) return;

  if (state.action === 'ai_match') {
    clearState(chatId);
    const thinking = await bot.sendMessage(chatId, 'AI анализирует ваши навыки...');
    try {
      const { data } = await axios.post(`${API_URL}/api/ai/match`, { skills: text });
      await bot.deleteMessage(chatId, thinking.message_id);
      if (!data.matches?.length) return bot.sendMessage(chatId, 'Не удалось подобрать вакансии. Попробуйте уточнить запрос.', mainKeyboard);

      const matchText = data.matches.map((m, i) =>
        `${i + 1}. *${m.job.title}* — ${m.job.company}\n${m.job.salary} | ${m.job.area}\nСовпадение: *${m.match_percent}%*\n${m.reason}`
      ).join('\n\n---\n\n');

      bot.sendMessage(chatId,
        `AI подобрал для вас:\n\n${matchText}${data.recommendation ? `\n\nСовет: ${data.recommendation}` : ''}`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              ...data.matches.map(m => [{ text: `Откликнуться: ${m.job.title}`, callback_data: `apply_${m.job_id}` }]),
              [{ text: 'Открыть все вакансии', url: WEB_URL }]
            ]
          }
        }
      );
    } catch (e) {
      await bot.deleteMessage(chatId, thinking.message_id).catch(() => {});
      bot.sendMessage(chatId, 'Ошибка AI. Попробуйте позже.', mainKeyboard);
    }
    return;
  }

  if (state.action === 'apply') {
    if (state.step === 'name') {
      setState(chatId, { step: 'phone', apply_name: text });
      return bot.sendMessage(chatId, 'Введите ваш номер телефона:', cancelKeyboard);
    }
    if (state.step === 'phone') {
      setState(chatId, { step: 'message', apply_phone: text });
      return bot.sendMessage(chatId, 'Напишите сопроводительное сообщение (или "пропустить"):', cancelKeyboard);
    }
    if (state.step === 'message') {
      const message = text === 'пропустить' ? '' : text;
      try {
        const { data } = await axios.post(`${API_URL}/api/jobs/${state.job_id}/apply`, {
          user_tg_id: String(chatId),
          user_name: state.apply_name,
          user_phone: state.apply_phone,
          message
        });
        clearState(chatId);
        bot.sendMessage(chatId, `Отклик отправлен!\n\nВакансия: *${data.job_title}*\n\nРаботодатель получил уведомление и скоро свяжется с вами.`, { parse_mode: 'Markdown', ...mainKeyboard });

        if (data.employer_tg_id) {
          bot.sendMessage(data.employer_tg_id,
            `Новый отклик!\n\nВакансия: *${data.job_title}*\nКандидат: ${state.apply_name}\nТелефон: ${state.apply_phone}${message ? `\n"${message}"` : ''}`,
            { parse_mode: 'Markdown' }
          ).catch(() => {});
        }
      } catch (e) {
        clearState(chatId);
        bot.sendMessage(chatId, e.response?.data?.error === 'Already applied' ? 'Вы уже откликались на эту вакансию.' : 'Ошибка. Попробуйте позже.', mainKeyboard);
      }
    }
    return;
  }

  if (state.action === 'post_job') {
    const job = state.job || {};
    if (state.step === 'title') {
      setState(chatId, { job: { ...job, title: text }, step: 'company' });
      return bot.sendMessage(chatId, 'Шаг 2/7: Введите название компании:', cancelKeyboard);
    }
    if (state.step === 'company') {
      setState(chatId, { job: { ...job, company: text }, step: 'salary' });
      return bot.sendMessage(chatId, 'Шаг 3/7: Введите зарплату (тг/мес) или "договорная":', cancelKeyboard);
    }
    if (state.step === 'salary') {
      setState(chatId, { job: { ...job, salary: text }, step: 'type' });
      return bot.sendMessage(chatId, 'Шаг 4/7: Выберите тип занятости:', typeKeyboard);
    }
    if (state.step === 'description') {
      setState(chatId, { job: { ...job, description: text === 'пропустить' ? '' : text }, step: 'contact' });
      return bot.sendMessage(chatId, 'Шаг 7/7: Введите контакт для связи (Telegram или телефон):', cancelKeyboard);
    }
    if (state.step === 'contact') {
      const finalJob = { ...job, contact: text, employer_tg_id: String(chatId) };
      try {
        await axios.post(`${API_URL}/api/jobs`, finalJob);
        clearState(chatId);
        bot.sendMessage(chatId,
          `Вакансия опубликована!\n\n*${finalJob.title}*\n${finalJob.company}\n${finalJob.salary}\n${finalJob.area}\n\nВы получите уведомление при новом отклике.`,
          { parse_mode: 'Markdown', ...mainKeyboard }
        );
      } catch (e) {
        clearState(chatId);
        bot.sendMessage(chatId, 'Ошибка публикации. Попробуйте снова.', mainKeyboard);
      }
    }
  }
});

console.log('MangystauJobs Telegram Bot started');      [{ text: 'Общепит', callback_data: 'sphere_cafe' }, { text: 'Торговля', callback_data: 'sphere_trade' }],
      [{ text: 'Строительство', callback_data: 'sphere_build' }, { text: 'Красота', callback_data: 'sphere_beauty' }],
      [{ text: 'IT', callback_data: 'sphere_it' }, { text: 'Доставка', callback_data: 'sphere_delivery' }],
      [{ text: 'Другое', callback_data: 'sphere_other' }]
    
  
};

const typeKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: 'Полная занятость', callback_data: 'type_full' }],
      [{ text: 'Частичная занятость', callback_data: 'type_part' }],
      [{ text: 'Подработка', callback_data: 'type_gig' }]
    ]
  }
};

const areaKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '5-й мкр', callback_data: 'area_5' }, { text: '7-й мкр', callback_data: 'area_7' }],
      [{ text: '9-й мкр', callback_data: 'area_9' }, { text: '11-й мкр', callback_data: 'area_11' }],
      [{ text: '15-й мкр', callback_data: 'area_15' }, { text: '17-й мкр', callback_data: 'area_17' }],
      [{ text: 'Центр', callback_data: 'area_center' }, { text: 'Новый город', callback_data: 'area_new' }],
      [{ text: 'Весь город', callback_data: 'area_all' }, { text: 'Удалённо', callback_data: 'area_remote' }]
    ]
  }
};

function formatJob(job, index = null) {
  const prefix = index !== null ? `${index + 1}. ` : '';
  return `${prefix}*${job.title}*\n${job.company}\n${job.salary}\n${job.area} | ${job.type}\nОпыт: ${job.experience}${job.description ? `\n\n${job.description.substring(0, 150)}${job.description.length > 150 ? '...' : ''}` : ''}`;
}

// /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  clearState(chatId);
  try {
    await axios.post(`${API_URL}/api/users`, {
      tg_id: String(chatId),
      name: `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim(),
      role: 'seeker'
    });
  } catch (e) {}

  let statsText = '';
  try {
    const { data } = await axios.get(`${API_URL}/api/stats`);
    statsText = `\n\nСейчас на платформе:\n- ${data.jobs} активных вакансий\n- ${data.employers} работодателей\n- ${data.applications} откликов`;
  } catch (e) {}

  await bot.sendMessage(chatId,
    `Привет, ${msg.from.first_name}!\n\nMangystauJobs — платформа занятости для молодёжи и малого бизнеса Мангистауской области.${statsText}\n\nAI подбирает вакансии по вашим навыкам.\nРаботодатели публикуют вакансии прямо здесь.`,
    { parse_mode: 'Markdown', ...mainKeyboard }
  );
});

bot.onText(/Найти работу/, (msg) => {
  setState(msg.chat.id, { action: 'browse' });
  bot.sendMessage(msg.chat.id, 'Выберите сферу:', sphereKeyboard);
});

bot.onText(/AI подбор/, (msg) => {
  setState(msg.chat.id, { action: 'ai_match' });
  bot.sendMessage(msg.chat.id,
    'AI-подбор вакансий\n\nОпишите свои навыки, опыт и пожелания — AI подберёт лучшие варианты.\n\nПример: "Умею готовить, работал поваром 1 год, ищу полную занятость в центре Актау"',
    { parse_mode: 'Markdown', ...cancelKeyboard }
  );
});

bot.onText(/Разместить вакансию/, (msg) => {
  setState(msg.chat.id, { action: 'post_job', step: 'title', job: {} });
  bot.sendMessage(msg.chat.id, 'Публикация вакансии\n\nШаг 1/7: Введите название вакансии\n\nПример: Бариста, Продавец, Разнорабочий', { parse_mode: 'Markdown', ...cancelKeyboard });
});

bot.onText(/Мои отклики/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const { data } = await axios.get(`${API_URL}/api/employer/${chatId}/applications`);
    if (!data.applications.length) return bot.sendMessage(chatId, 'У вас пока нет откликов.', mainKeyboard);
    const text = data.applications.slice(0, 10).map((a, i) =>
      `${i + 1}. *${a.job_title}*\n${a.user_name || 'Аноним'} | ${a.status === 'pending' ? 'Ожидает' : 'Просмотрен'}\nТелефон: ${a.user_phone || 'Не указан'}${a.message ? `\n${a.message}` : ''}`
    ).join('\n\n---\n\n');
    bot.sendMessage(chatId, `Отклики на ваши вакансии:\n\n${text}`, { parse_mode: 'Markdown', ...mainKeyboard });
  } catch (e) {
    bot.sendMessage(chatId, 'Не удалось загрузить отклики.', mainKeyboard);
  }
});

bot.onText(/Открыть сайт/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Открыть платформу:', {
    reply_markup: { inline_keyboard: [[{ text: 'Открыть MangystauJobs', url: WEB_URL }]] }
  });
});

bot.onText(/Поддержка/, (msg) => {
  bot.sendMessage(msg.chat.id,
    'Поддержка MangystauJobs\n\nПо вопросам работы платформы:\nTelegram: @mangystau_hub\nEmail: jobs@mangystau.kz\n\nОфис: Mangystau Hub, Актау',
    { parse_mode: 'Markdown', ...mainKeyboard }
  );
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const state = getState(chatId);
  await bot.answerCallbackQuery(query.id);

  if (data.startsWith('sphere_') && state.action === 'browse') {
    const sphere = data.replace('sphere_', '');
    try {
      const { data: res } = await axios.get(`${API_URL}/api/jobs?sphere=${sphere}&limit=5`);
      if (!res.jobs.length) return bot.sendMessage(chatId, 'Вакансий в этой сфере пока нет.', mainKeyboard);
      const text = res.jobs.map((j, i) => formatJob(j, i)).join('\n\n---\n\n');
      bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: res.jobs.map(j => [{ text: `Откликнуться: ${j.title}`, callback_data: `apply_${j.id}` }])
        }
      });
    } catch (e) {
      bot.sendMessage(chatId, 'Ошибка загрузки.', mainKeyboard);
    }
  }

  if (data.startsWith('apply_')) {
    const jobId = data.replace('apply_', '');
    setState(chatId, { action: 'apply', job_id: jobId, step: 'name' });
    bot.sendMessage(chatId, 'Отклик на вакансию\n\nВведите ваше имя и фамилию:', { parse_mode: 'Markdown', ...cancelKeyboard });
  }

  if (data.startsWith('sphere_') && state.action === 'post_job') {
    const sphere = data.replace('sphere_', '');
    setState(chatId, { job: { ...state.job, sphere }, step: 'area' });
    bot.sendMessage(chatId, 'Шаг 5/7: Выберите район:', { ...areaKeyboard });
  }

  if (data.startsWith('type_') && state.action === 'post_job') {
    const typeMap = { type_full: 'Полная', type_part: 'Частичная', type_gig: 'Подработка' };
    setState(chatId, { job: { ...state.job, type: typeMap[data] }, step: 'sphere' });
    bot.sendMessage(chatId, 'Шаг 4/7: Выберите сферу:', sphereKeyboard);
  }

  if (data.startsWith('area_') && state.action === 'post_job') {
    const areaMap = { area_5: '5-й мкр', area_7: '7-й мкр', area_9: '9-й мкр', area_11: '11-й мкр', area_15: '15-й мкр', area_17: '17-й мкр', area_center: 'Центр', area_new: 'Новый город', area_all: 'Весь город', area_remote: 'Удалённо' };
    setState(chatId, { job: { ...state.job, area: areaMap[data] }, step: 'description' });
    bot.sendMessage(chatId, 'Шаг 6/7: Опишите требования и условия (или напишите "пропустить"):', cancelKeyboard);
  }
});

bot.on('message', async (msg) => {
  if (!msg.text) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const state = getState(chatId);

  if (text === 'Отмена') {
    clearState(chatId);
    return bot.sendMessage(chatId, 'Отменено.', mainKeyboard);
  }

  const triggers = ['Найти работу', 'Мои отклики', 'Разместить вакансию', 'AI подбор', 'Поддержка', 'Открыть сайт'];
  if (text.startsWith('/') || triggers.includes(text)) return;

  if (state.action === 'ai_match') {
    clearState(chatId);
    const thinking = await bot.sendMessage(chatId, 'AI анализирует ваши навыки...');
    try {
      const { data } = await axios.post(`${API_URL}/api/ai/match`, { skills: text });
      await bot.deleteMessage(chatId, thinking.message_id);
      if (!data.matches?.length) return bot.sendMessage(chatId, 'Не удалось подобрать вакансии. Попробуйте уточнить запрос.', mainKeyboard);

      const matchText = data.matches.map((m, i) =>
        `${i + 1}. *${m.job.title}* — ${m.job.company}\n${m.job.salary} | ${m.job.area}\nСовпадение: *${m.match_percent}%*\n${m.reason}`
      ).join('\n\n---\n\n');

      bot.sendMessage(chatId,
        `AI подобрал для вас:\n\n${matchText}${data.recommendation ? `\n\nСовет: ${data.recommendation}` : ''}`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              ...data.matches.map(m => [{ text: `Откликнуться: ${m.job.title}`, callback_data: `apply_${m.job_id}` }]),
              [{ text: 'Открыть все вакансии', url: WEB_URL }]
            ]
          }
        }
      );
    } catch (e) {
      await bot.deleteMessage(chatId, thinking.message_id).catch(() => {});
      bot.sendMessage(chatId, 'Ошибка AI. Попробуйте позже.', mainKeyboard);
    }
    return;
  }

  if (state.action === 'apply') {
    if (state.step === 'name') {
      setState(chatId, { step: 'phone', apply_name: text });
      return bot.sendMessage(chatId, 'Введите ваш номер телефона:', cancelKeyboard);
    }
    if (state.step === 'phone') {
      setState(chatId, { step: 'message', apply_phone: text });
      return bot.sendMessage(chatId, 'Напишите сопроводительное сообщение (или "пропустить"):', cancelKeyboard);
    }
    if (state.step === 'message') {
      const message = text === 'пропустить' ? '' : text;
      try {
        const { data } = await axios.post(`${API_URL}/api/jobs/${state.job_id}/apply`, {
          user_tg_id: String(chatId),
          user_name: state.apply_name,
          user_phone: state.apply_phone,
          message
        });
        clearState(chatId);
        bot.sendMessage(chatId, `Отклик отправлен!\n\nВакансия: *${data.job_title}*\n\nРаботодатель получил уведомление и скоро свяжется с вами.`, { parse_mode: 'Markdown', ...mainKeyboard });

        if (data.employer_tg_id) {
          bot.sendMessage(data.employer_tg_id,
            `Новый отклик!\n\nВакансия: *${data.job_title}*\nКандидат: ${state.apply_name}\nТелефон: ${state.apply_phone}${message ? `\n"${message}"` : ''}`,
            { parse_mode: 'Markdown' }
          ).catch(() => {});
        }
      } catch (e) {
        clearState(chatId);
        bot.sendMessage(chatId, e.response?.data?.error === 'Already applied' ? 'Вы уже откликались на эту вакансию.' : 'Ошибка. Попробуйте позже.', mainKeyboard);
      }
    }
    return;
  }

  if (state.action === 'post_job') {
    const job = state.job || {};
    if (state.step === 'title') {
      setState(chatId, { job: { ...job, title: text }, step: 'company' });
      return bot.sendMessage(chatId, 'Шаг 2/7: Введите название компании:', cancelKeyboard);
    }
    if (state.step === 'company') {
      setState(chatId, { job: { ...job, company: text }, step: 'salary' });
      return bot.sendMessage(chatId, 'Шаг 3/7: Введите зарплату (тг/мес) или "договорная":', cancelKeyboard);
    }
    if (state.step === 'salary') {
      setState(chatId, { job: { ...job, salary: text }, step: 'type' });
      return bot.sendMessage(chatId, 'Шаг 4/7: Выберите тип занятости:', typeKeyboard);
    }
    if (state.step === 'description') {
      setState(chatId, { job: { ...job, description: text === 'пропустить' ? '' : text }, step: 'contact' });
      return bot.sendMessage(chatId, 'Шаг 7/7: Введите контакт для связи (Telegram или телефон):', cancelKeyboard);
    }
    if (state.step === 'contact') {
      const finalJob = { ...job, contact: text, employer_tg_id: String(chatId) };
      try {
        await axios.post(`${API_URL}/api/jobs`, finalJob);
        clearState(chatId);
        bot.sendMessage(chatId,
          `Вакансия опубликована!\n\n*${finalJob.title}*\n${finalJob.company}\n${finalJob.salary}\n${finalJob.area}\n\nВы получите уведомление при новом отклике.`,
          { parse_mode: 'Markdown', ...mainKeyboard }
        );
      } catch (e) {
        clearState(chatId);
        bot.sendMessage(chatId, 'Ошибка публикации. Попробуйте снова.', mainKeyboard);
      }
    }
  }
});

console.log('MangystauJobs Telegram Bot started');
