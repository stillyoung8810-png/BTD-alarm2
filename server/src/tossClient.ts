import axios from "axios";
import https from "https";
import dotenv from "dotenv";

dotenv.config();

// Toss API Base URLs
const TOSS_API_URL = process.env.TOSS_API_URL ||
    "https://apps-in-toss-api.toss.im";
const TOSS_PAYMENTS_URL = "https://api.tosspayments.com"; // Standard (fallback)

// Load certificates from environment variables
// Note: In Railway, multiline secrets might need handling (e.g., replace \\n with \n)
const clientCert = process.env.TOSS_CLIENT_CERT?.replace(/\\n/g, "\n");
const clientKey = process.env.TOSS_CLIENT_KEY?.replace(/\\n/g, "\n");

if (!clientCert || !clientKey) {
    console.warn(
        "[TossClient] mTLS certificates (TOSS_CLIENT_CERT, TOSS_CLIENT_KEY) are missing. mTLS calls will fail.",
    );
}

// Create HTTPS Agent with mTLS certs
const httpsAgent = new https.Agent({
    cert: clientCert,
    key: clientKey,
    rejectUnauthorized: true, // Enforce server certificate verification
});

// Axios instance for mTLS calls (Login, etc.)
export const tossClient = axios.create({
    baseURL: TOSS_API_URL,
    httpsAgent,
    headers: {
        "Content-Type": "application/json",
    },
    timeout: 10000,
});

/** 토스 API 실패 응답: resultType "FAIL", error: { errorCode, reason } */
export function normalizeTossErrorPayload(data: unknown): { error: string; errorCode?: string } {
    if (data && typeof data === 'object' && 'error' in data) {
        const err = (data as { error?: { reason?: string; errorCode?: string } }).error;
        if (err && typeof err === 'object') {
            return {
                error: typeof err.reason === 'string' ? err.reason : 'Unknown error',
                errorCode: typeof err.errorCode === 'string' ? err.errorCode : undefined,
            };
        }
    }
    return { error: 'Internal Server Error' };
}

export const handleTossError = (error: unknown, context: string): { error: string; errorCode?: string } => {
    if (axios.isAxiosError(error)) {
        const data = error.response?.data;
        console.error(`[TossClient] ${context} Error:`, {
            status: error.response?.status,
            data,
            message: error.message,
        });
        const normalized = normalizeTossErrorPayload(data);
        if (normalized.error !== 'Internal Server Error') return normalized;
        return {
            error: typeof data === 'object' && data !== null && 'message' in data
                ? String((data as { message?: string }).message)
                : error.message,
            errorCode: 'UNKNOWN_ERROR',
        };
    }
    console.error(`[TossClient] ${context} Unexpected Error:`, error);
    return { error: 'Internal Server Error' };
};
