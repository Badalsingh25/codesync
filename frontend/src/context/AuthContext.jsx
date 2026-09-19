/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect, useContext, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

// Setup a global Axios instance for API requests
export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Request interceptor to append authorization token if available
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('jwt_token');
    if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

// The access token is short-lived (24h). Previously the backend returned a
// refreshToken on login but the frontend never stored or used it, and there
// was no handling for an expired token at all — every API call would just
// start failing with 401s and the user had no way to recover short of
// manually logging in again. This registry lets the response interceptor
// below (a plain module-level function, outside any React component) drive
// real state updates on AuthProvider once it mounts and registers itself.
let authHandlers = {
    onTokenRefreshed: () => {},
    onLogout: () => {},
};

// Multiple requests can fail with 401 at the same time (e.g. several API
// calls in flight when the access token expires) — without de-duplication
// each one would trigger its own concurrent refresh call. This tracks a
// single in-flight refresh so every failed request waits on the same result.
let refreshPromise = null;

function refreshAccessToken() {
    if (refreshPromise) {
        return refreshPromise;
    }
    const storedRefreshToken = localStorage.getItem('refresh_token');
    if (!storedRefreshToken) {
        return Promise.reject(new Error('No refresh token available'));
    }
    refreshPromise = axios
        .post(`${API_BASE_URL}/auth/refreshtoken`, { refreshToken: storedRefreshToken })
        .then((response) => {
            const { accessToken, refreshToken: newRefreshToken, email } = response.data;
            localStorage.setItem('jwt_token', accessToken);
            if (newRefreshToken) {
                localStorage.setItem('refresh_token', newRefreshToken);
            }
            if (email) {
                localStorage.setItem('user_email', email);
            }
            authHandlers.onTokenRefreshed(accessToken, email);
            return accessToken;
        })
        .finally(() => {
            refreshPromise = null;
        });
    return refreshPromise;
}

// Response interceptor: on a 401 (expired/invalid access token), try one
// silent refresh and replay the original request with the new token. If the
// refresh itself fails (refresh token missing/expired/revoked), fall back
// to a real logout instead of leaving the app in a broken, half-authed
// state. This did not exist before — a session used to just silently stop
// working after 24h with no recovery path.
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        const status = error.response?.status;
        if (status === 401 && originalRequest && !originalRequest._retry && !originalRequest.url?.includes('/auth/')) {
            originalRequest._retry = true;
            try {
                const newAccessToken = await refreshAccessToken();
                originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
                return api(originalRequest);
            } catch (refreshError) {
                authHandlers.onLogout();
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    }
);

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('jwt_token'));
    const [userEmail, setUserEmail] = useState(localStorage.getItem('user_email'));
    const [loading] = useState(false);
    
    const logout = useCallback(() => {
        // Best-effort: revoke the refresh token server-side so it can't be
        // used again even if it leaked. Previously there was no logout
        // endpoint at all — this only clears local state, which meant a
        // "logged out" refresh token actually remained valid indefinitely.
        const hadToken = !!localStorage.getItem('jwt_token');
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_email');
        setToken(null);
        setUserEmail(null);
        if (hadToken) {
            api.post('/auth/logout').catch(() => {
                // Nothing actionable if this fails (e.g. we're already
                // offline, or the token was already invalid) — local state
                // is cleared regardless, which is what actually matters for
                // the user's own session.
            });
        }
    }, []);

    useEffect(() => {
        authHandlers = {
            onTokenRefreshed: (newAccessToken, email) => {
                setToken(newAccessToken);
                if (email) setUserEmail(email);
            },
            onLogout: () => logout(),
        };
        return () => {
            authHandlers = { onTokenRefreshed: () => {}, onLogout: () => {} };
        };
    }, [logout]);

    // useEffect(() => {
    //     // Quick verification of token presence on mount
    //     const storedToken = localStorage.getItem('jwt_token');
    //     const storedEmail = localStorage.getItem('user_email');
    //     if (storedToken && storedEmail) {
    //         setToken(storedToken);
    //         setUserEmail(storedEmail);
    //     } else {
    //         logout();
    //     }
    //     setLoading(false);
    // }, [logout]);

    const login = async (email, password) => {
        try {
            // Backend returns JwtResponse { accessToken, refreshToken, email }
            const response = await axios.post(`${API_BASE_URL}/auth/login`, {
                email,
                password
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            const { accessToken, refreshToken, email: userEmailFromServer } = response.data;
            if (accessToken) {
                localStorage.setItem('jwt_token', accessToken);
                if (refreshToken) {
                    localStorage.setItem('refresh_token', refreshToken);
                }
                localStorage.setItem('user_email', userEmailFromServer || email);
                setToken(accessToken);
                setUserEmail(userEmailFromServer || email);
                return { success: true };
            }
            return { success: false, message: 'Login failed: no token received.' };
        } catch (error) {
            let errorMsg = 'Login failed. Please check your credentials.';
            if (error.response?.data) {
                if (typeof error.response.data === 'string') {
                    errorMsg = error.response.data;
                } else {
                    errorMsg = error.response.data.message || error.response.data.error || 'Login failed.';
                }
            }
            return { success: false, message: errorMsg };
        }
    };

    const register = async (name, email, password) => {
        try {
            // Backend endpoint is `/auth/signup` (case sensitive)
            await axios.post(`${API_BASE_URL}/auth/signup`, {
                name,
                email,
                password,
                role: 'USER' // Default role
            }, {
                headers: { 'Content-Type': 'application/json' }
            });
            return { success: true };
        } catch (error) {
            let errorMsg = 'Registration failed.';
            if (error.response?.data) {
                if (typeof error.response.data === 'string') {
                    errorMsg = error.response.data;
                } else if (error.response.data.message) {
                    errorMsg = error.response.data.message;
                } else if (error.response.data.error) {
                    errorMsg = error.response.data.error;
                } else if (typeof error.response.data === 'object') {
                    // Handle Spring Boot Map<String, String> validation errors
                    errorMsg = Object.values(error.response.data).join(' ');
                }
            }
            return { success: false, message: errorMsg };
        }
    };

    const value = {
        token,
        userEmail,
        login,
        register,
        logout,
        loading
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    return useContext(AuthContext);
};
