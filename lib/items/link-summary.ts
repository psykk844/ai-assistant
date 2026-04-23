/**
 * Fetch a URL, extract text content, and generate an AI summary.
 * Returns metadata fields to merge into the item's metadata.
 */

const URL_REGEX = /(https?:\/\/[^\s<>"']+)/i;

export function extractUrl(content: string): string | null {
  const match = content.match(URL_REGEX);
  return match ? match[1] : null;
}

export async function fetchLinkSummary(url: string): Promise<{
  url: string;
  site_name: string | null;
  page_title: string | null;
  description: string | null;
  ai_summary: string | null;
}> {
  const result: {
    url: string;
    site_name: string | null;
    page_title: string | null;
    description: string | null;
    ai_summary: string | null;
  } = {
    url,
    site_name: null,
    page_title: null,
    description: null,
    ai_summary: null,
  };

  try {
    // Fetch the page with a timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AIAssistantBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) return result;

    const html = await res.text();

    // Extract meta tags
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    result.page_title = titleMatch?.[1]?.trim()?.slice(0, 200) ?? null;

    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    if (ogTitle && !result.page_title) result.page_title = ogTitle[1].trim().slice(0, 200);

    const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    result.description = (ogDesc?.[1] ?? metaDesc?.[1])?.trim()?.slice(0, 500) ?? null;

    const ogSite = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
    result.site_name = ogSite?.[1]?.trim() ?? null;
    if (!result.site_name) {
      try { result.site_name = new URL(url).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
    }

    // Extract body text for AI summary (strip HTML tags, limit to 2000 chars)
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyText = (bodyMatch?.[1] ?? html)
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);

    // Generate AI summary
    const baseUrl = process.env.OARS_BASE_URL ?? "https://llm.digiwebfr.studio/v1";
    const apiKey = process.env.OARS_API_KEY ?? "";
    const model = process.env.OARS_MODEL ?? "claude-sonnet-4-6";

    if (apiKey && bodyText.length > 50) {
      const aiRes = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: 150,
          temperature: 0,
          messages: [
            {
              role: "system",
              content: "Summarize this web page in 1-2 sentences. Be concise and useful. Focus on what the page is about and why someone saved it. No markdown.",
            },
            {
              role: "user",
              content: `URL: ${url}\nTitle: ${result.page_title ?? "Unknown"}\nContent: ${bodyText}`,
            },
          ],
        }),
      });

      if (aiRes.ok) {
        const data = await aiRes.json();
        result.ai_summary = data.choices?.[0]?.message?.content?.trim()?.slice(0, 300) ?? null;
      }
    }

    // Fallback: use description if no AI summary
    if (!result.ai_summary && result.description) {
      result.ai_summary = result.description;
    }
  } catch (err) {
    console.error("[link-summary] Failed to fetch/summarize:", url, err);
  }

  return result;
}
