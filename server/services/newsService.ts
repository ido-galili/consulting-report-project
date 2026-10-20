const NEWS_API_URL = 'https://news-api.jona-581.workers.dev/';
const NEWS_TIMEOUT_MS = 5000;

export interface NewsArticle {
  heading: string;
  content: string;
}

// Returns null when no article could be fetched, so the report can still be
// generated from DB data with a "news unavailable" warning.
export const getCompanyNews = async (
  companyId: string
): Promise<NewsArticle | null> => {
  try {
    const url = `${NEWS_API_URL}?id=${encodeURIComponent(companyId)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(NEWS_TIMEOUT_MS),
    });
    const body = await res.json();

    if (!res.ok || typeof body?.heading !== 'string') {
      console.warn(
        `News API returned no article for ${companyId}:`,
        res.status,
        body?.error ?? body
      );
      return null;
    }

    return { heading: body.heading, content: body.content ?? '' };
  } catch (error) {
    console.warn(`News API request failed for ${companyId}:`, error);
    return null;
  }
};
