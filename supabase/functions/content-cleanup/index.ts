import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BUCKET = 'content-uploads'
const MAX_AGE_DAYS = 30
const EXCLUDED_CATEGORIES = ['ai-generated']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS)
    const cutoffISO = cutoff.toISOString()

    console.log(`[content-cleanup] Running cleanup. Cutoff: ${cutoffISO}. Excluding: ${EXCLUDED_CATEGORIES.join(', ')}`)

    // Find stale content_assets: updated_at older than cutoff, not in excluded categories
    // We use updated_at as a proxy for "last opened/touched" — any view or edit bumps this
    const { data: staleAssets, error: queryErr } = await supabase
      .from('content_assets')
      .select('id, title, url, category, updated_at')
      .lt('updated_at', cutoffISO)
      .not('category', 'in', `(${EXCLUDED_CATEGORIES.join(',')})`)
      .limit(200)

    if (queryErr) throw new Error(`Query error: ${queryErr.message}`)
    if (!staleAssets || staleAssets.length === 0) {
      console.log('[content-cleanup] No stale assets found.')
      return new Response(JSON.stringify({ cleaned: 0, message: 'No stale assets' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[content-cleanup] Found ${staleAssets.length} stale assets to clean.`)

    let deletedFiles = 0
    let deletedRecords = 0
    const errors: string[] = []

    for (const asset of staleAssets) {
      // Try to delete from storage if URL points to our bucket
      if (asset.url && asset.url.includes(BUCKET)) {
        try {
          // Extract storage path from URL
          // URL format: .../storage/v1/object/public/content-uploads/path/to/file
          const bucketMarker = `/object/public/${BUCKET}/`
          const pathIdx = asset.url.indexOf(bucketMarker)
          if (pathIdx !== -1) {
            const storagePath = decodeURIComponent(asset.url.substring(pathIdx + bucketMarker.length))
            const { error: delErr } = await supabase.storage.from(BUCKET).remove([storagePath])
            if (delErr) {
              console.warn(`[content-cleanup] Storage delete failed for "${asset.title}": ${delErr.message}`)
              errors.push(`storage:${asset.id}:${delErr.message}`)
            } else {
              deletedFiles++
            }
          }
        } catch (e: any) {
          console.warn(`[content-cleanup] Storage parse error for "${asset.title}": ${e.message}`)
        }
      }

      // Delete the database record
      const { error: dbErr } = await supabase.from('content_assets').delete().eq('id', asset.id)
      if (dbErr) {
        console.error(`[content-cleanup] DB delete failed for "${asset.title}": ${dbErr.message}`)
        errors.push(`db:${asset.id}:${dbErr.message}`)
      } else {
        deletedRecords++
      }
    }

    const summary = `Cleaned ${deletedRecords} records, ${deletedFiles} storage files. ${errors.length} errors.`
    console.log(`[content-cleanup] ${summary}`)

    // Log activity for Telegram notification
    await supabase.from('activity_log').insert({
      entity_type: 'content',
      action: 'deleted',
      meta: {
        name: `🧹 Auto-Cleanup: ${deletedRecords} stale files removed`,
        message: `🧹 *Content Auto-Cleanup*\nRemoved *${deletedRecords}* files older than ${MAX_AGE_DAYS} days\n(Excluded: AI-generated)`,
        detail: summary,
      },
    })

    return new Response(JSON.stringify({
      cleaned: deletedRecords,
      storage_deleted: deletedFiles,
      errors: errors.length,
      cutoff: cutoffISO,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[content-cleanup] error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
