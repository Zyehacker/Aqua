import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_PATH =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/avatar\.webp$/i;

type JsonRecord = Record<string, unknown>;
const DEFAULT_FUNCTION_ORIGINS = [
  "http://tauri.localhost",
  "tauri://localhost",
  "http://localhost",
  "http://127.0.0.1",
];

function allowedOrigins(): string[] {
  const configured = Deno.env.get("SUPABASE_FUNCTIONS_ALLOWED_ORIGINS") ??
    Deno.env.get("AVATAR_CORS_ORIGIN");
  return (configured ? configured.split(",") : DEFAULT_FUNCTION_ORIGINS)
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("Origin");
  const configured = allowedOrigins();
  const allowOrigin =
    origin && (configured.includes("*") || configured.includes(origin))
      ? origin
      : configured.includes("*")
      ? "*"
      : configured[0] ?? "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, prefer",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(
  request: Request,
  body: JsonRecord,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

function errorResponse(
  request: Request,
  reason: string,
  status: number,
): Response {
  return jsonResponse(request, { allowed: false, reason }, status);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function isWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 &&
    bytes[11] === 0x50;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

export async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return errorResponse(request, "Method not allowed", 405);
  }
  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (declaredLength > 16 * 1024) {
    return errorResponse(request, "Request body is too large", 413);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.match(/^Bearer\s+\S+$/i)) {
    return errorResponse(request, "Authentication required", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("moderate-avatar is missing Supabase configuration");
    return errorResponse(request, "Server configuration error", 500);
  }

  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data: authData, error: authError } = await adminClient.auth.getUser(
    accessToken,
  );
  if (authError || !authData.user) {
    return errorResponse(request, "Invalid or expired authentication", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(request, "Invalid request body", 400);
  }
  const path = isRecord(body) && typeof body.path === "string"
    ? body.path.trim()
    : "";
  const match = AVATAR_PATH.exec(path);
  if (!match) return errorResponse(request, "Invalid avatar path", 400);

  const userId = authData.user.id;
  if (match[1].toLowerCase() !== userId.toLowerCase()) {
    return errorResponse(request, "Permission denied", 403);
  }

  const storage = adminClient.storage.from("avatars");
  const { data: files, error: listError } = await storage.list(userId, {
    limit: 10,
    search: "avatar.webp",
  });
  if (listError) {
    console.error("moderate-avatar storage lookup failed", listError);
    return errorResponse(request, "Could not verify avatar", 500);
  }
  const avatar = files?.find((file) => file.name === "avatar.webp");
  if (!avatar) return errorResponse(request, "Avatar file not found", 404);

  const metadata = isRecord(avatar.metadata) ? avatar.metadata : null;
  const metadataSize = metadata && typeof metadata.size === "number"
    ? metadata.size
    : null;
  const metadataType = metadata && typeof metadata.mimetype === "string"
    ? metadata.mimetype.toLowerCase()
    : null;
  if (metadataSize !== null && metadataSize > MAX_AVATAR_BYTES) {
    return errorResponse(request, "Avatar is too large", 413);
  }
  if (metadataType !== null && !["image/webp", "image/png", "image/jpeg"].includes(metadataType)) {
    return errorResponse(request, "Avatar must be a PNG, JPEG, or WebP image", 415);
  }

  // Validate the actual private object with the server-only client. The service
  // role key is never returned to the browser or used by frontend code.
  const { data: file, error: downloadError } = await storage.download(path);
  if (downloadError || !file) {
    console.error("moderate-avatar storage download failed", downloadError);
    return errorResponse(request, "Could not verify avatar", 500);
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return errorResponse(request, "Avatar is too large", 413);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detectedType = isWebp(bytes) ? "image/webp" : isPng(bytes) ? "image/png" : isJpeg(bytes) ? "image/jpeg" : null;
  if (!detectedType || (file.type && file.type.toLowerCase() !== detectedType)) {
    return errorResponse(request, "Avatar must be a valid PNG, JPEG, or WebP image", 415);
  }

  // No external image-moderation provider is configured. This endpoint
  // truthfully performs ownership, storage, size, and type validation only.
  return jsonResponse(request, { allowed: true });
}

Deno.serve(handler);
