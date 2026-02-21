import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import {
    FiFolder, FiFile, FiImage, FiVideo, FiMusic, FiArchive, FiFileText,
    FiUploadCloud, FiTrash2, FiClock, FiHardDrive, FiGrid, FiList,
    FiMoreVertical, FiDownload, FiShare2, FiEdit3, FiX, FiChevronRight,
    FiMenu, FiLogOut, FiPlus, FiRefreshCw, FiHome, FiLink, FiCopy
} from 'react-icons/fi';
import FilePreview from '../components/FilePreview';

const CHUNK_SIZE = 20 * 1024 * 1024; // 20MB

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });
}

function getFileIcon(mimeType) {
    if (!mimeType) return { icon: FiFile, cls: 'file-icon' };
    if (mimeType.startsWith('image/')) return { icon: FiImage, cls: 'image-icon' };
    if (mimeType.startsWith('video/')) return { icon: FiVideo, cls: 'video-icon' };
    if (mimeType.startsWith('audio/')) return { icon: FiMusic, cls: 'audio-icon' };
    if (mimeType.includes('pdf')) return { icon: FiFileText, cls: 'pdf-icon' };
    if (mimeType.includes('zip') || mimeType.includes('rar')) return { icon: FiArchive, cls: 'archive-icon' };
    return { icon: FiFile, cls: 'file-icon' };
}

export default function Dashboard({ page }) {
    const { folderId } = useParams();
    const navigate = useNavigate();
    const { user, logout, refreshUser } = useAuth();

    const [folders, setFolders] = useState([]);
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('grid');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [breadcrumbs, setBreadcrumbs] = useState([]);
    const [currentFolderName, setCurrentFolderName] = useState(null);

    // Upload state
    const [showUpload, setShowUpload] = useState(false);
    const [uploadFiles, setUploadFiles] = useState([]);
    const [uploading, setUploading] = useState(false);

    // Context menu
    const [ctxMenu, setCtxMenu] = useState(null);

    // Modals
    const [renameModal, setRenameModal] = useState(null);
    const [newFolderModal, setNewFolderModal] = useState(false);
    const [shareModal, setShareModal] = useState(null);
    const [previewFile, setPreviewFile] = useState(null);

    const currentFolderId = folderId || null;
    const isTrash = page === 'trash';
    const isRecent = page === 'recent';

    // Fetch data
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            if (isTrash) {
                const res = await api.get('/files/trash');
                setFiles(res.data.files);
                setFolders([]);
            } else if (isRecent) {
                const res = await api.get('/files/recent');
                setFiles(res.data.files);
                setFolders([]);
            } else {
                const [fRes, fiRes] = await Promise.all([
                    api.get('/folders', { params: { parentId: currentFolderId } }),
                    api.get('/files', { params: { folderId: currentFolderId } }),
                ]);
                setFolders(fRes.data.folders);
                setFiles(fiRes.data.files);
            }
        } catch (err) {
            toast.error('Failed to load files');
        } finally {
            setLoading(false);
        }
    }, [currentFolderId, isTrash, isRecent]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Fetch current folder name and breadcrumbs
    useEffect(() => {
        if (currentFolderId) {
            fetchFolderName(currentFolderId);
        } else {
            setCurrentFolderName(null);
            setBreadcrumbs([]);
        }
    }, [currentFolderId]);

    async function fetchFolderName(fId) {
        try {
            const res = await api.get(`/folders/${fId}`);
            const folder = res.data.folder;
            setCurrentFolderName(folder.name);

            // Build breadcrumb chain by walking up parentId
            const crumbs = [{ id: folder._id, name: folder.name }];
            let parentId = folder.parentId;
            while (parentId) {
                try {
                    const parentRes = await api.get(`/folders/${parentId}`);
                    crumbs.unshift({ id: parentRes.data.folder._id, name: parentRes.data.folder.name });
                    parentId = parentRes.data.folder.parentId;
                } catch {
                    break;
                }
            }
            setBreadcrumbs(crumbs);
        } catch {
            setCurrentFolderName('Folder');
            setBreadcrumbs([]);
        }
    }

    // Close context menu on click outside
    useEffect(() => {
        const close = () => setCtxMenu(null);
        window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, []);

    // ===== FOLDER OPERATIONS =====
    const createFolder = async (name) => {
        try {
            await api.post('/folders', { name, parentId: currentFolderId });
            toast.success('Folder created');
            setNewFolderModal(false);
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to create folder');
        }
    };

    const deleteFolder = async (id) => {
        try {
            await api.delete(`/folders/${id}`);
            toast.success('Folder moved to trash');
            fetchData();
        } catch (err) {
            toast.error('Failed to delete folder');
        }
    };

    const renameFolder = async (id, name) => {
        try {
            await api.patch(`/folders/${id}`, { name });
            toast.success('Folder renamed');
            setRenameModal(null);
            fetchData();
        } catch (err) {
            toast.error('Failed to rename folder');
        }
    };

    // ===== FILE OPERATIONS =====
    const handleUpload = async (selectedFiles) => {
        if (!selectedFiles.length) return;

        setUploading(true);
        const items = Array.from(selectedFiles).map((f) => ({
            file: f,
            name: f.name,
            size: f.size,
            progress: 0,
            status: 'pending',
            error: null,
            chunksUploaded: 0,
            totalChunks: Math.ceil(f.size / CHUNK_SIZE),
        }));
        setUploadFiles(items);

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const totalChunks = Math.ceil(item.size / CHUNK_SIZE);
            let fileId = null;

            try {
                for (let chunk = 0; chunk < totalChunks; chunk++) {
                    const start = chunk * CHUNK_SIZE;
                    const end = Math.min(start + CHUNK_SIZE, item.size);
                    const blob = item.file.slice(start, end);

                    const formData = new FormData();
                    formData.append('file', blob, `${item.name}.part${chunk}`);
                    formData.append('fileName', item.name);
                    formData.append('chunkIndex', chunk.toString());
                    formData.append('totalChunks', totalChunks.toString());
                    formData.append('mimeType', item.file.type || 'application/octet-stream');
                    formData.append('totalSize', item.size.toString());
                    formData.append('chunkSize', (end - start).toString());
                    if (fileId) formData.append('fileId', fileId);
                    if (currentFolderId) formData.append('folderId', currentFolderId);

                    const res = await api.post('/files/upload', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                    });

                    fileId = res.data.fileId;

                    // Update progress
                    const progress = Math.round(((chunk + 1) / totalChunks) * 100);
                    items[i] = { ...items[i], progress, status: 'uploading', chunksUploaded: chunk + 1 };
                    setUploadFiles([...items]);
                }

                items[i] = { ...items[i], progress: 100, status: 'complete' };
                setUploadFiles([...items]);
            } catch (err) {
                items[i] = {
                    ...items[i],
                    status: 'error',
                    error: err.response?.data?.error || 'Upload failed',
                };
                setUploadFiles([...items]);
            }
        }

        setUploading(false);
        fetchData();
        refreshUser();
        // Brief delay so user sees the completion status, then auto-close
        setTimeout(() => {
            toast.success('Upload complete!');
            setShowUpload(false);
            setUploadFiles([]);
        }, 1500);
    };

    const downloadFile = async (file) => {
        try {
            toast.loading('Preparing download…', { id: 'download' });
            const res = await api.get(`/files/${file._id}/download`, {
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            a.click();
            window.URL.revokeObjectURL(url);
            toast.success('Download started!', { id: 'download' });
        } catch (err) {
            toast.error('Download failed', { id: 'download' });
        }
    };

    const deleteFile = async (id) => {
        try {
            await api.delete(`/files/${id}`);
            toast.success('File moved to trash');
            fetchData();
        } catch (err) {
            toast.error('Failed to delete file');
        }
    };

    const restoreFile = async (id) => {
        try {
            await api.post(`/files/${id}/restore`);
            toast.success('File restored');
            fetchData();
        } catch (err) {
            toast.error('Failed to restore file');
        }
    };

    const permanentDelete = async (id) => {
        if (!confirm('Permanently delete this file? This cannot be undone.')) return;
        try {
            await api.delete(`/files/${id}/permanent`);
            toast.success('File permanently deleted');
            fetchData();
            refreshUser();
        } catch (err) {
            toast.error('Failed to delete file');
        }
    };

    const renameFile = async (id, name) => {
        try {
            await api.patch(`/files/${id}`, { name });
            toast.success('File renamed');
            setRenameModal(null);
            fetchData();
        } catch (err) {
            toast.error('Failed to rename');
        }
    };

    const shareFile = async (id) => {
        try {
            const res = await api.post(`/share/${id}`);
            setShareModal({
                link: `${window.location.origin}/share/${res.data.token}`,
                token: res.data.token,
            });
        } catch (err) {
            toast.error('Failed to create share link');
        }
    };

    // ===== CONTEXT MENU =====
    const handleContextMenu = (e, item, type) => {
        e.preventDefault();
        e.stopPropagation();
        setCtxMenu({ x: e.clientX, y: e.clientY, item, type });
    };

    // ===== RENDER =====
    const navItems = [
        { path: '/drive', icon: FiHardDrive, label: 'My Drive', active: !isTrash && !isRecent && !folderId },
        { path: '/recent', icon: FiClock, label: 'Recent', active: isRecent },
        { path: '/trash', icon: FiTrash2, label: 'Trash', active: isTrash },
    ];

    // Storage is unlimited (Telegram-backed), show usage only
    const storageUsed = user?.storageUsed || 0;

    return (
        <div className="app-layout">
            {/* Mobile overlay */}
            {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

            {/* Sidebar */}
            <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-logo">
                    <img src="/logo.png" alt="TeleFile" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                    <h1>TeleFile</h1>
                </div>

                <div className="upload-btn-wrap">
                    <button className="upload-btn" onClick={() => setShowUpload(true)}>
                        <FiUploadCloud /> Upload Files
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map((item) => (
                        <button
                            key={item.path}
                            className={`nav-item ${item.active ? 'active' : ''}`}
                            onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                        >
                            <item.icon /> {item.label}
                        </button>
                    ))}

                    <div className="nav-section-title">Actions</div>
                    <button className="nav-item" onClick={() => setNewFolderModal(true)}>
                        <FiPlus /> New Folder
                    </button>
                </nav>

                <div className="storage-section">
                    <div className="storage-info">
                        <span>{formatBytes(storageUsed)} used</span>
                        <span>Unlimited</span>
                    </div>
                    <div className="storage-bar">
                        <div className="storage-bar-fill" style={{ width: storageUsed > 0 ? '100%' : '0%', background: 'var(--gradient-accent)', opacity: 0.4 }} />
                    </div>
                </div>
            </aside>

            {/* Main */}
            <div className="main-content">
                {/* Header */}
                <header className="header-bar">
                    <div className="header-left">
                        <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)}>
                            <FiMenu />
                        </button>

                        <div className="breadcrumb">
                            <button className="breadcrumb-item" onClick={() => navigate('/drive')}>
                                <FiHome />
                            </button>
                            {breadcrumbs.map((crumb, idx) => (
                                <span key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <FiChevronRight className="breadcrumb-sep" />
                                    {idx === breadcrumbs.length - 1 ? (
                                        <span className="breadcrumb-item current">{crumb.name}</span>
                                    ) : (
                                        <button className="breadcrumb-item" onClick={() => navigate(`/drive/${crumb.id}`)}>{crumb.name}</button>
                                    )}
                                </span>
                            ))}
                            {isTrash && (
                                <>
                                    <FiChevronRight className="breadcrumb-sep" />
                                    <span className="breadcrumb-item current">Trash</span>
                                </>
                            )}
                            {isRecent && (
                                <>
                                    <FiChevronRight className="breadcrumb-sep" />
                                    <span className="breadcrumb-item current">Recent</span>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="header-right">
                        <div className="view-toggle">
                            <button className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')}>
                                <FiGrid />
                            </button>
                            <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>
                                <FiList />
                            </button>
                        </div>

                        <button className="user-menu-btn" onClick={logout} title="Sign out">
                            <div className="user-avatar">{user?.name?.[0]?.toUpperCase()}</div>
                            <FiLogOut />
                        </button>
                    </div>
                </header>

                {/* Content */}
                <div className="content-area">
                    {loading ? (
                        <div className="loading-spinner"><div className="spinner" /></div>
                    ) : folders.length === 0 && files.length === 0 ? (
                        <div className="empty-state">
                            <div className="icon">
                                {isTrash ? <FiTrash2 /> : <FiFolder />}
                            </div>
                            <h3>{isTrash ? 'Trash is empty' : isRecent ? 'No recent files' : 'This folder is empty'}</h3>
                            <p>{isTrash ? 'Deleted files will appear here' : 'Drop files here or click Upload'}</p>
                        </div>
                    ) : viewMode === 'grid' ? (
                        <div className="items-grid">
                            {/* Folders */}
                            {folders.map((folder) => (
                                <div
                                    key={folder._id}
                                    className="item-card"
                                    onClick={() => navigate(`/drive/${folder._id}`)}
                                    onContextMenu={(e) => handleContextMenu(e, folder, 'folder')}
                                >
                                    <div className="icon folder-icon"><FiFolder /></div>
                                    <div className="item-name">{folder.name}</div>
                                    <div className="item-actions">
                                        <button
                                            className="btn btn-ghost btn-icon"
                                            onClick={(e) => { e.stopPropagation(); handleContextMenu(e, folder, 'folder'); }}
                                        >
                                            <FiMoreVertical />
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {/* Files */}
                            {files.map((file) => {
                                const { icon: Icon, cls } = getFileIcon(file.mimeType);
                                return (
                                    <div
                                        key={file._id}
                                        className="item-card"
                                        onClick={() => setPreviewFile(file)}
                                        onContextMenu={(e) => handleContextMenu(e, file, 'file')}
                                    >
                                        <div className={`icon ${cls}`}><Icon /></div>
                                        <div className="item-name">{file.name}</div>
                                        <div className="item-meta">{formatBytes(file.size)}</div>
                                        <div className="item-actions">
                                            <button
                                                className="btn btn-ghost btn-icon"
                                                onClick={(e) => { e.stopPropagation(); handleContextMenu(e, file, 'file'); }}
                                            >
                                                <FiMoreVertical />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="items-list">
                            {/* List view */}
                            {folders.map((folder) => (
                                <div
                                    key={folder._id}
                                    className="item-row"
                                    onClick={() => navigate(`/drive/${folder._id}`)}
                                    onContextMenu={(e) => handleContextMenu(e, folder, 'folder')}
                                >
                                    <div className="icon folder-icon"><FiFolder /></div>
                                    <div className="item-info">
                                        <div className="item-name">{folder.name}</div>
                                    </div>
                                    <div className="item-date">{formatDate(folder.createdAt)}</div>
                                </div>
                            ))}
                            {files.map((file) => {
                                const { icon: Icon, cls } = getFileIcon(file.mimeType);
                                return (
                                    <div
                                        key={file._id}
                                        className="item-row"
                                        onClick={() => setPreviewFile(file)}
                                        onContextMenu={(e) => handleContextMenu(e, file, 'file')}
                                    >
                                        <div className={`icon ${cls}`}><Icon /></div>
                                        <div className="item-info">
                                            <div className="item-name">{file.name}</div>
                                            <div className="item-meta">{file.mimeType}</div>
                                        </div>
                                        <div className="item-size">{formatBytes(file.size)}</div>
                                        <div className="item-date">{formatDate(file.createdAt)}</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Context Menu */}
            {ctxMenu && (
                <div className="context-menu" style={{ top: ctxMenu.y, left: ctxMenu.x }}>
                    {ctxMenu.type === 'folder' && !isTrash && (
                        <>
                            <button className="context-menu-item" onClick={() => { navigate(`/drive/${ctxMenu.item._id}`); setCtxMenu(null); }}>
                                <FiFolder /> Open
                            </button>
                            <button className="context-menu-item" onClick={() => { setRenameModal({ id: ctxMenu.item._id, name: ctxMenu.item.name, type: 'folder' }); setCtxMenu(null); }}>
                                <FiEdit3 /> Rename
                            </button>
                            <div className="context-menu-divider" />
                            <button className="context-menu-item danger" onClick={() => { deleteFolder(ctxMenu.item._id); setCtxMenu(null); }}>
                                <FiTrash2 /> Delete
                            </button>
                        </>
                    )}
                    {ctxMenu.type === 'file' && !isTrash && (
                        <>
                            <button className="context-menu-item" onClick={() => { downloadFile(ctxMenu.item); setCtxMenu(null); }}>
                                <FiDownload /> Download
                            </button>
                            <button className="context-menu-item" onClick={() => { shareFile(ctxMenu.item._id); setCtxMenu(null); }}>
                                <FiShare2 /> Share
                            </button>
                            <button className="context-menu-item" onClick={() => { setRenameModal({ id: ctxMenu.item._id, name: ctxMenu.item.name, type: 'file' }); setCtxMenu(null); }}>
                                <FiEdit3 /> Rename
                            </button>
                            <div className="context-menu-divider" />
                            <button className="context-menu-item danger" onClick={() => { deleteFile(ctxMenu.item._id); setCtxMenu(null); }}>
                                <FiTrash2 /> Move to Trash
                            </button>
                        </>
                    )}
                    {isTrash && ctxMenu.type === 'file' && (
                        <>
                            <button className="context-menu-item" onClick={() => { restoreFile(ctxMenu.item._id); setCtxMenu(null); }}>
                                <FiRefreshCw /> Restore
                            </button>
                            <div className="context-menu-divider" />
                            <button className="context-menu-item danger" onClick={() => { permanentDelete(ctxMenu.item._id); setCtxMenu(null); }}>
                                <FiTrash2 /> Delete Permanently
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Upload Modal */}
            {showUpload && (
                <div className="modal-overlay" onClick={() => !uploading && setShowUpload(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Upload Files</h3>
                            <button className="modal-close" onClick={() => !uploading && setShowUpload(false)}>
                                <FiX />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 16, background: 'rgba(99, 102, 241, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                <FiFolder style={{ color: '#fbbf24', fontSize: 18, flexShrink: 0 }} />
                                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Uploading to:</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {currentFolderName || 'My Drive'}
                                </span>
                            </div>
                            <div className="dropzone" id="upload-dropzone">
                                <input
                                    type="file"
                                    multiple
                                    onChange={(e) => handleUpload(e.target.files)}
                                    disabled={uploading}
                                />
                                <div className="icon"><FiUploadCloud /></div>
                                <h4>Drop files here or click to browse</h4>
                                <p>Files are split into 20MB chunks for upload</p>
                            </div>

                            {uploadFiles.length > 0 && (
                                <div className="upload-files">
                                    {uploadFiles.map((uf, idx) => (
                                        <div key={idx} className="upload-file-item">
                                            <FiFile />
                                            <div className="file-info">
                                                <div className="file-name">{uf.name}</div>
                                                <div className="file-size-info">
                                                    {formatBytes(uf.size)} • {uf.totalChunks} chunk{uf.totalChunks !== 1 ? 's' : ''} ({formatBytes(CHUNK_SIZE)} each)
                                                </div>
                                                <div className="progress-bar">
                                                    <div
                                                        className={`progress-bar-fill ${uf.status === 'error' ? 'error' : ''}`}
                                                        style={{ width: `${uf.progress}%` }}
                                                    />
                                                </div>
                                                <div className={`upload-status ${uf.status}`}>
                                                    {uf.status === 'pending' && `⏳ Waiting — 0/${uf.totalChunks} chunks`}
                                                    {uf.status === 'uploading' && `⬆ Chunk ${uf.chunksUploaded}/${uf.totalChunks} — ${uf.progress}%`}
                                                    {uf.status === 'complete' && `✓ Complete — ${uf.totalChunks} chunk${uf.totalChunks !== 1 ? 's' : ''} uploaded`}
                                                    {uf.status === 'error' && `✗ Failed at chunk ${uf.chunksUploaded}/${uf.totalChunks} — ${uf.error}`}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* New Folder Modal */}
            {newFolderModal && (
                <NewFolderModal
                    onClose={() => setNewFolderModal(false)}
                    onCreate={createFolder}
                />
            )}

            {/* Rename Modal */}
            {renameModal && (
                <RenameModal
                    data={renameModal}
                    onClose={() => setRenameModal(null)}
                    onRename={(name) => {
                        if (renameModal.type === 'folder') renameFolder(renameModal.id, name);
                        else renameFile(renameModal.id, name);
                    }}
                />
            )}

            {/* Share Modal */}
            {shareModal && (
                <ShareModal
                    data={shareModal}
                    onClose={() => setShareModal(null)}
                />
            )}

            {/* File Preview */}
            {previewFile && (
                <FilePreview
                    file={previewFile}
                    onClose={() => setPreviewFile(null)}
                    onDownload={downloadFile}
                />
            )}
        </div>
    );
}

// ===== Sub-components =====

function NewFolderModal({ onClose, onCreate }) {
    const [name, setName] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (name.trim()) onCreate(name.trim());
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
                <div className="modal-header">
                    <h3>New Folder</h3>
                    <button className="modal-close" onClick={onClose}><FiX /></button>
                </div>
                <div className="modal-body">
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Folder Name</label>
                            <input
                                className="inline-input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="My Folder"
                                autoFocus
                            />
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
                            Create Folder
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

function RenameModal({ data, onClose, onRename }) {
    const [name, setName] = useState(data.name);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (name.trim()) onRename(name.trim());
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
                <div className="modal-header">
                    <h3>Rename</h3>
                    <button className="modal-close" onClick={onClose}><FiX /></button>
                </div>
                <div className="modal-body">
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>New Name</label>
                            <input
                                className="inline-input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
                            Rename
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

function ShareModal({ data, onClose }) {
    const [copied, setCopied] = useState(false);

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(data.link);
            setCopied(true);
            toast.success('Link copied!');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback
            const input = document.querySelector('.share-link-input');
            input?.select();
            document.execCommand('copy');
            setCopied(true);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
                <div className="modal-header">
                    <h3><FiLink /> Share File</h3>
                    <button className="modal-close" onClick={onClose}><FiX /></button>
                </div>
                <div className="modal-body">
                    <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 12 }}>
                        Anyone with this link can download the file.
                    </p>
                    <div className="share-link-box">
                        <input
                            className="share-link-input"
                            value={data.link}
                            readOnly
                            onClick={(e) => e.target.select()}
                        />
                        <button className="btn btn-secondary" onClick={copyLink}>
                            <FiCopy /> {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
