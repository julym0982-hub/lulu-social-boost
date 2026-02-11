// ==========================================
// LuLu Social Boost - Fixed for Render & Cloudflare
// ==========================================

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const mongoose = require('mongoose');
const express = require('express'); // Render အတွက် လိုအပ်သည်

// ================ ၁။ RENDER PORT SETUP (အရေးကြီးသည်) ================
const app = express();
const PORT = process.env.PORT || 8000;

app.get('/', (req, res) => {
    res.send('Bot is running live!');
});

app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
});

// ================ ၂။ CONFIGURATION ================
const CONFIG = {
    TOKEN: '8330406067:AAHGxAdIZmj-ou1iu8rfVabtbbmmLC_oKvg',
    ADMIN_ID: 7072739469, 
    OWNER_USERNAME: 'Rowan_Elliss',
    
    // SMM Provider Info
    API_URL: 'https://brothersmm.com/api',
    API_KEY: '72dd1d7b0ade683680631a027ff813d0a7d11b01',
    
    // Database
    MONGO_URL: 'mongodb+srv://paingzinsoe:AGLMG7iArSBqPLdt@cluster0.dzaellc.mongodb.net/lulu_social_boost?retryWrites=true&w=majority',
    
    EXCHANGE_RATE: 4500,
    MIN_DEPOSIT_USD: 1,
    SPAM_COOLDOWN: 2000,
};

// ================ ၃။ DATABASE SCHEMAS ================

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
    'tt_likes': { id: 87129, name: "TikTok Likes [HQ]", price: 0.2237, min: 10, time: "20 minutes", regex: /tiktok\.com/ },
    'tt_views': { id: 87132, name: "TikTok Views", price: 0.0078, min: 100, time: "11 minutes", regex: /tiktok\.com/ },
    'tt_shares': { id: 87089, name: "TikTok Shares", price: 0.0848, min: 10, time: "12 minutes", regex: /tiktok\.com/ },
    'tt_saves': { id: 7090, name: "TikTok Saves", price: 0.015, min: 10, time: "26 minutes", regex: /tiktok\.com/ },
    'tt_foll': { id: 87117, name: "TikTok Followers", price: 0.9188, min: 50, time: "30 minutes", regex: /tiktok\.com/ },
    
    'fb_foll': { id: 86930, name: "FB Page/Profile Followers", price: 0.4298, min: 100, time: "31 minutes", regex: /facebook\.com|fb\.watch/ },
    'fb_likes': { id: 87072, name: "FB Post Likes", price: 0.264, min: 10, time: "27 minutes", regex: /facebook\.com|fb\.watch/ },
    'fb_love': { id: 86458, name: "FB Love ❤️", price: 0.1689, min: 10, time: "40 minutes", regex: /facebook\.com/ },
    'fb_care': { id: 86459, name: "FB Care 🤗", price: 0.1689, min: 10, time: "28 minutes", regex: /facebook\.com/ },
    'fb_haha': { id: 86461, name: "FB Haha 😂", price: 0.6457, min: 10, time: "Pending", regex: /facebook\.com/ },
    'fb_wow': { id: 86460, name: "FB Wow 😲", price: 0.6457, min: 10, time: "6 hours", regex: /facebook\.com/ },
    'fb_sad': { id: 86462, name: "FB Sad 😥", price: 0.6457, min: 10, time: "1 hour", regex: /facebook\.com/ },
    'fb_angry': { id: 86463, name: "FB Angry 🤬", price: 0.6457, min: 10, time: "47 minutes", regex: /facebook\.com/ },

    'yt_subs': { id: 86560, name: "YouTube Subscribers", price: 22.7526, min: 100, time: "74 hours", regex: /youtube\.com|youtu\.be/ },
    'yt_views': { id: 86562, name: "YouTube Views HQ", price: 1.8732, min: 100, time: "5 hours", regex: /youtube\.com|youtu\.be/ },

    'tg_views': { id: 86620, name: "Telegram Post View", price: 0.0499, min: 10, time: "14 minutes", regex: /t\.me/ },
    'tg_mem': { id: 86629, name: "Telegram Members", price: 0.948, min: 10, time: "31 minutes", regex: /t\.me/ }
};

// ================ ၅။ BOT SETUP & HELPERS ================

const bot = new TelegramBot(CONFIG.TOKEN, { polling: true });
const userStates = new Map();
const spamFilter = new Map();

// Helper: Escape Markdown Characters to prevent crashes
function escapeMarkdown(text) {
    if (!text) return '';
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// Helper: Anti-Spam
function checkSpam(userId) {
    const lastTime = spamFilter.get(userId) || 0;
    const now = Date.now();
    if (now - lastTime < CONFIG.SPAM_COOLDOWN) return true;
    spamFilter.set(userId, now);
    return false;
}

// Helper: Get User
async function getOrCreateUser(msg) {
    const userId = msg.from.id;
    let user = await User.findOne({ telegramId: userId });
    if (!user) {
        user = new User({
            telegramId: userId,
            username: msg.from.username,
            firstName: msg.from.first_name
        });
        await user.save();
    }
    return user;
}

// Helper: SMM API Call (with Cloudflare Bypass Headers)
async function callSmmApi(params) {
    try {
        params.key = CONFIG.API_KEY;
        // Adding User-Agent to bypass Cloudflare
        const response = await axios.post(CONFIG.API_URL, params, {
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
        // Return a safe error object instead of throwing
        return { error: 'API Connection Failed or Blocked' };
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

const CancelKeyboard = {
    reply_markup: {
        keyboard: [['🔙 နောက်ပြန်သွားရန်']],
        resize_keyboard: true
    }
};

// ================ ၇။ BOT LOGIC ================

// Start Command
bot.onText(/\/start|🔙 နောက်ပြန်သွားရန်/, async (msg) => {
    if (checkSpam(msg.from.id)) return;
    const user = await getOrCreateUser(msg);

    if (user.isBanned) return bot.sendMessage(msg.chat.id, "🚫 သင့်အကောင့်ကို ပိတ်ပင်ထားပါသည်။");

    userStates.delete(msg.chat.id);

    // Using escapeMarkdown to prevent "Can't find end of entity" error
    const safeName = escapeMarkdown(msg.from.username || msg.from.first_name);
    
    const welcomeMsg = `မင်္ဂလာပါ *${safeName}* LuLu Social Boost မှ ကြိုဆိုပါတယ်ဗျာ။ ✨\n\n✅ ငွေဖြည့်ခြင်း၊ ဝန်ဆောင်မှုများတောင်းခံခြင်းကို ဒီ Bot မှတစ်ဆင့် လုပ်ဆောင်နိုင်ပါပြီ။`;
    
    bot.sendMessage(msg.chat.id, welcomeMsg, { 
        parse_mode: 'MarkdownV2', 
        ...MainKeyboard 
    });
});

// FAQ
bot.onText(/Faq⁉️/, async (msg) => {
    const faqText = `
⁉️ *မကြာခဏမေးလေ့ရှိသော မေးခွန်းများ (FAQ)*

၁။ *LuLu Social Boost က ဘာတွေလုပ်ပေးတာလဲ?*
Social Media Platform များအတွက် Likes, Views, Followers နှင့် အခြား ဝန်ဆောင်မှုများကို ဈေးနှုန်းချိုသာစွာဖြင့် တိုးမြှင့်ပေးတဲ့ Bot ဖြစ်ပါတယ်။

၂။ *ဝန်ဆောင်မှုတစ်ခုကို ဘယ်လိုမှာယူရမလဲ?*
Menu ထဲရှိ "📱 ရရှိနိုင်သော Service များ" ကို နှိပ်ပါ။ မိမိအသုံးပြုလိုသော Platform ကို ရွေးချယ်ပြီး ညွှန်ကြားချက်အတိုင်း ဆောင်ရွက်နိုင်ပါသည်။

၃။ *ငွေကို ဘယ်လိုဖြည့်ရမလဲ?*
"💸 ငွေဖြည့်ရန်" Button ကို နှိပ်ပြီး KBZ Pay/Wave Pay သို့ ငွေလွှဲပါ။ Screenshot နှင့် Transaction ID ကို Bot ထံ ပေးပို့ရပါမယ်။

၄။ *Order တင်ပြီးရင် ဘယ်လောက်ကြာမလဲ?*
မိနစ် ၂၀ မှ ၂၄ နာရီအတွင်း အပြီးဆောင်ရွက်ပေးပါတယ်။

၅။ *Link မှားပေးမိရင် ဘယ်လိုလုပ်ရမလဲ?*
Order မတင်မီ Link ကို သေချာစစ်ဆေးပါ။ Order တင်ပြီးပါက ပြန်ဖျက်၍ မရနိုင်ပါ။

💡 အကူအညီလိုအပ်ပါက: Admin - @${escapeMarkdown(CONFIG.OWNER_USERNAME)} ထံ ဆက်သွယ်ပါ။
    `;
    // Standard Markdown is safer here if not using user input
    bot.sendMessage(msg.chat.id, faqText, { parse_mode: 'Markdown' });
});

// Select Platform
bot.onText(/📱 ရရှိနိုင်သော Service များ/, async (msg) => {
    const msgText = `📌 *မည်သည့် Platform အတွက် ဝန်ဆောင်မှု လိုအပ်ပါသလဲ?*\n\nအောက်ပါ Platform များမှ ရွေးချယ်နိုင်ပါသည်:`;
    bot.sendMessage(msg.chat.id, msgText, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🎬 TikTok', callback_data: 'plat_tt' }, { text: '📘 Facebook', callback_data: 'plat_fb' }],
                [{ text: '📺 YouTube', callback_data: 'plat_yt' }, { text: '✈️ Telegram', callback_data: 'plat_tg' }]
            ]
        }
    });
});

// Callback Handling
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith('plat_')) {
        let text = "";
        let keyboard = [];

        if (data === 'plat_tt') {
            text = "🎬 TikTok Services ကို ရွေးချယ်ပါ:";
            keyboard = [
                [{ text: 'Like ❤️', callback_data: 'svc_tt_likes' }, { text: 'Views 👀', callback_data: 'svc_tt_views' }],
                [{ text: 'Share 📍', callback_data: 'svc_tt_shares' }, { text: 'Save 💾', callback_data: 'svc_tt_saves' }],
                [{ text: 'Followers 👤', callback_data: 'svc_tt_foll' }]
            ];
        } else if (data === 'plat_fb') {
            text = "📘 Facebook Services ကို ရွေးချယ်ပါ:";
            keyboard = [
                [{ text: 'Followers 👤', callback_data: 'svc_fb_foll' }, { text: 'Post Likes 👍', callback_data: 'svc_fb_likes' }],
                [{ text: 'Love ❤️', callback_data: 'svc_fb_love' }, { text: 'Care 🤗', callback_data: 'svc_fb_care' }],
                [{ text: 'Haha 😂', callback_data: 'svc_fb_haha' }, { text: 'Wow 😲', callback_data: 'svc_fb_wow' }],
                [{ text: 'Sad 😥', callback_data: 'svc_fb_sad' }, { text: 'Angry 🤬', callback_data: 'svc_fb_angry' }]
            ];
        } else if (data === 'plat_yt') {
            text = "📺 YouTube Services ကို ရွေးချယ်ပါ:";
            keyboard = [
                [{ text: 'Subscribers 👤', callback_data: 'svc_yt_subs' }],
                [{ text: 'Views 👀', callback_data: 'svc_yt_views' }]
            ];
        } else if (data === 'plat_tg') {
            text = "✈️ Telegram Services ကို ရွေးချယ်ပါ:";
            keyboard = [
                [{ text: 'Post Views 👀', callback_data: 'svc_tg_views' }],
                [{ text: 'Members 👤', callback_data: 'svc_tg_mem' }]
            ];
        }

        bot.editMessageText(text, {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    if (data.startsWith('svc_')) {
        const serviceKey = data.replace('svc_', '');
        const service = SERVICES[serviceKey];
        if (!service) return;

        userStates.set(chatId, { step: 'WAITING_LINK', serviceKey: serviceKey });

        const infoText = `
📌 *${service.name}*

⏱️ ပျမ်းမျှကြာချိန်: ${service.time}
📦 အနည်းဆုံးအရေအတွက်: ${service.min}
💰 ဈေးနှုန်း: ${(service.price * CONFIG.EXCHANGE_RATE / 1000).toFixed(2)} MMK per 1

🔗 ကျေးဇူးပြု၍ သင့် Link ကို ပေးပို့ပါ။`;

        bot.sendMessage(chatId, infoText, { parse_mode: 'Markdown', ...CancelKeyboard });
        bot.answerCallbackQuery(query.id);
    }

    if (data === 'confirm_order') {
        const state = userStates.get(chatId);
        if (!state || !state.qty) return;

        const user = await User.findOne({ telegramId: chatId });
        if (user.balance < state.totalCost) {
            return bot.sendMessage(chatId, "⚠️ လက်ကျန်ငွေ မလုံလောက်ပါ။ ကျေးဇူးပြု၍ ငွေဖြည့်ပါ။", MainKeyboard);
        }

        bot.editMessageText("⏳ Order တင်နေပါသည်... ခေတ္တစောင့်ပါ...", {
            chat_id: chatId,
            message_id: query.message.message_id
        });

        try {
            const apiRes = await callSmmApi({
                action: 'add',
                service: SERVICES[state.serviceKey].id,
                link: state.link,
                quantity: state.qty
            });

            if (apiRes.order) {
                user.balance -= state.totalCost;
                user.totalSpent += state.totalCost;
                await user.save();

                await Order.create({
                    orderId: apiRes.order,
                    telegramId: chatId,
                    serviceName: SERVICES[state.serviceKey].name,
                    link: state.link,
                    quantity: state.qty,
                    costMMK: state.totalCost,
                    status: 'Pending'
                });

                bot.sendMessage(chatId, 
                    `✅ *Order အောင်မြင်စွာ တင်ပြီးပါပြီ!*\n\n🆔 Order ID: \`${apiRes.order}\`\n💰 ကျသင့်ငွေ: ${state.totalCost} MMK\n💵 လက်ကျန်ငွေ: ${user.balance} MMK`, 
                    { parse_mode: 'Markdown', ...MainKeyboard }
                );
            } else {
                bot.sendMessage(chatId, `❌ Error: ${apiRes.error || 'Server Blocked'}`, MainKeyboard);
            }
        } catch (error) {
            bot.sendMessage(chatId, "❌ စနစ်ပိုင်းဆိုင်ရာ အမှားအယွင်း ဖြစ်ပေါ်နေပါသည်။ Admin သို့ ဆက်သွယ်ပါ။", MainKeyboard);
        }
        userStates.delete(chatId);
    }

    if (data === 'cancel_setup') {
        userStates.delete(chatId);
        bot.sendMessage(chatId, "❌ Order မှာယူခြင်းကို ပယ်ဖျက်လိုက်ပါသည်။", MainKeyboard);
        bot.deleteMessage(chatId, query.message.message_id);
    }

    if (data.startsWith('do_cancel_')) {
        const orderId = data.replace('do_cancel_', '');
        try {
            const apiRes = await callSmmApi({ action: 'cancel', order: orderId });
            
            // Note: SMMBrother usually doesn't allow instant cancel via API for all services
            // We only refund if API says success or if we force logic
            if (apiRes.status || !apiRes.error) {
                 const order = await Order.findOne({ orderId: orderId });
                 if(order && order.status !== 'Canceled') {
                     order.status = 'Canceled';
                     await order.save();
                     await User.updateOne({ telegramId: chatId }, { $inc: { balance: order.costMMK } });
                     bot.sendMessage(chatId, `✅ Order ID ${orderId} ကို ပယ်ဖျက်လိုက်ပါပြီ။\n💰 ${order.costMMK} MMK ပြန်လည်ထည့်သွင်းပေးထားပါသည်။`);
                 }
            } else {
                bot.sendMessage(chatId, `❌ ပယ်ဖျက်မရနိုင်ပါ: ${apiRes.error || "Started already"}`);
            }
        } catch (e) {
            bot.sendMessage(chatId, "❌ Error cancelling order.");
        }
    }
});

// Message Handling
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const state = userStates.get(chatId);

    if (!state && !text?.startsWith('/')) {
        if (text === '📜 Order History') {
             const orders = await Order.find({ telegramId: chatId }).sort({ timestamp: -1 }).limit(5);
             if (orders.length === 0) return bot.sendMessage(chatId, "📭 Order History မရှိသေးပါ။");
             
             let historyMsg = "📋 *နောက်ဆုံး Order ၅ ခု*\n\n";
             orders.forEach(o => {
                 historyMsg += `🆔 ID: \`${o.orderId}\`\n▪️ ${o.serviceName}\n▪️ Status: ${o.status}\n\n`;
             });
             historyMsg += "💡 အသေးစိတ်သိလိုပါက Order ID ကို ရိုက်ထည့်ပါ။";
             return bot.sendMessage(chatId, historyMsg, { parse_mode: 'Markdown' });
        }
        
        if (/^\d+$/.test(text)) {
            const orderId = text;
            const waitingMsg = await bot.sendMessage(chatId, "🔍 Order အခြေအနေ ရှာဖွေနေပါသည်...");
            
            try {
                const apiRes = await callSmmApi({ action: 'status', order: orderId });
                
                let statusText = apiRes.status || apiRes.orderStatus || 'Unknown';
                let canCancel = (statusText === 'Pending');

                // Update Local DB
                await Order.updateOne({ orderId: orderId }, { status: statusText });

                let responseMsg = `🆔 *Order ID:* ${orderId}\n📊 *Status:* ${statusText}\n📉 *Remains:* ${apiRes.remains || 'N/A'}`;
                
                const opts = { parse_mode: 'Markdown' };
                if (canCancel) {
                    opts.reply_markup = {
                        inline_keyboard: [[{ text: "🚫 Cancel Order", callback_data: `do_cancel_${orderId}` }]]
                    };
                }

                bot.deleteMessage(chatId, waitingMsg.message_id);
                bot.sendMessage(chatId, responseMsg, opts);
            } catch (error) {
                bot.sendMessage(chatId, "❌ Order ID မမှန်ကန်ပါ သို့မဟုတ် ရှာမတွေ့ပါ။");
            }
            return;
        }
    }

    if (state) {
        if (state.step === 'WAITING_LINK') {
            if (text === '🔙 နောက်ပြန်သွားရန်') {
                userStates.delete(chatId);
                return bot.sendMessage(chatId, "ပင်မစာမျက်နှာသို့", MainKeyboard);
            }
            const service = SERVICES[state.serviceKey];
            if (!service.regex.test(text)) {
                return bot.sendMessage(chatId, `❌ Link မှားယွင်းနေပါသည်။\n${service.name} အတွက် မှန်ကန်သော Link ဖြစ်ရပါမည်။`);
            }
            state.link = text;
            state.step = 'WAITING_QTY';
            bot.sendMessage(chatId, `📌 *${service.name}*\n\n🔢 တိုးမြှင့်လိုသော အရေအတွက်ကို ရိုက်ထည့်ပေးပါ\nအနည်းဆုံး: *${service.min}*`, { parse_mode: 'Markdown' });
        }
        else if (state.step === 'WAITING_QTY') {
            const qty = parseInt(text);
            const service = SERVICES[state.serviceKey];
            if (isNaN(qty) || qty < service.min) return bot.sendMessage(chatId, `⚠️ အနည်းဆုံး ${service.min} နှင့်အထက် ရိုက်ထည့်ပေးပါ။`);

            const totalCost = Math.ceil((qty / 1000) * service.price * CONFIG.EXCHANGE_RATE);
            state.qty = qty;
            state.totalCost = totalCost;
            state.step = 'CONFIRM';

            const summary = `📋 *Order အတည်ပြုရန်*\n\n🛒 Service: ${service.name}\n🔗 Link: ${state.link}\n📊 Quantity: ${qty}\n💰 ကျသင့်ငွေ: *${totalCost} MMK*`;
            bot.sendMessage(chatId, summary, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '✅ ဆက်သွားရန်', callback_data: 'confirm_order' }, { text: '❌ ပယ်ဖျက်ရန်', callback_data: 'cancel_setup' }]]
                }
            });
        }
        else if (state.step === 'WAITING_SS' && msg.photo) {
            state.photo = msg.photo[msg.photo.length - 1].file_id;
            state.step = 'WAITING_TXID';
            bot.sendMessage(chatId, "✅ Screenshot လက်ခံရရှိပါပြီ။\nTransaction ID (နောက်ဆုံးဂဏန်း ၄လုံး) ကို ရိုက်ထည့်ပေးပါ။");
        }
        else if (state.step === 'WAITING_TXID') {
             state.txid = text;
             state.step = 'WAITING_AMOUNT';
             bot.sendMessage(chatId, "✅ Transaction ID လက်ခံရရှိပါပြီ။\nငွေလွှဲထားသော ပမာဏ (MMK) ကို ရိုက်ထည့်ပေးပါ။");
        }
        else if (state.step === 'WAITING_AMOUNT') {
            const amount = parseInt(text);
            if (isNaN(amount) || amount < 0) return bot.sendMessage(chatId, "❌ ပမာဏ မှားယွင်းနေပါသည်။");
            
            // To Admin
            const adminMsg = `🔔 *ငွေဖြည့်လွှာအသစ်*\n👤 User: ${escapeMarkdown(msg.from.first_name)} (ID: \`${chatId}\`)\n💰 Amount: ${amount} MMK\n📝 TxID: \`${state.txid}\`\n\n👇 Approve Command:\n\`/approve ${chatId} ${amount}\``;
            
            try {
                await bot.sendPhoto(CONFIG.ADMIN_ID, state.photo, { caption: adminMsg, parse_mode: 'MarkdownV2' });
                bot.sendMessage(chatId, "✅ သင့်ငွေဖြည့်လွှာကို Admin ထံသို့ ပေးပို့ထားပါပြီ။", MainKeyboard);
            } catch (e) {
                bot.sendMessage(chatId, "❌ Error sending to admin.", MainKeyboard);
            }
            userStates.delete(chatId);
        }
    }
});

// Balance Check & Deposit
bot.onText(/💰 လက်ကျန်ငွေစစ်ရန်/, async (msg) => {
    const user = await getOrCreateUser(msg);
    bot.sendMessage(msg.chat.id, `👤 Username: ${escapeMarkdown(user.username)}\n💰 လက်ကျန်ငွေ: *${user.balance} MMK*`, {
        parse_mode: 'MarkdownV2',
        reply_markup: { inline_keyboard: [[{ text: '💸 ငွေဖြည့်ရန်', callback_data: 'trigger_deposit' }]] }
    });
});

bot.onText(/💸 ငွေဖြည့်ရန်/, (msg) => handleDeposit(msg.chat.id));
bot.on('callback_query', (q) => { if(q.data === 'trigger_deposit') handleDeposit(q.message.chat.id); });

function handleDeposit(chatId) {
    const text = `
💵 *ငွေဖြည့်ရန် ညွှန်ကြားချက်များ*

💰 1$ = ${CONFIG.EXCHANGE_RATE} MMK
(အနည်းဆုံး 1$ မှစဝယ်ပေးပါ)

🏦 *KBZ Pay*
\`09952537056\`
Name: Joe Eaindray Thwe

🏦 *Wave Pay*
\`09882494488\`
Name: Paing Zin Soe

✅ ငွေလွှဲပြီးပါက Screenshot နှင့် Transaction ID (နောက်ဆုံးဂဏန်း ၄လုံး) ပို့ပေးပါ။
    `;
    bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
            keyboard: [['📸 Screenshot ပို့ရန်'], ['🔙 နောက်ပြန်သွားရန်']],
            resize_keyboard: true
        }
    });
}
bot.onText(/📸 Screenshot ပို့ရန်/, (msg) => {
    userStates.set(msg.chat.id, { step: 'WAITING_SS' });
    bot.sendMessage(msg.chat.id, "✅ Screenshot ပို့ပေးပါခင်ဗျာ။");
});

// Admin Commands
bot.onText(/\/approve (\d+) (\d+)/, async (msg, match) => {
    if (msg.chat.id !== CONFIG.ADMIN_ID) return;
    const targetId = match[1];
    const amount = parseInt(match[2]);
    await User.updateOne({ telegramId: targetId }, { $inc: { balance: amount } });
    bot.sendMessage(msg.chat.id, `✅ Success! Added ${amount} to ${targetId}.`);
    bot.sendMessage(targetId, `💰 သင့်အကောင့်ထဲသို့ *${amount} MMK* ထည့်သွင်းပြီးပါပြီ။`, { parse_mode: 'Markdown' });
});

bot.onText(/\/admin/, async (msg) => {
    if (msg.chat.id !== CONFIG.ADMIN_ID) return;
    const userCount = await User.countDocuments();
    bot.sendMessage(msg.chat.id, `👑 *Admin Dashboard*\n👥 Users: ${userCount}`, { parse_mode: 'Markdown' });
});

console.log("🚀 Bot is running...");