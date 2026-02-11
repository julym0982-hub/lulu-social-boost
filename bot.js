// ==========================================
// LuLu Social Boost - Full Featured Bot
// ==========================================

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const mongoose = require('mongoose');

// ================ ၁။ CONFIGURATION ================
const CONFIG = {
    // လူကြီးမင်း ပေးထားသော အချက်အလက်များ
    TOKEN: '8330406067:AAHGxAdIZmj-ou1iu8rfVabtbbmmLC_oKvg',
    ADMIN_ID: 7072739469, // Number type for strict checking
    OWNER_USERNAME: 'Rowan_Elliss',
    
    // SMM Provider Info
    API_URL: 'https://brothersmm.com/api',
    API_KEY: '72dd1d7b0ade683680631a027ff813d0a7d11b01',
    
    // Database
    MONGO_URL: 'mongodb+srv://paingzinsoe:AGLMG7iArSBqPLdt@cluster0.dzaellc.mongodb.net/lulu_social_boost?retryWrites=true&w=majority',
    
    // Rate & Settings
    EXCHANGE_RATE: 4500, // 1$ = 4500 MMK
    MIN_DEPOSIT_USD: 1,
    SPAM_COOLDOWN: 2000, // 2 seconds between clicks
};

// ================ ၂။ DATABASE SCHEMAS ================

mongoose.connect(CONFIG.MONGO_URL)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

const userSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    username: String,
    firstName: String,
    balance: { type: Number, default: 0 },
    isBanned: { type: Boolean, default: false },
    lastActive: { type: Date, default: Date.now },
    totalSpent: { type: Number, default: 0 }
});

const orderSchema = new mongoose.Schema({
    orderId: String, // ID from SMM Provider
    telegramId: Number,
    serviceName: String,
    link: String,
    quantity: Number,
    costMMK: Number,
    costUSD: Number,
    status: { type: String, default: 'Pending' }, // Pending, Completed, Canceled
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Order = mongoose.model('Order', orderSchema);

// ================ ၃။ SERVICES CONFIGURATION ================

// Service ID များအားလုံးကို SMM Provider ID အတိုင်း ထည့်သွင်းထားသည်
const SERVICES = {
    // TikTok
    'tt_likes': { id: 87129, name: "TikTok Likes [HQ]", price: 0.2237, min: 10, time: "20 minutes", regex: /tiktok\.com/ },
    'tt_views': { id: 87132, name: "TikTok Views", price: 0.0078, min: 100, time: "11 minutes", regex: /tiktok\.com/ },
    'tt_shares': { id: 87089, name: "TikTok Shares", price: 0.0848, min: 10, time: "12 minutes", regex: /tiktok\.com/ },
    'tt_saves': { id: 7090, name: "TikTok Saves", price: 0.015, min: 10, time: "26 minutes", regex: /tiktok\.com/ },
    'tt_foll': { id: 87117, name: "TikTok Followers", price: 0.9188, min: 50, time: "30 minutes", regex: /tiktok\.com/ },
    
    // Facebook
    'fb_foll': { id: 86930, name: "FB Page/Profile Followers", price: 0.4298, min: 100, time: "31 minutes", regex: /facebook\.com|fb\.watch/ },
    'fb_likes': { id: 87072, name: "FB Post Likes", price: 0.264, min: 10, time: "27 minutes", regex: /facebook\.com|fb\.watch/ },
    'fb_love': { id: 86458, name: "FB Love ❤️", price: 0.1689, min: 10, time: "40 minutes", regex: /facebook\.com/ },
    'fb_care': { id: 86459, name: "FB Care 🤗", price: 0.1689, min: 10, time: "28 minutes", regex: /facebook\.com/ },
    'fb_haha': { id: 86461, name: "FB Haha 😂", price: 0.6457, min: 10, time: "Pending", regex: /facebook\.com/ },
    'fb_wow': { id: 86460, name: "FB Wow 😲", price: 0.6457, min: 10, time: "6 hours", regex: /facebook\.com/ },
    'fb_sad': { id: 86462, name: "FB Sad 😥", price: 0.6457, min: 10, time: "1 hour", regex: /facebook\.com/ },
    'fb_angry': { id: 86463, name: "FB Angry 🤬", price: 0.6457, min: 10, time: "47 minutes", regex: /facebook\.com/ },

    // YouTube
    'yt_subs': { id: 86560, name: "YouTube Subscribers", price: 22.7526, min: 100, time: "74 hours", regex: /youtube\.com|youtu\.be/ },
    'yt_views': { id: 86562, name: "YouTube Views HQ", price: 1.8732, min: 100, time: "5 hours", regex: /youtube\.com|youtu\.be/ },

    // Telegram
    'tg_views': { id: 86620, name: "Telegram Post View", price: 0.0499, min: 10, time: "14 minutes", regex: /t\.me/ },
    'tg_mem': { id: 86629, name: "Telegram Members", price: 0.948, min: 10, time: "31 minutes", regex: /t\.me/ }
};

// ================ ၄။ BOT SETUP & STATE ================

const bot = new TelegramBot(CONFIG.TOKEN, { polling: true });
const userStates = new Map(); // Stores temporary steps like WAITING_LINK
const spamFilter = new Map(); // Stores last interaction time

// --- Helper Functions ---

// Check Spam/Cooldown
function checkSpam(userId) {
    const lastTime = spamFilter.get(userId) || 0;
    const now = Date.now();
    if (now - lastTime < CONFIG.SPAM_COOLDOWN) return true;
    spamFilter.set(userId, now);
    return false;
}

// Get or Create User
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

// SMM API Call Wrapper
async function callSmmApi(params) {
    try {
        params.key = CONFIG.API_KEY;
        const response = await axios.post(CONFIG.API_URL, params, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
        throw error;
    }
}

// ================ ၅။ MAIN MENUS ================

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

// ================ ၆။ COMMAND HANDLERS ================

// /start Command
bot.onText(/\/start|🔙 နောက်ပြန်သွားရန်/, async (msg) => {
    if (checkSpam(msg.from.id)) return;
    const user = await getOrCreateUser(msg);

    if (user.isBanned) return bot.sendMessage(msg.chat.id, "🚫 သင့်အကောင့်ကို ပိတ်ပင်ထားပါသည်။");

    userStates.delete(msg.chat.id); // Clear states

    const welcomeMsg = `မင်္ဂလာပါ ${msg.from.username || msg.from.first_name} LuLu Social Boost မှ ကြိုဆိုပါတယ်ဗျာ။ ✨\n\n✅ ငွေဖြည့်ခြင်း၊ ဝန်ဆောင်မှုများတောင်းခံခြင်းကို ဒီ Bot မှတစ်ဆင့် လုပ်ဆောင်နိုင်ပါပြီ။`;
    
    bot.sendMessage(msg.chat.id, welcomeMsg, MainKeyboard);
});

// FAQ
bot.onText(/Faq⁉️/, async (msg) => {
    const faqText = `
⁉️ *မကြာခဏမေးလေ့ရှိသော မေးခွန်းများ (FAQ)*

၁။ *LuLu Social Boost က ဘာတွေလုပ်ပေးတာလဲ?*
ကျွန်တော်တို့ Bot ဟာ Facebook, TikTok, YouTube, Telegram အစရှိတဲ့ Social Media Platform များအတွက် Likes, Views, Followers နှင့် အခြား ဝန်ဆောင်မှုများကို ဈေးနှုန်းချိုသာစွာဖြင့် အလိုအလျောက် တိုးမြှင့်ပေးတဲ့ Bot ဖြစ်ပါတယ်။

၂။ *ဝန်ဆောင်မှုတစ်ခုကို ဘယ်လိုမှာယူရမလဲ?*
Menu ထဲရှိ "📱 ရရှိနိုင်သော Service များ" ကို နှိပ်ပါ။ မိမိအသုံးပြုလိုသော Platform ကို ရွေးချယ်ပြီး ညွှန်ကြားချက်အတိုင်း ဆောင်ရွက်နိုင်ပါသည်။

၃။ *ငွေကို ဘယ်လိုဖြည့်ရမလဲ?*
"💸 ငွေဖြည့်ရန်" Button ကို နှိပ်ပြီး ဖော်ပြထားသော KBZ Pay/Wave Pay သို့ ငွေလွှဲပါ။ ထို့နောက် Screenshot နှင့် Transaction ID ကို Bot ထံ ပေးပို့ရပါမယ်။

၄။ *Order တင်ပြီးရင် ဘယ်လောက်ကြာမလဲ?*
Service တစ်ခုချင်းစီမှာ ပျှမ်းမျှကြာချိန် (Average Time) ဖော်ပြထားပါတယ်။ များသောအားဖြင့် မိနစ် ၂၀ မှ ၂၄ နာရီအတွင်း အပြီးဆောင်ရွက်ပေးပါတယ်။

၅။ *Link မှားပေးမိရင် ဘယ်လိုလုပ်ရမလဲ?*
Order စတင်လုပ်ဆောင်နေပြီဆိုပါက ပြန်ဖျက်၍ မရနိုင်ပါ။ အမြန်ဆုံး Admin (@${CONFIG.OWNER_USERNAME}) ထံ ဆက်သွယ်ပေးပါ။

💡 အကူအညီလိုအပ်ပါက: Admin - @${CONFIG.OWNER_USERNAME} ထံ တိုက်ရိုက်မေးမြန်းနိုင်ပါတယ်။
    `;
    bot.sendMessage(msg.chat.id, faqText, { parse_mode: 'Markdown' });
});

// ================ ၇။ SERVICE FLOW ================

// 1. Select Platform
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

// Callback Queries (Menus & Selection)
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    // Platform Menus
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

    // Service Selection
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

    // Confirm Order
    if (data === 'confirm_order') {
        const state = userStates.get(chatId);
        if (!state || !state.qty) return;

        // Double check balance & Lock button
        const user = await User.findOne({ telegramId: chatId });
        if (user.balance < state.totalCost) {
            return bot.sendMessage(chatId, "⚠️ လက်ကျန်ငွေ မလုံလောက်ပါ။ ကျေးဇူးပြု၍ ငွေဖြည့်ပါ။", MainKeyboard);
        }

        bot.editMessageText("⏳ Order တင်နေပါသည်... ခေတ္တစောင့်ပါ...", {
            chat_id: chatId,
            message_id: query.message.message_id
        });

        try {
            // Call API
            const apiRes = await callSmmApi({
                action: 'add',
                service: SERVICES[state.serviceKey].id,
                link: state.link,
                quantity: state.qty
            });

            if (apiRes.order) {
                // Deduct Balance
                user.balance -= state.totalCost;
                user.totalSpent += state.totalCost;
                await user.save();

                // Save Order to DB
                await Order.create({
                    orderId: apiRes.order,
                    telegramId: chatId,
                    serviceName: SERVICES[state.serviceKey].name,
                    link: state.link,
                    quantity: state.qty,
                    costMMK: state.totalCost,
                    costUSD: (state.totalCost / CONFIG.EXCHANGE_RATE),
                    status: 'Pending'
                });

                bot.sendMessage(chatId, 
                    `✅ *Order အောင်မြင်စွာ တင်ပြီးပါပြီ!*\n\n` +
                    `🆔 Order ID: \`${apiRes.order}\`\n` +
                    `💰 ကျသင့်ငွေ: ${state.totalCost} MMK\n` +
                    `💵 လက်ကျန်ငွေ: ${user.balance} MMK`, 
                    { parse_mode: 'Markdown', ...MainKeyboard }
                );
            } else if (apiRes.error) {
                bot.sendMessage(chatId, `❌ Error: ${apiRes.error}`, MainKeyboard);
            }
        } catch (error) {
            bot.sendMessage(chatId, "❌ စနစ်ပိုင်းဆိုင်ရာ အမှားအယွင်း ဖြစ်ပေါ်နေပါသည်။ Admin သို့ ဆက်သွယ်ပါ။", MainKeyboard);
        }
        
        userStates.delete(chatId);
    }

    // Cancel Order Setup
    if (data === 'cancel_setup') {
        userStates.delete(chatId);
        bot.sendMessage(chatId, "❌ Order မှာယူခြင်းကို ပယ်ဖျက်လိုက်ပါသည်။", MainKeyboard);
        bot.deleteMessage(chatId, query.message.message_id);
    }

    // Cancel Active Order (From Status Check)
    if (data.startsWith('do_cancel_')) {
        const orderId = data.replace('do_cancel_', '');
        
        // Call API Cancel
        try {
            const apiRes = await callSmmApi({ action: 'cancel', order: orderId });
            
            // Check if API says success or if we should refund locally
            // Note: Many SMM APIs handle refund automatically to the panel account, 
            // but we need to refund the User's MMK balance manually.
            
            // Assuming API returns { status: "success", ... } or similar error
            if (apiRes.status || !apiRes.error) {
                 // Find order in DB
                 const order = await Order.findOne({ orderId: orderId });
                 if(order && order.status !== 'Canceled') {
                     order.status = 'Canceled';
                     await order.save();
                     
                     // Refund
                     await User.updateOne({ telegramId: chatId }, { $inc: { balance: order.costMMK } });
                     
                     bot.sendMessage(chatId, 
                        `✅ Order ID ${orderId} ကို ပယ်ဖျက်လိုက်ပါပြီ။\n` +
                        `💰 သင့်အကောင့်ထဲသို့ ${order.costMMK} MMK ပြန်လည်ထည့်သွင်းပေးထားပါသည်။`
                     );
                 }
            } else {
                bot.sendMessage(chatId, `❌ ပယ်ဖျက်မရနိုင်ပါ: ${apiRes.error || "Started already"}`);
            }
        } catch (e) {
            bot.sendMessage(chatId, "❌ Error cancelling order.");
        }
    }
});

// ================ ၈။ MESSAGE HANDLING (Input & Payment) ================

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const state = userStates.get(chatId);

    if (!state && !text?.startsWith('/')) {
        // Handle "Order Status Check" by ID directly?
        // Or "Order History" button
        if (text === '📜 Order History') {
             const orders = await Order.find({ telegramId: chatId }).sort({ timestamp: -1 }).limit(5);
             if (orders.length === 0) {
                 return bot.sendMessage(chatId, "📭 Order History မရှိသေးပါ။");
             }
             
             let historyMsg = "📋 *နောက်ဆုံး Order ၅ ခု*\n\n";
             orders.forEach(o => {
                 historyMsg += `🆔 ID: \`${o.orderId}\`\n▪️ ${o.serviceName}\n▪️ Status: ${o.status}\n\n`;
             });
             historyMsg += "💡 အသေးစိတ်သိလိုပါက Order ID ကို ရိုက်ထည့်ပါ။ (ဥပမာ: 929202)";
             return bot.sendMessage(chatId, historyMsg, { parse_mode: 'Markdown' });
        }
        
        // Check if input is digits (Order ID Lookup)
        if (/^\d+$/.test(text)) {
            const orderId = text;
            const waitingMsg = await bot.sendMessage(chatId, "🔍 Order အခြေအနေ ရှာဖွေနေပါသည်...");
            
            try {
                const apiRes = await callSmmApi({ action: 'status', order: orderId });
                // apiRes example: { status: "Pending", remains: "100", ... }
                
                let statusText = "";
                let statusEmoji = "";
                let canCancel = false;

                const status = apiRes.status; // Pending, In progress, Completed, Partial, Canceled, Processing

                if (status === 'Pending' || status === 'Processing') {
                    statusText = "လုပ်ဆောင်နေဆဲ";
                    statusEmoji = "⏳";
                    canCancel = (status === 'Pending'); // Only allow cancel if strictly pending
                } else if (status === 'Completed') {
                    statusText = "လုပ်ဆောင်ပြီး";
                    statusEmoji = "✅";
                } else if (status === 'Canceled' || status === 'Partial') {
                    statusText = "ပယ်ဖျက်ထားသည်/မပြည့်စုံ";
                    statusEmoji = "❌";
                } else {
                    statusText = status;
                    statusEmoji = "📋";
                }

                // Update Local DB Status if changed
                await Order.updateOne({ orderId: orderId }, { status: status });

                let responseMsg = `🆔 *Order ID:* ${orderId}\n` +
                                  `📊 *Status:* ${statusText} ${statusEmoji}\n` +
                                  `📉 *Remains:* ${apiRes.remains || 'N/A'}`;
                
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
        // --- STEP 1: Waiting for Link ---
        if (state.step === 'WAITING_LINK') {
            if (text === '🔙 နောက်ပြန်သွားရန်') {
                userStates.delete(chatId);
                return bot.sendMessage(chatId, "ပင်မစာမျက်နှာသို့", MainKeyboard);
            }

            const service = SERVICES[state.serviceKey];
            
            // Regex Validation
            if (!service.regex.test(text)) {
                return bot.sendMessage(chatId, `❌ Link မှားယွင်းနေပါသည်။\n${service.name} အတွက် မှန်ကန်သော Link ဖြစ်ရပါမည်။\nကျေးဇူးပြု၍ ပြန်လည်ပို့ပေးပါ။`);
            }

            state.link = text;
            state.step = 'WAITING_QTY';
            
            bot.sendMessage(chatId, 
                `📌 *${service.name}*\n\n` +
                `🔢 တိုးမြှင့်လိုသော အရေအတွက်ကို ရိုက်ထည့်ပေးပါ\n` +
                `အနည်းဆုံး: *${service.min}*`,
                { parse_mode: 'Markdown' }
            );
        }
        
        // --- STEP 2: Waiting for Quantity ---
        else if (state.step === 'WAITING_QTY') {
            const qty = parseInt(text);
            const service = SERVICES[state.serviceKey];

            if (isNaN(qty) || qty < service.min) {
                return bot.sendMessage(chatId, `⚠️ အနည်းဆုံး ${service.min} နှင့်အထက် ရိုက်ထည့်ပေးပါ။`);
            }

            const totalCost = Math.ceil((qty / 1000) * service.price * CONFIG.EXCHANGE_RATE);
            state.qty = qty;
            state.totalCost = totalCost;
            state.step = 'CONFIRM';

            const summary = `
📋 *Order အတည်ပြုရန်*

🛒 Service: ${service.name}
🔗 Link: ${state.link}
📊 Quantity: ${qty}
⏱️ Time: ${service.time}

💰 ကျသင့်ငွေ: *${totalCost} MMK*
            `;

            bot.sendMessage(chatId, summary, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ ဆက်သွားရန်', callback_data: 'confirm_order' },
                            { text: '❌ ပယ်ဖျက်ရန်', callback_data: 'cancel_setup' }
                        ]
                    ]
                }
            });
        }

        // --- PAYMENT STEPS ---
        else if (state.step === 'WAITING_SS' && msg.photo) {
            const photoId = msg.photo[msg.photo.length - 1].file_id;
            state.photo = photoId;
            state.step = 'WAITING_TXID';
            bot.sendMessage(chatId, "✅ Screenshot လက်ခံရရှိပါပြီ။\n\nကျေးဇူးပြု၍ *Transaction ID* (နောက်ဆုံးဂဏန်း ၄လုံး) ကို ရိုက်ထည့်ပေးပါ။");
        }
        
        else if (state.step === 'WAITING_TXID') {
             state.txid = text;
             state.step = 'WAITING_AMOUNT';
             bot.sendMessage(chatId, "✅ Transaction ID လက်ခံရရှိပါပြီ။\n\nကျေးဇူးပြု၍ *ငွေလွှဲထားသော ပမာဏ (MMK)* ကို ရိုက်ထည့်ပေးပါ။\nဥပမာ: 4500");
        }

        else if (state.step === 'WAITING_AMOUNT') {
            const amount = parseInt(text);
            if (isNaN(amount) || amount < 0) return bot.sendMessage(chatId, "❌ ပမာဏ မှားယွင်းနေပါသည်။");

            // Notify Admin
            const adminMsg = `
🔔 *ငွေဖြည့်လွှာအသစ်*
👤 User: ${msg.from.first_name} (ID: ${chatId})
💰 Amount: ${amount} MMK
📝 TxID: ${state.txid}
📅 Date: ${new Date().toLocaleString()}

👇 Admin Copy Paste Command:
\`<code>/approve ${chatId} ${amount}</code>\`
            `;

            try {
                await bot.sendPhoto(CONFIG.ADMIN_ID, state.photo, { caption: adminMsg, parse_mode: 'HTML' });
                bot.sendMessage(chatId, 
                    "✅ သင့်ငွေဖြည့်လွှာကို Admin ထံသို့ ပေးပို့ထားပါပြီ။\nအတည်ပြုချက် ရရှိပါက သင့်အကောင့်သို့ ငွေရောက်ရှိလာပါမည်။", 
                    MainKeyboard
                );
            } catch (e) {
                console.error("Admin send error", e);
                bot.sendMessage(chatId, "❌ Error sending to admin. Please contact manually.");
            }
            userStates.delete(chatId);
        }
    }
});

// ================ ၉။ BALANCE & PAYMENT ================

bot.onText(/💰 လက်ကျန်ငွေစစ်ရန်/, async (msg) => {
    const user = await getOrCreateUser(msg);
    const text = `
👤 Username: ${user.username || 'N/A'}
💰 လက်ကျန်ငွေ: *${user.balance} MMK*
    `;
    
    bot.sendMessage(msg.chat.id, text, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: '💸 ငွေဖြည့်ရန်', callback_data: 'trigger_deposit' }]]
        }
    });
});

bot.onText(/💸 ငွေဖြည့်ရန်/, (msg) => handleDeposit(msg.chat.id));
bot.on('callback_query', (q) => {
    if(q.data === 'trigger_deposit') handleDeposit(q.message.chat.id);
});

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

⚠️ *အရေးကြီးသတိပေးချက်*
• KBZ Pay တွင် "Note" ၌ dollar နှင့်ပတ်သက်သော စာသားမထည့်ရ
• "payment" သို့မဟုတ် "for service" အစရှိသော စာသားသာထည့်ရန်
• ငွေလွှဲ Screenshot မှ လက်ခံသူအမည်၊ ပမာဏ၊ ရက်စွဲများ ရှင်းလင်းစွာမြင်ရပါစေ
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


// ================ ၁၀။ ADMIN COMMANDS ================

// /approve <userId> <amount>
bot.onText(/\/approve (\d+) (\d+)/, async (msg, match) => {
    if (msg.chat.id !== CONFIG.ADMIN_ID) return;

    const targetId = match[1];
    const amount = parseInt(match[2]);

    const user = await User.findOne({ telegramId: targetId });
    if (!user) return bot.sendMessage(msg.chat.id, "❌ User not found");

    user.balance += amount;
    await user.save();

    bot.sendMessage(msg.chat.id, `✅ Success! Added ${amount} to ${targetId}. New Balance: ${user.balance}`);
    bot.sendMessage(targetId, `💰 သင့်အကောင့်ထဲသို့ *${amount} MMK* ထည့်သွင်းပြီးပါပြီ။\nလက်ရှိလက်ကျန်: *${user.balance} MMK*`, { parse_mode: 'Markdown' });
});

// /admin (Stats)
bot.onText(/\/admin/, async (msg) => {
    if (msg.chat.id !== CONFIG.ADMIN_ID) return;

    const userCount = await User.countDocuments();
    const orderCount = await Order.countDocuments();
    
    // Aggregation for Total Sales (might be slow on large DB)
    const sales = await User.aggregate([{ $group: { _id: null, total: { $sum: "$totalSpent" } } }]);
    const totalSales = sales[0]?.total || 0;

    // Check SMM Balance
    let apiBal = "Error";
    try {
        const res = await callSmmApi({ action: 'balance' });
        apiBal = res.balance + " " + res.currency;
    } catch (e) {}

    bot.sendMessage(msg.chat.id, 
        `👑 *Admin Dashboard*\n\n` +
        `👥 Users: ${userCount}\n` +
        `📦 Orders: ${orderCount}\n` +
        `💸 Total Sales: ${totalSales} MMK\n` +
        `🏦 API Balance: ${apiBal}`, 
        { parse_mode: 'Markdown' }
    );
});

// /ban <userId>
bot.onText(/\/ban (\d+)/, async (msg, match) => {
    if (msg.chat.id !== CONFIG.ADMIN_ID) return;
    await User.updateOne({ telegramId: match[1] }, { isBanned: true });
    bot.sendMessage(msg.chat.id, `🚫 User ${match[1]} has been banned.`);
});

// /unban <userId>
bot.onText(/\/unban (\d+)/, async (msg, match) => {
    if (msg.chat.id !== CONFIG.ADMIN_ID) return;
    await User.updateOne({ telegramId: match[1] }, { isBanned: false });
    bot.sendMessage(msg.chat.id, `✅ User ${match[1]} has been unbanned.`);
});

// /setbalance <userId> <amount>
bot.onText(/\/setbalance (\d+) (\d+)/, async (msg, match) => {
    if (msg.chat.id !== CONFIG.ADMIN_ID) return;
    await User.updateOne({ telegramId: match[1] }, { balance: parseInt(match[2]) });
    bot.sendMessage(msg.chat.id, `✅ Balance set to ${match[2]} for user ${match[1]}.`);
});

// /broadcast <message>
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
    if (msg.chat.id !== CONFIG.ADMIN_ID) return;
    const text = match[1];
    const users = await User.find({});
    
    bot.sendMessage(msg.chat.id, `📢 Sending to ${users.length} users...`);
    
    let success = 0;
    for (const u of users) {
        try {
            await bot.sendMessage(u.telegramId, `📢 *Announcement*\n\n${text}`, { parse_mode: 'Markdown' });
            success++;
        } catch (e) {
            // User blocked bot
        }
    }
    bot.sendMessage(msg.chat.id, `✅ Broadcast complete. Sent to ${success} users.`);
});

console.log("🚀 Bot is running...");