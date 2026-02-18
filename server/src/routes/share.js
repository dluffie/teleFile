const express = require('express');
const crypto = require('crypto');
const File = require('../models/File');
const auth = require('../middleware/auth');
const telegram = require('../services/telegram');

const router = express.Router();

// POST /api/share/:id — Generate share link for a file
router.post('/:id', auth, async (req, res) => {
    try {
        const file = await File.findOne({ _id: req.params.id, ownerId: req.userId });
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Generate token if not exists
        if (!file.shareLinkToken) {
            file.shareLinkToken = crypto.randomBytes(24).toString('hex');
        }

        // Optional expiry (default 7 days)
        const { expiresInDays } = req.body;
        if (expiresInDays) {
            file.shareExpiry = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
        }

        await file.save();

        res.json({
            shareLink: `/share/${file.shareLinkToken}`,
            token: file.shareLinkToken,
            expiresAt: file.shareExpiry,
        });
    } catch (err) {
        console.error('Share error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/share/:id — Remove share link
router.delete('/:id', auth, async (req, res) => {
    try {
        const file = await File.findOne({ _id: req.params.id, ownerId: req.userId });
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        file.shareLinkToken = undefined;
        file.shareExpiry = undefined;
        await file.save();

        res.json({ message: 'Share link removed' });
    } catch (err) {
        console.error('Unshare error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/share/download/:token — Public download via share link
router.get('/download/:token', async (req, res) => {
    try {
        const file = await File.findOne({
            shareLinkToken: req.params.token,
            isDeleted: false,
            uploadComplete: true,
        });

        if (!file) {
            return res.status(404).json({ error: 'Shared file not found or link expired' });
        }

        // Check expiry
        if (file.shareExpiry && new Date() > file.shareExpiry) {
            return res.status(410).json({ error: 'Share link has expired' });
        }

        // Stream download
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
        res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
        if (file.size) res.setHeader('Content-Length', file.size);

        const sortedChunks = [...file.chunks].sort((a, b) => a.partNumber - b.partNumber);

        for (const chunk of sortedChunks) {
            const stream = await telegram.downloadChunk(chunk.telegramFileId);
            await new Promise((resolve, reject) => {
                stream.pipe(res, { end: false });
                stream.on('end', resolve);
                stream.on('error', reject);
            });
        }

        res.end();
    } catch (err) {
        console.error('Shared download error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Download failed' });
        }
    }
});

// GET /api/share/info/:token — Get shared file info (no auth needed)
router.get('/info/:token', async (req, res) => {
    try {
        const file = await File.findOne({
            shareLinkToken: req.params.token,
            isDeleted: false,
            uploadComplete: true,
        }).select('name size mimeType createdAt shareExpiry');

        if (!file) {
            return res.status(404).json({ error: 'Shared file not found' });
        }

        if (file.shareExpiry && new Date() > file.shareExpiry) {
            return res.status(410).json({ error: 'Share link has expired' });
        }

        res.json({ file });
    } catch (err) {
        console.error('Share info error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
