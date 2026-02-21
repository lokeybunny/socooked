import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

// ─── JWT signing for service account ────────────────────────
function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getAccessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(
    new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  );
  const payload = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/drive",
        aud: GOOGLE_TOKEN_URL,
        iat: now,
        exp: now + 3600,
      })
    )
  );
  const signingInput = `${header}.${payload}`;

  // Import the private key
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      new TextEncoder().encode(signingInput)
    )
  );
  const jwt = `${signingInput}.${base64url(sig)}`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ─── Drive helpers ──────────────────────────────────────────
async function findFolder(
  token: string,
  name: string,
  parentId: string
): Promise<string | null> {
  const q = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(
  token: string,
  name: string,
  parentId: string
): Promise<string> {
  const res = await fetch(`${DRIVE_API}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Create folder error: ${JSON.stringify(data)}`);
  return data.id;
}

async function getOrCreateFolder(
  token: string,
  name: string,
  parentId: string
): Promise<string> {
  const existing = await findFolder(token, name, parentId);
  if (existing) return existing;
  return createFolder(token, name, parentId);
}

async function listFiles(
  token: string,
  folderId: string
): Promise<any[]> {
  const q = `'${folderId}' in parents and trashed=false`;
  const res = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,createdTime,webViewLink)&orderBy=createdTime desc`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  return data.files || [];
}

async function uploadFile(
  token: string,
  fileName: string,
  mimeType: string,
  fileBytes: Uint8Array,
  parentId: string
): Promise<any> {
  const metadata = JSON.stringify({ name: fileName, parents: [parentId] });
  const boundary = "----LovableBoundary";
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
  const footer = `\r\n--${boundary}--`;

  const b64 = btoa(String.fromCharCode(...fileBytes));
  const fullBody = body + b64 + footer;

  const res = await fetch(
    `${UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: fullBody,
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Upload error: ${JSON.stringify(data)}`);
  return data;
}

// ─── Main handler ───────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    const rootFolderId = Deno.env.get("GOOGLE_DRIVE_ROOT_FOLDER_ID");
    if (!saJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured");
    if (!rootFolderId) throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID not configured");

    let sa: any;
    try {
      sa = JSON.parse(saJson);
    } catch (parseErr) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Make sure you pasted the entire service account key file contents.");
    }
    if (!sa.private_key) throw new Error("Service account JSON is missing 'private_key'. Ensure you pasted the full JSON key file.");
    if (!sa.client_email) throw new Error("Service account JSON is missing 'client_email'. Ensure you pasted the full JSON key file.");

    const token = await getAccessToken(sa);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ─── ENSURE FOLDER STRUCTURE ──────────────────────────
    // Returns the target folder ID for a given category + customer name
    if (action === "ensure-folder") {
      const { category, customer_name } = await req.json();
      if (!category || !customer_name)
        throw new Error("category and customer_name required");

      const categoryFolderId = await getOrCreateFolder(token, category, rootFolderId);
      const customerFolderId = await getOrCreateFolder(token, customer_name, categoryFolderId);

      return new Response(
        JSON.stringify({ folder_id: customerFolderId, category_folder_id: categoryFolderId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── UPLOAD FILE ──────────────────────────────────────
    if (action === "upload") {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      const folderId = formData.get("folder_id") as string;
      if (!file || !folderId) throw new Error("file and folder_id required");

      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await uploadFile(token, file.name, file.type || "application/octet-stream", bytes, folderId);

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── LIST FILES IN FOLDER ─────────────────────────────
    if (action === "list") {
      const folderId = url.searchParams.get("folder_id") || rootFolderId;
      const files = await listFiles(token, folderId);
      return new Response(JSON.stringify({ files }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── LIST CATEGORY FOLDERS ────────────────────────────
    if (action === "folders") {
      const folders = await listFiles(token, rootFolderId);
      return new Response(JSON.stringify({ folders }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action. Use ?action=ensure-folder|upload|list|folders" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Google Drive error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
