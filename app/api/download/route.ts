import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  // Check environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase environment variables')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  try {
    const code = req.nextUrl.searchParams.get('code')?.toUpperCase().trim()

    if (!code || code.length !== 6) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('files')
      .select('*')
      .eq('code', code)

    if (error || !data || data.length === 0) {
      return NextResponse.json({ error: 'Code not found' }, { status: 404 })
    }

    const record = data[0]
    const expiresAt = new Date(record.expires_at)
    if (expiresAt < new Date()) {
      const filePathString = record.file_path
      let expiredPaths: string[] = []
      try {
        expiredPaths = JSON.parse(filePathString)
      } catch {
        expiredPaths = [filePathString]
      }
      await supabaseAdmin.storage.from('print-files').remove(expiredPaths)
      await supabaseAdmin.from('files').delete().eq('code', code)
      return NextResponse.json({ error: 'This code has expired' }, { status: 410 })
    }

    let filePaths: string[] = []
    let originalNames: string[] = []

    try {
      filePaths = JSON.parse(record.file_path)
    } catch {
      filePaths = [record.file_path]
    }

    try {
      originalNames = JSON.parse(record.original_name)
    } catch {
      originalNames = [record.original_name]
    }

    if (filePaths.length === 1) {
      const { data: urlData, error: urlError } = await supabaseAdmin.storage
        .from('print-files')
        .createSignedUrl(filePaths[0], 60)

      if (urlError || !urlData) {
        console.error('Signed URL error:', urlError)
        return NextResponse.json({ error: 'Failed to generate download link' }, { status: 500 })
      }

      await supabaseAdmin.from('files').delete().eq('code', code)
      return NextResponse.json({
        url: urlData.signedUrl,
        fileName: originalNames[0] || filePaths[0].split('/').pop() || 'file',
      })
    }

    const { PassThrough } = await import('stream')
    const archiver = (await import('archiver')).default

    const fileBuffers = await Promise.all(filePaths.map(async (path, index) => {
      const { data: fileData, error: downloadError } = await supabaseAdmin.storage
        .from('print-files')
        .download(path)

      if (downloadError || !fileData) {
        throw downloadError || new Error('Failed to download file data')
      }

      const arrayBuffer = fileData.arrayBuffer ? await fileData.arrayBuffer() : await new Response(fileData).arrayBuffer()
      return {
        buffer: Buffer.from(arrayBuffer),
        name: originalNames[index] || path.split('/').pop() || `file${index + 1}`,
      }
    }))

    const zip = archiver('zip', { zlib: { level: 9 } })
    const passthrough = new PassThrough()
    const buffers: Buffer[] = []

    passthrough.on('data', (chunk) => buffers.push(Buffer.from(chunk)))

    const zipBufferPromise = new Promise<Buffer>((resolve, reject) => {
      passthrough.on('end', () => resolve(Buffer.concat(buffers)))
      passthrough.on('error', reject)
      zip.on('error', reject)
    })

    zip.pipe(passthrough)
    fileBuffers.forEach((file) => {
      zip.append(file.buffer, { name: file.name })
    })
    await zip.finalize()

    const zipBuffer = await zipBufferPromise

    await supabaseAdmin.storage.from('print-files').remove(filePaths)
    await supabaseAdmin.from('files').delete().eq('code', code)

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${code}.zip"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    })
  } catch (err) {
    console.error('Download error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}