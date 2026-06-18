/**
 * Wrapper around fetch that redirects to login when the session expires.
 */
async function authFetch(url, options = {}) {
    const response = await fetch(url, options);
    if (response.status === 401) {
        window.location.href = '/auth/login?reason=session_expired';
        throw new Error('Session expired');
    }
    return response;
}
