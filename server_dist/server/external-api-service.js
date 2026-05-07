/**
 * External API Service
 * Connects to external API at 103.154.2.122
 * This service provides a configurable interface to interact with the external API
 */
class ExternalApiService {
    config;
    constructor() {
        const baseUrl = process.env.EXTERNAL_API_URL || "http://103.154.2.122";
        const apiKey = process.env.EXTERNAL_API_KEY;
        this.config = {
            baseUrl: baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl,
            timeout: parseInt(process.env.EXTERNAL_API_TIMEOUT || "30000", 10),
            apiKey,
        };
    }
    /**
     * Generic method to make requests to the external API
     */
    async request(endpoint, options = {}) {
        try {
            const url = `${this.config.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
            const headers = {
                "Content-Type": "application/json",
                ...options.headers,
            };
            if (this.config.apiKey) {
                headers["Authorization"] = `Bearer ${this.config.apiKey}`;
                headers["X-API-Key"] = this.config.apiKey;
            }
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
            const response = await fetch(url, {
                method: options.method || "GET",
                headers,
                body: options.body ? JSON.stringify(options.body) : undefined,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                return {
                    success: false,
                    error: data.message || `HTTP ${response.status}`,
                    statusCode: response.status,
                };
            }
            return {
                success: true,
                data,
                statusCode: response.status,
            };
        }
        catch (error) {
            if (error.name === "AbortError") {
                return {
                    success: false,
                    error: "Request timeout",
                };
            }
            return {
                success: false,
                error: error.message || "Unknown error",
            };
        }
    }
    /**
     * Health check - test connection to external API
     */
    async healthCheck() {
        return this.request("/health", { method: "GET" });
    }
    /**
     * Get API status/info
     */
    async getStatus() {
        return this.request("/status", { method: "GET" });
    }
    /**
     * Generic GET request
     */
    async get(endpoint, headers) {
        return this.request(endpoint, { method: "GET", headers });
    }
    /**
     * Generic POST request
     */
    async post(endpoint, body, headers) {
        return this.request(endpoint, { method: "POST", body, headers });
    }
    /**
     * Generic PUT request
     */
    async put(endpoint, body, headers) {
        return this.request(endpoint, { method: "PUT", body, headers });
    }
    /**
     * Generic DELETE request
     */
    async delete(endpoint, headers) {
        return this.request(endpoint, { method: "DELETE", headers });
    }
}
export const externalApiService = new ExternalApiService();
