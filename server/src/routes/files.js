const express = require('express');
const Busboy = require('busboy');
const File = require('../models/File');
const User = require('../models/User');
const auth = require('../middleware/auth');
const telegram = require('../services/telegram');
const uploadQueue = require('../services/uploadQueue');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// GET /api/files?folderId=xxx
router.get('/', auth, async (req, res) => {
    try {
        const { folderId } = req.query;
        const files = await File.find({
            ownerId: req.userId,
            folderId: folderId || null,
            isDeleted: false,
        }).sort({ createdAt: -1 });

        res.json({ files });
    } catch (err) {
        console.error('List files error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/files/recent
router.get('/recent', auth, async (req, res) => {
    try {
        const files = await File.find({
            ownerId: req.userId,
            isDeleted: false,
            uploadComplete: true,
        })
            .sort({ createdAt: -1 })
            .limit(20);

        res.json({ files });
    } catch (err) {
        console.error('Recent files error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/files/trash
router.get('/trash', auth, async (req, res) => {
    try {
        const files = await File.find({
            ownerId: req.userId,
            isDeleted: true,
        }).sort({ deletedAt: -1 });

        res.json({ files });
    } catch (err) {
        console.error('Trash files error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/files/upload
// Accepts multipart: file chunk + metadata fields
router.post('/upload', auth, async (req, res) => {
    try {
        const busboy = Busboy({ headers: req.headers, limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB max
        let fileBuffer = null;
        let fields = {};

        busboy.on('field', (name, val) => {
            fields[name] = val;
        });

        busboy.on('file', (name, stream, info) => {
            const chunks = [];
            stream.on('data', (data) => chunks.push(data));
            stream.on('end', () => {
                fileBuffer = Buffer.concat(chunks);
            });
        });

        busboy.on('finish', async () => {
            try {
                const { fileName, chunkIndex, totalChunks, fileId, folderId, mimeType, totalSize } = fields;
                const chunkIdx = parseInt(chunkIndex, 10);
                const totalChunksNum = parseInt(totalChunks, 10);

                if (!fileName || isNaN(chunkIdx) || isNaN(totalChunksNum)) {
                    return res.status(400).json({ error: 'Missing required fields: fileName, chunkIndex, totalChunks' });
                }

                if (!fileBuffer || fileBuffer.length === 0) {
                    return res.status(400).json({ error: 'No file data received' });
                }

                // Upload chunk to Telegram via queue
                const chunkName = `${fileName}.part${chunkIdx}`;
                const tgResult = await uploadQueue.enqueue(() =>
                    telegram.uploadChunk(fileBuffer, chunkName)
                );

                // Free buffer
                fileBuffer = null;

                let fileDoc;

                if (fileId) {
                    // Existing file — add chunk
                    fileDoc = await File.findOne({ _id: fileId, ownerId: req.userId });
                    if (!fileDoc) {
                        return res.status(404).json({ error: 'File record not found' });
                    }
                } else {
                    // First chunk — create file record
                    fileDoc = new File({
                        name: fileName,
                        size: parseInt(totalSize, 10) || 0,
                        mimeType: mimeType || 'application/octet-stream',
                        folderId: folderId || null,
                        ownerId: req.userId,
                        totalChunks: totalChunksNum,
                        chunks: [],
                        uploadComplete: false,
                    });
                }

                // Add chunk info
                fileDoc.chunks.push({
                    partNumber: chunkIdx,
                    telegramFileId: tgResult.fileId,
                    telegramMessageId: tgResult.messageId,
                    size: parseInt(fields.chunkSize, 10) || fileBuffer?.length || 0,
                });

                // Auto-complete if all chunks received
                if (fileDoc.chunks.length >= totalChunksNum) {
                    fileDoc.uploadComplete = true;
                    // Sort chunks by partNumber
                    fileDoc.chunks.sort((a, b) => a.partNumber - b.partNumber);

                    // Update user storage
                    await User.findByIdAndUpdate(req.userId, {
                        $inc: { storageUsed: fileDoc.size },
                    });
                }

                await fileDoc.save();

                res.json({
                    fileId: fileDoc._id,
                    chunkIndex: chunkIdx,
                    uploaded: fileDoc.chunks.length,
                    total: totalChunksNum,
                    complete: fileDoc.uploadComplete,
                });
            } catch (err) {
                console.error('Upload chunk process error:', err);
                res.status(500).json({ error: err.message || 'Upload failed' });
            }
        });

        req.pipe(busboy);
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// GET /api/files/:id/download
router.get('/:id/download', auth, async (req, res) => {
    try {
        const file = await File.findOne({
            _id: req.params.id,
            ownerId: req.userId,
            uploadComplete: true,
        });

        if (!file) {
            return res.status(404).json({ error: 'File not found or upload incomplete' });
        }

        // Set headers for download
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
        res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
        if (file.size) {
            res.setHeader('Content-Length', file.size);
        }

        // Stream chunks in order
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
        console.error('Download error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Download failed' });
        }
    }
});

// GET /api/files/:id/preview — stream file for inline viewing (images, videos, PDFs)
router.get('/:id/preview', auth, async (req, res) => {
    try {
        const file = await File.findOne({
            _id: req.params.id,
            ownerId: req.userId,
            uploadComplete: true,
        });

        if (!file) {
            return res.status(404).json({ error: 'File not found or upload incomplete' });
        }

        const mimeType = file.mimeType || 'application/octet-stream';
        const fileSize = file.size;

        // Set inline headers
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'private, max-age=3600');

        // Sort chunks
        const sortedChunks = [...file.chunks].sort((a, b) => a.partNumber - b.partNumber);

        // Handle Range requests (Crucial for video seeking)
        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkLength = end - start + 1;

            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            res.setHeader('Content-Length', chunkLength);

            // Calculate which chunks we need
            let currentOffset = 0;
            for (const chunk of sortedChunks) {
                const chunkStart = currentOffset;
                const chunkEnd = currentOffset + chunk.size - 1;

                // Check if this chunk overlaps with requested range
                if (chunkEnd >= start && chunkStart <= end) {
                    // Overlap found
                    const stream = await telegram.downloadChunk(chunk.telegramFileId);

                    // We need to slice the chunk stream if it's partially requested
                    // For simplicity in this implementation, we'll pipe the key parts.
                    // Note: Ideally we'd slice the buffer, but getting a stream from TG makes exact byte slicing tricky without buffering the chunk.
                    // Standard strategy: Stream the whole relevant chunks and let client/browser handle the extra bytes if any, 
                    // OR buffer just the specific chunks needed.

                    // Since chunks are 20MB max, buffering ONE chunk at a time is acceptable.

                    const chunkBuffer = await new Promise((resolve, reject) => {
                        const chunks = [];
                        stream.on('data', c => chunks.push(c));
                        stream.on('end', () => resolve(Buffer.concat(chunks)));
                        stream.on('error', reject);
                    });

                    // Calculate slice relative to chunk
                    const startInChunk = Math.max(0, start - chunkStart);
                    const endInChunk = Math.min(chunk.size - 1, end - chunkStart);

                    const sliced = chunkBuffer.subarray(startInChunk, endInChunk + 1);
                    res.write(sliced);
                }

                currentOffset += chunk.size;
                if (currentOffset > end) break;
            }
            res.end();
            return;
        }

        // No Range request — stream all chunks sequentially
        res.setHeader('Content-Length', fileSize);

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
        console.error('Preview error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Preview failed' });
        }
    }
});

// DELETE /api/files/:id (soft delete)
router.delete('/:id', auth, async (req, res) => {
    try {
        const file = await File.findOne({ _id: req.params.id, ownerId: req.userId });
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        file.isDeleted = true;
        file.deletedAt = new Date();
        await file.save();

        res.json({ message: 'File moved to trash' });
    } catch (err) {
        console.error('Delete file error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/files/:id/restore
router.post('/:id/restore', auth, async (req, res) => {
    try {
        const file = await File.findOne({ _id: req.params.id, ownerId: req.userId, isDeleted: true });
        if (!file) {
            return res.status(404).json({ error: 'File not found in trash' });
        }

        file.isDeleted = false;
        file.deletedAt = null;
        await file.save();

        res.json({ message: 'File restored', file });
    } catch (err) {
        console.error('Restore file error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/files/:id/permanent
router.delete('/:id/permanent', auth, async (req, res) => {
    try {
        const file = await File.findOne({ _id: req.params.id, ownerId: req.userId });
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Delete chunks from Telegram
        for (const chunk of file.chunks) {
            try {
                await uploadQueue.enqueue(() => telegram.deleteMessage(chunk.telegramMessageId));
            } catch (err) {
                console.warn(`Failed to delete TG message ${chunk.telegramMessageId}:`, err.message);
            }
        }

        // Update user storage
        if (file.uploadComplete) {
            await User.findByIdAndUpdate(req.userId, {
                $inc: { storageUsed: -file.size },
            });
        }

        await File.findByIdAndDelete(file._id);

        res.json({ message: 'File permanently deleted' });
    } catch (err) {
        console.error('Permanent delete error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// PATCH /api/files/:id (rename / move)
router.patch('/:id', auth, async (req, res) => {
    try {
        const { name, folderId } = req.body;
        const file = await File.findOne({ _id: req.params.id, ownerId: req.userId });

        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        if (name) file.name = name.trim();
        if (folderId !== undefined) file.folderId = folderId || null;

        await file.save();
        res.json({ file });
    } catch (err) {
        console.error('Update file error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
