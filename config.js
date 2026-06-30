module.exports = {
  // 替换为你的 Telegram Bot Token（从 @BotFather 获取）
  BOT_TOKEN: process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE',

  // 管理员 Telegram ID（必填，用于接收转发消息并引用回复）
  // 可通过 @userinfobot 获取自己的 ID
  ADMIN_ID: process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : null,

  // 验证超时时间（毫秒）
  CAPTCHA_TIMEOUT: 60 * 1000,
};
