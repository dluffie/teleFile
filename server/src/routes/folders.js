const express = require('express');
const Folder = require('../models/Folder');
const File = require('../models/File');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/folders?parentId=xxx
router.get('/', auth, async (req, res) => {
    try {
        const { parentId } = req.query;
        const filter = {
            ownerId: req.userId,
            isDeleted: false,
            parentId: parentId || null,
        };

        const folders = await Folder.find(filter).sort({ name: 1 });
        res.json({ folders });
    } catch (err) {
        console.error('List folders error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/folders
router.post('/', auth, async (req, res) => {
    try {
        const { name, parentId } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Folder name is required' });
        }

        // Verify parent exists if specified
        if (parentId) {
            const parent = await Folder.findOne({ _id: parentId, ownerId: req.userId });
            if (!parent) {
                return res.status(404).json({ error: 'Parent folder not found' });
            }
        }

        const folder = new Folder({
            name: name.trim(),
            parentId: parentId || null,
            ownerId: req.userId,
        });

        await folder.save();
        res.status(201).json({ folder });
    } catch (err) {
        console.error('Create folder error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// PATCH /api/folders/:id
router.patch('/:id', auth, async (req, res) => {
    try {
        const { name, parentId } = req.body;
        const folder = await Folder.findOne({ _id: req.params.id, ownerId: req.userId });

        if (!folder) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        if (name) folder.name = name.trim();
        if (parentId !== undefined) folder.parentId = parentId || null;

        await folder.save();
        res.json({ folder });
    } catch (err) {
        console.error('Update folder error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/folders/:id (soft delete — moves to trash)
router.delete('/:id', auth, async (req, res) => {
    try {
        const folder = await Folder.findOne({ _id: req.params.id, ownerId: req.userId });
        if (!folder) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        // Soft delete folder and all contents
        folder.isDeleted = true;
        folder.deletedAt = new Date();
        await folder.save();

        // Also soft-delete all files in this folder
        await File.updateMany(
            { folderId: folder._id, ownerId: req.userId },
            { isDeleted: true, deletedAt: new Date() }
        );

        // Recursively soft-delete subfolders
        await softDeleteChildren(folder._id, req.userId);

        res.json({ message: 'Folder moved to trash' });
    } catch (err) {
        console.error('Delete folder error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

async function softDeleteChildren(parentId, ownerId) {
    const children = await Folder.find({ parentId, ownerId, isDeleted: false });
    for (const child of children) {
        child.isDeleted = true;
        child.deletedAt = new Date();
        await child.save();
        await File.updateMany(
            { folderId: child._id, ownerId },
            { isDeleted: true, deletedAt: new Date() }
        );
        await softDeleteChildren(child._id, ownerId);
    }
}

module.exports = router;
