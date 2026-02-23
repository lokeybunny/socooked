/**
 * Deterministic storage path builder for site assets.
 * Pattern: site-assets/{customer_id}/{timestamp}/{key}.png
 */
export function buildAssetPath(
  customerId: string,
  key: string,
  ext = 'png',
  timestamp?: number,
): string {
  const ts = timestamp ?? Date.now()
  // Sanitize key: lowercase, replace spaces/special chars with hyphens
  const safeKey = key.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-')
  return `${customerId}/${ts}/${safeKey}.${ext}`
}

/**
 * Build the full public URL for a stored asset.
 */
export function buildPublicUrl(
  supabaseUrl: string,
  bucket: string,
  path: string,
): string {
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
}
