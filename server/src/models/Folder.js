const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    parentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Folder',
        default: null, // null = root level
    },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    sharedWith: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        role: { type: String, enum: ['viewer', 'editor'], default: 'viewer' },
    }],
    isDeleted: {
        type: Boolean,
        default: false,
    },
    deletedAt: Date,
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Indexes for fast folder browsing
folderSchema.index({ ownerId: 1, parentId: 1 });
folderSchema.index({ 'sharedWith.userId': 1 });

module.exports = mongoose.model('Folder', folderSchema);
