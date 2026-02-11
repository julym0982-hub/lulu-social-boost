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
    API_KEY: '72dd1d7b0ade683680631a027ff813d0a7d11b01', // သင့် API Key
    EXCHANGE_RATE: 4500
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
        console.log("✅ MongoDB Connected!");
    } catch (e) {
        console.error("❌ DB Error: ", e);
    }
}

// ================ ၃။ Helper Functions ================
async function updateUserBalance(userId, amount) {
    if (!usersCol) return;
    await usersCol.updateOne({ telegram_id: userId.toString() }, { $inc: { balance: amount } });
}

async function getUserBalance(userId) {
    if (!usersCol) return 0;
    const user = await usersCol.findOne({ telegram_id: userId.toString() });
    return user ? user.balance : 0;
}

// ================ ၄။ Services List (IDs မှန်အောင်ထည့်ထားသည်) ================
const SERVICES = {
    'tt_likes': { id: 87129, name: "TikTok Likes [HQ]", price: 0.2237, min: 10 },
    'tt_views': { id: 87132, name: "TikTok Views [1M/D]", price: 0.0078, min: 100 },
    'tt_shares': { id: 87089, name: "TikTok Shares", price: 0.0848, min: 10 },
    'tt_saves': { id: 7090, name: "TikTok Saves", price: 0.015, min: 10 },
    'tt_foll': { id: 87117, name: "TikTok Followers", price: 0.9188, min: 50 },
    'fb_foll': { id: 86930, name: "FB Page/Profile Followers", price: 0.4298, min: 100 },
    'fb_likes': { id: 87072, name: "FB Post Likes", price: 0.264, min: 10 },
    'fb_love': { id: 86458, name: "FB Love ❤️", price: 0.1689, min: 10 },
    'yt_subs': { id: 86560, name: "YouTube Subscribers", price: 22.7526, min: 100 },
    'tg_mem': { id: 86629, name: "Telegram Members", price: 0.948, min: 10 }
};

const mainKeyboard = {
    reply_markup: {
        keyboard: [['📱 ရရှိနိုင်သော Service များ'], ['💰 လက်ကျန်ငွေစစ်ရန်', '💸 ငွေဖြည့်ရန်']],
        resize_keyboard: true
    }
};

// ================ ၅။ Bot Logic ================

bot.onText(/\/start|🔙 နောက်ပြန်သွားရန်/, async (msg) => {
    const chatId = msg.chat.id;
    if (usersCol) {
        await usersCol.updateOne(
            { telegram_id: chatId.toString() },
            { $set: { username: msg.from.first_name }, $setOnInsert: { balance: 0 } },
            { upsert: true }
        );
    }
    userStates.delete(chatId);
    bot.sendMessage(chatId, `*LuLu Social Boost* မှ ကြိုဆိုပါတယ်။`, { parse_mode: 'Markdown', ...mainKeyboard });
});

bot.onText(/📱 ရရှိနိုင်သော Service များ/, (msg) => {
    bot.sendMessage(msg.chat.id, "📌 *Platform ရွေးချယ်ပါ*", {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🎬 TikTok', callback_data: 'group_tt' }, { text: '📘 Facebook', callback_data: 'group_fb' }],
                [{ text: '📺 YouTube', callback_data: 'group_yt' }, { text: '✈️ Telegram', callback_data: 'group_tg' }]
            ]
        }
    });
});

// ================ ၆။ 403 Error ကို ဖြေရှင်းထားသော API Order အပိုင်း ================

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const msgId = query.message.message_id;

    if (data.startsWith('group_')) {
        const platform = data.replace('group_', '');
        const items = [];
        if (platform === 'tt') items.push(['tt_likes', '❤️ Likes'], ['tt_views', '👁️ Views'], ['tt_foll', '👤 Followers']);
        if (platform === 'fb') items.push(['fb_foll', '👤 Followers'], ['fb_likes', '👍 Likes'], ['fb_love', '❤️ Love']);
        
        const kb = items.map(i => [{ text: i[1], callback_data: 'order_' + i[0] }]);
        kb.push([{ text: '🔙 Back', callback_data: 'main_menu' }]);
        bot.editMessageText(`📂 ${platform.toUpperCase()} ဝန်ဆောင်မှုများ`, { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: kb } });
    }

    if (data.startsWith('order_')) {
        const key = data.replace('order_', '');
        userStates.set(chatId, { step: 'WAITING_LINK', serviceKey: key });
        bot.deleteMessage(chatId, msgId);
        bot.sendMessage(chatId, `🔗 Link ပို့ပေးပါ:`);
    }

    if (data === 'confirm_order') {
        const state = userStates.get(chatId);
        if (!state) return;
        const s = SERVICES[state.serviceKey];

        try {
            // 🚀 403 Error မတက်စေရန် URLSearchParams ကို အသုံးပြုပါ
            const params = new URLSearchParams();
            params.append('apiKey', CONFIG.API_KEY);
            params.append('action', 'add');
            params.append('orderType', s.id);      
            params.append('orderUrl', state.link); 
            params.append('orderQuantity', state.qty);

            // 🚀 Header တွင် User-Agent ပါမှ Cloudflare က ပေးဝင်မှာပါ
            const res = await axios({
                method: 'post',
                url: CONFIG.API_URL,
                data: params.toString(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
                }
            });

            if (res.data && res.data.orderID) {
                await updateUserBalance(chatId, -state.cost);
                bot.sendMessage(chatId, `🎉 *Order Successful!*\n🆔 ID: \`${res.data.orderID}\`\n💰 Cost: ${state.cost} MMK`, { parse_mode: 'Markdown', ...mainKeyboard });
            } else {
                // BrotherSMM က error ပြန်ရင် (ဥပမာ Link မှားတာ)
                const errorMsg = res.data.error || JSON.stringify(res.data);
                throw new Error(errorMsg);
            }
        } catch (err) {
            console.error('API Error:', err.response ? err.response.data : err.message);
            bot.sendMessage(chatId, `❌ Order မအောင်မြင်ပါ။\nError: ${err.message}`);
        }
        userStates.delete(chatId);
    }
});

// ================ ၇။ User Interaction Logic ================

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const state = userStates.get(chatId);

    if (!state || !text || text.startsWith('/')) return;

    if (state.step === 'WAITING_LINK') {
        state.link = text;
        state.step = 'WAITING_QTY';
        bot.sendMessage(chatId, `အရေအတွက် ပို့ပေးပါ။ (အနည်းဆုံး ${SERVICES[state.serviceKey].min})`);
    } else if (state.step === 'WAITING_QTY') {
        const qty = parseInt(text);
        const s = SERVICES[state.serviceKey];
        if (isNaN(qty) || qty < s.min) return bot.sendMessage(chatId, `⚠️ အနည်းဆုံး ${s.min} ခု ဖြစ်ရပါမည်။`);

        const cost = Math.ceil((qty / 1000) * s.price * CONFIG.EXCHANGE_RATE);
        const balance = await getUserBalance(chatId);
        state.qty = qty;
        state.cost = cost;
        state.step = 'CONFIRMING';

        const buttons = balance >= cost ? [[{ text: '✅ အတည်ပြုမည်', callback_data: 'confirm_order' }]] : [[{ text: '❌ ငွေမလောက်ပါ', callback_data: 'order_cancel' }]];
        bot.sendMessage(chatId, `🧾 *Order Summary*\n💰 Cost: ${cost} MMK\n👛 Balance: ${balance} MMK`, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
        });
    }
});

// Startup
const app = express();
app.get('/', (req, res) => res.send('Bot is Live!'));
app.listen(process.env.PORT || 10000, async () => {
    await initDB();
});