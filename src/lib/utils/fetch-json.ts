/**
 * Read a JSON response without letting a non-JSON one crash the page.
 *
 * A route that throws before it can serialise anything comes back with an empty
 * body, and `res.json()` then rejects with "Unexpected end of JSON input" — an
 * error about parsing, shown to a receptionist, in place of the one that
 * actually happened. This returns something usable either way.
 */
// The shape varies per endpoint and callers read named fields off it, so the
// default is deliberately loose rather than forcing a cast at every call site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJson<T = Record<string, any>>(
  res: Response
): Promise<T & { error?: string }> {
  const text = await res.text().catch(() => "");
  if (!text.trim()) {
    return {
      error: res.ok
        ? "The server sent an empty reply. Please try again."
        : `Something went wrong (${res.status}). Please try again.`,
    } as T & { error?: string };
  }
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    return { error: `Unexpected reply from the server (${res.status}).` } as T & { error?: string };
  }
}
