require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { MongoClient } = require('mongodb');
const axios = require('axios');
const express = require('express');

// ================ ၁။ Configuration ================
const CONFIG = {
    TOKEN: process.env.BOT_TOKEN,
    ADMIN_ID: process.env.ADMIN_ID,
    MONGO_URL: process.env.MONGO_URL,
    API_URL: 'https://brothersmm.com/api', 
    API_KEY: '72dd1d7b0ade683680631a027ff813d0a7d11b01', // BrotherSMM API Key
    EXCHANGE_RATE: 4500, // 1 USD = 4500 MMK
};

const bot = new TelegramBot(CONFIG.TOKEN, { polling: true });
let usersCol;
const userStates = new Map();

// ================ ၂။ Database Connection ================
async function initDB() {
    try {
        const client = new MongoClient(CONFIG.MONGO_URL);
        await client.connect();
        usersCol = client.db('lulu_social_boost').collection('users');
        console.log("✅ MongoDB Connected Successfully!");
    } catch (e) {
        console.error("❌ DB Error: ", e);
    }
}

// ================ ၃။ Helper Functions ================
async function updateUserBalance(userId, amount) {
    if (!usersCol) return;
    await usersCol.updateOne(
        { telegram_id: userId.toString() }, 
        { $inc: { balance: amount } }
    );
}

async function getUserBalance(userId) {
    if (!usersCol) return 0;
    const user = await usersCol.findOne({ telegram_id: userId.toString() });
    return user ? user.balance : 0;
}

async function checkBan(userId) {
    if (!usersCol) return false;
    const user = await usersCol.findOne({ telegram_id: userId.toString() });
    return user ? user.is_banned : false;
}

// ================ ၄။ Services List (Documentation အရ ID များ) ================
const SERVICES = {
    // TikTok
    'tt_likes': { id: 87129, name: "TikTok Likes [HQ]", price: 0.2237, min: 10 },
    'tt_views': { id: 87132, name: "TikTok Views [1M/D]", price: 0.0078, min: 100 },
    'tt_shares': { id: 87089, name: "TikTok Shares", price: 0.0848, min: 10 },
    'tt_saves': { id: 7090, name: "TikTok Saves", price: 0.015, min: 10 },
    'tt_foll': { id: 87117, name: "TikTok Followers", price: 0.9188, min: 50 },

    // Facebook
    'fb_foll': { id: 86930, name: "FB Page/Profile Followers", price: 0.4298, min: 100 },
    'fb_likes': { id: 87072, name: "FB Post Likes", price: 0.264, min: 10 },
    'fb_love': { id: 86458, name: "FB Love ❤️", price: 0.1689, min: 10 },
    'fb_care': { id: 86459, name: "FB Care 🤗", price: 0.1689, min: 10 },
    'fb_haha': { id: 86461, name: "FB Haha 😂", price: 0.6457, min: 10 },
    'fb_wow': { id: 86460, name: "FB Wow 😲", price: 0.6457, min: 10 },
    'fb_sad': { id: 86462, name: "FB Sad 😥", price: 0.6457, min: 10 },
    'fb_angry': { id: 86463, name: "FB Angry 🤬", price: 0.6457, min: 10 },
    'fb_like_react': { id: 86457, name: "FB Like 👍", price: 0.1689, min: 10 },

    // YouTube
    'yt_subs': { id: 86560, name: "YouTube Subscribers", price: 22.7526, min: 100 },
    'yt_views': { id: 86562, name: "YouTube Views HQ", price: 1.8732, min: 100 },

    // Telegram
    'tg_views': { id: 86620, name: "Telegram Post View", price: 0.0499, min: 10 },
    'tg_mem': { id: 86629, name: "Telegram Members", price: 0.948, min: 10 }
};

// ================ ၅။ Keyboard Layouts ================
const mainKeyboard = {
    reply_markup: {
        keyboard: [['📱 ရရှိနိုင်သော Service များ'], ['💰 လက်ကျန်ငွေစစ်ရန်', '💸 ငွေဖြည့်ရန်']],
        resize_keyboard: true
    }
};

// ================ ၆။ Bot Commands ================

bot.onText(/\/start|🔙 နောက်ပြန်သွားရန်/, async (msg) => {
    const chatId = msg.chat.id;
    if (usersCol) {
        await usersCol.updateOne(
            { telegram_id: chatId.toString() },
            { $set: { username: msg.from.first_name }, $setOnInsert: { balance: 0, is_banned: false } },
            { upsert: true }
        );
    }
    userStates.delete(chatId);
    bot.sendMessage(chatId, `*LuLu Social Boost* မှ ကြိုဆိုပါတယ်ဗျာ။ ✨`, { parse_mode: 'Markdown', ...mainKeyboard });
});

bot.onText(/📱 ရရှိနိုင်သော Service များ/, (msg) => {
    bot.sendMessage(msg.chat.id, "📌 *ဝန်ဆောင်မှု Platform ရွေးချယ်ရန်*", {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🎬 TikTok', callback_data: 'group_tt' }, { text: '📘 Facebook', callback_data: 'group_fb' }],
                [{ text: '📺 YouTube', callback_data: 'group_yt' }, { text: '✈️ Telegram', callback_data: 'group_tg' }]
            ]
        }
    });
});

// ================ ၇။ Callback & Order Process (API Logic အသစ်ပါဝင်သည်) ================

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const msgId = query.message.message_id;

    if (data === 'main_menu') {
        bot.editMessageText("📌 *ဝန်ဆောင်မှု Platform ရွေးချယ်ရန်*", {
            chat_id: chatId, message_id: msgId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🎬 TikTok', callback_data: 'group_tt' }, { text: '📘 Facebook', callback_data: 'group_fb' }],
                    [{ text: '📺 YouTube', callback_data: 'group_yt' }, { text: '✈️ Telegram', callback_data: 'group_tg' }]
                ]
            }
        });
    }

    if (data.startsWith('group_')) {
        const platform = data.replace('group_', '');
        const items = [];
        if (platform === 'tt') items.push(['tt_likes', '❤️ Likes'], ['tt_views', '👁️ Views'], ['tt_shares', '🚀 Shares'], ['tt_foll', '👤 Followers']);
        if (platform === 'fb') items.push(['fb_foll', '👤 Followers'], ['fb_likes', '👍 Likes'], ['fb_love', '❤️ Love'], ['fb_like_react', '👍 Like React']);
        if (platform === 'yt') items.push(['yt_subs', '👤 Subscribers'], ['yt_views', '👁️ Views']);
        if (platform === 'tg') items.push(['tg_views', '👁️ Views'], ['tg_mem', '👤 Members']);

        const kb = items.map(i => [{ text: i[1], callback_data: 'order_' + i[0] }]);
        kb.push([{ text: '🔙 Back', callback_data: 'main_menu' }]);
        bot.editMessageText(`📂 ${platform.toUpperCase()} ဝန်ဆောင်မှုများ`, { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: kb } });
    }

    if (data.startsWith('order_')) {
        const key = data.replace('order_', '');
        userStates.set(chatId, { step: 'WAITING_LINK', serviceKey: key });
        bot.deleteMessage(chatId, msgId);
        bot.sendMessage(chatId, `🔗 Link ပို့ပေးပါခင်ဗျာ:`);
    }

    if (data === 'confirm_order') {
        const state = userStates.get(chatId);
        if (!state) return;
        const s = SERVICES[state.serviceKey];

        try {
            // BrotherSMM Documentation အတိုင်း Parameter များ
            const params = new URLSearchParams();
            params.append('apiKey', CONFIG.API_KEY);
            params.append('action', 'add');
            params.append('orderType', s.id);      // documentation အရ 'orderType'
            params.append('orderUrl', state.link); // documentation အရ 'orderUrl'
            params.append('orderQuantity', state.qty); // documentation အရ 'orderQuantity'

            // 403 Forbidden Error ကျော်ရန် Header များ
            const res = await axios.post(CONFIG.API_URL, params.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
                }
            });

            // success response မှာ 'orderID' ဖြစ်လို့ ပြင်ထားပါတယ်
            if (res.data.orderID) {
                await updateUserBalance(chatId, -state.cost);
                bot.sendMessage(chatId, `🎉 *Order Successful!*\n🆔 Order ID: \`${res.data.orderID}\`\n💰 Cost: ${state.cost} MMK\n👛 Balance: ${res.data.remaining_balance}$`, { parse_mode: 'Markdown', ...mainKeyboard });
                bot.sendMessage(CONFIG.ADMIN_ID, `✅ New Order: ${res.data.orderID} | User: ${chatId} | ${state.cost} MMK`);
            } else {
                throw new Error(res.data.error || "Panel Error");
            }
        } catch (err) {
            bot.sendMessage(chatId, `❌ Order မအောင်မြင်ပါ။ Error: ${err.message}`);
        }
        userStates.delete(chatId);
    }
    
    if (data === 'order_cancel') {
        userStates.delete(chatId);
        bot.deleteMessage(chatId, msgId);
        bot.sendMessage(chatId, "❌ မှာယူမှုကို ပယ်ဖျက်လိုက်ပါပြီ။", mainKeyboard);
    }
});

// ================ ၈။ Message Handling ================

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const state = userStates.get(chatId);

    if (!state || !text || text.startsWith('/')) return;

    if (state.step === 'WAITING_LINK') {
        state.link = text;
        state.step = 'WAITING_QTY';
        const s = SERVICES[state.serviceKey];
        bot.sendMessage(chatId, `အရေအတွက် ပို့ပေးပါ။ (အနည်းဆုံး ${s.min} ခု)`);
    } else if (state.step === 'WAITING_QTY') {
        const qty = parseInt(text);
        const s = SERVICES[state.serviceKey];
        if (isNaN(qty) || qty < s.min) return bot.sendMessage(chatId, `⚠️ အနည်းဆုံး ${s.min} ခု ဖြစ်ရပါမည်။`);

        const cost = Math.ceil((qty / 1000) * s.price * CONFIG.EXCHANGE_RATE);
        const balance = await getUserBalance(chatId);
        state.qty = qty;
        state.cost = cost;
        state.step = 'CONFIRMING';

        const summary = `🧾 *ORDER SUMMARY*\n🛒 Service: ${s.name}\n📊 Qty: ${qty}\n💰 Cost: ${cost} MMK\n👛 Your Balance: ${balance} MMK`;
        const buttons = balance >= cost ? [[{ text: '✅ အတည်ပြုမည်', callback_data: 'confirm_order' }]] : [[{ text: '❌ ငွေမလောက်ပါ', callback_data: 'order_cancel' }]];
        buttons.push([{ text: '❌ ပယ်ဖျက်မည်', callback_data: 'order_cancel' }]);

        bot.sendMessage(chatId, summary, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
    }
});

// Admin Commands (Approve)
bot.onText(/\/approve (\d+) (\d+)/, async (msg, match) => {
    if (msg.chat.id.toString() !== CONFIG.ADMIN_ID) return;
    await updateUserBalance(match[1], parseInt(match[2]));
    bot.sendMessage(match[1], `💰 Admin မှ ${match[2]} MMK ဖြည့်သွင်းပေးလိုက်ပါပြီ။`);
    bot.sendMessage(CONFIG.ADMIN_ID, `✅ Approved ${match[2]} for ${match[1]}`);
});

bot.onText(/💰 လက်ကျန်ငွေစစ်ရန်/, async (msg) => {
    const bal = await getUserBalance(msg.chat.id);
    bot.sendMessage(msg.chat.id, `💵 *လက်ကျန်ငွေ: ${bal} MMK*`, { parse_mode: 'Markdown' });
});

// ================ ၉။ Express Startup ================
const app = express();
app.get('/', (req, res) => res.send('Bot is Running!'));
app.listen(process.env.PORT || 10000, async () => {
    await initDB();
});