import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Generates a random 6-character alphanumeric code e.g. "A3F9K2"
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // removed ambiguous chars like 0,O,1,I
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function POST(req: NextRequest) {
  // Check environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase environment variables')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  try {
    const formData = await req.formData()
    const entries = formData.getAll('files')
    const files = entries.filter((entry): entry is File => entry instanceof File)

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    if (files.length > 10) {
      return NextResponse.json({ error: 'Too many files. Max 10 files at once.' }, { status: 400 })
    }

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
    ]

    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) {
        return NextResponse.json({ error: 'Each file must be 20MB or smaller.' }, { status: 400 })
      }
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json({ error: 'File type not allowed. Use PDF, DOC, DOCX, JPG, or PNG.' }, { status: 400 })
      }
    }

    let code = generateCode()
    let attempts = 0
    while (attempts < 5) {
      const { data } = await supabaseAdmin.from('files').select('code').eq('code', code).limit(1)
      if (!data || data.length === 0) break
      code = generateCode()
      attempts++
    }

    const safeNames = new Set<string>()
    const uploads: { filePath: string; file: File }[] = []

    for (const file of files) {
      let safeName = file.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._\-]/g, '')
      if (!safeName) safeName = 'file'
      const extensionIndex = safeName.lastIndexOf('.')
      const baseName = extensionIndex >= 0 ? safeName.slice(0, extensionIndex) : safeName
      const extension = extensionIndex >= 0 ? safeName.slice(extensionIndex) : ''
      let candidate = safeName
      let duplicateCount = 1
      while (safeNames.has(candidate)) {
        candidate = `${baseName}_${duplicateCount}${extension}`
        duplicateCount++
      }
      safeNames.add(candidate)
      uploads.push({ filePath: `${code}/${candidate}`, file })
    }

    const uploadedPaths: string[] = []
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    try {
      for (const { filePath, file } of uploads) {
        const arrayBuffer = await file.arrayBuffer()
        const { error: uploadError } = await supabaseAdmin.storage
          .from('print-files')
          .upload(filePath, arrayBuffer, {
            contentType: file.type,
            upsert: false,
          })

        if (uploadError) {
          throw uploadError
        }

        uploadedPaths.push(filePath)
      }

      const filePaths = uploads.map((upload) => upload.filePath)
      const originalNames = files.map((file) => file.name)

      const { error: dbError } = await supabaseAdmin.from('files').insert({
        code,
        file_path: JSON.stringify(filePaths),
        original_name: JSON.stringify(originalNames),
        expires_at: expiresAt,
      })

      if (dbError) {
        throw dbError
      }
    } catch (error) {
      if (uploadedPaths.length > 0) {
        await supabaseAdmin.storage.from('print-files').remove(uploadedPaths)
      }
      console.error('Upload error:', error)
      return NextResponse.json({ error: 'Failed to upload files' }, { status: 500 })
    }

    return NextResponse.json({ code, expiresAt, count: files.length })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}