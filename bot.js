// ============================================
// LuLu Social Boost - Complete Reseller Bot
// Version: 3.0.0
// Author: @Rowan_Elliss
// ============================================

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const mongoose = require('mongoose');
const express = require('express');

// ---------- Express Server for Render/Heroku ----------
const app = express();
const PORT = process.env.PORT || 8000;
app.get('/', (req, res) => res.send('✅ Bot is running'));
app.listen(PORT, () => console.log(`📡 Server on port ${PORT}`));

// ---------- Environment Variables ----------
const BOT_TOKEN = process.env.BOT_TOKEN || '8330406067:AAHGxAdIZmj-ou1iu8rfVabtbbmmLC_oKvg';
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '7072739469');
const API_KEY = process.env.API_KEY || '72dd1d7b0ade683680631a027ff813d0a7d11b01';
const MONGO_URL = process.env.MONGO_URL || 'mongodb+srv://paingzinsoe:AGLMG7iArSBqPLdt@cluster0.dzaellc.mongodb.net/lulu_social_boost?retryWrites=true&w=majority';
const EXCHANGE_RATE = 4500; // 1 USD = 4500 MMK
const COOLDOWN_MS = 2000;    // 2 seconds anti-spam

// ---------- MongoDB Schemas ----------
const userSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: String,
  firstName: String,
  balance: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  isBanned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  telegramId: { type: Number, required: true },
  serviceId: String,
  serviceName: String,
  link: String,
  quantity: Number,
  costUSD: Number,
  costMMK: Number,
  status: { type: String, default: 'Pending' }, // Pending, In progress, Completed, Partial, Cancelled
  apiStatus: String,
  createdAt: { type: Date, default: Date.now }
});

const depositSchema = new mongoose.Schema({
  telegramId: Number,
  username: String,
  screenshotFileId: String,
  transactionId: String,
  amountMMK: Number,
  status: { type: String, default: 'Pending' }, // Pending, Approved, Rejected
  adminMessageId: Number, // for editing later
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Order = mongoose.model('Order', orderSchema);
const Deposit = mongoose.model('Deposit', depositSchema);

// ---------- Connect MongoDB ----------
mongoose.connect(MONGO_URL)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ---------- Service Definitions (from user) ----------
const SERVICES = {
  // TikTok
  'tt_likes':   { id: 87129, name: '🩷 TikTok Likes [HQ]', price: 0.2237, min: 10, max: 100000, time: '20 min', regex: /tiktok\.com/, category: 'tt' },
  'tt_views':   { id: 87132, name: '👀 TikTok Views', price: 0.0078, min: 100, max: 500000000, time: '11 min', regex: /tiktok\.com/, category: 'tt' },
  'tt_shares':  { id: 87089, name: '📍 TikTok Shares', price: 0.0848, min: 10, max: 10000000, time: '12 min', regex: /tiktok\.com/, category: 'tt' },
  'tt_saves':   { id: 7090, name: '💾 TikTok Saves', price: 0.015, min: 10, max: 2147482647, time: '26 min', regex: /tiktok\.com/, category: 'tt' },
  'tt_follow':  { id: 87117, name: '👤 TikTok Followers', price: 0.9188, min: 50, max: 100000, time: '30 min', regex: /tiktok\.com/, category: 'tt' },
  
  // Facebook
  'fb_follow':  { id: 86930, name: '📘 FB Page Followers', price: 0.4298, min: 100, max: 100000, time: '31 min', regex: /facebook\.com|fb\.watch/, category: 'fb' },
  'fb_likes':   { id: 87072, name: '👍 FB Post Likes', price: 0.264, min: 10, max: 1000000, time: '27 min', regex: /facebook\.com|fb\.watch/, category: 'fb' },
  'fb_love':    { id: 86458, name: '❤️ FB Love', price: 0.1689, min: 10, max: 100000, time: '40 min', regex: /facebook\.com/, category: 'fb' },
  'fb_care':    { id: 86459, name: '🤗 FB Care', price: 0.1689, min: 10, max: 100000, time: '28 min', regex: /facebook\.com/, category: 'fb' },
  'fb_haha':    { id: 86461, name: '😂 FB Haha', price: 0.6457, min: 10, max: 500000, time: 'N/A', regex: /facebook\.com/, category: 'fb' },
  'fb_wow':     { id: 86460, name: '😲 FB Wow', price: 0.6457, min: 10, max: 100000, time: '6h 58m', regex: /facebook\.com/, category: 'fb' },
  'fb_sad':     { id: 86462, name: '😥 FB Sad', price: 0.6457, min: 10, max: 500000, time: '1h 17m', regex: /facebook\.com/, category: 'fb' },
  'fb_angry':   { id: 86463, name: '🤬 FB Angry', price: 0.6457, min: 10, max: 500000, time: '47 min', regex: /facebook\.com/, category: 'fb' },
  
  // YouTube
  'yt_subs':    { id: 86560, name: '📺 YouTube Subscribers', price: 22.7526, min: 100, max: 10000, time: '74h 43m', regex: /youtube\.com|youtu\.be/, category: 'yt' },
  'yt_views':   { id: 86562, name: '📺 YouTube Views HQ', price: 1.8732, min: 100, max: 10000000, time: '5h 2m', regex: /youtube\.com|youtu\.be/, category: 'yt' },
  
  // Telegram
  'tg_views':   { id: 86620, name: '✈️ Telegram Post Views', price: 0.0499, min: 10, max: 2147483647, time: '14 min', regex: /t\.me/, category: 'tg' },
  'tg_member':  { id: 86629, name: '✈️ Telegram Members', price: 0.948, min: 10, max: 100000, time: '31 min', regex: /t\.me/, category: 'tg' }
};

// Group services by platform
const PLATFORMS = {
  tt: { name: '🎬 TikTok', services: ['tt_likes','tt_views','tt_shares','tt_saves','tt_follow'] },
  fb: { name: '📘 Facebook', services: ['fb_follow','fb_likes','fb_love','fb_care','fb_haha','fb_wow','fb_sad','fb_angry'] },
  yt: { name: '📺 YouTube', services: ['yt_subs','yt_views'] },
  tg: { name: '✈️ Telegram', services: ['tg_views','tg_member'] }
};

// ---------- Bot Initialization ----------
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ---------- Global State & Cooldown ----------
const userStates = new Map();      // { chatId: { step, serviceKey, link, qty, cost, messageId, ... } }
const cooldown = new Map();       // { userId: lastMsgTime }

// ---------- Helper Functions ----------
function escapeHTML(text) {
  return String(text).replace(/[&<>"]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    if (m === '"') return '&quot;';
    return m;
  });
}

async function getUser(telegramId, msg = null) {
  let user = await User.findOne({ telegramId });
  if (!user && msg) {
    user = new User({
      telegramId,
      username: msg.from.username,
      firstName: msg.from.first_name
    });
    await user.save();
  }
  return user;
}

function isAdmin(userId) {
  return userId === ADMIN_ID;
}

// ---------- Anti-Spam ----------
function checkSpam(userId) {
  const now = Date.now();
  const last = cooldown.get(userId) || 0;
  if (now - last < COOLDOWN_MS) return true;
  cooldown.set(userId, now);
  return false;
}

// ---------- SMM Brother API Call (with Cloudflare bypass) ----------
async function callSmmApi(params) {
  try {
    const response = await axios.post('https://brothersmm.com/api', {
      key: API_KEY,
      ...params
    }, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 20000
    });
    return response.data;
  } catch (error) {
    console.error('API Error:', error.response?.data || error.message);
    return { error: 'API_CONNECTION_FAILED', details: error.message };
  }
}

// ---------- Main Keyboards ----------
const mainKeyboard = {
  reply_markup: {
    keyboard: [
      ['📱 ရရှိနိုင်သော Service များ'],
      ['💰 လက်ကျန်ငွေစစ်ရန်', '💸 ငွေဖြည့်ရန်'],
      ['📜 Order History', 'Faq⁉️']
    ],
    resize_keyboard: true
  }
};

const backButtonKeyboard = {
  reply_markup: {
    keyboard: [['🔙 နောက်ပြန်သွားရန်']],
    resize_keyboard: true
  }
};

// ---------- 1. /start and Welcome ----------
bot.onText(/\/start|🔙 နောက်ပြန်သွားရန်/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (checkSpam(userId)) return;

  userStates.delete(chatId);
  const user = await getUser(userId, msg);
  const name = user.firstName || 'User';
  
  const welcomeText = `✨ <b>မင်္ဂလာပါ ${escapeHTML(name)}!</b>\n<b>LuLu Social Boost</b> မှ ကြိုဆိုပါတယ်ဗျာ။ ✨\n\n✅ ငွေဖြည့်ခြင်း၊ ဝန်ဆောင်မှုများတောင်းခံခြင်းကို ဒီ Bot မှတစ်ဆင့် လုပ်ဆောင်နိုင်ပါပြီ။`;
  
  bot.sendMessage(chatId, welcomeText, {
    parse_mode: 'HTML',
    ...mainKeyboard
  });
});

// ---------- 2. Platform & Service Selection ----------
bot.onText(/📱 ရရှိနိုင်သော Service များ/, (msg) => {
  const chatId = msg.chat.id;
  if (checkSpam(msg.from.id)) return;
  
  const inlineKeyboard = [];
  for (const [key, plat] of Object.entries(PLATFORMS)) {
    inlineKeyboard.push([{ text: plat.name, callback_data: `plat_${key}` }]);
  }
  
  bot.sendMessage(chatId, '📌 <b>မည်သည့် Platform အတွက် ဝန်ဆောင်မှု လိုအပ်ပါသလဲ?</b>\n\nအောက်ပါ Platform များမှ ရွေးချယ်နိုင်ပါသည်:', {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: inlineKeyboard }
  });
});

// ---------- Callback Query Handler ----------
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;
  
  if (checkSpam(userId)) {
    return bot.answerCallbackQuery(query.id, { text: '⏳ ခဏစောင့်ပါ...', show_alert: false });
  }

  // ---------- Platform selected ----------
  if (data.startsWith('plat_')) {
    const platformKey = data.split('_')[1];
    const platform = PLATFORMS[platformKey];
    if (!platform) return;
    
    const serviceButtons = [];
    for (const svcKey of platform.services) {
      const svc = SERVICES[svcKey];
      serviceButtons.push([{ text: svc.name.split('[')[0].trim(), callback_data: `svc_${svcKey}` }]);
    }
    
    bot.editMessageText(`<b>${platform.name}</b> ဝန်ဆောင်မှုများ:`, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: serviceButtons }
    });
  }
  
  // ---------- Service selected ----------
  else if (data.startsWith('svc_')) {
    const serviceKey = data.replace('svc_', '');
    const service = SERVICES[serviceKey];
    if (!service) return;
    
    // Save state: waiting for link
    userStates.set(chatId, {
      step: 'WAITING_LINK',
      serviceKey,
      serviceName: service.name,
      min: service.min,
      regex: service.regex,
      price: service.price,
      time: service.time,
      messageId: query.message.message_id
    });
    
    const msgText = `📌 <b>${service.name}</b>\n\n⏱️ ပျမ်းမျှကြာချိန်: ${service.time}\n📦 အနည်းဆုံးအရေအတွက်: ${service.min}\n\n🔗 ကျေးဇူးပြု၍ သင့် link ကို ပေးပို့ပါ။`;
    
    bot.editMessageText(msgText, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '❌ ပယ်ဖျက်ရန်', callback_data: 'cancel_order' }]] }
    });
  }
  
  // ---------- Cancel order setup ----------
  else if (data === 'cancel_order') {
    userStates.delete(chatId);
    bot.editMessageText('❌ ဝန်ဆောင်မှု ရွေးချယ်ခြင်းကို ပယ်ဖျက်လိုက်ပါသည်။', {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML'
    });
  }
  
  // ---------- Confirm order (after checking balance) ----------
  else if (data === 'confirm_order') {
    const state = userStates.get(chatId);
    if (!state || state.step !== 'CONFIRM') {
      return bot.answerCallbackQuery(query.id, { text: 'ဤအမိန့်မှာ သက်တမ်းကုန်သွားပါပြီ။', show_alert: true });
    }
    
    // Double order prevention: immediately remove buttons
    bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
      chat_id: chatId,
      message_id: query.message.message_id
    }).catch(() => {});
    
    const user = await getUser(userId);
    if (user.isBanned) {
      return bot.sendMessage(chatId, '⛔ သင်သည် Bot သုံးခွင့် ပိတ်ထားခံရပါသည်။');
    }
    if (user.balance < state.totalCost) {
      userStates.delete(chatId);
      return bot.sendMessage(chatId, '⚠️ သင့်လက်ကျန်ငွေ မလုံလောက်ပါ။ ကျေးဇူးပြု၍ ငွေဖြည့်ပါ။', {
        reply_markup: { inline_keyboard: [[{ text: '💸 ငွေဖြည့်ရန်', callback_data: 'deposit_now' }]] }
      });
    }
    
    // Call API to place order
    const apiRes = await callSmmApi({
      action: 'add',
      service: state.serviceId,
      link: state.link,
      quantity: state.quantity
    });
    
    if (apiRes.order) {
      const orderId = apiRes.order.toString();
      const remainingBalance = apiRes.remaining_balance || 0;
      
      // Deduct balance & save order
      user.balance -= state.totalCost;
      user.totalSpent += state.totalCost;
      await user.save();
      
      const order = new Order({
        orderId,
        telegramId: userId,
        serviceId: state.serviceId,
        serviceName: state.serviceName,
        link: state.link,
        quantity: state.quantity,
        costUSD: state.costUSD,
        costMMK: state.totalCost,
        status: 'Pending',
        apiStatus: 'Pending'
      });
      await order.save();
      
      const successMsg = `✅ <b>Order အသစ်တင်ပြီးပါပြီ။</b>\n\n🆔 <b>Order ID:</b> <code>${orderId}</code>\n📌 ဝန်ဆောင်မှု: ${state.serviceName}\n🔗 Link: ${state.link}\n📊 အရေအတွက်: ${state.quantity}\n💰 ကုန်ကျငွေ: ${state.totalCost} MMK\n💵 လက်ကျန်: ${user.balance} MMK\n\n⏱️ ပျမ်းမျှကြာချိန်: ${state.time}`;
      
      bot.sendMessage(chatId, successMsg, { parse_mode: 'HTML', ...mainKeyboard });
      userStates.delete(chatId);
    } else {
      // API error
      bot.sendMessage(chatId, `❌ Order မအောင်မြင်ပါ။\n\n${apiRes.error || 'API အမှား၊ ခဏနေမှပြန်ကြိုးစားပါ။'}`, { ...mainKeyboard });
      userStates.delete(chatId);
    }
  }
  
  // ---------- Deposit flow start ----------
  else if (data === 'deposit_now' || data === 'start_deposit') {
    // Show payment instructions
    const instText = `💵 <b>ငွေဖြည့်ရန် ညွှန်ကြားချက်များ</b>\n\n💰 1$ = ${EXCHANGE_RATE} MMK\n(အနည်းဆုံး 1$ မှ စ၍ ဖြည့်နိုင်ပါသည်)\n\n🏦 KBZ Pay\n09952537056\nName: Joe Eaindray Thwe\n\n🏦 Wave Pay\n09882494488\nName: Paing Zin Soe\n\n✅ ငွေလွှဲပြီးပါက Screenshot နှင့် Transaction ID (နောက်ဆုံးဂဏန်း ၄လုံး) ပို့ပေးပါ။\n\n⚠️ <b>အရေးကြီးသတိပေးချက်</b>\n• KBZ Pay တွင် "Note" ၌ dollar နှင့်ပတ်သက်သော စာသားမထည့်ရ\n• "payment" သို့မဟုတ် "for service" အစရှိသော စာသားသာထည့်ရန်\n• ငွေလွှဲ Screenshot မှ လက်ခံသူအမည်၊ ပမာဏ၊ ရက်စွဲများ ရှင်းလင်းစွာမြင်ရပါစေ။`;
    
    bot.sendMessage(chatId, instText, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📸 Screenshot ပို့ရန်', callback_data: 'deposit_send_ss' }],
          [{ text: '❌ ပယ်ဖျက်ရန်', callback_data: 'cancel_deposit' }]
        ]
      }
    });
  }
  
  else if (data === 'deposit_send_ss') {
    userStates.set(chatId, { step: 'WAITING_SCREENSHOT' });
    bot.sendMessage(chatId, '📸 ကျေးဇူးပြု၍ ငွေလွှဲပြီးသော Screenshot ကို ပို့ပေးပါ။', backButtonKeyboard);
  }
  
  else if (data === 'cancel_deposit') {
    userStates.delete(chatId);
    bot.sendMessage(chatId, '❌ ငွေဖြည့်ခြင်းလုပ်ငန်းစဉ်ကို ပယ်ဖျက်လိုက်ပါသည်။', mainKeyboard);
  }
  
  // ---------- FAQ with Back button ----------
  else if (data === 'faq_back') {
    bot.editMessageText('🔙 ပင်မမီနူးသို့ ပြန်သွားရန် /start ကိုနှိပ်ပါ။', {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'HTML'
    });
    bot.sendMessage(chatId, 'ပင်မမီနူး', mainKeyboard);
  }
  
  // ---------- Order History: Check specific order ----------
  else if (data.startsWith('check_order_')) {
    const orderId = data.replace('check_order_', '');
    await showOrderStatus(chatId, orderId, query.message.message_id);
  }
  
  // ---------- Cancel order (from status check) ----------
  else if (data.startsWith('cancel_api_')) {
    const orderId = data.replace('cancel_api_', '');
    await cancelOrder(chatId, orderId, query);
  }
  
  // ---------- Order History: Prompt to enter order ID ----------
  else if (data === 'order_history_search') {
    userStates.set(chatId, { step: 'WAITING_ORDER_ID' });
    bot.sendMessage(chatId, '🔍 ကျေးဇူးပြု၍ သင်စစ်ဆေးလိုသော Order ID ကို ရိုက်ထည့်ပါ။', backButtonKeyboard);
  }
  
  // Answer callback query
  bot.answerCallbackQuery(query.id);
});

// ---------- 3. Message Handler (All text & photo) ----------
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  const photo = msg.photo;
  
  if (checkSpam(userId)) return;
  if (msg.chat.type !== 'private') return; // only private chats
  
  // ---------- Banned check ----------
  const user = await getUser(userId, msg);
  if (user.isBanned) {
    return bot.sendMessage(chatId, '⛔ သင်သည် Bot သုံးခွင့် ပိတ်ထားခံရပါသည်။');
  }
  
  // ---------- State-based processing ----------
  const state = userStates.get(chatId);
  
  // --- Order flow: Waiting for link ---
  if (state && state.step === 'WAITING_LINK') {
    const service = SERVICES[state.serviceKey];
    if (!service.regex.test(text)) {
      return bot.sendMessage(chatId, '❌ Link မှားနေပါသည်။ နောက်တစ်ကြိမ် ကြိုးစားပါ။');
    }
    state.link = text;
    state.step = 'WAITING_QUANTITY';
    state.serviceId = service.id;
    bot.sendMessage(chatId, `🔢 <b>တိုးမြှင့်လိုသော အရေအတွက်ကို ရိုက်ထည့်ပေးပါ။</b>\n\n📦 အနည်းဆုံး: ${service.min}`, { parse_mode: 'HTML' });
  }
  
  // --- Order flow: Waiting for quantity ---
  else if (state && state.step === 'WAITING_QUANTITY') {
    const service = SERVICES[state.serviceKey];
    const qty = parseInt(text);
    if (isNaN(qty) || qty < service.min) {
      return bot.sendMessage(chatId, `❌ အနည်းဆုံး ${service.min} နှင့်အထက်သာ ရိုက်ထည့်ပါ။`);
    }
    if (qty > service.max) {
      return bot.sendMessage(chatId, `❌ အများဆုံး ${service.max} သာ ခွင့်ပြုပါသည်။`);
    }
    
    state.quantity = qty;
    state.costUSD = (qty / 1000) * service.price; // API price per 1000
    state.totalCost = Math.ceil(state.costUSD * EXCHANGE_RATE);
    state.time = service.time;
    state.step = 'CONFIRM';
    
    const confirmText = `📌 <b>${service.name}</b>\n\n` +
      `🔗 Link: ${state.link}\n` +
      `📊 အရေအတွက်: ${qty}\n` +
      `💰 ကုန်ကျငွေ: <b>${state.totalCost} MMK</b>\n` +
      `⏱️ ပျမ်းမျှကြာချိန်: ${service.time}\n\n` +
      `ဆက်သွားရန် အတည်ပြုပါ။`;
    
    bot.sendMessage(chatId, confirmText, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ ဆက်သွားရန်', callback_data: 'confirm_order' }],
          [{ text: '❌ ပယ်ဖျက်ရန်', callback_data: 'cancel_order' }]
        ]
      }
    });
  }
  
  // --- Deposit flow: Waiting for screenshot ---
  else if (state && state.step === 'WAITING_SCREENSHOT' && photo) {
    const fileId = photo[photo.length - 1].file_id;
    state.screenshotFileId = fileId;
    state.step = 'WAITING_TRANSACTION_ID';
    bot.sendMessage(chatId, '✅ Screenshot လက်ခံရရှိပါပြီ။\n\nကျေးဇူးပြု၍ <b>Transaction ID (နောက်ဆုံးဂဏန်း ၄လုံး)</b> ကို ရိုက်ထည့်ပေးပါ။', { parse_mode: 'HTML' });
  }
  
  // --- Deposit flow: Waiting for transaction ID ---
  else if (state && state.step === 'WAITING_TRANSACTION_ID' && text) {
    if (!/^\d{4}$/.test(text.trim())) {
      return bot.sendMessage(chatId, '❌ ကျေးဇူးပြု၍ နောက်ဆုံးဂဏန်း ၄လုံးကိုသာ ရိုက်ထည့်ပါ။');
    }
    state.transactionId = text.trim();
    state.step = 'WAITING_AMOUNT';
    bot.sendMessage(chatId, '✅ Transaction ID လက်ခံရရှိပါပြီ။\n\nကျေးဇူးပြု၍ <b>ငွေလွှဲထားသော ပမာဏ (MMK)</b> ကို ရိုက်ထည့်ပေးပါ။\nဥပမာ: 4500', { parse_mode: 'HTML' });
  }
  
  // --- Deposit flow: Waiting for amount ---
  else if (state && state.step === 'WAITING_AMOUNT' && text) {
    const amount = parseInt(text);
    if (isNaN(amount) || amount < 4500) {
      return bot.sendMessage(chatId, '❌ အနည်းဆုံး 4500 MMK နှင့်အထက်သာ ဖြည့်နိုင်ပါသည်။');
    }
    
    // Create deposit record
    const deposit = new Deposit({
      telegramId: userId,
      username: msg.from.username,
      screenshotFileId: state.screenshotFileId,
      transactionId: state.transactionId,
      amountMMK: amount,
      status: 'Pending'
    });
    await deposit.save();
    
    // Notify admin with approve command
    const adminMsg = `💰 <b>ငွေဖြည့်လျှောက်ထားချက် အသစ်</b>\n\n` +
      `👤 User: ${msg.from.first_name} ${msg.from.username ? '@' + msg.from.username : ''}\n` +
      `🆔 User ID: <code>${userId}</code>\n` +
      `💵 ပမာဏ: ${amount} MMK\n` +
      `🆔 Transaction ID: ${state.transactionId}\n` +
      `📅 အချိန်: ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Yangon' })}\n\n` +
      `👉 /approve <code>${userId}</code> <code>${amount}</code>`;
    
    bot.sendPhoto(ADMIN_ID, state.screenshotFileId, {
      caption: adminMsg,
      parse_mode: 'HTML'
    });
    
    // Notify user
    bot.sendMessage(chatId, `✅ သင့်ငွေဖြည့်လွှာကို Admin ထံသို့ ပေးပို့ထားပါပြီ။\n\nအတည်ပြုချက် ရရှိပါက သင့်အကောင့်သို့ <b>${amount} MMK</b> ထည့်သွင်းပေးပါမည်။\nကျေးဇူးပြု၍ စောင့်ဆိုင်းပေးပါ။\nအကူအညီလိုအပ်ပါက admin - @Rowan_Elliss`, { parse_mode: 'HTML', ...mainKeyboard });
    
    userStates.delete(chatId);
  }
  
  // --- Order History: Waiting for order ID to check status ---
  else if (state && state.step === 'WAITING_ORDER_ID' && text) {
    const orderId = text.trim();
    // Validate order exists for this user
    const order = await Order.findOne({ orderId, telegramId: userId });
    if (!order) {
      return bot.sendMessage(chatId, '❌ ဤ Order ID ကို ရှာမတွေ့ပါ။ သင့် Order ID သေချာစွာ ရိုက်ထည့်ပါ။');
    }
    await showOrderStatus(chatId, orderId);
    userStates.delete(chatId);
  }
  
  // ---------- 4. Menu Commands (no state) ----------
  
  // --- Balance ---
  else if (text === '💰 လက်ကျန်ငွေစစ်ရန်') {
    const balance = user.balance || 0;
    bot.sendMessage(chatId, `💰 <b>သင့်လက်ကျန်ငွေ:</b> ${balance} MMK`, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '💸 ငွေဖြည့်ရန်', callback_data: 'deposit_now' }]]
      }
    });
  }
  
  // --- Deposit (trigger via button) handled in callback ---
  
  // --- Order History (Last 5 orders) ---
  else if (text === '📜 Order History') {
    const orders = await Order.find({ telegramId: userId }).sort({ createdAt: -1 }).limit(5);
    if (orders.length === 0) {
      return bot.sendMessage(chatId, '📭 သင့်တွင် မှာယူမှု မှတ်တမ်း မရှိသေးပါ။');
    }
    
    let histMsg = '<b>📜 သင်၏ နောက်ဆုံး Order ၅ ခု</b>\n\n';
    const inlineKeyboard = [];
    
    orders.forEach((o, idx) => {
      histMsg += `${idx+1}. 🆔 <code>${o.orderId}</code> - ${o.serviceName.split('[')[0]} - ${o.status}\n`;
      inlineKeyboard.push([{ text: `🔍 စစ်ဆေးရန် ${o.orderId}`, callback_data: `check_order_${o.orderId}` }]);
    });
    
    inlineKeyboard.push([{ text: '🔍 Order ID ရိုက်ထည့်ရန်', callback_data: 'order_history_search' }]);
    
    bot.sendMessage(chatId, histMsg, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: inlineKeyboard }
    });
  }
  
  // --- FAQ ---
  else if (text === 'Faq⁉️') {
    const faqText = `⁉️ <b>မကြာခဏမေးလေ့ရှိသော မေးခွန်းများ (FAQ)</b>\n\n` +
      `၁။ <b>LuLu Social Boost က ဘာတွေလုပ်ပေးတာလဲ?</b>\n` +
      `ကျွန်တော်တို့ Bot ဟာ Facebook, TikTok, YouTube, Telegram အစရှိတဲ့ Social Media Platform များအတွက် Likes, Views, Followers နှင့် အခြား ဝန်ဆောင်မှုများကို ဈေးနှုန်းချိုသာစွာဖြင့် အလိုအလျောက် တိုးမြှင့်ပေးတဲ့ Bot ဖြစ်ပါတယ်။\n\n` +
      `၂။ <b>ဝန်ဆောင်မှုတစ်ခုကို ဘယ်လိုမှာယူရမလဲ?</b>\n` +
      `Menu ထဲရှိ "📱 ရရှိနိုင်သော Service များ" ကို နှိပ်ပါ။\n` +
      `မိမိအသုံးပြုလိုသော Platform (ဥပမာ - TikTok) ကို ရွေးချယ်ပါ။\n` +
      `ဝန်ဆောင်မှုအမျိုးအစား (ဥပမာ - Likes) ကို ရွေးချယ်ပါ။\n` +
      `မှန်ကန်သော Link ကို ပေးပို့ပြီး တိုးမြှင့်လိုသော အရေအတွက် ကို ရိုက်ထည့်ပါ။\n` +
      `ကုန်ကျငွေကို စစ်ဆေးပြီး "ဆက်သွားရန် ✅" ကို နှိပ်ရုံပါပဲ။\n\n` +
      `၃။ <b>ငွေကို ဘယ်လိုဖြည့်ရမလဲ?</b>\n` +
      `"💸 ငွေဖြည့်ရန်" Button ကို နှိပ်ပြီး ဖော်ပြထားသော KBZ Pay သို့မဟုတ် Wave Pay နံပါတ်များသို့ ငွေလွှဲပါ။ ထို့နောက် Screenshot နှင့် Transaction ID ကို Bot ထံ ပေးပို့ရပါမယ်။ Admin မှ အတည်ပြုပြီးသည်နှင့် သင့်အကောင့်ထဲသို့ ငွေရောက်ရှိလာပါမည်။\n\n` +
      `၄။ <b>Order တင်ပြီးရင် ဘယ်လောက်ကြာမလဲ?</b>\n` +
      `Service တစ်ခုချင်းစီမှာ ပျှမ်းမျှကြာချိန် (Average Time) ဖော်ပြထားပါတယ်။ များသောအားဖြင့် မိနစ် ၂၀ မှ ၂၄ နာရီအတွင်း အပြီးဆောင်ရွက်ပေးပါတယ်။\n\n` +
      `၅။ <b>Link မှားပေးမိရင် ဘယ်လိုလုပ်ရမလဲ?</b>\n` +
      `Order မတင်ခင် Link မှန်/မမှန်ကို Bot က စစ်ဆေးပေးမှာဖြစ်ပါတယ်။ အကယ်၍ Order တင်ပြီးမှ Link မှားနေသည်ဟု သိရှိပါက အမြန်ဆုံး Admin (@Rowan_Elliss) ထံ ဆက်သွယ်ပေးပါ။ (Order စတင်လုပ်ဆောင်နေပြီဆိုပါက ပြန်ဖျက်၍ မရနိုင်ပါ)\n\n` +
      `၆။ <b>ငွေလွှဲတဲ့အခါ ဘာတွေသတိထားရမလဲ?</b>\n` +
      `• KBZ Pay Note တွင် Dollar, USDT, Service အစရှိသော စာသားများ လုံးဝ (လုံးဝ) မရေးရပါ။\n` +
      `• Screenshot သည် ရှင်းလင်းပြတ်သားပြီး Transaction ID ပါဝင်ရပါမည်။\n\n` +
      `💡 <b>အကူအညီလိုအပ်ပါက:</b> @Rowan_Elliss`;
    
    bot.sendMessage(chatId, faqText, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 နောက်သို့', callback_data: 'faq_back' }]]
      }
    });
  }
  
  // --- Admin Commands (only owner) ---
  else if (text && text.startsWith('/') && isAdmin(userId)) {
    await handleAdminCommand(msg);
  }
});

// ---------- 5. Admin Command Handler ----------
async function handleAdminCommand(msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const parts = text.split(' ');
  const cmd = parts[0].toLowerCase();

  // --- /approve user_id amount ---
  if (cmd === '/approve' && parts.length === 3) {
    const targetId = parseInt(parts[1]);
    const amount = parseInt(parts[2]);
    if (isNaN(targetId) || isNaN(amount)) return bot.sendMessage(chatId, '❌ ပုံစံမှားနေသည်။ /approve user_id amount');
    
    const targetUser = await User.findOne({ telegramId: targetId });
    if (!targetUser) return bot.sendMessage(chatId, '❌ User ID ရှာမတွေ့ပါ။');
    
    targetUser.balance += amount;
    await targetUser.save();
    
    // Update deposit record if exists (optional)
    await Deposit.findOneAndUpdate(
      { telegramId: targetId, amountMMK: amount, status: 'Pending' },
      { status: 'Approved' },
      { sort: { createdAt: -1 } }
    );
    
    bot.sendMessage(chatId, `✅ User <code>${targetId}</code> အကောင့်ထဲသို့ ${amount} MMK ထည့်ပြီးပါပြီ။\nလက်ကျန်: ${targetUser.balance} MMK`, { parse_mode: 'HTML' });
    
    // Notify user
    bot.sendMessage(targetId, `✅ သင့်အကောင့်သို့ ${amount} MMK ဖြည့်သွင်းပြီးပါပြီ။\nလက်ကျန်: ${targetUser.balance} MMK`, mainKeyboard);
  }
  
  // --- /ban user_id ---
  else if (cmd === '/ban' && parts.length === 2) {
    const targetId = parseInt(parts[1]);
    const targetUser = await User.findOne({ telegramId: targetId });
    if (!targetUser) return bot.sendMessage(chatId, '❌ User ID ရှာမတွေ့ပါ။');
    targetUser.isBanned = true;
    await targetUser.save();
    bot.sendMessage(chatId, `⛔ User <code>${targetId}</code> ကို Ban လိုက်ပါပြီ။`, { parse_mode: 'HTML' });
  }
  
  // --- /unban user_id ---
  else if (cmd === '/unban' && parts.length === 2) {
    const targetId = parseInt(parts[1]);
    const targetUser = await User.findOne({ telegramId: targetId });
    if (!targetUser) return bot.sendMessage(chatId, '❌ User ID ရှာမတွေ့ပါ။');
    targetUser.isBanned = false;
    await targetUser.save();
    bot.sendMessage(chatId, `✅ User <code>${targetId}</code> ကို Unban လိုက်ပါပြီ။`, { parse_mode: 'HTML' });
  }
  
  // --- /setbalance user_id amount ---
  else if (cmd === '/setbalance' && parts.length === 3) {
    const targetId = parseInt(parts[1]);
    const amount = parseInt(parts[2]);
    if (isNaN(targetId) || isNaN(amount)) return;
    const targetUser = await User.findOne({ telegramId: targetId });
    if (!targetUser) return bot.sendMessage(chatId, '❌ User ID ရှာမတွေ့ပါ။');
    targetUser.balance = amount;
    await targetUser.save();
    bot.sendMessage(chatId, `✅ User <code>${targetId}</code> လက်ကျန်ကို ${amount} MMK သို့ သတ်မှတ်ပြီးပါပြီ။`, { parse_mode: 'HTML' });
  }
  
  // --- /stats ---
  else if (cmd === '/stats') {
    const totalUsers = await User.countDocuments();
    const totalOrders = await Order.countDocuments();
    const totalSpent = await Order.aggregate([{ $group: { _id: null, total: { $sum: '$costMMK' } } }]);
    const today = new Date(); today.setHours(0,0,0,0);
    const todayOrders = await Order.countDocuments({ createdAt: { $gte: today } });
    const todayRevenue = await Order.aggregate([
      { $match: { createdAt: { $gte: today } } },
      { $group: { _id: null, total: { $sum: '$costMMK' } } }
    ]);
    
    const statsMsg = `📊 <b>Bot စာရင်းချုပ်</b>\n\n` +
      `👥 စုစုပေါင်းအသုံးပြုသူ: ${totalUsers}\n` +
      `📦 စုစုပေါင်း Order: ${totalOrders}\n` +
      `💰 စုစုပေါင်းရောင်းရငွေ: ${totalSpent[0]?.total || 0} MMK\n` +
      `📅 ယနေ့ Order အရေအတွက်: ${todayOrders}\n` +
      `💵 ယနေ့ရောင်းရငွေ: ${todayRevenue[0]?.total || 0} MMK`;
    
    bot.sendMessage(chatId, statsMsg, { parse_mode: 'HTML' });
  }
  
  // --- /broadcast message ---
  else if (cmd === '/broadcast' && parts.length >= 2) {
    const broadcastMsg = text.substring('/broadcast'.length).trim();
    if (!broadcastMsg) return;
    
    const users = await User.find({ isBanned: false }).select('telegramId');
    let sent = 0, failed = 0;
    for (const u of users) {
      try {
        await bot.sendMessage(u.telegramId, `📢 <b>Admin မှ သတင်းပေးပို့ချက်</b>\n\n${broadcastMsg}`, { parse_mode: 'HTML' });
        sent++;
      } catch (e) {
        failed++;
      }
      // delay to avoid flood
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    bot.sendMessage(chatId, `✅ Broadcast ပို့ပြီးပါပြီ။\n📨 ပို့ရန် အောင်မြင်: ${sent}\n❌ မအောင်မြင်: ${failed}`);
  }
  
  // --- /admin help ---
  else if (cmd === '/admin') {
    const help = `<b>Admin Commands</b>\n\n` +
      `/approve [user_id] [amount] - ငွေဖြည့်အတည်ပြုရန်\n` +
      `/ban [user_id] - User ပိတ်ရန်\n` +
      `/unban [user_id] - User ပြန်ဖွင့်ရန်\n` +
      `/setbalance [user_id] [amount] - လက်ကျန်ပြင်ရန်\n` +
      `/stats - စာရင်းချုပ်ကြည့်ရန်\n` +
      `/broadcast [message] - အသုံးပြုသူအားလုံးကို စာပို့ရန်\n` +
      `/admin - ဤအကူညီစာရင်း`;
    bot.sendMessage(chatId, help, { parse_mode: 'HTML' });
  }
}

// ---------- 6. Order Status & Cancel Functions ----------
async function showOrderStatus(chatId, orderId, editMsgId = null) {
  const order = await Order.findOne({ orderId });
  if (!order) {
    return bot.sendMessage(chatId, '❌ Order ID ရှာမတွေ့ပါ။');
  }
  
  const apiRes = await callSmmApi({
    action: 'status',
    order: orderId
  });
  
  let statusText, statusEmoji;
  const apiStatus = apiRes.orderStatus || 'Pending';
  order.apiStatus = apiStatus;
  
  // Map status to Burmese
  if (apiStatus.includes('Pending') || apiStatus.includes('In progress')) {
    statusText = 'လုပ်ဆောင်နေဆဲ ⏳';
    statusEmoji = '⏳';
    order.status = 'Processing';
  } else if (apiStatus.includes('Completed')) {
    statusText = 'လုပ်ဆောင်ပြီး ✅';
    statusEmoji = '✅';
    order.status = 'Completed';
  } else if (apiStatus.includes('Partial') || apiStatus.includes('Cancel')) {
    statusText = 'တစ်စိတ်တစ်ပိုင်းပြီးစီး/ပယ်ဖျက်လိုက်သည် ❌';
    statusEmoji = '❌';
    order.status = 'Cancelled';
  } else {
    statusText = apiStatus;
    statusEmoji = '❓';
    order.status = apiStatus;
  }
  await order.save();
  
  const msg = `🆔 <b>Order ID:</b> <code>${orderId}</code>\n` +
    `📌 ဝန်ဆောင်မှု: ${order.serviceName}\n` +
    `🔗 Link: ${order.link}\n` +
    `📊 အရေအတွက်: ${order.quantity}\n` +
    `💰 ကုန်ကျငွေ: ${order.costMMK} MMK\n` +
    `📅 မှာယူချိန်: ${order.createdAt.toLocaleString('en-GB', { timeZone: 'Asia/Yangon' })}\n` +
    `📌 အခြေအနေ: ${statusText}\n`;
  
  const inlineKeyboard = [];
  // Only show cancel button if status is Pending (API status exactly "Pending")
  if (apiStatus && apiStatus.toLowerCase() === 'pending') {
    inlineKeyboard.push([{ text: '❌ Cancel Order', callback_data: `cancel_api_${orderId}` }]);
  }
  
  if (editMsgId) {
    bot.editMessageText(msg, {
      chat_id: chatId,
      message_id: editMsgId,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: inlineKeyboard }
    }).catch(() => {});
  } else {
    bot.sendMessage(chatId, msg, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: inlineKeyboard }
    });
  }
}

async function cancelOrder(chatId, orderId, query = null) {
  const order = await Order.findOne({ orderId, telegramId: chatId });
  if (!order) {
    return bot.answerCallbackQuery(query.id, { text: 'Order ကို ရှာမတွေ့ပါ။', show_alert: true });
  }
  
  // Check current status from API again
  const apiRes = await callSmmApi({ action: 'status', order: orderId });
  if (apiRes.orderStatus && apiRes.orderStatus.toLowerCase() !== 'pending') {
    return bot.answerCallbackQuery(query.id, { text: 'ဤ Order သည် စတင်လုပ်ဆောင်နေပြီဖြစ်၍ ပယ်ဖျက်၍မရပါ။', show_alert: true });
  }
  
  // Call cancel API
  const cancelRes = await callSmmApi({ action: 'cancel', order: orderId });
  if (cancelRes.status && cancelRes.status.toString().toLowerCase() === 'success') {
    // Refund user
    const user = await User.findOne({ telegramId: chatId });
    if (user) {
      user.balance += order.costMMK;
      await user.save();
    }
    order.status = 'Cancelled';
    await order.save();
    
    bot.sendMessage(chatId, `✅ သင်သည် Order ID <code>${orderId}</code> ကို ပယ်ဖျက်လိုက်ပါသဖြင့် သင့်အကောင့်ထဲသို့ ${order.costMMK} MMK ပြန်လည်ပို့ဆောင်ပေးထားပါသည်။`, { parse_mode: 'HTML' });
    
    if (query) bot.answerCallbackQuery(query.id, { text: 'Order ပယ်ဖျက်ပြီး ငွေပြန်အမ်းပြီးပါပြီ။', show_alert: false });
  } else {
    bot.answerCallbackQuery(query.id, { text: 'ပယ်ဖျက်၍မရပါ။ API အမှား။', show_alert: true });
  }
}

// ---------- 7. Error Handling & Graceful Shutdown ----------
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

console.log('🤖 LuLu Social Boost Bot started successfully!');