export const API_URL = "https://medi-connect-22m3.onrender.com";
export const TOKEN_KEY = "mediconnect_token";
export const USER_KEY = "mediconnect_user";

// Calls the backend with the saved login token.
// Throws an Error with .message (safe to show) and .status (HTTP code).
export async function apiFetch(path, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY);

    let response;
    try {
        response = await fetch(`${API_URL}${path}`, {
            method: options.method || "GET",
            headers: {
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
        });
    } catch {
        const error = new Error(
            "Cannot reach the server. Is the backend running on port 5000?"
        );
        error.status = 0;
        throw error;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(
            data.message || "Something went wrong. Please try again."
        );
        error.status = response.status;
        throw error;
    }

    return data;
}