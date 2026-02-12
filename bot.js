// ===================================================
// LuLu Social Boost - Vercel Serverless Version
// Webhook + MongoDB Caching | Complete & Fixed
// ===================================================

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

// -------------------- CONFIG --------------------
const CONFIG = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  ADMIN_ID: parseInt(process.env.ADMIN_ID),
  OWNER_USERNAME: 'Rowan_Elliss',
  API_URL: 'https://www.brothersmm.com/api',
  API_KEY: process.env.API_KEY,
  MONGO_URL: process.env.MONGO_URL,
  WEBHOOK_URL: process.env.WEBHOOK_URL,
  EXCHANGE_RATE: 4500,
  SPAM_COOLDOWN: 2000,
  MIN_TOPUP: 4500,
  PORT: process.env.PORT || 3000
};

// -------------------- MONGOOSE CACHING (Vercel) --------------------
let cachedDb = null;
async function connectDB() {
  if (cachedDb) return cachedDb;
  try {
    const conn = await mongoose.connect(CONFIG.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000
    });
    cachedDb = conn;
    console.log('✅ MongoDB connected');
    return conn;
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    throw err;
  }
}

// -------------------- SCHEMAS --------------------
const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  username: String,
  firstName: String,
  balance: { type: Number, default: 0 },
  isBanned: { type: Boolean, default: false },
  totalSpent: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  telegramId: Number,
  serviceId: String,
  serviceName: String,
  link: String,
  quantity: Number,
  costUSD: Number,
  costMMK: Number,
  status: { type: String, default: 'Pending' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date
});

const topupSchema = new mongoose.Schema({
  userId: Number,
  username: String,
  amountMMK: Number,
  screenshotFileId: String,
  transactionId: String,
  status: { type: String, default: 'Pending' },
  adminMessageId: Number,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Order = mongoose.model('Order', orderSchema);
const Topup = mongoose.model('Topup', topupSchema);

// -------------------- SERVICES --------------------
const SERVICES = {
  // TikTok
  tt_likes:   { id: 87129, name: "TikTok Likes [HQ]", price: 0.2237, min: 10, max: 100000, time: "20 mins", regex: /tiktok\.com/, platform: 'tt' },
  tt_views:   { id: 87132, name: "TikTok Views", price: 0.0078, min: 100, max: 500000000, time: "11 mins", regex: /tiktok\.com/, platform: 'tt' },
  tt_shares:  { id: 87089, name: "TikTok Video Shares", price: 0.0848, min: 10, max: 10000000, time: "12 mins", regex: /tiktok\.com/, platform: 'tt' },
  tt_saves:   { id: 7090, name: "TikTok Saves", price: 0.015, min: 10, max: 2147482647, time: "26 mins", regex: /tiktok\.com/, platform: 'tt' },
  tt_foll:    { id: 87117, name: "TikTok Followers", price: 0.9188, min: 50, max: 100000, time: "30 mins", regex: /tiktok\.com/, platform: 'tt' },
  // Facebook
  fb_foll:    { id: 86930, name: "FB Page/Profile Followers", price: 0.4298, min: 100, max: 100000, time: "31 mins", regex: /facebook\.com|fb\.watch/, platform: 'fb' },
  fb_likes:   { id: 87072, name: "FB Post Likes", price: 0.264, min: 10, max: 1000000, time: "27 mins", regex: /facebook\.com|fb\.watch/, platform: 'fb' },
  fb_love:    { id: 86458, name: "FB Love ❤️", price: 0.1689, min: 10, max: 100000, time: "40 mins", regex: /facebook\.com|fb\.watch/, platform: 'fb' },
  fb_care:    { id: 86459, name: "FB Care 🤗", price: 0.1689, min: 10, max: 100000, time: "28 mins", regex: /facebook\.com|fb\.watch/, platform: 'fb' },
  fb_haha:    { id: 86461, name: "FB Haha 😂", price: 0.6457, min: 10, max: 500000, time: "Pending", regex: /facebook\.com|fb\.watch/, platform: 'fb' },
  fb_wow:     { id: 86460, name: "FB Wow 😲", price: 0.6457, min: 10, max: 500000, time: "6 hrs", regex: /facebook\.com|fb\.watch/, platform: 'fb' },
  fb_sad:     { id: 86462, name: "FB Sad 😥", price: 0.6457, min: 10, max: 500000, time: "1 hr", regex: /facebook\.com|fb\.watch/, platform: 'fb' },
  fb_angry:   { id: 86463, name: "FB Angry 🤬", price: 0.6457, min: 10, max: 500000, time: "47 mins", regex: /facebook\.com|fb\.watch/, platform: 'fb' },
  // YouTube
  yt_subs:    { id: 86560, name: "YouTube Subscribers", price: 22.7526, min: 100, max: 10000, time: "74 hrs", regex: /youtube\.com|youtu\.be/, platform: 'yt' },
  yt_views:   { id: 86562, name: "YouTube Views HQ", price: 1.8732, min: 100, max: 10000000, time: "5 hrs", regex: /youtube\.com|youtu\.be/, platform: 'yt' },
  // Telegram
  tg_views:   { id: 86620, name: "Telegram Post View", price: 0.0499, min: 10, max: 2147483647, time: "14 mins", regex: /t\.me/, platform: 'tg' },
  tg_mem:     { id: 86629, name: "Telegram Members", price: 0.948, min: 10, max: 100000, time: "31 mins", regex: /t\.me/, platform: 'tg' }
};

// -------------------- BOT SETUP (Webhook) --------------------
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: false });
const app = express();
app.use(express.json());

// ================ 🟢 CRITICAL: WEBHOOK ROUTE ================
app.post('/webhook', (req, res) => {
  try {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err);
    res.sendStatus(500);
  }
});
// ============================================================

// -------------------- SPAM PROTECTION --------------------
const userCooldown = new Map();
const userStates = new Map();

function isSpamming(chatId) {
  const now = Date.now();
  const last = userCooldown.get(chatId);
  if (last && now - last < CONFIG.SPAM_COOLDOWN) return true;
  userCooldown.set(chatId, now);
  return false;
}

// -------------------- SMM API CALL --------------------
async function callSmmApi(params) {
  try {
    const payload = { apiKey: CONFIG.API_KEY };
    if (params.action) payload.actionType = params.action;
    if (params.action === 'add') {
      payload.orderType = params.service;
      payload.orderUrl = params.link;
      payload.orderQuantity = params.quantity;
    }
    if (params.action === 'status' || params.action === 'cancel') {
      payload.orderID = params.orderID;
    }
    const res = await axios.post(CONFIG.API_URL, new URLSearchParams(payload).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000
    });
    return res.data;
  } catch (err) {
    console.error('SMM API Error:', err.message);
    return { error: err.message };
  }
}

// -------------------- DATABASE HELPERS --------------------
async function findOrCreateUser(telegramId, msg = null) {
  await connectDB();
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

// -------------------- KEYBOARDS --------------------
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

// ==================== BOT LOGIC ====================
// -------------------- /start --------------------
bot.onText(/\/start|🔙 နောက်ပြန်သွားရန်/, async (msg) => {
  if (isSpamming(msg.chat.id)) return;
  const user = await findOrCreateUser(msg.chat.id, msg);
  userStates.delete(msg.chat.id);
  bot.sendMessage(msg.chat.id,
    `မင်္ဂလာပါ ${user.firstName || 'User'}!\nLuLu Social Boost မှ ကြိုဆိုပါတယ်ဗျာ။ ✨\n\n✅ ငွေဖြည့်ခြင်း၊ ဝန်ဆောင်မှုများတောင်းခံခြင်းကို ဒီ Bot မှတစ်ဆင့် လုပ်ဆောင်နိုင်ပါပြီ။`,
    mainKeyboard
  );
});

// -------------------- Service Menu --------------------
bot.onText(/📱 ရရှိနိုင်သော Service များ/, (msg) => {
  if (isSpamming(msg.chat.id)) return;
  bot.sendMessage(msg.chat.id,
    '📌 မည်သည့် Platform အတွက် ဝန်ဆောင်မှု လိုအပ်ပါသလဲ?\n\nအောက်ပါ Platform များမှ ရွေးချယ်နိုင်ပါသည်:',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎬 TikTok', callback_data: 'platform_tt' }, { text: '📘 Facebook', callback_data: 'platform_fb' }],
          [{ text: '📺 YouTube', callback_data: 'platform_yt' }, { text: '✈️ Telegram', callback_data: 'platform_tg' }]
        ]
      }
    }
  );
});

// -------------------- Balance Check --------------------
bot.onText(/💰 လက်ကျန်ငွေစစ်ရန်/, async (msg) => {
  if (isSpamming(msg.chat.id)) return;
  const user = await findOrCreateUser(msg.chat.id);
  bot.sendMessage(msg.chat.id,
    `💰 လက်ကျန်ငွေ: <b>${user.balance.toLocaleString()} MMK</b>`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💸 ငွေဖြည့်ရန်', callback_data: 'topup' }]
        ]
      }
    }
  );
});

// -------------------- Topup Instructions --------------------
bot.onText(/💸 ငွေဖြည့်ရန်/, async (msg) => {
  if (isSpamming(msg.chat.id)) return;
  await sendTopupInstructions(msg.chat.id);
});

async function sendTopupInstructions(chatId) {
  const text = `💵 ငွေဖြည့်ရန် ညွှန်ကြားချက်များ

💰 1$ = 4500 MMK
(အနည်းဆုံး 1$ မှစဝယ်ပေးပါ)

🏦 KBZ Pay
09952537056
Name: Joe Eaindray Thwe

🏦 Wave Pay
09882494488
Name: Paing Zin Soe

✅ ငွေလွှဲပြီးပါက Screenshot နှင့် Transaction ID (နောက်ဆုံးဂဏန်း ၄လုံး) ပို့ပေးပါ။

⚠️ အရေးကြီးသတိပေးချက်
• KBZ Pay တွင် "Note" ၌ dollar နှင့်ပတ်သက်သော စာသားမထည့်ရ
• "payment" သို့မဟုတ် "for service" အစရှိသော စာသားသာထည့်ရန်
• ငွေလွှဲ Screenshot မှ လက်ခံသူအမည်၊ ပမာဏ၊ ရက်စွဲများ ရှင်းလင်းစွာမြင်ရပါစေ`;

  bot.sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📤 Screenshot ပို့ရန်', callback_data: 'topup_send_screenshot' }],
        [{ text: '❌ ပယ်ဖျက်ရန်', callback_data: 'topup_cancel' }]
      ]
    }
  });
}

// -------------------- FAQ --------------------
bot.onText(/Faq⁉️/, (msg) => {
  if (isSpamming(msg.chat.id)) return;
  const faq = `⁉️ မကြာခဏမေးလေ့ရှိသော မေးခွန်းများ (FAQ)

၁။ LuLu Social Boost က ဘာတွေလုပ်ပေးတာလဲ?
ကျွန်တော်တို့ Bot ဟာ Facebook, TikTok, YouTube, Telegram အစရှိတဲ့ Social Media Platform များအတွက် Likes, Views, Followers နှင့် အခြား ဝန်ဆောင်မှုများကို ဈေးနှုန်းချိုသာစွာဖြင့် အလိုအလျောက် တိုးမြှင့်ပေးတဲ့ Bot ဖြစ်ပါတယ်။

၂။ ဝန်ဆောင်မှုတစ်ခုကို ဘယ်လိုမှာယူရမလဲ?
Menu ထဲရှိ "📱 ရရှိနိုင်သော Service များ" ကို နှိပ်ပါ။
မိမိအသုံးပြုလိုသော Platform (ဥပမာ - TikTok) ကို ရွေးချယ်ပါ။
ဝန်ဆောင်မှုအမျိုးအစား (ဥပမာ - Likes) ကို ရွေးချယ်ပါ။
မှန်ကန်သော Link ကို ပေးပို့ပြီး တိုးမြှင့်လိုသော အရေအတွက် ကို ရိုက်ထည့်ပါ။
ကုန်ကျငွေကို စစ်ဆေးပြီး "ဆက်သွားရန် ✅" ကို နှိပ်ရုံပါပဲ။

၃။ ငွေကို ဘယ်လိုဖြည့်ရမလဲ?
"💸 ငွေဖြည့်ရန်" Button ကို နှိပ်ပြီး ဖော်ပြထားသော KBZ Pay သို့မဟုတ် Wave Pay နံပါတ်များသို့ ငွေလွှဲပါ။ ထို့နောက် Screenshot နှင့် Transaction ID ကို Bot ထံ ပေးပို့ရပါမယ်။ Admin မှ အတည်ပြုပြီးသည်နှင့် သင့်အကောင့်ထဲသို့ ငွေရောက်ရှိလာပါမည်။

၄။ Order တင်ပြီးရင် ဘယ်လောက်ကြာမလဲ?
Service တစ်ခုချင်းစီမှာ ပျှမ်းမျှကြာချိန် (Average Time) ဖော်ပြထားပါတယ်။ များသောအားဖြင့် မိနစ် ၂၀ မှ ၂၄ နာရီအတွင်း အပြီးဆောင်ရွက်ပေးပါတယ်။

၅။ Link မှားပေးမိရင် ဘယ်လိုလုပ်ရမလဲ?
Order မတင်ခင် Link မှန်/မမှန်ကို Bot က စစ်ဆေးပေးမှာဖြစ်ပါတယ်။ အကယ်၍ Order တင်ပြီးမှ Link မှားနေသည်ဟု သိရှိပါက အမြန်ဆုံး Admin (@${CONFIG.OWNER_USERNAME}) ထံ ဆက်သွယ်ပေးပါ။ (Order စတင်လုပ်ဆောင်နေပြီဆိုပါက ပြန်ဖျက်၍ မရနိုင်ပါ)။

၆။ ငွေလွှဲတဲ့အခါ ဘာတွေသတိထားရမလဲ?
KBZ Pay Note တွင် Dollar, USDT, Service အစရှိသော စာသားများ လုံးဝ (လုံးဝ) မရေးရပါ။
Screenshot သည် ရှင်းလင်းပြတ်သားပြီး Transaction ID ပါဝင်ရပါမည်။

💡 အကူအညီလိုအပ်ပါက: အထက်ပါအချက်အလက်များအပြင် အခြားသိလိုသည်များရှိပါက Admin - @${CONFIG.OWNER_USERNAME} ထံ တိုက်ရိုက်မေးမြန်းနိုင်ပါတယ်။`;

  bot.sendMessage(msg.chat.id, faq, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 နောက်ပြန်', callback_data: 'back_to_main' }]
      ]
    }
  });
});

// -------------------- Order History --------------------
bot.onText(/📜 Order History/, async (msg) => {
  if (isSpamming(msg.chat.id)) return;
  await connectDB();
  const orders = await Order.find({ telegramId: msg.chat.id })
    .sort({ createdAt: -1 })
    .limit(5);
  if (orders.length === 0) {
    return bot.sendMessage(msg.chat.id, 'မှတ်တမ်းမရှိသေးပါ။');
  }
  let text = '<b>📜 သင်၏ နောက်ဆုံး Order (၅) ခု</b>\n\n';
  orders.forEach(o => {
    text += `🆔 <code>${o.orderId}</code> - ${o.serviceName}\n`;
    text += `📊 ${o.quantity} | 💰 ${o.costMMK} MMK | ${o.status}\n\n`;
  });
  text += 'Order ID ရိုက်ထည့်ပါ → အခြေအနေအပြည့်အစုံကြည့်ရန် / ပယ်ဖျက်ရန် (ဆိုင်းငံ့အခြေအနေမှသာ)';
  bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML' });
});

// ==================== CALLBACK QUERY HANDLER ====================
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const msgId = query.message.message_id;

  if (isSpamming(chatId)) {
    return bot.answerCallbackQuery(query.id, { text: 'ကျေးဇူးပြု၍ ခဏစောင့်ပါ...', show_alert: false });
  }

  // ----- Platform Selection -----
  if (data.startsWith('platform_')) {
    const platform = data.split('_')[1];
    let inlineKeyboard = [];

    if (platform === 'tt') {
      inlineKeyboard = [
        [{ text: 'Like ❤️', callback_data: 'svc_tt_likes' }, { text: 'Views 👀', callback_data: 'svc_tt_views' }],
        [{ text: 'Share 📍', callback_data: 'svc_tt_shares' }, { text: 'Save 💾', callback_data: 'svc_tt_saves' }],
        [{ text: 'Followers 👤', callback_data: 'svc_tt_foll' }],
        [{ text: '🔙 နောက်သို့', callback_data: 'back_to_platforms' }]
      ];
    } else if (platform === 'fb') {
      inlineKeyboard = [
        [{ text: 'Page/Profile Followers 👥', callback_data: 'svc_fb_foll' }],
        [{ text: 'Post Likes 👍', callback_data: 'svc_fb_likes' }],
        [{ text: 'Reactions 😍😡😢', callback_data: 'fb_reactions' }],
        [{ text: '🔙 နောက်သို့', callback_data: 'back_to_platforms' }]
      ];
    } else if (platform === 'yt') {
      inlineKeyboard = [
        [{ text: 'Subscribers 📈', callback_data: 'svc_yt_subs' }],
        [{ text: 'Views 👀', callback_data: 'svc_yt_views' }],
        [{ text: '🔙 နောက်သို့', callback_data: 'back_to_platforms' }]
      ];
    } else if (platform === 'tg') {
      inlineKeyboard = [
        [{ text: 'Post Views 📨', callback_data: 'svc_tg_views' }],
        [{ text: 'Members 👥', callback_data: 'svc_tg_mem' }],
        [{ text: '🔙 နောက်သို့', callback_data: 'back_to_platforms' }]
      ];
    }

    bot.editMessageText('ကျေးဇူးပြု၍ ဝန်ဆောင်မှုကို ရွေးချယ်ပါ:', {
      chat_id: chatId,
      message_id: msgId,
      reply_markup: { inline_keyboard: inlineKeyboard }
    });
    bot.answerCallbackQuery(query.id);
    return;
  }

  // ----- Facebook Reactions -----
  if (data === 'fb_reactions') {
    const inlineKeyboard = [
      [{ text: 'Love ❤️', callback_data: 'svc_fb_love' }, { text: 'Care 🤗', callback_data: 'svc_fb_care' }],
      [{ text: 'Haha 😂', callback_data: 'svc_fb_haha' }, { text: 'Wow 😲', callback_data: 'svc_fb_wow' }],
      [{ text: 'Sad 😥', callback_data: 'svc_fb_sad' }, { text: 'Angry 🤬', callback_data: 'svc_fb_angry' }],
      [{ text: '🔙 နောက်သို့', callback_data: 'platform_fb' }]
    ];
    bot.editMessageText('Facebook Reaction ရွေးချယ်ပါ:', {
      chat_id: chatId,
      message_id: msgId,
      reply_markup: { inline_keyboard: inlineKeyboard }
    });
    bot.answerCallbackQuery(query.id);
    return;
  }

  // ----- Back to Platforms -----
  if (data === 'back_to_platforms') {
    bot.editMessageText('📌 မည်သည့် Platform အတွက် ဝန်ဆောင်မှု လိုအပ်ပါသလဲ?', {
      chat_id: chatId,
      message_id: msgId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎬 TikTok', callback_data: 'platform_tt' }, { text: '📘 Facebook', callback_data: 'platform_fb' }],
          [{ text: '📺 YouTube', callback_data: 'platform_yt' }, { text: '✈️ Telegram', callback_data: 'platform_tg' }]
        ]
      }
    });
    bot.answerCallbackQuery(query.id);
    return;
  }

  // ----- Back to Main Menu -----
  if (data === 'back_to_main') {
    bot.deleteMessage(chatId, msgId);
    const user = await findOrCreateUser(chatId);
    bot.sendMessage(chatId,
      `မင်္ဂလာပါ ${user.firstName || 'User'}!\nLuLu Social Boost မှ ကြိုဆိုပါတယ်ဗျာ။ ✨`,
      mainKeyboard
    );
    bot.answerCallbackQuery(query.id);
    return;
  }

  // ----- Service Selection (svc_*) -----
  if (data.startsWith('svc_')) {
    const serviceKey = data.substring(4);
    const service = SERVICES[serviceKey];
    if (!service) {
      bot.answerCallbackQuery(query.id, { text: 'Service not found', show_alert: true });
      return;
    }
    userStates.set(chatId, { step: 'WAITING_LINK', serviceKey });
    bot.sendMessage(chatId,
      `<b>📌 ${service.name}</b>\n⏱️ ပျမ်းမျှကြာချိန်: ${service.time}\n📦 အနည်းဆုံးအရေအတွက်: ${service.min}\n\n🔗 ကျေးဇူးပြု၍ သင့် ${serviceKey.split('_')[0].toUpperCase()} Link ကို ပေးပို့ပါ။`,
      { parse_mode: 'HTML' }
    );
    bot.answerCallbackQuery(query.id);
    return;
  }

  // ----- Order Confirmation -----
  if (data === 'confirm_order') {
    const state = userStates.get(chatId);
    if (!state || !state.serviceKey || !state.link || !state.qty) {
      bot.sendMessage(chatId, '❌ Order information missing. Please start over.');
      userStates.delete(chatId);
      return bot.answerCallbackQuery(query.id);
    }
    const user = await findOrCreateUser(chatId);
    if (user.isBanned) {
      return bot.sendMessage(chatId, '🚫 သင့်အကောင့်ကို ပိတ်ထားပါသည်။ Admin ကို ဆက်သွယ်ပါ။');
    }
    if (user.balance < state.totalCost) {
      bot.sendMessage(chatId,
        `⚠️ လက်ကျန်ငွေ မလုံလောက်ပါ။\n💰 လက်ကျန်: ${user.balance} MMK\n💸 လိုအပ်ငွေ: ${state.totalCost} MMK\n\nကျေးဇူးပြု၍ ငွေဖြည့်ပါ။`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '💸 ငွေဖြည့်ရန်', callback_data: 'topup' }]
            ]
          }
        }
      );
      return bot.answerCallbackQuery(query.id);
    }

    const service = SERVICES[state.serviceKey];
    const apiRes = await callSmmApi({
      action: 'add',
      service: service.id,
      link: state.link,
      quantity: state.qty
    });

    if (apiRes.error) {
      bot.sendMessage(chatId, `❌ Order မအောင်မြင်ပါ။\nError: ${apiRes.error}`);
      return bot.answerCallbackQuery(query.id);
    }

    if (apiRes.orderID) {
      user.balance -= state.totalCost;
      user.totalSpent += state.totalCost;
      await user.save();

      const order = new Order({
        orderId: apiRes.orderID.toString(),
        telegramId: chatId,
        serviceId: service.id,
        serviceName: service.name,
        link: state.link,
        quantity: state.qty,
        costUSD: (state.qty / 1000) * service.price,
        costMMK: state.totalCost,
        status: 'Pending'
      });
      await order.save();

      bot.sendMessage(chatId,
        `✅ Order အသစ်တင်ပြီးပါပြီ။\n🆔 Order ID: <code>${apiRes.orderID}</code>\n💰 ကုန်ကျငွေ: ${state.totalCost} MMK\n📊 လက်ကျန်: ${user.balance} MMK`,
        { parse_mode: 'HTML', reply_markup: mainKeyboard }
      );
      userStates.delete(chatId);
    } else {
      bot.sendMessage(chatId, '❌ Order တင်ရာတွင် ပြဿနာရှိသည်။ Admin ကို ဆက်သွယ်ပါ။');
    }
    bot.answerCallbackQuery(query.id);
    return;
  }

  // ----- Cancel Order (from status) -----
  if (data.startsWith('cancel_')) {
    const orderId = data.split('_')[1];
    await cancelOrder(chatId, orderId, query);
    return;
  }

  // ----- Cancel Setup (during order creation) -----
  if (data === 'cancel_setup') {
    userStates.delete(chatId);
    bot.deleteMessage(chatId, msgId);
    bot.answerCallbackQuery(query.id);
    return;
  }

  // ----- Topup Flow -----
  if (data === 'topup') {
    await sendTopupInstructions(chatId);
    bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'topup_send_screenshot') {
    userStates.set(chatId, { step: 'WAITING_TOPUP_SCREENSHOT' });
    bot.sendMessage(chatId, '✅ ကျေးဇူးပြု၍ ငွေလွှဲပြီးသား Screenshot ကို ပို့ပေးပါ။');
    bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'topup_cancel') {
    userStates.delete(chatId);
    bot.deleteMessage(chatId, msgId);
    bot.sendMessage(chatId, '❌ ငွေဖြည့်ခြင်းကို ပယ်ဖျက်လိုက်သည်။', mainKeyboard);
    bot.answerCallbackQuery(query.id);
    return;
  }

  bot.answerCallbackQuery(query.id);
});

// ==================== CANCEL ORDER FUNCTION ====================
async function cancelOrder(chatId, orderId, query = null) {
  try {
    await connectDB();
    const order = await Order.findOne({ orderId, telegramId: chatId });
    if (!order) {
      bot.sendMessage(chatId, '❌ Order not found.');
      return;
    }
    if (order.status !== 'Pending') {
      bot.sendMessage(chatId,
        `⚠️ Order ID <code>${orderId}</code> သည် လုပ်ဆောင်နေပြီဖြစ်၍ ပယ်ဖျက်၍ မရပါ။`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    const apiRes = await callSmmApi({ action: 'cancel', orderID: orderId });
    if (apiRes.error) {
      bot.sendMessage(chatId, `❌ Cancel failed: ${apiRes.error}`);
      return;
    }

    if (apiRes.status === 'Success' || apiRes.status === 'success') {
      const user = await User.findOne({ telegramId: chatId });
      user.balance += order.costMMK;
      await user.save();

      order.status = 'Cancelled';
      order.updatedAt = new Date();
      await order.save();

      bot.sendMessage(chatId,
        `✅ Order ID <code>${orderId}</code> ကို ပယ်ဖျက်လိုက်ပါသည်။\n💰 ငွေပြန်အမ်းငွေ: ${order.costMMK} MMK`,
        { parse_mode: 'HTML' }
      );
    } else {
      bot.sendMessage(chatId, '❌ Cancel request failed. API returned error.');
    }
  } catch (err) {
    console.error('Cancel error:', err);
    bot.sendMessage(chatId, '❌ Cancel လုပ်ရာတွင် အမှားရှိသည်။');
  }
}

// ==================== MESSAGE HANDLERS ====================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const state = userStates.get(chatId);

  // ----- Link input for order -----
  if (state && state.step === 'WAITING_LINK' && text) {
    const service = SERVICES[state.serviceKey];
    if (!service.regex.test(text)) {
      return bot.sendMessage(chatId, '❌ Link မှားနေပါသည်။ ကျေးဇူးပြု၍ မှန်ကန်သော Link ကို ပြန်လည်ပေးပို့ပါ။');
    }
    state.link = text;
    state.step = 'WAITING_QTY';
    bot.sendMessage(chatId,
      `🔢 တိုးမြှင့်လိုသော အရေအတွက်ကို ရိုက်ထည့်ပေးပါ။\n📦 အနည်းဆုံး: ${service.min} | အများဆုံး: ${service.max.toLocaleString()}`
    );
    userStates.set(chatId, state);
    return;
  }

  // ----- Quantity input for order -----
  if (state && state.step === 'WAITING_QTY' && text) {
    const service = SERVICES[state.serviceKey];
    const qty = parseInt(text);
    if (isNaN(qty) || qty < service.min || qty > service.max) {
      return bot.sendMessage(chatId,
        `❌ အနည်းဆုံး ${service.min} နှင့် အများဆုံး ${service.max.toLocaleString()} ကြားသာ ရိုက်ထည့်ပါ။`
      );
    }

    const totalCost = Math.ceil((qty / 1000) * service.price * CONFIG.EXCHANGE_RATE);
    state.qty = qty;
    state.totalCost = totalCost;
    state.step = 'CONFIRM';

    const summary = `<b>📋 သင်၏ Order အချုပ်အခြာ</b>\n\n` +
      `🛒 Service: ${service.name}\n` +
      `🔗 Link: ${state.link}\n` +
      `📊 ပမာဏ: ${qty}\n` +
      `💰 ကုန်ကျငွေ: <b>${totalCost} MMK</b>\n` +
      `⏱️ ပျမ်းမျှကြာချိန်: ${service.time}\n\n` +
      `ဆက်သွားရန် ✅ ကိုနှိပ်ပါ။`;

    bot.sendMessage(chatId, summary, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ ဆက်သွားရန်', callback_data: 'confirm_order' },
           { text: '❌ ပယ်ဖျက်ရန်', callback_data: 'cancel_setup' }]
        ]
      }
    });
    userStates.set(chatId, state);
    return;
  }

  // ----- Order ID input (status check) -----
  if (text && /^\d{5,}$/.test(text)) {
    await connectDB();
    const order = await Order.findOne({ orderId: text, telegramId: chatId });
    if (order) {
      await handleOrderStatus(chatId, text);
      return;
    }
  }

  // ----- Screenshot upload for topup -----
  if (state && state.step === 'WAITING_TOPUP_SCREENSHOT' && msg.photo) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    state.screenshotFileId = fileId;
    state.step = 'WAITING_TOPUP_TRANS_ID';
    userStates.set(chatId, state);
    bot.sendMessage(chatId,
      '✅ Screenshot လက်ခံရရှိပါပြီ။\n\nကျေးဇူးပြု၍ *Transaction ID* (နောက်ဆုံးဂဏန်း ၄လုံး) ကို ရိုက်ထည့်ပေးပါ။',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // ----- Transaction ID input -----
  if (state && state.step === 'WAITING_TOPUP_TRANS_ID' && text) {
    if (!/^\d{4}$/.test(text)) {
      return bot.sendMessage(chatId, '❌ Transaction ID သည် နောက်ဆုံးဂဏန်း ၄လုံး ဖြစ်ရပါမည်။ ပြန်ရိုက်ပါ။');
    }
    state.transactionId = text;
    state.step = 'WAITING_TOPUP_AMOUNT';
    userStates.set(chatId, state);
    bot.sendMessage(chatId,
      '✅ Transaction ID လက်ခံရရှိပါပြီ။\n\nကျေးဇူးပြု၍ *ငွေလွှဲထားသော ပမာဏ (MMK)* ကို ရိုက်ထည့်ပေးပါ။\nဥပမာ: 4500',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // ----- Amount input for topup -----
  if (state && state.step === 'WAITING_TOPUP_AMOUNT' && text) {
    const amount = parseInt(text);
    if (isNaN(amount) || amount < CONFIG.MIN_TOPUP) {
      return bot.sendMessage(chatId, `❌ အနည်းဆုံး ${CONFIG.MIN_TOPUP} MMK မှ စတင်ဖြည့်နိုင်ပါသည်။`);
    }
    state.amountMMK = amount;
    const user = await findOrCreateUser(chatId);

    const topup = new Topup({
      userId: chatId,
      username: user.username,
      amountMMK: amount,
      screenshotFileId: state.screenshotFileId,
      transactionId: state.transactionId,
      status: 'Pending'
    });
    await topup.save();

    const caption = `💰 ငွေဖြည့်လျှောက်ထားချက်\n\n` +
      `👤 User: ${user.firstName || 'N/A'} (@${user.username || 'no_username'})\n` +
      `🆔 ID: <code>${chatId}</code>\n` +
      `💵 ပမာဏ: ${amount} MMK\n` +
      `🔢 Transaction ID: ${state.transactionId}\n` +
      `💰 လက်ကျန် (မဖြည့်မီ): ${user.balance} MMK\n\n` +
      `👉 အတည်ပြုရန်:\n<code>/approve ${chatId} ${amount}</code>\n` +
      `❌ ပယ်ဖျက်ရန်:\n<code>/reject ${chatId}</code>`;

    const adminMsg = await bot.sendPhoto(CONFIG.ADMIN_ID, state.screenshotFileId, {
      caption,
      parse_mode: 'HTML'
    });

    topup.adminMessageId = adminMsg.message_id;
    await topup.save();

    bot.sendMessage(chatId,
      `✅ သင့်ငွေဖြည့်လွှာကို Admin ထံသို့ ပေးပို့ထားပါပြီ။\n\nအတည်ပြုချက် ရရှိပါက သင့်အကောင့်သို့ *${amount} MMK* ထည့်သွင်းပေးပါမည်။\nကျေးဇူးပြု၍ စောင့်ဆိုင်းပေးပါ။\nအကူအညီလိုအပ်ပါက admin-@${CONFIG.OWNER_USERNAME} သို့ဆက်သွယ်ပေးပါ။`,
      { parse_mode: 'Markdown', reply_markup: mainKeyboard }
    );

    userStates.delete(chatId);
    return;
  }
});

// ==================== ORDER STATUS HANDLER ====================
async function handleOrderStatus(chatId, orderId) {
  try {
    await connectDB();
    const order = await Order.findOne({ orderId, telegramId: chatId });
    if (!order) {
      return bot.sendMessage(chatId, '❌ ဤ Order ID ကို ရှာမတွေ့ပါ။');
    }

    const apiRes = await callSmmApi({ action: 'status', orderID: orderId });
    if (apiRes.error) {
      return bot.sendMessage(chatId, `⚠️ API error: ${apiRes.error}`);
    }

    let statusText = '', statusEmoji = '';
    const apiStatus = apiRes.orderStatus || 'Pending';

    if (apiStatus.includes('Pending')) {
      statusText = 'လုပ်ဆောင်နေဆဲ ⏳';
      statusEmoji = '⏳';
      order.status = 'Pending';
    } else if (apiStatus.includes('Completed') || apiStatus.includes('Success')) {
      statusText = 'လုပ်ဆောင်ပြီး ✅';
      statusEmoji = '✅';
      order.status = 'Completed';
    } else if (apiStatus.includes('Cancelled') || apiStatus.includes('Cancel')) {
      statusText = 'ပယ်ဖျက်လိုက်သည် ❌';
      statusEmoji = '❌';
      order.status = 'Cancelled';
    } else if (apiStatus.includes('Partial')) {
      statusText = 'တစ်စိတ်တစ်ပိုင်းပြီးစီး ⚠️';
      statusEmoji = '⚠️';
      order.status = 'Partial';
    } else {
      statusText = apiStatus;
    }
    order.updatedAt = new Date();
    await order.save();

    let reply = `<b>Order ID: <code>${orderId}</code></b>\n`;
    reply += `🛒 ${order.serviceName}\n`;
    reply += `🔗 ${order.link}\n`;
    reply += `📊 ပမာဏ: ${order.quantity}\n`;
    reply += `💰 ကုန်ကျငွေ: ${order.costMMK} MMK\n`;
    reply += `📌 အခြေအနေ: ${statusEmoji} ${statusText}\n`;
    reply += `📅 မှာရက်စွဲ: ${new Date(order.createdAt).toLocaleString('my-MM')}\n`;

    const keyboard = [];
    if (order.status === 'Pending') {
      keyboard.push([{ text: '❌ Cancel Order', callback_data: `cancel_${orderId}` }]);
    }

    bot.sendMessage(chatId, reply, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (err) {
    console.error('Order status error:', err);
    bot.sendMessage(chatId, '❌ Order status ရယူရန် မအောင်မြင်ပါ။');
  }
}

// ==================== ADMIN COMMANDS ====================
bot.onText(/^\/approve (\d+) (\d+)$/, async (msg, match) => {
  if (msg.chat.id !== CONFIG.ADMIN_ID) return;
  const userId = parseInt(match[1]), amount = parseInt(match[2]);
  await connectDB();
  const user = await User.findOne({ telegramId: userId });
  if (!user) return bot.sendMessage(msg.chat.id, '❌ User not found.');
  user.balance += amount;
  await user.save();
  await Topup.findOneAndUpdate(
    { userId, amountMMK: amount, status: 'Pending' },
    { status: 'Approved' }
  );
  bot.sendMessage(userId, `✅ သင့်အကောင့်သို့ ${amount} MMK ထည့်သွင်းပြီးပါပြီ။\n💰 လက်ကျန်: ${user.balance} MMK`, mainKeyboard);
  bot.sendMessage(msg.chat.id, `✅ Approved: ${amount} MMK added to user ${userId}.`);
});

bot.onText(/^\/reject (\d+)$/, async (msg, match) => {
  if (msg.chat.id !== CONFIG.ADMIN_ID) return;
  const userId = parseInt(match[1]);
  await connectDB();
  const user = await User.findOne({ telegramId: userId });
  if (!user) return bot.sendMessage(msg.chat.id, '❌ User not found.');
  await Topup.findOneAndUpdate({ userId, status: 'Pending' }, { status: 'Rejected' });
  bot.sendMessage(userId, `❌ သင့်ငွေဖြည့်လွှာကို ပယ်ဖျက်လိုက်ပါသည်။\nအကူအညီအတွက် admin-@${CONFIG.OWNER_USERNAME} ကို ဆက်သွယ်ပါ။`, mainKeyboard);
  bot.sendMessage(msg.chat.id, `✅ Rejected: User ${userId}.`);
});

bot.onText(/^\/deduct (\d+) (\d+)$/, async (msg, match) => {
  if (msg.chat.id !== CONFIG.ADMIN_ID) return;
  const userId = parseInt(match[1]), amount = parseInt(match[2]);
  await connectDB();
  const user = await User.findOne({ telegramId: userId });
  if (!user) return bot.sendMessage(msg.chat.id, '❌ User not found.');
  if (user.balance < amount) {
    return bot.sendMessage(msg.chat.id, `❌ User balance is only ${user.balance} MMK. Cannot deduct ${amount} MMK.`);
  }
  user.balance -= amount;
  await user.save();
  bot.sendMessage(userId, `💰 သင့်အကောင့်မှ ${amount} MMK ကို ဖြတ်တောက်လိုက်ပါသည်။\nလက်ကျန်ငွေ: ${user.balance} MMK`, mainKeyboard);
  bot.sendMessage(msg.chat.id, `✅ Deducted ${amount} MMK from user ${userId}. New balance: ${user.balance} MMK`);
});

bot.onText(/^\/ban (\d+)$/, async (msg, match) => {
  if (msg.chat.id !== CONFIG.ADMIN_ID) return;
  const userId = parseInt(match[1]);
  await connectDB();
  const user = await User.findOneAndUpdate({ telegramId: userId }, { isBanned: true });
  if (user) {
    bot.sendMessage(userId, '🚫 သင့်အကောင့်ကို ပိတ်ထားပါသည်။ Admin ကို ဆက်သွယ်ပါ။');
    bot.sendMessage(msg.chat.id, `✅ User ${userId} banned.`);
  } else bot.sendMessage(msg.chat.id, '❌ User not found.');
});

bot.onText(/^\/unban (\d+)$/, async (msg, match) => {
  if (msg.chat.id !== CONFIG.ADMIN_ID) return;
  const userId = parseInt(match[1]);
  await connectDB();
  const user = await User.findOneAndUpdate({ telegramId: userId }, { isBanned: false });
  if (user) {
    bot.sendMessage(userId, '✅ သင့်အကောင့်ကို ပြန်ဖွင့်ပေးလိုက်ပါပြီ။', mainKeyboard);
    bot.sendMessage(msg.chat.id, `✅ User ${userId} unbanned.`);
  } else bot.sendMessage(msg.chat.id, '❌ User not found.');
});

bot.onText(/^\/setbalance (\d+) (\d+)$/, async (msg, match) => {
  if (msg.chat.id !== CONFIG.ADMIN_ID) return;
  const userId = parseInt(match[1]), newBalance = parseInt(match[2]);
  await connectDB();
  const user = await User.findOneAndUpdate({ telegramId: userId }, { balance: newBalance }, { new: true });
  if (user) {
    bot.sendMessage(userId, `💰 Admin မှ သင့်လက်ကျန်ငွေကို ပြင်ဆင်လိုက်သည်။\nလက်ကျန်: ${newBalance} MMK`, mainKeyboard);
    bot.sendMessage(msg.chat.id, `✅ Balance set to ${newBalance} MMK for user ${userId}.`);
  } else bot.sendMessage(msg.chat.id, '❌ User not found.');
});

bot.onText(/^\/broadcast (.+)/, async (msg, match) => {
  if (msg.chat.id !== CONFIG.ADMIN_ID) return;
  const message = match[1];
  await connectDB();
  const users = await User.find({}, 'telegramId');
  let success = 0, fail = 0;
  for (const user of users) {
    try {
      await bot.sendMessage(user.telegramId, `📢 Admin Message:\n\n${message}`, mainKeyboard);
      success++;
    } catch { fail++; }
  }
  bot.sendMessage(msg.chat.id, `✅ Broadcast completed.\n✅ Sent: ${success}\n❌ Failed: ${fail}`);
});

bot.onText(/^\/stats$/, async (msg) => {
  if (msg.chat.id !== CONFIG.ADMIN_ID) return;
  await connectDB();
  const totalUsers = await User.countDocuments();
  const totalOrders = await Order.countDocuments();
  const totalSpent = await Order.aggregate([{ $group: { _id: null, total: { $sum: '$costMMK' } } }]);
  const pendingTopups = await Topup.countDocuments({ status: 'Pending' });
  const apiBalance = await callSmmApi({ action: 'balance' });
  const stats = `📊 Bot Statistics\n\n` +
    `👥 Total Users: ${totalUsers}\n` +
    `📦 Total Orders: ${totalOrders}\n` +
    `💰 Total Spent (MMK): ${totalSpent[0]?.total.toLocaleString() || 0}\n` +
    `⏳ Pending Topups: ${pendingTopups}\n` +
    `💳 API Balance: ${apiBalance.balance || 'N/A'} ${apiBalance.currency || 'USD'}`;
  bot.sendMessage(msg.chat.id, stats);
});

bot.onText(/^\/admin$/, (msg) => {
  if (msg.chat.id !== CONFIG.ADMIN_ID) return;
  const help = `🔐 Admin Commands\n\n` +
    `/approve [user_id] [amount] - Approve topup\n` +
    `/reject [user_id] - Reject topup\n` +
    `/deduct [user_id] [amount] - ငွေဖြတ်ရန် (ဖျက်ရန်)\n` +
    `/ban [user_id] - Ban user\n` +
    `/unban [user_id] - Unban user\n` +
    `/setbalance [user_id] [amount] - Set balance\n` +
    `/broadcast [message] - Send to all users\n` +
    `/stats - View bot statistics`;
  bot.sendMessage(msg.chat.id, help);
});

// ==================== HEALTH CHECK ====================
app.get('/', (req, res) => res.send('LuLu Social Boost Bot is running.'));

// ==================== START SERVER ====================
app.listen(CONFIG.PORT, async () => {
  console.log(`🚀 Server running on port ${CONFIG.PORT}`);
  await connectDB();
  try {
    await bot.setWebHook(`${CONFIG.WEBHOOK_URL}`);
    console.log('✅ Webhook set to:', CONFIG.WEBHOOK_URL);
  } catch (err) {
    console.error('❌ Webhook setup failed:', err);
  }
});