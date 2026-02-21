const fetch = require('node-fetch');
const FormData = require('form-data');

const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = () => process.env.TELEGRAM_CHAT_ID;
const API_BASE = () => `https://api.telegram.org/bot${BOT_TOKEN()}`;

/**
 * Upload a buffer as a document to the Telegram channel
 * @param {Buffer} buffer - file data
 * @param {string} filename - original filename
 * @returns {{ fileId: string, messageId: number }}
 */
async function uploadChunk(buffer, filename) {
    const form = new FormData();
    form.append('chat_id', CHAT_ID());
    form.append('document', buffer, { filename, contentType: 'application/octet-stream' });

    const res = await fetch(`${API_BASE()}/sendDocument`, {
        method: 'POST',
        body: form,
    });

    const data = await res.json();
    if (!data.ok) {
        throw new Error(`Telegram upload failed: ${data.description || 'Unknown error'}`);
    }

    return {
        fileId: data.result.document.file_id,
        messageId: data.result.message_id,
    };
}

/**
 * Download a file from Telegram by file_id → returns a readable stream
 * @param {string} fileId
 * @returns {ReadableStream}
 */
async function downloadChunk(fileId) {
    // Step 1: get file path
    const fileRes = await fetch(`${API_BASE()}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();

    if (!fileData.ok) {
        throw new Error(`Telegram getFile failed: ${fileData.description || 'Unknown error'}`);
    }

    const filePath = fileData.result.file_path;

    // Step 2: download the file
    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN()}/${filePath}`;
    const downloadRes = await fetch(downloadUrl);

    if (!downloadRes.ok) {
        throw new Error(`Telegram download failed: ${downloadRes.status}`);
    }

    return downloadRes.body; // Node.js readable stream
}

/**
 * Delete a message from the storage channel
 * @param {number} messageId
 * @returns {boolean} true if deleted successfully
 */
async function deleteMessage(messageId) {
    const res = await fetch(`${API_BASE()}/deleteMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: CHAT_ID(),
            message_id: messageId,
        }),
    });

    const data = await res.json();
    if (!data.ok) {
        console.warn(`Telegram deleteMessage warning: ${data.description}`);
    }
    return data.ok;
}

/**
 * Mark a message as deleted by editing its caption to #deleted
 * This is used when deleteMessage fails (message > 48h old).
 * Admin can search #deleted in the chat to find and clean up manually.
 * @param {number} messageId
 * @param {string} fileName - original file name for reference
 */
async function markAsDeleted(messageId, fileName) {
    try {
        const res = await fetch(`${API_BASE()}/editMessageCaption`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID(),
                message_id: messageId,
                caption: `#deleted ${fileName || 'unknown'}`,
            }),
        });

        const data = await res.json();
        if (!data.ok) {
            console.warn(`Telegram markAsDeleted warning: ${data.description}`);
        }
        return data.ok;
    } catch (err) {
        console.warn(`markAsDeleted failed for message ${messageId}:`, err.message);
        return false;
    }
}

module.exports = { uploadChunk, downloadChunk, deleteMessage, markAsDeleted };
