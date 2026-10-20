import { getCompanyFinancials } from './dbService';
import { getCompanyNews } from './newsService';
import { generateReportWithLLM, ReportType } from './llmService';

const NEWS_UNAVAILABLE_BANNER =
  '> ⚠️ **News unavailable.** This report is based on database figures only.';

export interface ReportResult {
  markdown: string;
  cached: boolean;
  generatedAt: string; // ISO timestamp of when the LLM produced the report
}

// In-memory cache of finished reports, one per company and report type (a
// high-level report is not a valid answer to a detailed request). The first
// report is reused regardless of later news until the server restarts or the
// user asks for a refresh; a hit needs no DB, news or LLM calls.
const reportCache = new Map<string, Omit<ReportResult, 'cached'>>();

const cacheKey = (companyId: string, reportType: ReportType): string =>
  `${companyId}|${reportType}`;

const isReportType = (value: string): value is ReportType =>
  value === 'high-level' || value === 'detailed';

export const generateReportMarkdown = async (
  companyName: string,
  companyId: string,
  reportType: string,
  forceRefresh = false
): Promise<ReportResult> => {
  if (!isReportType(reportType)) {
    throw new Error(`Unknown report type: ${reportType}`);
  }

  // forceRefresh skips the lookup but still overwrites the entry below.
  const key = cacheKey(companyId, reportType);
  const cached = !forceRefresh && reportCache.get(key);
  if (cached) {
    console.log(`Report cache hit: ${key}`);
    return { ...cached, cached: true };
  }

  try {
    // The two sources are independent, so fetch them in parallel.
    const [financials, news] = await Promise.all([
      getCompanyFinancials(companyId),
      getCompanyNews(companyId),
    ]);

    const body = await generateReportWithLLM({
      companyName,
      reportType,
      financials,
      news,
    });

    const sections = [`# ${companyName} — Investment Report`];
    if (!news) sections.push(NEWS_UNAVAILABLE_BANNER);
    sections.push(body);
    const report = {
      markdown: sections.join('\n\n'),
      generatedAt: new Date().toISOString(),
    };

    // Reports without news are never cached: the next request may well get an
    // article, and should not be stuck with the news-unavailable version.
    if (news) reportCache.set(key, report);
    return { ...report, cached: false };
  } catch (error) {
    // The controller swallows errors into a generic 500, so log the cause here.
    console.error(
      `Failed to generate ${reportType} report for ${companyId}:`,
      error
    );
    throw error;
  }
};
