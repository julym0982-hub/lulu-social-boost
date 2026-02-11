// ==========================================
// LuLu Social Boost - Fully Optimized Version
// ==========================================

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const mongoose = require('mongoose');
const express = require('express');

// ================ ၁။ RENDER PORT SETUP ================
const app = express();
const PORT = process.env.PORT || 8000;

app.get('/', (req, res) => {
    res.send('Bot is running live and healthy!');
});

app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
});

// ================ ၂။ CONFIGURATION ================
const CONFIG = {
    TOKEN: '8330406067:AAHGxAdIZmj-ou1iu8rfVabtbbmmLC_oKvg',
    ADMIN_ID: 7072739469, 
    OWNER_USERNAME: 'Rowan_Elliss',
    
    API_URL: 'https://brothersmm.com/api',
    API_KEY: '72dd1d7b0ade683680631a027ff813d0a7d11b01',
    
    MONGO_URL: 'mongodb+srv://paingzinsoe:AGLMG7iArSBqPLdt@cluster0.dzaellc.mongodb.net/lulu_social_boost?retryWrites=true&w=majority',
    
    EXCHANGE_RATE: 4500,
    SPAM_COOLDOWN: 2000,
};

// ================ ၃။ DATABASE CONNECTION ================
mongoose.connect(CONFIG.MONGO_URL)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

const userSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    username: String,
    firstName: String,
    balance: { type: Number, default: 0 },
    isBanned: { type: Boolean, default: false },
    totalSpent: { type: Number, default: 0 }
});

const orderSchema = new mongoose.Schema({
    orderId: String,
    telegramId: Number,
    serviceName: String,
    link: String,
    quantity: Number,
    costMMK: Number,
    status: { type: String, default: 'Pending' },
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Order = mongoose.model('Order', orderSchema);

// ================ ၄။ SERVICES LIST ================
const SERVICES = {
    'tt_likes': { id: 87129, name: "TikTok Likes [HQ]", price: 0.2237, min: 10, time: "20 mins", regex: /tiktok\.com/ },
    'tt_views': { id: 87132, name: "TikTok Views", price: 0.0078, min: 100, time: "11 mins", regex: /tiktok\.com/ },
    'tt_shares': { id: 87089, name: "TikTok Shares", price: 0.0848, min: 10, time: "12 mins", regex: /tiktok\.com/ },
    'tt_saves': { id: 7090, name: "TikTok Saves", price: 0.015, min: 10, time: "26 mins", regex: /tiktok\.com/ },
    'tt_foll': { id: 87117, name: "TikTok Followers", price: 0.9188, min: 50, time: "30 mins", regex: /tiktok\.com/ },
    
    'fb_foll': { id: 86930, name: "FB Page/Profile Followers", price: 0.4298, min: 100, time: "31 mins", regex: /facebook\.com|fb\.watch/ },
    'fb_likes': { id: 87072, name: "FB Post Likes", price: 0.264, min: 10, time: "27 mins", regex: /facebook\.com|fb\.watch/ },
    'fb_love': { id: 86458, name: "FB Love ❤️", price: 0.1689, min: 10, time: "40 mins", regex: /facebook\.com/ },
    'fb_care': { id: 86459, name: "FB Care 🤗", price: 0.1689, min: 10, time: "28 mins", regex: /facebook\.com/ },
    'fb_haha': { id: 86461, name: "FB Haha 😂", price: 0.6457, min: 10, time: "Pending", regex: /facebook\.com/ },
    'fb_wow': { id: 86460, name: "FB Wow 😲", price: 0.6457, min: 10, time: "6 hours", regex: /facebook\.com/ },
    'fb_sad': { id: 86462, name: "FB Sad 😥", price: 0.6457, min: 10, time: "1 hour", regex: /facebook\.com/ },
    'fb_angry': { id: 86463, name: "FB Angry 🤬", price: 0.6457, min: 10, time: "47 mins", regex: /facebook\.com/ },

    'yt_subs': { id: 86560, name: "YouTube Subscribers", price: 22.7526, min: 100, time: "74 hours", regex: /youtube\.com|youtu\.be/ },
    'yt_views': { id: 86562, name: "YouTube Views HQ", price: 1.8732, min: 100, time: "5 hours", regex: /youtube\.com|youtu\.be/ },

    'tg_views': { id: 86620, name: "Telegram Post View", price: 0.0499, min: 10, time: "14 mins", regex: /t\.me/ },
    'tg_mem': { id: 86629, name: "Telegram Members", price: 0.948, min: 10, time: "31 mins", regex: /t\.me/ }
};

// ================ ၅။ HELPERS ================
const bot = new TelegramBot(CONFIG.TOKEN, { polling: true });
const userStates = new Map();
const spamFilter = new Map();

// Cloudflare Bypass Headers
async function callSmmApi(params) {
    try {
        params.key = CONFIG.API_KEY;
        const response = await axios.post(CONFIG.API_URL, params, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            },
            timeout: 15000
        });
        return response.data;
    } catch (error) {
        console.error('API Error:', error.message);
        return { error: 'API Connection Failed' };
    }
}

// ================ ၆။ KEYBOARDS ================
const MainKeyboard = {
    reply_markup: {
        keyboard: [
            ['📱 ရရှိနိုင်သော Service များ'],
            ['💰 လက်ကျန်ငွေစစ်ရန်', '💸 ငွေဖြည့်ရန်'],
            ['📜 Order History', 'Faq⁉️']
        ],
        resize_keyboard: true
    }
};

// ================ ၇။ BOT LOGIC ================

bot.onText(/\/start|🔙 နောက်ပြန်သွားရန်/, async (msg) => {
    const userId = msg.from.id;
    let user = await User.findOne({ telegramId: userId });
    if (!user) {
        user = await User.create({ telegramId: userId, username: msg.from.username, firstName: msg.from.first_name });
    }
    userStates.delete(userId);
    const welcome = `<b>မင်္ဂလာပါ ${user.firstName || 'User'}!</b>\nLuLu Social Boost မှ ကြိုဆိုပါတယ်။ ✨`;
    bot.sendMessage(userId, welcome, { parse_mode: 'HTML', ...MainKeyboard });
});

bot.onText(/📱 ရရှိနိုင်သော Service များ/, (msg) => {
    bot.sendMessage(msg.chat.id, "<b>📌 ဝန်ဆောင်မှုအမျိုးအစား ရွေးချယ်ပါ</b>", {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🎬 TikTok', callback_data: 'plat_tt' }, { text: '📘 Facebook', callback_data: 'plat_fb' }],
                [{ text: '📺 YouTube', callback_data: 'plat_yt' }, { text: '✈️ Telegram', callback_data: 'plat_tg' }]
            ]
        }
    });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith('plat_')) {
        let keyboard = [];
        let type = data.split('_')[1];
        if (type === 'tt') {
            keyboard = [[{ text: 'Like ❤️', callback_data: 'svc_tt_likes' }, { text: 'Views 👀', callback_data: 'svc_tt_views' }], [{ text: 'Followers 👤', callback_data: 'svc_tt_foll' }]];
        } else if (type === 'fb') {
            keyboard = [[{ text: 'Followers 👤', callback_data: 'svc_fb_foll' }, { text: 'Post Likes 👍', callback_data: 'svc_fb_likes' }]];
        } else {
            keyboard = [[{ text: 'Other Services', callback_data: 'plat_tt' }]];
        }
        bot.editMessageText("<b>အသေးစိတ် ဝန်ဆောင်မှုကို ရွေးချယ်ပါ:</b>", {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    if (data.startsWith('svc_')) {
        const key = data.replace('svc_', '');
        const service = SERVICES[key];
        userStates.set(chatId, { step: 'WAITING_LINK', serviceKey: key });
        bot.sendMessage(chatId, `<b>📌 ${service.name}</b>\n\n🔗 ကျေးဇူးပြု၍ Link ပေးပို့ပါ။`, { parse_mode: 'HTML' });
    }

    if (data === 'confirm_order') {
        const state = userStates.get(chatId);
        if (!state) return;
        
        const user = await User.findOne({ telegramId: chatId });
        if (user.balance < state.totalCost) return bot.sendMessage(chatId, "⚠️ လက်ကျန်ငွေ မလုံလောက်ပါ။");

        bot.editMessageText("⏳ Processing...", { chat_id: chatId, message_id: query.message.message_id });

        const apiRes = await callSmmApi({
            action: 'add', service: SERVICES[state.serviceKey].id, link: state.link, quantity: state.qty
        });

        if (apiRes.order) {
            user.balance -= state.totalCost;
            await user.save();
            await Order.create({
                orderId: apiRes.order, telegramId: chatId, serviceName: SERVICES[state.serviceKey].name,
                link: state.link, quantity: state.qty, costMMK: state.totalCost
            });
            bot.sendMessage(chatId, `✅ <b>Order အောင်မြင်သည်!</b>\n🆔 ID: <code>${apiRes.order}</code>\n💰 ကုန်ကျငွေ: ${state.totalCost} MMK`, { parse_mode: 'HTML', ...MainKeyboard });
        } else {
            bot.sendMessage(chatId, `❌ Error: ${apiRes.error || 'API Blocked by Provider'}`);
        }
        userStates.delete(chatId);
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const state = userStates.get(chatId);

    if (state && state.step === 'WAITING_LINK') {
        const service = SERVICES[state.serviceKey];
        if (!service.regex.test(text)) return bot.sendMessage(chatId, "❌ Link မှားယွင်းနေပါသည်။");
        state.link = text;
        state.step = 'WAITING_QTY';
        bot.sendMessage(chatId, `🔢 အရေအတွက် ရိုက်ထည့်ပါ (အနည်းဆုံး: ${service.min}):`);
    } 
    else if (state && state.step === 'WAITING_QTY') {
        const qty = parseInt(text);
        const service = SERVICES[state.serviceKey];
        if (isNaN(qty) || qty < service.min) return bot.sendMessage(chatId, `❌ အနည်းဆုံး ${service.min} ရိုက်ပါ။`);

        const cost = Math.ceil((qty / 1000) * service.price * CONFIG.EXCHANGE_RATE);
        state.qty = qty;
        state.totalCost = cost;
        state.step = 'CONFIRM';

        const summary = `<b>📋 Order အတည်ပြုရန်</b>\n\n🛒 Service: ${service.name}\n🔗 Link: ${state.link}\n📊 Qty: ${qty}\n💰 Cost: <b>${cost} MMK</b>`;
        bot.sendMessage(chatId, summary, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: '✅ Confirm', callback_data: 'confirm_order' }, { text: '❌ Cancel', callback_data: 'cancel_setup' }]]
            }
        });
    }
});

// Balance check
bot.onText(/💰 လက်ကျန်ငွေစစ်ရန်/, async (msg) => {
    const user = await User.findOne({ telegramId: msg.chat.id });
    bot.sendMessage(msg.chat.id, `💰 လက်ကျန်ငွေ: <b>${user.balance} MMK</b>`, { parse_mode: 'HTML' });
});

// Order History
bot.onText(/📜 Order History/, async (msg) => {
    const orders = await Order.find({ telegramId: msg.chat.id }).sort({ timestamp: -1 }).limit(5);
    if (orders.length === 0) return bot.sendMessage(msg.chat.id, "မှတ်တမ်းမရှိသေးပါ။");
    let txt = "<b>📜 သင်၏ နောက်ဆုံး Order များ</b>\n\n";
    orders.forEach(o => { txt += `🆔 <code>${o.orderId}</code> - ${o.status}\n`; });
    bot.sendMessage(msg.chat.id, txt, { parse_mode: 'HTML' });
});

console.log("🚀 Bot is running smoothly...");