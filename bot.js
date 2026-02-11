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
    API_URL: process.env.API_URL || 'https://brothersmm.com/api', // API URL မှန်အောင်စစ်ပါ
    API_KEY: process.env.API_KEY,
    EXCHANGE_RATE: 4500, // 1 USD = 4500 MMK
};

const bot = new TelegramBot(CONFIG.TOKEN, { polling: true }); // Polling true ထားပေးပါ
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

// ================ ၄။ Services List ================
const SERVICES = {
    // TikTok
    'tt_likes': { id: 87129, name: "TikTok Likes [HQ]", price: 0.2237, min: 10, time: "20 minutes" },
    'tt_views': { id: 87132, name: "TikTok Views [1M/D]", price: 0.0078, min: 100, time: "11 minutes" },
    'tt_shares': { id: 87089, name: "TikTok Shares", price: 0.0848, min: 10, time: "12 minutes" },
    'tt_saves': { id: 7090, name: "TikTok Saves", price: 0.015, min: 10, time: "26 minutes" },
    'tt_foll': { id: 87117, name: "TikTok Followers", price: 0.9188, min: 50, time: "30 minutes" },

    // Facebook
    'fb_foll': { id: 86930, name: "FB Page/Profile Followers", price: 0.4298, min: 100, time: "31 minutes" },
    'fb_likes': { id: 87072, name: "FB Post Likes", price: 0.264, min: 10, time: "27 minutes" },
    'fb_love': { id: 86458, name: "FB Love ❤️", price: 0.1689, min: 10, time: "40 minutes" },
    'fb_care': { id: 86459, name: "FB Care 🤗", price: 0.1689, min: 10, time: "28 minutes" },
    'fb_haha': { id: 86461, name: "FB Haha 😂", price: 0.6457, min: 10, time: "Pending" },
    'fb_wow': { id: 86460, name: "FB Wow 😲", price: 0.6457, min: 10, time: "6 hours" },
    'fb_sad': { id: 86462, name: "FB Sad 😥", price: 0.6457, min: 10, time: "1 hour" },
    'fb_angry': { id: 86463, name: "FB Angry 🤬", price: 0.6457, min: 10, time: "47 minutes" },

    // YouTube
    'yt_subs': { id: 86560, name: "YouTube Subscribers", price: 22.7526, min: 100, time: "74 hours" },
    'yt_views': { id: 86562, name: "YouTube Views HQ", price: 1.8732, min: 100, time: "5 hours" },

    // Telegram
    'tg_views': { id: 86620, name: "Telegram Post View", price: 0.0499, min: 10, time: "14 minutes" },
    'tg_mem': { id: 86629, name: "Telegram Members", price: 0.948, min: 10, time: "31 minutes" }
};

// ================ ၅။ Keyboard Layouts ================
const mainKeyboard = {
    reply_markup: {
        keyboard: [
            ['📱 ရရှိနိုင်သော Service များ'],
            ['💰 လက်ကျန်ငွေစစ်ရန်', '💸 ငွေဖြည့်ရန်']
        ],
        resize_keyboard: true
    }
};

const paymentKeyboard = {
    reply_markup: {
        keyboard: [
            ['📸 Screenshot ပို့ရန်'],
            ['🔙 နောက်ပြန်သွားရန်']
        ],
        resize_keyboard: true
    }
};

// ================ ၆။ Standard Commands ================

// Start Command
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
    bot.sendMessage(
        chatId,
        `*LuLu Social Boost* မှ ကြိုဆိုပါတယ်ဗျာ။ ✨\n\n✅ ငွေဖြည့်ခြင်း၊ ဝန်ဆောင်မှုများတောင်းခံခြင်းကို ဒီ Bot မှတစ်ဆင့် လုပ်ဆောင်နိုင်ပါပြီ။\n‼️အခက်အခဲများရှိပါက @Rowan_Elliss ကိုစာပို့ပေးပါခင်ဗျာ‼️`,
        { parse_mode: 'Markdown', ...mainKeyboard }
    );
});

// Admin Stats
bot.onText(/\/stats/, async (msg) => {
    if (msg.chat.id.toString() !== CONFIG.ADMIN_ID) return;

    try {
        if (!usersCol) return bot.sendMessage(msg.chat.id, "🗄 Database ချိတ်ဆက်မှု မရှိသေးပါ။");
        const userCount = await usersCol.countDocuments();
        const allUsers = await usersCol.find({}).toArray();
        const totalMMK = allUsers.reduce((sum, user) => sum + (user.balance || 0), 0);

        bot.sendMessage(msg.chat.id, `📊 *Statistics*\n\n👥 Users: ${userCount}\n💰 Balance: ${totalMMK.toLocaleString()} MMK\n💵 USD Value: ${(totalMMK / CONFIG.EXCHANGE_RATE).toFixed(2)} $`, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error(e);
    }
});

// Admin Manage Balance
bot.onText(/\/(approve|addfund|deduct|ban|unban) (\d+)(?: (\d+))?/, async (msg, match) => {
    if (msg.chat.id.toString() !== CONFIG.ADMIN_ID) return;
    const action = match[1];
    const targetId = match[2];
    const amount = parseInt(match[3]) || 0;

    if (action === 'approve' || action === 'addfund') {
        await updateUserBalance(targetId, amount);
        bot.sendMessage(targetId, `💰 Admin မှ ${amount} MMK ဖြည့်ပေးလိုက်ပါပြီ။`);
        bot.sendMessage(CONFIG.ADMIN_ID, `✅ Approved/Added ${amount} for ${targetId}`);
    } else if (action === 'deduct') {
        await updateUserBalance(targetId, -amount);
        bot.sendMessage(CONFIG.ADMIN_ID, `✅ Deducted ${amount} from ${targetId}`);
    } else if (action === 'ban') {
        await usersCol.updateOne({ telegram_id: targetId }, { $set: { is_banned: true } });
        bot.sendMessage(CONFIG.ADMIN_ID, `🚫 User ${targetId} Banned!`);
    } else if (action === 'unban') {
        await usersCol.updateOne({ telegram_id: targetId }, { $set: { is_banned: false } });
        bot.sendMessage(CONFIG.ADMIN_ID, `✅ User ${targetId} Unbanned!`);
    }
});

// ================ ၇။ Menu Triggers ================

bot.onText(/💸 ငွေဖြည့်ရန်/, (msg) => {
    const paymentInstructions = `
💎 *ငွေဖြည့်သွင်းရန် လမ်းညွှန်* 💎
➖➖➖➖➖➖➖➖➖➖
💵 *Exchange Rate:* 1 USD = ${CONFIG.EXCHANGE_RATE} MMK
(အနည်းဆုံး 1$ မှစ၍ ဖြည့်သွင်းနိုင်ပါသည်)

🏦 *KBZ Pay* (Direct)
┗ \`09952537056\`
┗ Name: Joe Eaindray Thwe

💰 *Wave Pay*
┗ \`09882494488\`
┗ Name: Paing Zin Soe

⚠️ *Note:* "Personal" သို့မဟုတ် "Pocket Money" ဟုသာ ရေးသားပါ။
📸 ငွေလွှဲပြီးပါက Screenshot နှင့် Transaction ID (နောက်ဆုံး ၄ လုံး) ပို့ပေးပါ။
`;
    bot.sendMessage(msg.chat.id, paymentInstructions, { parse_mode: 'Markdown', ...paymentKeyboard });
});

bot.onText(/📸 Screenshot ပို့ရန်/, (msg) => {
    userStates.set(msg.chat.id, { step: 'WAITING_SS' });
    bot.sendMessage(msg.chat.id, "ကျေးဇူးပြု၍ ငွေလွှဲထားသော Screenshot ကို ပို့ပေးပါခင်ဗျာ။ 👇");
});

bot.onText(/💰 လက်ကျန်ငွေစစ်ရန်/, async (msg) => {
    const bal = await getUserBalance(msg.chat.id);
    bot.sendMessage(msg.chat.id, `💵 *လက်ကျန်ငွေ: ${bal} MMK*\nဒေါ်လာတန်ဖိုး: ${(bal / CONFIG.EXCHANGE_RATE).toFixed(2)} $`, { parse_mode: 'Markdown' });
});

bot.onText(/📱 ရရှိနိုင်သော Service များ/, (msg) => {
    userStates.delete(msg.chat.id);
    bot.sendMessage(msg.chat.id, "📌 *ဝန်ဆောင်မှု Platform ရွေးချယ်ရန်*", {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🎬 TikTok', callback_data: 'group_tt' }, { text: '📘 Facebook', callback_data: 'group_fb' }],
                [{ text: '📺 YouTube', callback_data: 'group_yt' }, { text: '✈️ Telegram', callback_data: 'group_tg' }]
            ]
        }
    });
});

// ================ ၈။ Message & State Handler ================

bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const state = userStates.get(chatId);
    if (state && state.step === 'WAITING_SS') {
        userStates.set(chatId, { step: 'WAITING_TXID', photo: msg.photo[msg.photo.length - 1].file_id });
        bot.sendMessage(chatId, "✅ Screenshot ရပါပြီ။\n*Transaction ID* (နောက်ဆုံးဂဏန်း ၄လုံး) ကို ရိုက်ထည့်ပေးပါ။\nဥပမာ: 1234", { parse_mode: 'Markdown' });
    }
});

// ❌ အရင် Code မှာ ဒီနေရာမှာ ကော်မာ ပါနေလို့ Error တက်တာပါ၊ အခု ပြင်ထားပါပြီ ✅
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const state = userStates.get(chatId);

    if (!state || !text || text.startsWith('/')) return; // Ignore commands

    const isBanned = await checkBan(chatId);
    if (isBanned) return bot.sendMessage(chatId, "🚫 You are banned.");

    // 1. Transaction ID
    if (state.step === 'WAITING_TXID') {
        if (text.length !== 4 || isNaN(text)) {
            return bot.sendMessage(chatId, "❌ Transaction ID သည် ဂဏန်း ၄လုံး ဖြစ်ရပါမည်။");
        }
        state.txid = text;
        state.step = 'WAITING_AMOUNT';
        return bot.sendMessage(chatId, "✅ Transaction ID ရပါပြီ။\nငွေလွှဲထားသော ပမာဏ (MMK) ကို ရိုက်ထည့်ပေးပါ။\nဥပမာ: 4500");
    }

    // 2. Amount Check & Notify Admin
    if (state.step === 'WAITING_AMOUNT') {
        const amount = parseInt(text);
        if (isNaN(amount) || amount < CONFIG.EXCHANGE_RATE) {
            return bot.sendMessage(chatId, `❌ အနည်းဆုံး ${CONFIG.EXCHANGE_RATE} MMK (1$) ဖြစ်ရပါမည်။`);
        }
        
        bot.sendMessage(chatId, `✅ Admin ထံ ပို့လိုက်ပါပြီ။ အတည်ပြုပြီးပါက Balance ဖြည့်ပေးပါမည်။`, mainKeyboard);
        
        const adminMsg = `🔔 *ငွေဖြည့်လွှာ*\n👤 User: ${chatId}\n💵 Amount: ${amount}\n📝 TxID: ${state.txid}\n\n✅ Approve:\n\`/approve ${chatId} ${amount}\``;
        try {
            await bot.sendPhoto(CONFIG.ADMIN_ID, state.photo, { caption: adminMsg, parse_mode: 'Markdown' });
        } catch {
            bot.sendMessage(CONFIG.ADMIN_ID, adminMsg + "\n(No Photo)", { parse_mode: 'Markdown' });
        }
        userStates.delete(chatId);
        return;
    }

    // 3. Order Link (အရင် Code မှာ ဒီအပိုင်းပျောက်နေပါတယ်)
    if (state.step === 'WAITING_LINK') {
        state.link = text;
        state.step = 'WAITING_QTY';
        const service = SERVICES[state.serviceKey];
        return bot.sendMessage(chatId, `✅ Link ရပါပြီ။\nအရေအတွက် ဘယ်လောက် မှာယူလိုပါသလဲ?\n(အနည်းဆုံး *${service.min}* ခု)`, { parse_mode: 'Markdown' });
    }

    // 4. Order Quantity & Confirm
    if (state.step === 'WAITING_QTY') {
        const qty = parseInt(text);
        const service = SERVICES[state.serviceKey];

        if (isNaN(qty) || qty < service.min) {
            return bot.sendMessage(chatId, `⚠️ အနည်းဆုံး *${service.min}* ခု မှာယူရပါမည်။`, { parse_mode: 'Markdown' });
        }

        const cost = Math.ceil((qty / 1000) * service.price * CONFIG.EXCHANGE_RATE);
        const balance = await getUserBalance(chatId);

        state.qty = qty;
        state.cost = cost;
        state.step = 'CONFIRMING';

        const summary = `
🧾 *ORDER SUMMARY*
➖➖➖➖➖➖➖➖
🛒 *Service:* ${service.name}
🔗 *Link:* ${state.link}
📊 *Qty:* ${qty}
💰 *Cost:* ${cost} MMK
👛 *Balance:* ${balance} MMK
➖➖➖➖➖➖➖➖
${balance < cost ? '⚠️ လက်ကျန်ငွေ မလုံလောက်ပါ' : '✅ အချက်အလက် မှန်ကန်ပါက အတည်ပြုပါ'}`;

        const buttons = balance < cost ? [] : [[{ text: '✅ အတည်ပြုမည်', callback_data: 'confirm_order' }]];
        buttons.push([{ text: '❌ ပယ်ဖျက်မည်', callback_data: 'order_cancel' }]);

        bot.sendMessage(chatId, summary, { parse_mode: 'Markdown', disable_web_page_preview: true, reply_markup: { inline_keyboard: buttons } });
    }
});

// ================ ၉။ Callback Query Handler ================
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const msgId = query.message.message_id;

    if (await checkBan(chatId)) return;

    try {
        if (data === 'main_menu') {
            bot.deleteMessage(chatId, msgId);
            return bot.sendMessage(chatId, "📌 *ဝန်ဆောင်မှု Platform ရွေးချယ်ရန်*", {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🎬 TikTok', callback_data: 'group_tt' }, { text: '📘 Facebook', callback_data: 'group_fb' }],
                        [{ text: '📺 YouTube', callback_data: 'group_yt' }, { text: '✈️ Telegram', callback_data: 'group_tg' }]
                    ]
                }
            });
        }

        const menus = {
            'group_tt': { title: "TikTok", items: [['tt_likes', '❤️ Likes'], ['tt_views', '👁️ Views'], ['tt_shares', '🚀 Shares'], ['tt_saves', '💾 Saves'], ['tt_foll', '👤 Followers']] },
            'group_fb': { title: "Facebook", items: [['fb_foll', '👤 Followers'], ['fb_likes', '👍 Likes'], ['fb_love', '❤️ Love'], ['fb_care', '🤗 Care']] },
            'group_yt': { title: "YouTube", items: [['yt_subs', '👤 Subscribers'], ['yt_views', '👁️ Views']] },
            'group_tg': { title: "Telegram", items: [['tg_views', '👁️ Views'], ['tg_mem', '👤 Members']] }
        };

        if (menus[data]) {
            const kb = menus[data].items.map(item => [{ text: item[1], callback_data: 'order_' + item[0] }]);
            kb.push([{ text: '🔙 Back', callback_data: 'main_menu' }]);
            
            bot.editMessageText(`📂 *${menus[data].title} Services*`, {
                chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: kb }
            });
            return;
        }

        if (data.startsWith('order_')) {
            const key = data.replace('order_', '');
            const s = SERVICES[key];
            userStates.set(chatId, { step: 'WAITING_LINK', serviceKey: key });
            
            bot.deleteMessage(chatId, msgId);
            bot.sendMessage(chatId, `📌 *${s.name}*\n💰 Price: ${s.price}$ / 1000\n🔗 Link ပို့ပေးပါ:`, { parse_mode: 'Markdown' });
            return;
        }

        if (data === 'confirm_order') {
            const state = userStates.get(chatId);
            if (!state) return bot.deleteMessage(chatId, msgId);

            const s = SERVICES[state.serviceKey];
            
            // API Call Logic
            try {
                // SMM Panel အများစုအတွက် Standard Format (Brothersmm သုံးထားပါက key, action, service, link, quantity)
                const params = new URLSearchParams();
                params.append('key', CONFIG.API_KEY); 
                params.append('action', 'add');
                params.append('service', s.id);
                params.append('link', state.link);
                params.append('quantity', state.qty);

                const res = await axios.post(CONFIG.API_URL, params);
                
                if (res.data.order) {
                     await updateUserBalance(chatId, -state.cost);
                     bot.deleteMessage(chatId, msgId);
                     bot.sendMessage(chatId, `🎉 *Order Successful!*\n🆔 Order ID: \`${res.data.order}\`\n💰 Cost: ${state.cost} MMK`, { parse_mode: 'Markdown', ...mainKeyboard });
                     bot.sendMessage(CONFIG.ADMIN_ID, `✅ New Order: ${res.data.order} | User: ${chatId} | ${state.cost} MMK`);
                } else {
                    throw new Error(JSON.stringify(res.data));
                }
            } catch (err) {
                console.error(err);
                bot.sendMessage(chatId, `❌ Error: ${err.message || "API Connection Failed"}`);
            }
            userStates.delete(chatId);
        }

        if (data === 'order_cancel') {
            userStates.delete(chatId);
            bot.deleteMessage(chatId, msgId);
            bot.sendMessage(chatId, "❌ Cancelled.", mainKeyboard);
        }

    } catch (e) {
        console.error(e);
    }
    bot.answerCallbackQuery(query.id);
});

// ================ ၁၀။ Server Startup (Render အတွက်) ================
const app = express();
app.get('/', (req, res) => res.send('Bot is Alive! 🚀'));

app.listen(process.env.PORT || 10000, async () => {
    console.log("🚀 Server running...");
    await initDB();
});