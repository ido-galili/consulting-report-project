import { GoogleGenAI } from '@google/genai';
import type { YearlyFinancials } from './dbService';
import type { NewsArticle } from './newsService';

// Respects thinkingBudget: 0 and was the fastest model in testing (3-15s per
// detailed report). gemini-3.5-flash gives slightly richer reports, but its
// free-tier daily quota (20 requests, shared with 3.6-flash) runs out quickly.
const MODEL = 'gemini-3.1-flash-lite';

export type ReportType = 'high-level' | 'detailed';

export interface ReportInput {
  companyName: string;
  reportType: ReportType;
  financials: YearlyFinancials[];
  news: NewsArticle | null;
}

// Created lazily so a missing key fails the request, not the server start.
let client: GoogleGenAI | null = null;
const getClient = (): GoogleGenAI => {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
};

// Shared by both modes: role, how to weigh the sources, and output rules.
const SYSTEM_INSTRUCTION = `You are an investment analyst at a consulting firm. You write investment reports about a single company for internal decision makers.

You are given two sources:
1. DATABASE: yearly aggregated sales and profit figures. These are historical.
2. NEWS: one recent news article about the company. It may be missing.

Rules:
- If the news article states sales or profit figures that are more recent than the database, prefer the article's figures and say so. Never invent figures that appear in neither source.
- Weigh both sources. Strong financials with negative news should lead to "Don't Invest" or "Defer", not "Invest".
- If the data is missing, conflicting, or too thin to decide, say so explicitly and lean towards "Defer".
- The final recommendation must be exactly one of: Invest, Don't Invest, Defer.
- Figures have no stated currency or unit; report them as plain numbers.
- Output GitHub-flavored Markdown only. Do not wrap it in a code block and do not add any preamble or closing remarks.
- Do not add a top-level title; the application adds it.`;

// Per-mode output format, appended after the data.
const OUTPUT_FORMATS: Record<ReportType, string> = {
  'high-level': `Write a HIGH-LEVEL report: a single sentence that gives the key reason and ends with the recommendation in bold, e.g. **Recommendation: Invest**. No headings, no lists.`,
  detailed: `Write a DETAILED report with exactly these sections, each as a "##" heading:
## Executive Summary
2-3 sentences.
## Sales & Profit Snapshot
A Markdown table of every year with sales, profit and profit margin, followed by 1-2 sentences on the trend. Include any newer figures from the news, marked as such.
## News Analysis
The article's heading, whether it is positive, negative or neutral for the company, and why.
## Recommendation
**Invest**, **Don't Invest** or **Defer** in bold, followed by a short justification that references both sources.`,
};

const formatFinancials = (financials: YearlyFinancials[]): string => {
  if (financials.length === 0) return 'No database records for this company.';
  return financials
    .map((f) => `- ${f.year}: sales ${f.sales}, profit ${f.profit}`)
    .join('\n');
};

const formatNews = (news: NewsArticle | null): string => {
  if (!news) return 'Unavailable - the news source could not be reached.';
  return `Heading: ${news.heading}\nContent: ${news.content}`;
};

const buildPrompt = (input: ReportInput): string =>
  `Company: ${input.companyName}

DATABASE:
${formatFinancials(input.financials)}

NEWS:
${formatNews(input.news)}

${OUTPUT_FORMATS[input.reportType]}`;

// Models sometimes wrap the answer in ```markdown fences despite instructions.
const stripCodeFences = (text: string): string =>
  text
    .trim()
    .replace(/^```(?:markdown|md)?\s*\n/i, '')
    .replace(/\n```$/, '')
    .trim();

const RETRY_DELAY_MS = 1500;

// Gemini's free tier intermittently returns 503 "high demand"; those are worth
// one retry. Client errors (4xx, incl. 429 rate limits) are not.
const isTransientError = (error: unknown): boolean => {
  const status = (error as { status?: number })?.status;
  return typeof status === 'number' && status >= 500;
};

const callModel = (input: ReportInput) =>
  getClient().models.generateContent({
    model: MODEL,
    contents: buildPrompt(input),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.2,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

export const generateReportWithLLM = async (
  input: ReportInput
): Promise<string> => {
  let response;
  try {
    response = await callModel(input);
  } catch (error) {
    if (!isTransientError(error)) throw error;
    console.warn(`LLM call failed transiently, retrying once:`, error);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    response = await callModel(input);
  }

  if (!response.text) {
    throw new Error('LLM returned an empty response');
  }
  return stripCodeFences(response.text);
};
