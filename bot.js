require('dotenv').config(); // အပေါ်ဆုံးမှာ ဒါလေး အရင်ထည့်ပါ

const TelegramBot = require('node-telegram-bot-api');
const { MongoClient } = require('mongodb'); 
const axios = require('axios');
const express = require('express');

// ================ ၁။ ပြင်ဆင်ရန် လိုအပ်ချက်များ ================

const CONFIG = {
    TOKEN: process.env.BOT_TOKEN,
    ADMIN_ID: process.env.ADMIN_ID,
    EXCHANGE_RATE: 4500,
    API_URL: 'https://brothersmm.com/api',
    API_KEY: process.env.API_KEY,
    MONGO_URL: process.env.MONGO_URL
};

const bot = new TelegramBot(CONFIG.TOKEN, { polling: true });
let usersCol;
const userStates = new Map();

async function initDB() {
    try {
        const client = new MongoClient(CONFIG.MONGO_URL);
        await client.connect();
        usersCol = client.db('lulu_social_boost').collection('users');
        console.log("MongoDB ချိတ်ဆက်မှု အောင်မြင်သည်! ✅");
    } catch (e) {
        console.error("DB ချိတ်ဆက်မှု မှားယွင်းနေသည်: ", e);
    }
}
initDB();
// ================ ၃။ Database Helper Functions ================

async function updateUserBalance(userId, amount) {
    await usersCol.updateOne({ telegram_id: userId }, { $inc: { balance: amount } });
}

async function getUserBalance(userId) {
    const user = await usersCol.findOne({ telegram_id: userId });
    return user ? user.balance : 0;
}

async function checkBan(userId) {
    const user = await usersCol.findOne({ telegram_id: userId });
    return user ? user.is_banned : false;
}

// ================ ၄။ Services List (မပြင်ရ) ================

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

// ================ ၆။ Start Command ================

bot.onText(/\/start|🔙 နောက်ပြန်သွားရန်/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = chatId.toString();
    
    await usersCol.updateOne(
        { telegram_id: userId },
        { $set: { username: msg.from.first_name }, $setOnInsert: { balance: 0, is_banned: false } },
        { upsert: true }
    );
    
    userStates.delete(chatId);
    
    bot.sendMessage(
        chatId,
        `*LuLu Social Boost* မှ ကြိုဆိုပါတယ်ဗျာ။ ✨\n\n` +
        `✅ ငွေဖြည့်ခြင်း၊ ဝန်ဆောင်မှုများတောင်းခံခြင်းကို ဒီ Bot မှတစ်ဆင့် လုပ်ဆောင်နိုင်ပါပြီ။`,
        { 
            parse_mode: 'Markdown',
            ...mainKeyboard 
        }
    );
});

// ================ ၇။ Payment Flow (ပိုကောင်းအောင်ပြင်ထား) ================

bot.onText(/💸 ငွေဖြည့်ရန်/, (msg) => {
    const paymentInstructions = `
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

    bot.sendMessage(msg.chat.id, paymentInstructions, {
        parse_mode: 'Markdown',
        ...paymentKeyboard
    });
});

bot.onText(/📸 Screenshot ပို့ရန်/, (msg) => {
    userStates.set(msg.chat.id, { step: 'WAITING_SS' });
    bot.sendMessage(
        msg.chat.id,
        "ကျေးဇူးပြု၍ ငွေလွှဲထားသော Screenshot ကို ပို့ပေးပါခင်ဗျာ။ 👇\n\n" +
        "Screenshot ထဲတွင် အောက်ပါအချက်များ ပါဝင်ရန် သေချာပါစေ:\n" +
        "✅ လက်ခံသူအမည်\n" +
        "✅ ငွေပမာဏ\n" +
        "✅ လွှဲပြောင်းရက်စွဲ\n" +
        "✅ Transaction ID"
    );
});

// Admin command ကို ပိုလုံခြုံအောင်ပြင်ထား
bot.onText(/\/(approve|addfund|deduct|ban|unban) (\d+)(?: (\d+))?/, async (msg, match) => {
    if (msg.chat.id.toString() !== CONFIG.ADMIN_ID) return;
    const action = match[1];
    const targetId = match[2];
    const amount = parseInt(match[3]) || 0;

    if (action === 'approve' || action === 'addfund') {
        await updateUserBalance(targetId, amount);
        bot.sendMessage(targetId, `💰 Admin မှ ${amount} MMK ဖြည့်ပေးလိုက်ပါပြီ။`);
        bot.sendMessage(CONFIG.ADMIN_ID, `✅ Approved ${amount} for ${targetId}`);
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

// ================ ၈။ Balance Check ================

bot.onText(/💰 လက်ကျန်ငွေစစ်ရန်/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = chatId.toString();
    
    try {
        const balance = await getUserBalance(userId);
        
        const balanceMessage = `
💵 *လက်ကျန်ငွေ အချက်အလက်*

လက်ကျန်ငွေ: *${balance} MMK*
ဒေါ်လာ: *${(balance / CONFIG.EXCHANGE_RATE).toFixed(2)} $*

${balance < 1000 ? '⚠️ လက်ကျန်ငွေ နည်းနေပါသည်။ ဝန်ဆောင်မှုများ အသုံးပြုရန် ငွေဖြည့်ပေးပါ။' : '✅ ဝန်ဆောင်မှုများ အတွက် လုံလောက်သော လက်ကျန်ငွေ ရှိပါသည်။'}
`;
        
        bot.sendMessage(chatId, balanceMessage, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Balance check error:', error);
        bot.sendMessage(chatId, "❌ လက်ကျန်ငွေ စစ်ဆေးရာတွင် အမှားအယွင်း ဖြစ်နေပါသည်။");
    }
});

// ================ ၉။ Services Menu ================

bot.onText(/📱 ရရှိနိုင်သော Service များ/, (msg) => {
    const chatId = msg.chat.id;
    userStates.delete(chatId);
    
    const serviceMenu = `
📌 *မည်သည့် Platform အတွက် ဝန်ဆောင်မှု လိုအပ်ပါသလဲ?*

အောက်ပါ Platform များမှ ရွေးချယ်နိုင်ပါသည်:
`;

    bot.sendMessage(chatId, serviceMenu, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '🎬 TikTok', callback_data: 'group_tt' },
                    { text: '📘 Facebook', callback_data: 'group_fb' }
                ],
                [
                    { text: '📺 YouTube', callback_data: 'group_yt' },
                    { text: '✈️ Telegram', callback_data: 'group_tg' }
                ]
            ]
        }
    });
});

// ================ ၁၀။ Photo Handling ================

bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const state = userStates.get(chatId);
    
    if (state && state.step === 'WAITING_SS') {
        const photoId = msg.photo[msg.photo.length - 1].file_id;
        
        userStates.set(chatId, {
            step: 'WAITING_TXID',
            photo: photoId,
            timestamp: new Date().toISOString()
        });
        
        bot.sendMessage(
            chatId,
            "✅ Screenshot လက်ခံရရှိပါပြီ။\n\n" +
            "ကျေးဇူးပြု၍ *Transaction ID* (နောက်ဆုံးဂဏန်း ၄လုံး) ကို ရိုက်ထည့်ပေးပါ။\n" +
            "ဥပမာ: 1234"
        );
    }
});

// ================ ၁၁။ Message Handling (ပိုကောင်းအောင်ပြင်ထား) ================

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = chatId.toString(); // ID ကို string ပြောင်းရန်
    const text = msg.text;
    const state = userStates.get(chatId);

    if (!text || text.startsWith('/')) return;

    // --- Ban စစ်ဆေးသည့်အပိုင်း ---
    const isBanned = await checkBan(userId);
    if (isBanned) {
        return bot.sendMessage(chatId, "🚫 သင်သည် ဝန်ဆောင်မှုအသုံးပြုခွင့် ပိတ်ပင် (Ban) ခံထားရပါသည်။");
    }
    // -------------------------
    // Payment flow
    if (state) {
        if (state.step === 'WAITING_TXID') {
            if (text.length !== 4 || isNaN(text)) {
                return bot.sendMessage(
                    chatId,
                    "❌ Transaction ID သည် ဂဏန်း ၄လုံးသာ ဖြစ်ရပါမည်။\n" +
                    "ဥပမာ: 5678\n" +
                    "ထပ်မံရိုက်ထည့်ပေးပါ။"
                );
            }

            state.txid = text;
            state.step = 'WAITING_AMOUNT';
            
            return bot.sendMessage(
                chatId,
                "✅ Transaction ID လက်ခံရရှိပါပြီ။\n\n" +
                "ကျေးဇူးပြု၍ *ငွေလွှဲထားသော ပမာဏ (MMK)* ကို ရိုက်ထည့်ပေးပါ။\n" +
                "ဥပမာ: 4500"
            );
        }

        if (state.step === 'WAITING_AMOUNT') {
            const amount = parseInt(text);
            
            if (isNaN(amount) || amount < CONFIG.EXCHANGE_RATE) {
                return bot.sendMessage(
                    chatId,
                    `❌ အနည်းဆုံး ${CONFIG.EXCHANGE_RATE} MMK (1$) ဖြစ်ရပါမည်။\n` +
                    `ထပ်မံရိုက်ထည့်ပေးပါ။`
                );
            }

            // Send confirmation to user
            bot.sendMessage(
                chatId,
                `✅ သင့်ငွေဖြည့်လွှာကို Admin ထံသို့ ပေးပို့ထားပါပြီ။\n\n` +
                `အတည်ပြုချက် ရရှိပါက သင့်အကောင့်သို့ *${amount} MMK* ထည့်သွင်းပေးပါမည်။\n` +
                `ကျေးဇူးပြု၍ စောင့်ဆိုင်းပေးပါ။`,
                mainKeyboard
            );

            // Send to admin
            const adminMessage = `
🔔 *ငွေဖြည့်လွှာအသစ်*

👤 User: ${chatId}
💵 Amount: ${amount} MMK (${(amount/CONFIG.EXCHANGE_RATE).toFixed(2)} $)
📝 TxID: ${state.txid}
⏰ Time: ${new Date().toLocaleString()}

✅ Approve Command:
\`/approve ${chatId} ${amount}\`

❌ Reject လုပ်လိုပါက ဘာမှမလုပ်ပါနှင့်။
`;

            try {
                await bot.sendPhoto(CONFIG.ADMIN_ID, state.photo, {
                    caption: adminMessage,
                    parse_mode: 'Markdown'
                });
            } catch (error) {
                await bot.sendMessage(
                    CONFIG.ADMIN_ID,
                    adminMessage + `\n\n⚠️ Screenshot ပေးပို့ရာတွင် အမှားဖြစ်နေပါသည်။`,
                    { parse_mode: 'Markdown' }
                );
            }

            userStates.delete(chatId);
            return;
        }

        // Order flow
        if (state.step === 'WAITING_LINK') {
            const service = SERVICES[state.serviceKey];
            
            // Basic URL validation
            if (!text.includes('http') || !text.includes('://')) {
                return bot.sendMessage(
                    chatId,
                    "❌ မှားယွင်းသော Link ဖြစ်နေပါသည်။\n" +
                    "ကျေးဇူးပြု၍ မှန်ကန်သော link ကို ထပ်မံပေးပို့ပေးပါ။\n" +
                    "ဥပမာ: https://www.tiktok.com/@username/video/123456789"
                );
            }

            state.link = text;
            state.step = 'WAITING_QTY';
            
            return bot.sendMessage(
                chatId,
                `📌 *${service.name}*\n\n` +
                `🔢 တိုးမြှင့်လိုသော အရေအတွက်ကို ရိုက်ထည့်ပေးပါ\n\n` +
                `အနည်းဆုံး: *${service.min}*\n` +
                `ဥပမာ: ${service.min * 2}`,
                { parse_mode: 'Markdown' }
            );
        }

        if (state.step === 'WAITING_QTY') {
            const qty = parseInt(text);
            const service = SERVICES[state.serviceKey];
            
            if (isNaN(qty) || qty < service.min) {
                return bot.sendMessage(
                    chatId,
                    `⚠️ အနည်းဆုံး ${service.min} ဖြစ်ရပါမည်။\n` +
                    `ကျေးဇူးပြု၍ ထပ်မံရိုက်ထည့်ပေးပါ။`
                );
            }

            const cost = Math.ceil((qty / 1000) * service.price * CONFIG.EXCHANGE_RATE);
            
            state.qty = qty;
            state.cost = cost;
            state.step = 'CONFIRMING';

            const orderSummary = `
📋 *အော်ဒါ အကျဉ်းချုပ်*

🛒 Service: ${service.name}
🔗 Link: ${state.link.substring(0, 30)}...
📊 Quantity: ${qty}
⏰ Estimated Time: ${service.time}
💰 Total Cost: *${cost} MMK*

လက်ရှိလက်ကျန်ငွေ: *${await getUserBalance(chatId.toString())} MMK*
`;

            return bot.sendMessage(chatId, orderSummary, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ အတည်ပြုမည်', callback_data: 'confirm_order' },
                            { text: '❌ ပယ်ဖျက်မည်', callback_data: 'order_cancel' }
                        ]
                    ]
                }
            });
        }
    }
});

// ================ ၁၂။ Callback Query Handling ================

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = chatId.toString();
    const messageId = query.message.message_id;
    const data = query.data;

    // --- Ban စစ်ဆေးသည့်အပိုင်း ---
    const isBanned = await checkBan(userId);
    if (isBanned) {
        return bot.answerCallbackQuery(query.id, {
            text: "🚫 သင်သည် Ban ခံထားရသဖြင့် အသုံးပြု၍မရပါ။",
            show_alert: true
        });
    }
    // -------------------------

    try {
        // Main menu
        if (data === 'main_menu') {
            return await bot.editMessageText(
                "📌 *ဝန်ဆောင်မှု Platform ရွေးချယ်ရန်*",
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '🎬 TikTok', callback_data: 'group_tt' },
                                { text: '📘 Facebook', callback_data: 'group_fb' }
                            ],
                            [
                                { text: '📺 YouTube', callback_data: 'group_yt' },
                                { text: '✈️ Telegram', callback_data: 'group_tg' }
                            ]
                        ]
                    }
                }
            );
        }

        // Platform selection
        const platformMenus = {
            'group_tt': {
                title: "🎬 *TikTok Services*",
                services: [
                    { text: "❤️ Likes", callback_data: 'order_tt_likes' },
                    { text: "👁️ Views", callback_data: 'order_tt_views' },
                    { text: "🚀 Shares", callback_data: 'order_tt_shares' },
                    { text: "💾 Saves", callback_data: 'order_tt_saves' },
                    { text: "👤 Followers", callback_data: 'order_tt_foll' }
                ]
            },
            'group_fb': {
                title: "📘 *Facebook Services*",
                services: [
                    { text: "👤 Followers", callback_data: 'order_fb_foll' },
                    { text: "👍 Likes", callback_data: 'order_fb_likes' },
                    { text: "❤️ Love", callback_data: 'order_fb_love' },
                    { text: "🤗 Care", callback_data: 'order_fb_care' },
                    { text: "😂 Haha", callback_data: 'order_fb_haha' },
                    { text: "😲 Wow", callback_data: 'order_fb_wow' }
                ]
            },
            'group_yt': {
                title: "📺 *YouTube Services*",
                services: [
                    { text: "👤 Subscribers", callback_data: 'order_yt_subs' },
                    { text: "👁️ Views", callback_data: 'order_yt_views' }
                ]
            },
            'group_tg': {
                title: "✈️ *Telegram Services*",
                services: [
                    { text: "👁️ Views", callback_data: 'order_tg_views' },
                    { text: "👤 Members", callback_data: 'order_tg_mem' }
                ]
            }
        };

        if (platformMenus[data]) {
            const menu = platformMenus[data];
            const keyboard = [];
            
            // Create rows of 2 buttons each
            for (let i = 0; i < menu.services.length; i += 2) {
                const row = menu.services.slice(i, i + 2);
                keyboard.push(row);
            }
            
            // Add back button
            keyboard.push([{ text: "🔙 နောက်သို့", callback_data: 'main_menu' }]);

            return await bot.editMessageText(
                menu.title + "\n\nမည်သည့် ဝန်ဆောင်မှုကို ရွေးချယ်မည်နည်း?",
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: keyboard }
                }
            );
        }

        // Order initiation
        if (data.startsWith('order_')) {
            const key = data.replace('order_', '');
            const service = SERVICES[key];
            
            if (!service) {
                return await bot.answerCallbackQuery(query.id, {
                    text: '❌ ဝန်ဆောင်မှု မတွေ့ရှိပါ',
                    show_alert: true
                });
            }

            userStates.set(chatId, {
                step: 'WAITING_LINK',
                serviceKey: key,
                serviceName: service.name
            });

            await bot.deleteMessage(chatId, messageId);
            
            await bot.sendMessage(
                chatId,
                `📌 *${service.name}*\n\n` +
                `💰 နှုန်းထား: ${service.price}$ per 1000\n` +
                `⏱️ ပျမ်းမျှကြာချိန်: ${service.time}\n` +
                `📦 အနည်းဆုံးအရေအတွက်: ${service.min}\n\n` +
                `🔗 ကျေးဇူးပြု၍ သင့် ${service.name.includes('TikTok') ? 'TikTok' : 
                  service.name.includes('Facebook') ? 'Facebook' : 
                  service.name.includes('YouTube') ? 'YouTube' : 'Telegram'} link ကို ပေးပို့ပါ။`,
                { parse_mode: 'Markdown' }
            );
            
            return await bot.answerCallbackQuery(query.id);
        }

        // Order confirmation
        if (data === 'confirm_order') {
            const state = userStates.get(chatId);
            
            if (!state) {
                return await bot.answerCallbackQuery(query.id, {
                    text: '❌ အော်ဒါ အချက်အလက်များ မရှိပါ',
                    show_alert: true
                });
            }

            const service = SERVICES[state.serviceKey];
            const userId = chatId.toString();
            
            // Check balance
            const balance = await getUserBalance(userId);
            
            if (balance < state.cost) {
                return await bot.answerCallbackQuery(query.id, {
                    text: `❌ လက်ကျန်ငွေ မလုံလောက်ပါ။\nလိုအပ်ငွေ: ${state.cost} MMK\nလက်ကျန်ငွေ: ${balance} MMK`,
                    show_alert: true
                });
            }

            // API call to place order
            try {
                const params = new URLSearchParams();
                params.append('apiKey', CONFIG.API_KEY);
                params.append('actionType', 'add');
                params.append('orderType', service.id);
                params.append('orderUrl', state.link);
                params.append('orderQuantity', state.qty);

                const response = await axios.post(CONFIG.API_URL, params, {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 10000
                });

                if (response.data && response.data.orderID) {
                    // Deduct balance
                    await updateUserBalance(userId, -state.cost);
                    // Notify user
                    await bot.deleteMessage(chatId, messageId);
                    await bot.sendMessage(
                        chatId,
                        `✅ *အော်ဒါတင်ခြင်း အောင်မြင်ပါသည်!*\n\n` +
                        `📋 Order ID: \`${response.data.orderID}\`\n` +
                        `🛒 Service: ${service.name}\n` +
                        `🔢 Quantity: ${state.qty}\n` +
                        `💰 ကုန်ကျငွေ: ${state.cost} MMK\n` +
                        `⏱️ ခန့်မှန်းကြာချိန်: ${service.time}\n` +
                        `📊 လက်ကျန်ငွေ: ${balance - state.cost} MMK\n\n` +
                        `📞 အကူအညီလိုပါက Admin ကို ဆက်သွယ်နိုင်ပါသည်။`,
                        { parse_mode: 'Markdown', ...mainKeyboard }
                    );

                    // Notify admin
                    await bot.sendMessage(
                        CONFIG.ADMIN_ID,
                        `🔔 *အော်ဒါအသစ်*\n\n` +
                        `👤 User: ${chatId}\n` +
                        `🛒 Service: ${service.name}\n` +
                        `📋 Order ID: ${response.data.orderID}\n` +
                        `🔢 Quantity: ${state.qty}\n` +
                        `💰 Amount: ${state.cost} MMK\n` +
                        `⏰ Time: ${new Date().toLocaleString()}`,
                        { parse_mode: 'Markdown' }
                    );
                } else {
                    throw new Error(response.data.error || 'Unknown API error');
                }
            } catch (error) {
                console.error('API Error:', error);
                
                await bot.deleteMessage(chatId, messageId);
                await bot.sendMessage(
                    chatId,
                    `❌ အော်ဒါတင်ခြင်း မအောင်မြင်ပါ။\n\n` +
                    `အကြောင်းရင်း: ${error.message || 'API Error'}\n\n` +
                    `ကျေးဇူးပြု၍ နောက်မှ ထပ်မံကြိုးစားကြည့်ပါ။`,
                    { parse_mode: 'Markdown', ...mainKeyboard }
                );
            }

            userStates.delete(chatId);
            return await bot.answerCallbackQuery(query.id);
        }

        // Order cancellation
        if (data === 'order_cancel') {
            userStates.delete(chatId);
            
            await bot.deleteMessage(chatId, messageId);
            await bot.sendMessage(
                chatId,
                "❌ အော်ဒါကို ပယ်ဖျက်လိုက်ပါပြီ။\n\n" +
                "ကျေးဇူးပြု၍ ပြန်လည်ရွေးချယ်ပေးပါ။",
                mainKeyboard
            );
            
            return await bot.answerCallbackQuery(query.id);
        }

    } catch (error) {
        console.error('Callback query error:', error);
        await bot.answerCallbackQuery(query.id, {
            text: '❌ အမှားအယွင်း ဖြစ်နေပါသည်',
            show_alert: true
        });
    }
});

// ================ ၁၃။ Error Handling ================

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

bot.on('error', (error) => {
    console.error('Bot error:', error);
});

// ================ ၁၄။ Startup Message ================

console.log("========================================");
console.log("🤖 LuLu Social Boost Bot စတင်နေပါသည်...");
console.log("✅ Database: MongoDB Atlas (lulu_db)");
console.log("✅ Admin ID: " + CONFIG.ADMIN_ID);
console.log("✅ Exchange Rate: " + CONFIG.EXCHANGE_RATE + " MMK/USD");
console.log("✅ Services Available: " + Object.keys(SERVICES).length);
console.log("========================================");
// ================ ၁၅။ Render အတွက် Port ဖွင့်ပေးခြင်း ================

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot is running online! 🤖✅');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
const http = require('http');
http.createServer((req, res) => {
    res.write('Bot is running!');
    res.end();
}).listen(process.env.PORT || 3000);