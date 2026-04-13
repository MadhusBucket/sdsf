import chromium from "@sparticuz/chromium";
import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";

// Best-effort in-memory rate limiter.
// In a multi-instance/serverless deployment, replace with Upstash Redis.
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(userId);
  if (!record || now >= record.resetAt) {
    rateLimitStore.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (record.count >= RATE_LIMIT_MAX) return false;
  record.count++;
  return true;
}

import { buildInvoiceHtml } from "@/lib/pdf/invoiceHtmlTemplate";
import {
  getBankFromEnv,
  getMerchantFromEnv,
  getSignatoryNameFromEnv,
} from "@/lib/pdf/merchantFromEnv";
import { createClient } from "@/lib/supabase/server";
import type { Company, Document } from "@/lib/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function launchBrowser() {
  const serverless = Boolean(process.env.VERCEL || process.env.AWS_EXECUTION_ENV);

  if (serverless) {
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
    });
  }

  // Local development: use system Chrome or CHROME_PATH override
  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH?.trim() ||
    process.env.CHROME_PATH?.trim() ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

  return puppeteer.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    headless: true,
  });
}

function safeFilename(docNumber: string) {
  return docNumber.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "document";
}

export async function GET(request: NextRequest) {
  const docId = request.nextUrl.searchParams.get("id");
  if (!docId) {
    return NextResponse.json({ error: "Missing id query parameter" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: "Too many requests. Maximum 20 PDFs per minute." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const { data, error } = await supabase
    .from("documents")
    .select("*, companies(*)")
    .eq("id", docId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const row = data as Document & { companies: Company | null };
  const company = row.companies;
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const { companies: _c, ...document } = row;
  const docPayload = document as Document;

  const merchant = getMerchantFromEnv();
  const bank = getBankFromEnv();
  const signatoryName = getSignatoryNameFromEnv();

  const html = buildInvoiceHtml({
    document: docPayload,
    company,
    merchant,
    bank,
    signatoryName,
  });

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 45_000 });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    const filename = `${safeFilename(docPayload.doc_number)}.pdf`;

    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[generate-pdf]", e);
    return NextResponse.json(
      { error: "PDF generation failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
