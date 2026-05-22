import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseService } from "@/lib/supabaseServer";
import { parseCsv, rowToObject } from "@/lib/royalties/csv";
import { parseFlexibleNumber, type NumberFormat } from "@/lib/royalties/numberParse";
import { getEcbFxSnapshot, sha256Hex } from "@/lib/royalties/ecbFx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CURRENCY_WHITELIST = new Set(["USD", "EUR", "GBP", "JPY", "BRL", "ARS", "CLP", "MXN"]);

function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "Unknown error";
}

function isoOrNull(s: string | undefined): string | null {
  const v = (s ?? "").trim();
  return v ? v : null;
}

function normalizeIso2Territory(v: string): string | null {
  const s = v.trim().toUpperCase();
  if (!s) return null;
  if (/^[A-Z]{2}$/.test(s)) return s;
  return null;
}

export async function POST(req: Request) {
  try {
    // Auth (same pattern as /api/tracks)
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
    }

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    const uid = userData.user.id;

    // Input: accept raw CSV (text/csv) OR JSON { csv, number_format? }
    const contentType = (req.headers.get("content-type") || "").toLowerCase();

    let csvText = "";
    let numberFormat: NumberFormat = "auto";
    let source = "mock_v0";
    let reportMonth: string | null = null;
    let importedAt: string = new Date().toISOString();
    let fileName: string | null = null;

    if (contentType.includes("application/json")) {
      const body = (await req.json()) as {
        csv?: string;
        number_format?: NumberFormat;
        source?: string;
        report_month?: string;
        imported_at?: string;
        file_name?: string;
      };
      csvText = String(body.csv ?? "");
      numberFormat = (body.number_format ?? "auto") as NumberFormat;
      source = String(body.source ?? source);
      reportMonth = isoOrNull(body.report_month ?? undefined);
      importedAt = String(body.imported_at ?? importedAt);
      fileName = isoOrNull(body.file_name ?? undefined);
    } else {
      csvText = await req.text();
    }

    if (!csvText.trim()) {
      return NextResponse.json({ error: "Missing CSV content" }, { status: 400 });
    }

    const correlation_id = crypto.randomUUID();
    const file_hash = sha256Hex(csvText);

    const { header, rows } = parseCsv(csvText);
    if (header.length === 0) {
      return NextResponse.json({ error: "CSV missing header" }, { status: 400 });
    }

    // If report_month/imported_at/source were not provided, try to read them from the first row.
    const peek = rows.length ? rowToObject(header, rows[0]) : {};
    source = (source || peek.source || "mock_v0").trim() || "mock_v0";
    reportMonth = reportMonth ?? isoOrNull(peek.report_month);
    importedAt = (importedAt || peek.imported_at || new Date().toISOString()).trim();

    if (!reportMonth || !/^\d{4}-\d{2}$/.test(reportMonth)) {
      return NextResponse.json({ error: "Missing/invalid report_month (YYYY-MM)" }, { status: 400 });
    }

    // Insert statement
    const statement_id = crypto.randomUUID();

    const lineInserts: Array<Record<string, unknown>> = [];
    const parsingErrors: string[] = [];
    let hasWarnings = false;
    let okLines = 0;

    for (let i = 0; i < rows.length; i++) {
      const obj = rowToObject(header, rows[i]);
      const warnings: string[] = [];
      const warning_codes: string[] = [];
      let parsing_status: "ok" | "warning" | "error" = "ok";
      let status: "matched" | "ambiguous" | "unmatched" | "quarantined" = "unmatched";
      let error_details: string | null = null;

      const original_currency = (obj.original_currency || obj.currency || "").trim().toUpperCase();
      const territory = normalizeIso2Territory(obj.territory || "");
      if ((obj.territory || "").trim() && !territory) {
        warnings.push("invalid_territory");
        warning_codes.push("invalid_territory");
      }

      // Amounts
      const netRaw = obj.net_amount_original || obj.net_amount || "";
      const netParsed = parseFlexibleNumber(netRaw, numberFormat);
      if (netParsed.error) {
        parsing_status = "error";
        status = "quarantined";
        error_details = netParsed.error;
        warning_codes.push(netParsed.error);
      }
      warnings.push(...netParsed.warnings);
      if (netParsed.warnings.length) warning_codes.push(...netParsed.warnings);

      // Currency whitelist + FX
      let fx_rate: number | null = null;
      let fx_timestamp: string | null = null;
      let net_amount_base: number | null = null;

      if (!original_currency || !/^[A-Z]{3}$/.test(original_currency)) {
        parsing_status = "error";
        status = "quarantined";
        error_details = error_details ?? "invalid_currency";
        warning_codes.push("invalid_currency");
      } else if (!CURRENCY_WHITELIST.has(original_currency)) {
        parsing_status = "error";
        status = "quarantined";
        error_details = error_details ?? "unsupported_currency";
        warning_codes.push("unsupported_currency");
      } else if (parsing_status !== "error") {
        const snap = await getEcbFxSnapshot(original_currency);
        fx_rate = snap.fx_rate;
        fx_timestamp = snap.fx_timestamp;
        const net = netParsed.value ?? 0;
        // MVP rounding: keep 6 decimals in USD
        net_amount_base = Math.round(net * fx_rate * 1e6) / 1e6;
      }

      // Promote to warning if we have non-fatal warnings
      if (parsing_status === "ok" && warning_codes.length) {
        parsing_status = "warning";
      }

      const raw_row_hash = sha256Hex(JSON.stringify(obj));
      const line_id = crypto.randomUUID();
      const created_at = new Date().toISOString();

      if (parsing_status === "warning") hasWarnings = true;
      if (parsing_status === "error") hasWarnings = true;
      if (parsing_status !== "error") okLines++;

      lineInserts.push({
        id: line_id,
        user_id: uid,
        statement_id,
        row_index: i,
        raw_row_hash,
        created_at,
        parsing_status,
        status,
        warnings,
        warning_codes,
        error_details,

        number_format: numberFormat,

        dsp: isoOrNull(obj.dsp),
        territory,
        release_title: isoOrNull(obj.release_title),
        track_title: isoOrNull(obj.track_title),
        artist_name: isoOrNull(obj.artist_name),
        isrc: isoOrNull(obj.ISRC || obj.isrc),
        upc: isoOrNull(obj.UPC || obj.upc),

        quantity: obj.quantity ? Number(obj.quantity) : null,

        original_currency,
        gross_amount_original: obj.gross_amount_original ? parseFlexibleNumber(obj.gross_amount_original, numberFormat).value : null,
        net_amount_original: netParsed.value,

        fx_base_currency: "USD",
        fx_source: "ECB",
        fx_rate,
        fx_timestamp,
        net_amount_base,

        report_month: reportMonth,
        imported_at: importedAt,
        source,
      });
    }

    const parsing_status = rows.length === 0 ? "failed" : hasWarnings ? "parsed_with_warnings" : "parsed";

    const { error: stmtErr } = await service.from("royalty_statements").insert({
      id: statement_id,
      user_id: uid,
      schema_version: "royalty_statement.v0.1",
      correlation_id,
      source,
      report_month: reportMonth,
      imported_at: importedAt,
      importer: "ui",
      file_name: fileName,
      file_hash,
      parsing_status,
      parsing_errors: parsingErrors,
      line_count: rows.length,
    });
    if (stmtErr) return NextResponse.json({ error: stmtErr.message }, { status: 500 });

    if (lineInserts.length) {
      const { error: lineErr } = await service.from("royalty_lines").insert(lineInserts);
      if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });
    }

    return NextResponse.json({
      statement: {
        id: statement_id,
        correlation_id,
        source,
        report_month: reportMonth,
        parsing_status,
        file_hash,
        line_count: rows.length,
        ok_lines: okLines,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

