export async function recordUntitledImport(supabase, { sourceUrl, ownerId, extraction }) {
  const missingFields = [...new Set(['name', ...(extraction.missing_fields || [])])]
  const { error } = await supabase.from('extraction_runs').insert({
    source_url: sourceUrl,
    source_platform: extraction.fields?.source_platform || null,
    status: 'needs_correction',
    extracted_data: {
      fields: extraction.fields || {},
      warnings: extraction.warnings || [],
      field_provenance: extraction.field_provenance || {},
      research: extraction.research || null,
    },
    missing_fields: missingFields,
    error_message: 'The event title could not be determined from the public source.',
    created_by: ownerId,
  })
  if (error) throw error
  return missingFields
}
