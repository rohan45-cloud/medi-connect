export const API_URL = "https://medi-connect-22m3.onrender.com";
export const TOKEN_KEY = "mediconnect_token";
export const USER_KEY = "mediconnect_user";

const authHeader = () => {
    const token = localStorage.getItem(TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
};

// Builds an Error with .message (safe to show) and .status (HTTP code)
async function failFrom(response) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(
        data.message || "Something went wrong. Please try again."
    );
    error.status = response.status;
    return error;
}

function networkError() {
    const error = new Error(
        "Cannot reach the server. Is the backend running on port 5000?"
    );
    error.status = 0;
    return error;
}

// Calls the backend with the saved login token.
// Throws an Error with .message (safe to show) and .status (HTTP code).
export async function apiFetch(path, options = {}) {
    let response;
    try {
        response = await fetch(`${API_URL}${path}`, {
            method: options.method || "GET",
            headers: {
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...authHeader(),
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
        });
    } catch {
        throw networkError();
    }

    if (!response.ok) throw await failFrom(response);

    return response.json().catch(() => ({}));
}

// Sends ONE file (PDF / PNG / JPG, max 2 MB) as the raw request body.
export async function apiUpload(path, file) {
    if (file.size > 2 * 1024 * 1024) {
        const error = new Error("That file is too large (maximum 2 MB).");
        error.status = 413;
        throw error;
    }

    let response;
    try {
        response = await fetch(`${API_URL}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": file.type || "application/octet-stream",
                "X-File-Name": encodeURIComponent(file.name),
                ...authHeader(),
            },
            body: file,
        });
    } catch {
        throw networkError();
    }

    if (!response.ok) throw await failFrom(response);
    return response.json().catch(() => ({}));
}

// Downloads a file that needs the login token (PDF, CSV, report...) and saves it in the browser.
export async function apiDownload(path, filename) {
    let response;
    try {
        response = await fetch(`${API_URL}${path}`, { headers: authHeader() });
    } catch {
        throw networkError();
    }

    if (!response.ok) throw await failFrom(response);

    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}