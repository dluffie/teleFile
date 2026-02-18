import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Trash from './pages/Trash';
import SharedFile from './pages/SharedFile';

function ProtectedRoute({ children }) {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="loading-spinner" style={{ height: '100vh' }}>
                <div className="spinner" />
            </div>
        );
    }

    return user ? children : <Navigate to="/login" />;
}

function GuestRoute({ children }) {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="loading-spinner" style={{ height: '100vh' }}>
                <div className="spinner" />
            </div>
        );
    }

    return !user ? children : <Navigate to="/drive" />;
}

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
            <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
            <Route path="/drive" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/drive/:folderId" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/trash" element={<ProtectedRoute><Dashboard page="trash" /></ProtectedRoute>} />
            <Route path="/recent" element={<ProtectedRoute><Dashboard page="recent" /></ProtectedRoute>} />
            <Route path="/share/:token" element={<SharedFile />} />
            <Route path="*" element={<Navigate to="/drive" />} />
        </Routes>
    );
}
