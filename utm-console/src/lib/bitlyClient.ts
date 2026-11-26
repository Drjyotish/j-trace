export type TokenGetter = () => Promise<string | null>;

async function call(body: object, getToken: TokenGetter): Promise<string> {
  const token = await getToken();
  const res = await fetch("/api/bitly", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { short_url?: string; error?: string };
  if (!res.ok || !json.short_url) throw new Error(json.error ?? `Bitly failed (${res.status})`);
  return json.short_url;
}

export const shortenLink = (longUrl: string, getToken: TokenGetter) => call({ action: "shorten", long_url: longUrl }, getToken);

export const repointLink = (shortUrl: string, longUrl: string, getToken: TokenGetter) =>
  call({ action: "repoint", short_url: shortUrl, long_url: longUrl }, getToken);

export async function bitlyConfigured(): Promise<boolean> {
  try {
    const res = await fetch("/api/bitly", { cache: "no-store" });
    return Boolean(((await res.json()) as { configured?: boolean }).configured);
  } catch {
    return false;
  }
}
