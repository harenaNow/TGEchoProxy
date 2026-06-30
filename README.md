# TG Echo Proxy

Telegram 客服中转机器人 —— 陌生人通过人机验证后发消息，机器人自动转发给管理员；管理员引用回复即可回传给陌生人。

## 工作流程

```
陌生人 /start → 数学题验证 → 通过后直接发消息
                                    ↓
                        机器人转发给管理员（消息自带头像和名字）
                                    ↓
                        管理员引用该消息回复 → 机器人转发回给陌生人
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置

复制 `.env.example` 为 `.env` 并填入：

```env
BOT_TOKEN=从 @BotFather 获取的 Bot Token
ADMIN_ID=你的 Telegram 数字ID（@userinfobot 可查）
```

或直接修改 `config.js`。

### 3. 运行

```bash
npm start
```

## 使用说明

| 操作 | 说明 |
|------|------|
| 陌生人发送 `/start` | 触发数学题人机验证 |
| 验证通过后发消息 | 自动转发给管理员 |
| 管理员**引用**转发消息回复 | 自动回传给对应陌生人 |

## 技术栈

- Node.js
- [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api)

## License

MIT
