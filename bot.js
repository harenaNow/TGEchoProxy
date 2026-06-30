const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');

const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

// ============================================================
// 状态管理
// ============================================================
const STATE = { IDLE: 'idle', CAPTCHA: 'captcha', ACTIVE: 'active' };

// userId -> { state, captchaAnswer, captchaTimer, username }
const users = new Map();

// 转发的消息ID -> 原始用户ID（用于管理员引用回复时定位用户）
const forwardedMap = new Map();

function getUser(id) {
  if (!users.has(id)) {
    users.set(id, { state: STATE.IDLE, captchaAnswer: null, captchaTimer: null, username: null });
  }
  return users.get(id);
}

function clearCaptchaTimer(user) {
  if (user.captchaTimer) {
    clearTimeout(user.captchaTimer);
    user.captchaTimer = null;
  }
}

function resetUser(id) {
  const user = users.get(id);
  if (user) {
    clearCaptchaTimer(user);
    user.state = STATE.IDLE;
    user.captchaAnswer = null;
  }
}

/** 生成数学验证码 */
function generateCaptcha() {
  const ops = ['+', '-', '×'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a, b, answer;

  switch (op) {
    case '+':
      a = Math.floor(Math.random() * 50) + 1;
      b = Math.floor(Math.random() * 50) + 1;
      answer = a + b;
      break;
    case '-':
      a = Math.floor(Math.random() * 50) + 10;
      b = Math.floor(Math.random() * a) + 1;
      answer = a - b;
      break;
    case '×':
      a = Math.floor(Math.random() * 9) + 2;
      b = Math.floor(Math.random() * 9) + 2;
      answer = a * b;
      break;
  }

  const question = `${a} ${op} ${b} = ?`;
  const options = new Set([answer]);
  while (options.size < 4) {
    const fake = answer + Math.floor(Math.random() * 11) - 5;
    if (fake !== answer && fake >= 0) options.add(fake);
  }
  const shuffled = [...options].sort(() => Math.random() - 0.5);
  return { question, answer, options: shuffled };
}

// ============================================================
// /start — 触发验证码
// ============================================================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  // 管理员自己跳过
  if (chatId === config.ADMIN_ID) {
    bot.sendMessage(chatId, '👋 你是管理员，直接引用转发消息回复即可。');
    return;
  }

  const user = getUser(chatId);
  clearCaptchaTimer(user);
  resetUser(chatId);

  user.username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
  user.state = STATE.CAPTCHA;

  const captcha = generateCaptcha();
  user.captchaAnswer = captcha.answer;

  user.captchaTimer = setTimeout(() => {
    if (user.state === STATE.CAPTCHA) {
      user.state = STATE.IDLE;
      user.captchaAnswer = null;
      bot.sendMessage(chatId, '⏰ 验证超时，请重新发送 /start。');
    }
  }, config.CAPTCHA_TIMEOUT);

  const keyboard = captcha.options.map((opt) => [{ text: String(opt), callback_data: `captcha:${opt}` }]);

  await bot.sendMessage(chatId, `🤖 人机验证\n\n请计算以下算式并选择正确答案：\n\n  ${captcha.question}\n\n⏱ 请在 60 秒内完成验证。`, {
    reply_markup: { inline_keyboard: keyboard },
  });
});

// ============================================================
// 内联按钮回调 — 验证答案
// ============================================================
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const user = getUser(chatId);

  if (!query.data.startsWith('captcha:')) return;
  if (user.state !== STATE.CAPTCHA) {
    await bot.answerCallbackQuery(query.id, { text: '验证已过期，请重新 /start' });
    return;
  }

  const selected = parseInt(query.data.split(':')[1], 10);
  clearCaptchaTimer(user);

  if (selected === user.captchaAnswer) {
    user.state = STATE.ACTIVE;
    user.captchaAnswer = null;

    await bot.editMessageText('✅ 验证通过！你现在可以直接发送消息，管理员会收到。', {
      chat_id: chatId,
      message_id: query.message.message_id,
    });
    await bot.answerCallbackQuery(query.id, { text: '验证成功！' });

    // 通知管理员有新用户
    if (config.ADMIN_ID) {
      const info = `👤 新用户通过验证\nID: ${chatId}\n名称: ${user.username}`;
      bot.sendMessage(config.ADMIN_ID, info);
    }
  } else {
    user.state = STATE.IDLE;
    user.captchaAnswer = null;

    await bot.editMessageText('❌ 验证失败！请发送 /start 重新验证。', {
      chat_id: chatId,
      message_id: query.message.message_id,
    });
    await bot.answerCallbackQuery(query.id, { text: '答案错误' });
  }
});

// ============================================================
// 核心：消息转发 + 引用回复
// ============================================================
bot.on('message', async (msg) => {
  if (msg.text && msg.text.startsWith('/')) return;
  if (msg.chat.type !== 'private') return;

  const chatId = msg.chat.id;
  const user = getUser(chatId);

  // ---------- 管理员回复：引用了一条转发消息 ----------
  if (chatId === config.ADMIN_ID && msg.reply_to_message) {
    const repliedMsgId = msg.reply_to_message.message_id;
    const targetUserId = forwardedMap.get(repliedMsgId);

    if (targetUserId) {
      try {
        // 把管理员的回复转发给原始用户
        await bot.forwardMessage(targetUserId, chatId, msg.message_id);
      } catch (err) {
        bot.sendMessage(chatId, `⚠️ 转发失败：${err.message}`);
      }
    } else {
      bot.sendMessage(chatId, '⚠️ 无法识别该消息对应的用户。');
    }
    return;
  }

  // ---------- 已验证用户发消息 → 转发给管理员 ----------
  if (user.state === STATE.ACTIVE && config.ADMIN_ID) {
    try {
      const sent = await bot.forwardMessage(config.ADMIN_ID, chatId, msg.message_id);
      // 记录映射：转发后的消息ID → 原始用户ID
      forwardedMap.set(sent.message_id, chatId);
    } catch (err) {
      bot.sendMessage(chatId, '⚠️ 消息发送失败，请稍后重试。');
    }
    return;
  }

  // ---------- 未验证 / 未开始 ----------
  if (user.state === STATE.IDLE) {
    bot.sendMessage(chatId, '👋 欢迎！发送 /start 开始验证。');
  }
});

// ============================================================
console.log('🤖 TG Echo Proxy 机器人已启动...');
console.log(`   Bot Token: ${config.BOT_TOKEN.slice(0, 8)}...`);
if (config.ADMIN_ID) {
  console.log(`   Admin ID: ${config.ADMIN_ID}`);
} else {
  console.warn('⚠️  未设置 ADMIN_ID，消息将无处转发！请在 config.js 或环境变量中配置。');
}
