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
  parentId: string,
  rootFolderId: string
): Promise<string | null> {
  const q = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  let url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  // For Shared Drives, specify corpora=drive and driveId
  url += `&corpora=drive&driveId=${rootFolderId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) {
    console.error("findFolder error:", JSON.stringify(data));
    return null;
  }
  return data.files?.[0]?.id || null;
}

async function createFolder(
  token: string,
  name: string,
  parentId: string
): Promise<string> {
  console.log("createFolder called:", { name, parentId });
  const body: any = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    parents: [parentId],
  };
  // For Shared Drives, we need supportsAllDrives in the query
  const res = await fetch(`${DRIVE_API}/files?supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  console.log("createFolder response:", res.status, JSON.stringify(data));
  if (!res.ok) throw new Error(`Create folder error: ${JSON.stringify(data)}`);
  return data.id;
}

async function getOrCreateFolder(
  token: string,
  name: string,
  parentId: string,
  rootFolderId: string
): Promise<string> {
  const existing = await findFolder(token, name, parentId, rootFolderId);
  if (existing) return existing;
  return createFolder(token, name, parentId);
}

async function listFiles(
  token: string,
  folderId: string,
  rootFolderId: string
): Promise<any[]> {
  const q = `'${folderId}' in parents and trashed=false`;
  let url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,createdTime,webViewLink)&orderBy=createdTime desc&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  if (folderId === rootFolderId) {
    url += `&corpora=drive&driveId=${rootFolderId}`;
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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

  // Convert bytes to base64 in chunks to avoid stack overflow
  let b64 = "";
  const chunkSize = 8192;
  for (let i = 0; i < fileBytes.length; i += chunkSize) {
    const chunk = fileBytes.subarray(i, Math.min(i + chunkSize, fileBytes.length));
    b64 += String.fromCharCode(...chunk);
  }
  b64 = btoa(b64);
  const fullBody = body + b64 + footer;

  const res = await fetch(
    `${UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true`,
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
      // Try parsing as-is first
      sa = JSON.parse(saJson);
    } catch {
      try {
        // Handle double-escaped JSON (e.g. the whole value was wrapped in extra quotes)
        sa = JSON.parse(JSON.parse(`"${saJson.replace(/"/g, '\\"')}"`));
      } catch {
        try {
          // Handle case where newlines were literally stored as \\n
          sa = JSON.parse(saJson.replace(/\\\\n/g, '\\n'));
        } catch (finalErr) {
          console.error("JSON parse attempts failed. Raw length:", saJson.length, "First 80 chars:", saJson.substring(0, 80));
          throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Make sure you pasted the entire JSON key file contents without extra quotes or escaping.");
        }
      }
    }
    if (!sa.private_key) throw new Error("Service account JSON is missing 'private_key'. Ensure you pasted the full JSON key file.");
    if (!sa.client_email) throw new Error("Service account JSON is missing 'client_email'. Ensure you pasted the full JSON key file.");

    const token = await getAccessToken(sa);
    console.log("Root folder ID:", rootFolderId);
    console.log("Service account:", sa.client_email);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ─── DIAGNOSE: List shared drives ─────────────────────
    if (action === "list-drives") {
      const res = await fetch(`${DRIVE_API.replace('/drive/v3', '/drive/v3')}/drives?pageSize=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      console.log("Shared drives:", JSON.stringify(data));
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DIAGNOSE: Check specific drive/folder access ─────
    if (action === "check-access") {
      // Try as Shared Drive first
      const driveRes = await fetch(`${DRIVE_API}/drives/${rootFolderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const driveData = await driveRes.json();
      
      // Try as regular folder
      const fileRes = await fetch(`${DRIVE_API}/files/${rootFolderId}?supportsAllDrives=true&fields=id,name,mimeType,driveId,capabilities`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const fileData = await fileRes.json();
      
      return new Response(JSON.stringify({
        rootFolderId,
        asSharedDrive: { status: driveRes.status, data: driveData },
        asFile: { status: fileRes.status, data: fileData },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ENSURE FOLDER STRUCTURE ──────────────────────────
    // Returns the target folder ID for a given category + customer name
    if (action === "ensure-folder") {
      const { category, customer_name } = await req.json();
      if (!category || !customer_name)
        throw new Error("category and customer_name required");

      const categoryFolderId = await getOrCreateFolder(token, category, rootFolderId, rootFolderId);
      const customerFolderId = await getOrCreateFolder(token, customer_name, categoryFolderId, rootFolderId);

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
      const files = await listFiles(token, folderId, rootFolderId);
      return new Response(JSON.stringify({ files }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── LIST CATEGORY FOLDERS ────────────────────────────
    if (action === "folders") {
      const folders = await listFiles(token, rootFolderId, rootFolderId);
      return new Response(JSON.stringify({ folders }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DOWNLOAD SINGLE FILE ─────────────────────────────
    if (action === "download") {
      const fileId = url.searchParams.get("file_id");
      if (!fileId) throw new Error("file_id required");

      // Get file metadata first
      const metaRes = await fetch(
        `${DRIVE_API}/files/${fileId}?fields=name,mimeType&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const meta = await metaRes.json();
      if (!metaRes.ok) throw new Error(`File meta error: ${JSON.stringify(meta)}`);

      // Check if it's a Google Workspace file (needs export)
      const isGoogleDoc = (meta.mimeType || "").startsWith("application/vnd.google-apps.");
      let downloadUrl: string;
      let downloadMime: string;
      let fileName = meta.name || "download";

      if (isGoogleDoc) {
        // Export Google Docs/Sheets/Slides as PDF
        downloadMime = "application/pdf";
        fileName = fileName.replace(/\.[^.]+$/, "") + ".pdf";
        downloadUrl = `${DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(downloadMime)}&supportsAllDrives=true`;
      } else {
        downloadMime = meta.mimeType || "application/octet-stream";
        downloadUrl = `${DRIVE_API}/files/${fileId}?alt=media&supportsAllDrives=true`;
      }

      const fileRes = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!fileRes.ok) {
        const errText = await fileRes.text();
        throw new Error(`Download error: ${errText}`);
      }

      return new Response(fileRes.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": downloadMime,
          "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        },
      });
    }

    // ─── LIST ALL FILES IN FOLDER (recursive for zip) ─────
    if (action === "list-all") {
      const folderId = url.searchParams.get("folder_id");
      if (!folderId) throw new Error("folder_id required");
      const files = await listFiles(token, folderId, rootFolderId);
      // Also list subfolders' files
      const allFiles: any[] = [];
      for (const f of files) {
        if (f.mimeType === "application/vnd.google-apps.folder") {
          const subFiles = await listFiles(token, f.id, rootFolderId);
          for (const sf of subFiles) {
            if (sf.mimeType !== "application/vnd.google-apps.folder") {
              allFiles.push({ ...sf, subfolder: f.name });
            }
          }
        } else {
          allFiles.push(f);
        }
      }
      return new Response(JSON.stringify({ files: allFiles }), {
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
