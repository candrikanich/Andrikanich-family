// supabase/functions/extract-document/index.ts
// Receives { documentId } from the frontend, verifies caller is editor+,
// downloads the file from Storage, extracts text, calls Claude Haiku,
// and returns a structured ExtractionResult JSON.
//
// ─── Manual Test Plan ──────────────────────────────────────────────────────────
//
// Prerequisites:
//   - Local Supabase running (`supabase start`) or deployed project
//   - ANTHROPIC_API_KEY set in supabase/functions/.env or Supabase dashboard secrets
//   - An approved editor/admin account
//   - A documents row + matching file in Storage bucket "documents"
//
// Test 1 — Missing auth header
//   curl -X POST <FUNCTION_URL> -H "Content-Type: application/json" \
//        -d '{"documentId":"<id>"}'
//   Expected: 401 Unauthorized
//
// Test 2 — Viewer role (not editor)
//   Use a JWT for a profile with role=viewer.
//   Expected: 403 Forbidden
//
// Test 3 — Missing documentId
//   curl -X POST <FUNCTION_URL> -H "Authorization: Bearer <editor_jwt>" \
//        -H "Content-Type: application/json" -d '{}'
//   Expected: 400 Bad Request
//
// Test 4 — Document not found
//   curl -X POST <FUNCTION_URL> -H "Authorization: Bearer <editor_jwt>" \
//        -H "Content-Type: application/json" \
//        -d '{"documentId":"00000000-0000-0000-0000-000000000000"}'
//   Expected: 404 Not Found
//
// Test 5 — Unsupported mime type (e.g. image/jpeg)
//   Insert a documents row with mime_type="image/jpeg", then invoke.
//   Expected: 400 Bad Request with "Unsupported file type"
//
// Test 6 — Valid .docx file
//   Upload a real .docx biography file, insert a documents row with
//   mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
//   Expected: 200 with valid ExtractionResult JSON (person.firstName populated)
//
// Test 7 — Valid .pdf file
//   Upload a real .pdf biography file.
//   Expected: 200 with valid ExtractionResult JSON
//
// Test 8 — CORS preflight
//   curl -X OPTIONS <FUNCTION_URL>
//   Expected: 204 with Access-Control-Allow-Origin header
//
// ──────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DocumentRow {
  id: string
  storage_path: string
  mime_type: string
}

// ─── Env helpers ───────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const value = Deno.env.get(key)
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const SUPABASE_URL               = requireEnv('SUPABASE_URL')
const SUPABASE_ANON_KEY          = requireEnv('SUPABASE_ANON_KEY')
const SUPABASE_SERVICE_ROLE_KEY  = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const ANTHROPIC_API_KEY          = requireEnv('ANTHROPIC_API_KEY')

const SUPPORTED_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
])

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM_PROMPT = `You are extracting structured genealogy data from a family history document.

The document uses a label-value format with consistent keywords (e.g., "Born:", "Mother:", "Married:").
Fields marked with "??" indicate uncertainty (e.g., "Mary Smith??") — extract these and set uncertain: true on that field.

Return ONLY a valid JSON object matching this exact schema. Do not include any explanation or markdown.

{
  "person": {
    "firstName": { "value": string, "uncertain": boolean },
    "lastName": { "value": string, "uncertain": boolean },
    "birthSurname": { "value": string, "uncertain": boolean } | null,
    "nickname": { "value": string, "uncertain": boolean } | null,
    "suffix": { "value": string, "uncertain": boolean } | null,
    "nameVariants": string[] | null,
    "birthDate": { "value": string, "uncertain": boolean } | null,
    "birthPlace": { "value": string, "uncertain": boolean } | null,
    "deathDate": { "value": string, "uncertain": boolean } | null,
    "deathPlace": { "value": string, "uncertain": boolean } | null,
    "burialPlace": { "value": string, "uncertain": boolean } | null,
    "biography": string | null,
    "notes": string | null
  },
  "residences": [{ "location": string, "fromDate": string | null, "toDate": string | null, "isCurrent": boolean }],
  "education": [{ "institution": string, "institutionType": "high_school"|"college"|"university"|"vocational"|"other", "startYear": number | null, "endYear": number | null, "graduated": boolean | null }],
  "occupations": [{ "employer": string | null, "title": string | null, "fromDate": string | null, "toDate": string | null, "isCurrent": boolean }],
  "militaryService": [{ "branch": string, "rank": string | null, "fromDate": string | null, "toDate": string | null, "notes": string | null }],
  "marriages": [{ "spouseName": string, "marriageDate": { "value": string, "uncertain": boolean } | null, "marriagePlace": { "value": string, "uncertain": boolean } | null, "endDate": string | null, "endReason": "divorced"|"widowed"|"annulled" | null }],
  "mentionedNames": [{ "name": string, "relationshipType": "parent"|"child"|"sibling"|"spouse", "mentionContext": string, "uncertain": boolean }]
}

Rules:
- Extract Mother and Father as mentionedNames with relationshipType "parent"
- Extract Children as mentionedNames with relationshipType "child"
- Extract Siblings as mentionedNames with relationshipType "sibling"
- Extract spouse from Married field as mentionedNames with relationshipType "spouse"
- For the "Lived in" field, create a residence entry per location with isCurrent: false
- For the "Lives in" field, create a residence entry with isCurrent: true
- If a field is not present in the document, use null (not an empty string or empty array)
- Preserve cross-reference notes (e.g., "See William Frances Andrikanich") in person.notes`

// ─── Helpers ───────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// ─── Text extraction: .docx ────────────────────────────────────────────────────

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  try {
    // deno-lint-ignore no-explicit-any
    const mammoth = ((await import('npm:mammoth')) as any).default ?? (await import('npm:mammoth'))
    const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer })
    if (result.value?.trim()) return result.value
  } catch (err) {
    console.warn('mammoth extraction failed, using XML fallback:', err)
  }
  return extractDocxXmlFallback(bytes)
}

function extractDocxXmlFallback(bytes: Uint8Array): string {
  // A .docx is a ZIP file. We decode it as latin1 (byte-preserving), locate
  // the word/document.xml entry by scanning for the filename string, then
  // strip XML tags to recover plain text. This is sufficient for the
  // label-value genealogy documents this project processes.
  const decoder = new TextDecoder('latin1')
  const raw = decoder.decode(bytes)

  const xmlMarker = 'word/document.xml'
  const xmlIdx = raw.indexOf(xmlMarker)
  if (xmlIdx === -1) {
    return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  const contentStart = raw.indexOf('<w:', xmlIdx)
  if (contentStart === -1) return ''

  const chunk = raw.slice(contentStart, contentStart + 500_000)
  return chunk
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:r>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Text extraction: .pdf ─────────────────────────────────────────────────────

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const MAX_PAGES = 20

  try {
    // deno-lint-ignore no-explicit-any
    const pdfjsLib = (await import('npm:pdfjs-dist/legacy/build/pdf.mjs')) as any

    // Workers are not available in the Deno runtime
    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = ''
    }

    const loadingTask = pdfjsLib.getDocument({
      data: bytes,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    })
    const pdfDoc = await loadingTask.promise
    const pageCount = Math.min(pdfDoc.numPages, MAX_PAGES)
    const pageTexts: string[] = []

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdfDoc.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = (textContent.items as Array<{ str?: string }>)
        .map(item => item.str ?? '')
        .join(' ')
      pageTexts.push(pageText)
    }

    return pageTexts.join('\n\n')
  } catch (err) {
    console.warn('pdfjs extraction failed, using raw byte fallback:', err)
    return extractPdfRawFallback(bytes)
  }
}

function extractPdfRawFallback(bytes: Uint8Array): string {
  // Extract text from PDF BT...ET blocks (Begin Text / End Text operators).
  // Parenthesis-delimited strings hold visible text in most PDFs.
  const decoder = new TextDecoder('latin1')
  const raw = decoder.decode(bytes)

  const segments: string[] = []
  const btEtRegex = /BT([\s\S]*?)ET/g
  let match: RegExpExecArray | null

  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1]
    const strRegex = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g
    let strMatch: RegExpExecArray | null
    while ((strMatch = strRegex.exec(block)) !== null) {
      const text = strMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\')
        .replace(/\\([()])/g, '$1')
      if (text.trim()) segments.push(text)
    }
  }

  if (segments.length > 0) return segments.join(' ').replace(/\s+/g, ' ').trim()

  // Absolute last resort: printable ASCII filter
  return Array.from(bytes)
    .filter(b => b >= 0x20 && b <= 0x7e)
    .map(b => String.fromCharCode(b))
    .join('')
    .replace(/\s+/g, ' ')
    .slice(0, 200_000)
    .trim()
}

// ─── Claude Haiku call with retry ─────────────────────────────────────────────

async function callHaiku(documentText: string): Promise<unknown> {
  const MAX_RETRIES = 2
  const RETRIABLE_STATUSES = new Set([429, 500, 502, 503, 529])

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: documentText }],
      }),
    })

    if (response.ok) {
      const data = await response.json()
      const rawContent: string = data.content?.[0]?.text ?? ''
      try {
        return JSON.parse(rawContent)
      } catch {
        throw new Error(`Claude returned non-JSON response: ${rawContent.slice(0, 200)}`)
      }
    }

    const errBody = await response.text()
    console.error(`Haiku attempt ${attempt + 1} failed (${response.status}):`, errBody)

    if (!RETRIABLE_STATUSES.has(response.status) || attempt === MAX_RETRIES) {
      throw new Error(`Claude API error (${response.status}): ${errBody}`)
    }

    if (response.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
    }
  }
}

// ─── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  try {
    // ── 1. Verify authentication ──────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('Missing or invalid Authorization header', 401)
    }
    const jwt = authHeader.slice(7)

    // Query profiles using the caller's JWT — RLS enforces auth.uid() match
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    const { data: profile, error: profileError } = await userClient
      .from('profiles')
      .select('role')
      .single()

    if (profileError || !profile) {
      return errorResponse('Unauthorized', 401)
    }

    if (profile.role !== 'editor' && profile.role !== 'admin') {
      return errorResponse('Forbidden: editor or admin role required', 403)
    }

    // ── 2. Parse request body ─────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const documentId: unknown = body?.documentId

    if (!documentId || typeof documentId !== 'string') {
      return errorResponse('Missing required field: documentId', 400)
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!UUID_REGEX.test(documentId)) {
      return errorResponse('Invalid documentId format', 400)
    }

    // ── 3. Fetch the documents row using service role (bypasses RLS) ──────────
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: docRow, error: docError } = await serviceClient
      .from('documents')
      .select('id, storage_path, mime_type')
      .eq('id', documentId)
      .single<DocumentRow>()

    if (docError || !docRow) {
      return errorResponse('Document not found', 404)
    }

    // ── 4. Validate mime type ─────────────────────────────────────────────────
    if (!SUPPORTED_MIMES.has(docRow.mime_type)) {
      return errorResponse(`Unsupported file type: ${docRow.mime_type}`, 400)
    }

    // ── 5. Download file bytes from private Storage bucket ────────────────────
    const { data: fileData, error: downloadError } = await serviceClient.storage
      .from('documents')
      .download(docRow.storage_path)

    if (downloadError || !fileData) {
      console.error('Storage download error:', downloadError)
      return errorResponse('Failed to download document from storage', 500)
    }

    const fileBytes = new Uint8Array(await fileData.arrayBuffer())

    // ── 6. Extract plain text ─────────────────────────────────────────────────
    const isDocx =
      docRow.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

    const documentText = isDocx
      ? await extractDocxText(fileBytes)
      : await extractPdfText(fileBytes)

    if (!documentText.trim()) {
      return errorResponse('Could not extract text from the document', 500)
    }

    // ── 7. Call Claude Haiku (up to 2 retries) ────────────────────────────────
    const extractionResult = await callHaiku(documentText)

    // ── 8. Return ExtractionResult directly (supabase.functions.invoke unwraps .data) ─
    return jsonResponse(extractionResult, 200)
  } catch (err) {
    console.error('Unexpected error in extract-document:', err)
    return errorResponse(
      err instanceof Error ? err.message : 'Internal server error',
      500,
    )
  }
})
