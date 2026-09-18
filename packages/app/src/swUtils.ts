/**
 * Service Worker Utilities
 * 
 * These functions are extracted to be testable independently from the
 * service worker context.
 */

// Cache name for storing offline mode state
export const OFFLINE_STATE_CACHE = 'offline-state';
export const OFFLINE_STATE_KEY = 'forceOffline';

/**
 * Save offline mode state to cache
 */
export async function setOfflineState(offline: boolean): Promise<void> {
    try {
        const cache = await caches.open(OFFLINE_STATE_CACHE);
        await cache.put(
            OFFLINE_STATE_KEY,
            new Response(JSON.stringify({ offline }), {
                headers: { 'Content-Type': 'application/json' },
            })
        );
    } catch (error) {
        console.error('[SW] Failed to save offline state:', error);
    }
}

/**
 * Load offline mode state from cache
 * @returns The cached offline state, or false if not found
 */
export async function loadOfflineState(): Promise<boolean> {
    try {
        const cache = await caches.open(OFFLINE_STATE_CACHE);
        const response = await cache.match(OFFLINE_STATE_KEY);
        if (response) {
            const data = await response.json();
            return data.offline;
        }
    } catch (error) {
        console.error('[SW] Failed to load offline state:', error);
    }
    return false;
}

/**
 * Generate a minimal offline HTML page
 */
export function generateOfflineHTML(): Response {
    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Offline - Budget Wise</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
               display: flex; justify-content: center; align-items: center; min-height: 100vh; 
               margin: 0; background: #f5f5f5; }
        .container { text-align: center; padding: 20px; max-width: 400px; }
        h1 { color: #333; margin-bottom: 10px; }
        p { color: #666; margin-bottom: 20px; }
        button { background: #007AFF; color: white; border: none; padding: 12px 24px; 
                border-radius: 8px; font-size: 16px; cursor: pointer; }
        button:hover { background: #0056b3; }
    </style>
</head>
<body>
    <div class="container">
        <h1>You're Offline</h1>
        <p>Please check your internet connection and try again.</p>
        <button onclick="window.location.reload()">Retry</button>
    </div>
</body>
</html>`;
    
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

