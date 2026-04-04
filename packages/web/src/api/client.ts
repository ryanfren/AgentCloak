import type { Account, ApiKey, Connection, FilterConfig } from "./types";

const BASE = "";

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (res.status === 401) {
    throw new Error("Not authenticated");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `HTTP ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

export interface AuthConfig {
  googleOAuth: boolean;
  emailPassword: boolean;
}

export const authApi = {
  getAuthConfig: () => request<AuthConfig>("/auth/config"),

  register: (data: { email: string; password: string; name?: string }) =>
    request<Account>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  loginWithPassword: (data: { email: string; password: string }) =>
    request<Account>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export const api = {
  getMe: () => request<Account>("/api/me"),

  listConnections: () => request<Connection[]>("/api/connections"),

  getConnection: (id: string) =>
    request<Connection>(`/api/connections/${id}`),

  updateConnection: (id: string, data: { displayName: string }) =>
    request<Connection>(`/api/connections/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteConnection: (id: string) =>
    request<{ success: boolean }>(`/api/connections/${id}`, {
      method: "DELETE",
    }),

  listKeys: (connectionId: string) =>
    request<ApiKey[]>(`/api/connections/${connectionId}/keys`),

  createKey: (connectionId: string, name: string) =>
    request<ApiKey>(`/api/connections/${connectionId}/keys`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  revokeKey: (connectionId: string, keyId: string) =>
    request<{ success: boolean }>(
      `/api/connections/${connectionId}/keys/${keyId}`,
      { method: "DELETE" },
    ),

  getFilters: (connectionId: string) =>
    request<FilterConfig>(`/api/connections/${connectionId}/filters`),

  updateFilters: (connectionId: string, config: Partial<FilterConfig>) =>
    request<FilterConfig>(`/api/connections/${connectionId}/filters`, {
      method: "PUT",
      body: JSON.stringify(config),
    }),

  testImapConnection: (data: {
    host: string;
    port: number;
    username: string;
    password: string;
    tls: boolean;
  }) =>
    request<{ success: boolean; error?: string }>(
      "/api/connections/imap/test",
      { method: "POST", body: JSON.stringify(data) },
    ),

  connectImap: (data: {
    host: string;
    port: number;
    username: string;
    password: string;
    tls: boolean;
    displayName?: string;
  }) =>
    request<Connection>("/api/connections/imap/connect", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getGasScript: () =>
    request<{ secret: string; script: string }>("/api/connections/gas/script"),

  testGasConnection: (data: { endpointUrl: string; secret: string }) =>
    request<{ success: boolean; email?: string; error?: string }>(
      "/api/connections/gas/test",
      { method: "POST", body: JSON.stringify(data) },
    ),

  connectGas: (data: {
    endpointUrl: string;
    secret: string;
    displayName?: string;
  }) =>
    request<Connection>("/api/connections/gas/connect", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
