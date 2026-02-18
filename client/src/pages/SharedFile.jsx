import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { FiDownload, FiFile, FiAlertCircle } from 'react-icons/fi';

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function SharedFile() {
    const { token } = useParams();
    const [file, setFile] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        api.get(`/share/info/${token}`)
            .then((res) => setFile(res.data.file))
            .catch((err) => {
                setError(err.response?.data?.error || 'File not found');
            })
            .finally(() => setLoading(false));
    }, [token]);

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const res = await api.get(`/share/download/${token}`, {
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch {
            alert('Download failed');
        } finally {
            setDownloading(false);
        }
    };

    if (loading) {
        return (
            <div className="auth-page">
                <div className="loading-spinner"><div className="spinner" /></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="auth-page">
                <div className="auth-card" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, color: 'var(--danger)', marginBottom: 16 }}>
                        <FiAlertCircle />
                    </div>
                    <h2>{error}</h2>
                    <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
                        This link may have expired or the file was deleted.
                    </p>
                    <Link to="/login" className="btn btn-primary" style={{ marginTop: 24, display: 'inline-flex' }}>
                        Go to TeleFile
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="auth-page">
            <div className="auth-card" style={{ textAlign: 'center' }}>
                <div className="logo">
                    <img src="/logo.png" alt="TeleFile" style={{ width: 48, height: 48, objectFit: 'contain' }} />
                    <h1>TeleFile</h1>
                    <p>Shared File</p>
                </div>

                <div style={{ margin: '24px 0' }}>
                    <div style={{ fontSize: 48, color: 'var(--accent-light)', marginBottom: 12 }}>
                        <FiFile />
                    </div>
                    <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, wordBreak: 'break-all' }}>
                        {file.name}
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                        {formatBytes(file.size)}
                    </p>
                </div>

                <button
                    className="btn btn-primary"
                    onClick={handleDownload}
                    disabled={downloading}
                    style={{ marginTop: 8 }}
                >
                    <FiDownload />
                    {downloading ? 'Downloading…' : 'Download File'}
                </button>
            </div>
        </div>
    );
}
