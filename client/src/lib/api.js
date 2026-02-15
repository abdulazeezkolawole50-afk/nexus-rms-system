const API = import.meta.env.VITE_API;

export function getToken() {
  return localStorage.getItem("nexus_token");
}

export async function api(path, { method = "GET", body } = {}) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}
