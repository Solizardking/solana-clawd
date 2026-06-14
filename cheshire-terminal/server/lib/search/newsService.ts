import fetch from 'node-fetch';

interface NewsSearchOptions {
  query?: string;
  coin?: string[];
  language?: string[];
  timeframe?: string;
}

interface NewsArticle {
  title: string;
  description?: string;
  url: string;
  publishedDate?: string;
  author?: string;
  source?: string;
}

export class NewsService {
  private exaKey?: string;

  constructor() {
    this.exaKey = process.env.EXA_API_KEY;
  }

  async searchCryptoNews(options: NewsSearchOptions): Promise<NewsArticle[]> {
    try {
      if (!this.exaKey) return [];
      const query = [options.query || 'crypto Solana latest news', ...(options.coin || [])].join(' ');
      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': this.exaKey },
        body: JSON.stringify({ query, numResults: 10, useAutoprompt: true }),
      });

      if (!response.ok) {
        throw new Error(`Exa search error: ${response.statusText}`);
      }

      const data: any = await response.json();
      return data.results?.map((article: any) => ({
        title: article.title || article.url,
        description: article.snippet,
        url: article.url,
        publishedDate: article.publishedDate,
        author: article.author,
        source: safeHostname(article.url),
      })) || [];
    } catch (error) {
      console.error('Error fetching news:', error);
      throw error;
    }
  }
}

export const newsService = new NewsService();

function safeHostname(url?: string): string | undefined {
  try {
    return url ? new URL(url).hostname : undefined;
  } catch {
    return undefined;
  }
}
