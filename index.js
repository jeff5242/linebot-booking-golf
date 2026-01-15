'use strict';

require('dotenv').config();

const express = require('express');
const line = require('@line/bot-sdk');

// LINE Bot 設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

// 建立 LINE Client
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

const app = express();

// 健康檢查端點
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// LINE Webhook 端點
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('Error handling events:', err);
      res.status(500).end();
    });
});

// 處理 LINE 事件
async function handleEvent(event) {
  // 只處理訊息事件
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userMessage = event.message.text;

  // Echo 回覆使用者訊息
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [
      {
        type: 'text',
        text: `你說了: ${userMessage}`,
      },
    ],
  });
}

// 啟動伺服器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LINE Bot 伺服器正在運行於 port ${PORT}`);
});
