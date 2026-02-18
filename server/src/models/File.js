const mongoose = require('mongoose');

const chunkSchema = new mongoose.Schema({
    partNumber: { type: Number, required: true },
    telegramFileId: { type: String, required: true },
    telegramMessageId: { type: Number, required: true },
    size: { type: Number, required: true },
}, { _id: false });

const fileSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    size: {
        type: Number,
        default: 0,
    },
    mimeType: {
        type: String,
        default: 'application/octet-stream',
    },
    folderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Folder',
        default: null, // null = root level
    },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    chunks: [chunkSchema],
    totalChunks: {
        type: Number,
        default: 0,
    },
    uploadComplete: {
        type: Boolean,
        default: false,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
    deletedAt: Date,
    // Sharing
    shareLinkToken: {
        type: String,
        unique: true,
        sparse: true,
    },
    shareExpiry: Date,
    sharedWith: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        role: { type: String, enum: ['viewer', 'editor'], default: 'viewer' },
    }],
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Indexes
fileSchema.index({ ownerId: 1, folderId: 1 });
fileSchema.index({ shareLinkToken: 1 });
fileSchema.index({ isDeleted: 1, ownerId: 1 });

module.exports = mongoose.model('File', fileSchema);
