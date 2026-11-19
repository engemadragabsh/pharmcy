/**
 * عميل الـ API الموحد — يضيف التوكن ويعالج الأخطاء والتجديد التلقائي
 */
import { useApp } from "./store";

interface ApiOpts {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: any;
  raw?: boolean; // لا تفشل عند الأخطاء
}

async function refreshTokens(): Promise<boolean> {
  const { auth, setAuth } = useApp.getState();
  if (!auth?.refreshToken) return false;
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setAuth({ token: data.accessToken, refreshToken: data.refreshToken, user: data.user });
    return true;
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(path: string, opts: ApiOpts = {}): Promise<T> {
  const doFetch = async (): Promise<Response> => {
    const token = useApp.getState().auth?.token;
    return fetch(`/api${path}`, {
      method: opts.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  };

  let res = await doFetch();

  // تجديد تلقائي عند انتهاء الصلاحية
  if (res.status === 401) {
    const refreshed = await refreshTokens();
    if (refreshed) res = await doFetch();
    else {
      useApp.getState().logout();
      throw new ApiError(401, "انتهت الجلسة — يرجى تسجيل الدخول من جديد");
    }
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (opts.raw) throw new ApiError(res.status, data.error || "حدث خطأ");
    throw new ApiError(res.status, data.error || "حدث خطأ غير متوقع");
  }
  return data as T;
}

/** تحويل مصفوفة إلى CSV وتنزيلها */
export function exportCsv(filename: string, rows: Record<string, any>[], headers?: Record<string, string>) {
  if (!rows.length) return;
  const cols = headers ? Object.keys(headers) : Object.keys(rows[0]);
  const head = headers ? Object.values(headers) : cols;
  const csv = [
    head.join(","),
    ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
