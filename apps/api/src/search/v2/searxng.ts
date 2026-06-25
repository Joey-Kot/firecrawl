import axios from "axios";
import { config } from "../../config";
import type {
  SearchResultType,
  SearchV2Response,
  WebSearchResult,
} from "../../lib/entities";
import { logger } from "../../lib/logger";

interface SearchOptions {
  tbs?: string;
  filter?: string;
  lang?: string;
  country?: string;
  location?: string;
  num_results: number;
  page?: number;
  type?: SearchResultType | SearchResultType[];
}

export async function searxng_search(
  q: string,
  options: SearchOptions,
): Promise<SearchV2Response> {
  const resultsPerPage = 20;
  const requestedResults = Math.max(options.num_results, 0);
  const startPage = options.page ?? 1;

  const url = config.SEARXNG_ENDPOINT!;
  const cleanedUrl = url.endsWith("/") ? url.slice(0, -1) : url;
  const finalUrl = cleanedUrl + "/search";
  const requestedTypes = new Set(
    (Array.isArray(options.type)
      ? options.type
      : options.type
        ? [options.type]
        : ["web"]) as SearchResultType[],
  );

  const fetchPage = async (
    page: number,
    category: "general" | "news" | "images",
  ): Promise<any[]> => {
    const params = {
      q: q,
      language: options.lang,
      // gl: options.country, //not possible with SearXNG
      // location: options.location, //not possible with SearXNG
      // num: options.num_results, //not possible with SearXNG
      engines: config.SEARXNG_ENGINES ?? "",
      categories: config.SEARXNG_CATEGORIES ?? category,
      pageno: page,
      format: "json",
    };

    const response = await axios.get(finalUrl, {
      headers: {
        "Content-Type": "application/json",
      },
      params: params,
    });

    const data = response.data;

    if (data && Array.isArray(data.results)) {
      return data.results;
    }

    return [];
  };

  const fetchCategory = async (
    category: "general" | "news" | "images",
  ): Promise<any[]> => {
    const pagesToFetch = Math.max(
      1,
      Math.ceil(requestedResults / resultsPerPage),
    );
    let results: any[] = [];

    for (let pageOffset = 0; pageOffset < pagesToFetch; pageOffset += 1) {
      const pageResults = await fetchPage(startPage + pageOffset, category);
      if (pageResults.length === 0) {
        break;
      }
      results = results.concat(pageResults);
      if (results.length >= requestedResults) {
        break;
      }
    }

    return results.slice(0, requestedResults);
  };

  try {
    if (requestedResults === 0) {
      return {};
    }

    const response: SearchV2Response = {};

    if (requestedTypes.has("web")) {
      const webResults = await fetchCategory("general");
      if (webResults.length > 0) {
        response.web = webResults.map(
          (a: any, index: number): WebSearchResult => ({
            url: a.url,
            title: a.title,
            description: a.content,
            position: index + 1,
          }),
        );
      }
    }

    if (requestedTypes.has("news")) {
      const newsResults = await fetchCategory("news");
      if (newsResults.length > 0) {
        response.news = newsResults.map((a: any, index: number) => ({
          url: a.url,
          title: a.title,
          snippet: a.content,
          date: a.publishedDate ?? a.published_date,
          imageUrl: a.img_src ?? a.thumbnail ?? a.thumbnail_src,
          position: index + 1,
          category: "news",
        }));
      }
    }

    if (requestedTypes.has("images")) {
      const imageResults = await fetchCategory("images");
      if (imageResults.length > 0) {
        response.images = imageResults.map((a: any, index: number) => ({
          title: a.title,
          imageUrl: a.img_src ?? a.thumbnail ?? a.thumbnail_src ?? a.url,
          url: a.url,
          position: index + 1,
        }));
      }
    }

    return response;
  } catch (error) {
    logger.error(`There was an error searching for content`, { error });
    return {};
  }
}
