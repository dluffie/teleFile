import { useState, useEffect, useRef } from 'react';
import { FiX, FiDownload, FiFile, FiMaximize2, FiMinimize2, FiMusic } from 'react-icons/fi';
import api, { API_BASE } from '../api/client';

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function FilePreview({ file, onClose, onDownload }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [fullscreen, setFullscreen] = useState(false);
    const containerRef = useRef(null);

    const isImage = file.mimeType?.startsWith('image/');
    const isVideo = file.mimeType?.startsWith('video/');
    const isAudio = file.mimeType?.startsWith('audio/');
    const isPdf = file.mimeType?.includes('pdf');
    const canPreview = isImage || isVideo || isAudio || isPdf;

    useEffect(() => {
        if (!canPreview) {
            setLoading(false);
            return;
        }

        // Construct direct URL with token
        const token = localStorage.getItem('telefile_token');
        const url = `${API_BASE}/api/files/${file._id}/preview?token=${token}`;

        // For video/audio/pdf, we can just set the URL and let the browser handle loading state
        // For images, we might want to preload to know when it's done
        setPreviewUrl(url);

        if (!isImage) {
            setLoading(false);
        }

    }, [file._id]);

    const toggleFullscreen = () => {
        if (!fullscreen) {
            containerRef.current?.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
        setFullscreen(!fullscreen);
    };

    // Listen for fullscreen change
    useEffect(() => {
        const handler = () => {
            if (!document.fullscreenElement) setFullscreen(false);
        };
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    // Close on Escape
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape' && !fullscreen) onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [fullscreen, onClose]);

    return (
        <div className="preview-overlay" onClick={onClose}>
            <div
                className={`preview-container ${fullscreen ? 'fullscreen' : ''}`}
                onClick={(e) => e.stopPropagation()}
                ref={containerRef}
            >
                {/* Header */}
                <div className="preview-header">
                    <div className="preview-file-info">
                        <FiFile />
                        <span className="preview-filename">{file.name}</span>
                        <span className="preview-size">{formatBytes(file.size)}</span>
                    </div>
                    <div className="preview-actions">
                        {canPreview && (
                            <button className="preview-btn" onClick={toggleFullscreen} title="Fullscreen">
                                {fullscreen ? <FiMinimize2 /> : <FiMaximize2 />}
                            </button>
                        )}
                        <button className="preview-btn" onClick={() => onDownload(file)} title="Download">
                            <FiDownload />
                        </button>
                        <button className="preview-btn close" onClick={onClose} title="Close">
                            <FiX />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="preview-body">
                    {loading && isImage && (
                        <div className="preview-loading">
                            <div className="preview-spinner" />
                            <p>Loading preview…</p>
                        </div>
                    )}

                    {error && (
                        <div className="preview-error">
                            <FiFile style={{ fontSize: 48, opacity: 0.3 }} />
                            <p>Failed to load preview</p>
                            <span>{error}</span>
                            <button className="btn btn-primary" onClick={() => onDownload(file)} style={{ marginTop: 16 }}>
                                <FiDownload /> Download Instead
                            </button>
                        </div>
                    )}

                    {!loading && !error && !canPreview && (
                        <div className="preview-unsupported">
                            <FiFile style={{ fontSize: 64, opacity: 0.3 }} />
                            <h3>Preview not available</h3>
                            <p>This file type ({file.mimeType || 'unknown'}) cannot be previewed.</p>
                            <button className="btn btn-primary" onClick={() => onDownload(file)} style={{ marginTop: 16 }}>
                                <FiDownload /> Download File
                            </button>
                        </div>
                    )}

                    {!error && previewUrl && isImage && (
                        <div className="preview-image-wrap">
                            <img
                                src={previewUrl}
                                alt={file.name}
                                className="preview-image"
                                onLoad={() => setLoading(false)}
                                onError={() => {
                                    setError('Failed to load image');
                                    setLoading(false);
                                }}
                                style={{ display: loading ? 'none' : 'block' }}
                            />
                        </div>
                    )}

                    {!error && previewUrl && isVideo && (
                        <video
                            src={previewUrl}
                            className="preview-video"
                            controls
                            autoPlay
                            playsInline
                            onError={() => setError('Failed to stream video')}
                        />
                    )}

                    {!error && previewUrl && isAudio && (
                        <div className="preview-audio-wrap">
                            <FiMusic style={{ fontSize: 80, opacity: 0.2 }} />
                            <p style={{ marginBottom: 20, color: 'var(--text-secondary)' }}>{file.name}</p>
                            <audio
                                src={previewUrl}
                                controls
                                autoPlay
                                style={{ width: '100%', maxWidth: 480 }}
                                onError={() => setError('Failed to stream audio')}
                            />
                        </div>
                    )}

                    {!error && previewUrl && isPdf && (
                        <iframe
                            src={previewUrl}
                            className="preview-pdf"
                            title={file.name}
                            onError={() => setError('Failed to load PDF')}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
