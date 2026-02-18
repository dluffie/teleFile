import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <Toaster
                    position="top-right"
                    toastOptions={{
                        style: {
                            background: 'rgba(15, 23, 42, 0.95)',
                            color: '#e2e8f0',
                            border: '1px solid rgba(99, 102, 241, 0.3)',
                            backdropFilter: 'blur(12px)',
                            fontFamily: 'Inter, sans-serif',
                        },
                    }}
                />
                <App />
            </AuthProvider>
        </BrowserRouter>
    </React.StrictMode>
);
