'use client'

import { useState, useRef, useCallback } from 'react'

type Mode = 'upload' | 'download'
type UploadState = 'idle' | 'uploading' | 'done' | 'error'
type DownloadState = 'idle' | 'loading' | 'error'

export default function Home() {
  const [mode, setMode] = useState<Mode>('upload')
  const [files, setFiles] = useState<File[]>([])
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [code, setCode] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [codeInput, setCodeInput] = useState('')
  const [downloadState, setDownloadState] = useState<DownloadState>('idle')
  const [downloadError, setDownloadError] = useState('')
  const [copied, setCopied] = useState(false)

  const handleFile = (selectedFiles: File[]) => {
    setFiles(selectedFiles)
    setUploadState('idle')
    setUploadError('')
    setCode('')
    setExpiresAt('')
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = Array.from(e.dataTransfer.files || [])
    if (dropped.length > 0) handleFile(dropped)
  }, [])

  const handleUpload = async () => {
    if (files.length === 0) return
    setUploadState('uploading')
    setUploadError('')
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) { setUploadError(data.error || 'Upload failed'); setUploadState('error'); return }
      setCode(data.code)
      setExpiresAt(new Date(data.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      setUploadState('done')
    } catch {
      setUploadError('Network error. Try again.')
      setUploadState('error')
    }
  }

  const resetUpload = () => {
    setFiles([])
    setUploadState('idle')
    setUploadError('')
    setCode('')
    setCopied(false)
    setExpiresAt('')
  }

  const handleDownload = async () => {
    const trimmed = codeInput.trim().toUpperCase()
    if (trimmed.length !== 6) { setDownloadError('Code must be 6 characters'); return }
    setDownloadState('loading')
    setDownloadError('')
    try {
      const res = await fetch(`/api/download?code=${trimmed}`)
      const contentType = res.headers.get('content-type') || ''

      if (!res.ok) {
        const data = await res.json()
        setDownloadError(data.error || 'Download failed')
        setDownloadState('error')
        return
      }

      if (!contentType.includes('application/json')) {
        const blob = await res.blob()
        const disposition = res.headers.get('content-disposition') || ''
        const match = disposition.match(/filename="?([^";]+)"?$/)
        const fileName = match ? match[1] : `${trimmed}.zip`
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = fileName
        a.click()
        URL.revokeObjectURL(a.href)
      } else {
        const data = await res.json()
        if (!data.url) {
          setDownloadError(data.error || 'Download failed')
          setDownloadState('error')
          return
        }
        const a = document.createElement('a')
        a.href = data.url
        a.download = data.fileName
        a.click()
      }

      setDownloadState('idle')
      setCodeInput('')
    } catch {
      setDownloadError('Network error. Try again.')
      setDownloadState('error')
    }
  }

  const copyCode = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #080b0f; }
        .pd-root {
          min-height: 100vh;
          background: #080b0f;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
          font-family: 'JetBrains Mono', monospace;
          position: relative;
          overflow: hidden;
        }
        .pd-root::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: repeating-linear-gradient(
            0deg, transparent, transparent 2px,
            rgba(0,255,128,0.015) 2px, rgba(0,255,128,0.015) 4px
          );
          pointer-events: none;
        }
        .pd-grid-bg {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(0,255,128,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,128,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
        }
        .pd-glow {
          position: absolute;
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(0,255,128,0.06) 0%, transparent 70%);
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }
        .pd-content { position: relative; z-index: 1; width: 100%; max-width: 460px; }
        .pd-header { text-align: center; margin-bottom: 2.5rem; }
        .pd-logo { font-size: 2rem; font-weight: 700; color: #00ff80; letter-spacing: -0.02em; text-shadow: 0 0 40px rgba(0,255,128,0.4); }
        .pd-logo span { color: #ffffff; opacity: 0.3; }
        .pd-tagline { font-size: 0.7rem; color: #3a4a3e; margin-top: 0.4rem; letter-spacing: 0.15em; text-transform: uppercase; }
        .pd-tabs { display: flex; border: 1px solid #1a2420; border-radius: 10px; padding: 4px; margin-bottom: 1.5rem; background: #0c1210; }
        .pd-tab { flex: 1; padding: 0.55rem 1rem; border-radius: 7px; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; font-weight: 500; cursor: pointer; border: none; transition: all 0.15s; letter-spacing: 0.05em; }
        .pd-tab-active { background: #00ff80; color: #080b0f; }
        .pd-tab-inactive { background: transparent; color: #3a5040; }
        .pd-tab-inactive:hover { color: #00cc66; }
        .pd-card { background: #0c1210; border: 1px solid #1a2420; border-radius: 14px; padding: 1.75rem; position: relative; overflow: hidden; }
        .pd-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(0,255,128,0.3), transparent); }
        .pd-dropzone { border: 1px dashed #1e3028; border-radius: 10px; padding: 2.5rem 1.5rem; text-align: center; cursor: pointer; transition: all 0.2s; margin-bottom: 1rem; background: #080f0b; }
        .pd-dropzone:hover, .pd-dropzone-drag { border-color: #00ff80; background: #0a1a10; }
        .pd-dropzone-active { border-color: #00cc66; background: #091509; }
        .pd-drop-icon { width: 36px; height: 36px; margin: 0 auto 1rem; opacity: 0.4; }
        .pd-drop-title { font-size: 0.8rem; color: #4a7055; margin-bottom: 0.4rem; }
        .pd-drop-sub { font-size: 0.65rem; color: #2a3a2e; letter-spacing: 0.05em; }
        .pd-file-name { font-size: 0.8rem; color: #00ff80; margin-bottom: 0.3rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pd-file-size { font-size: 0.65rem; color: #3a5040; }
        .pd-btn { width: 100%; padding: 0.85rem; border-radius: 8px; font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.08em; cursor: pointer; border: none; transition: all 0.15s; text-transform: uppercase; }
        .pd-btn-primary { background: #00ff80; color: #080b0f; }
        .pd-btn-primary:hover:not(:disabled) { background: #00cc66; box-shadow: 0 0 24px rgba(0,255,128,0.25); }
        .pd-btn-primary:disabled { opacity: 0.25; cursor: not-allowed; }
        .pd-btn-secondary { background: transparent; color: #3a5040; border: 1px solid #1a2420; margin-bottom: 0.75rem; }
        .pd-btn-secondary:hover { border-color: #2a3a2e; color: #00cc66; }
        .pd-error { font-size: 0.7rem; color: #ff4455; text-align: center; margin-bottom: 0.75rem; letter-spacing: 0.03em; }
        .pd-success-label { font-size: 0.65rem; color: #3a5040; text-align: center; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 1rem; }
        .pd-code-display { text-align: center; margin-bottom: 1.5rem; padding: 1.5rem; background: #080f0b; border-radius: 10px; border: 1px solid #1a2420; }
        .pd-code { font-size: 3rem; font-weight: 700; letter-spacing: 0.25em; color: #00ff80; text-shadow: 0 0 30px rgba(0,255,128,0.5); user-select: all; display: block; margin-bottom: 0.5rem; }
        .pd-expiry { font-size: 0.65rem; color: #2a4030; letter-spacing: 0.1em; }
        .pd-expiry span { color: #3a6045; }
        .pd-input { width: 100%; text-align: center; font-size: 2rem; font-weight: 700; letter-spacing: 0.3em; background: #080f0b; border: 1px solid #1a2420; border-radius: 10px; padding: 1rem; color: #00ff80; font-family: 'JetBrains Mono', monospace; outline: none; transition: border-color 0.15s; margin-bottom: 1rem; text-transform: uppercase; caret-color: #00ff80; }
        .pd-input::placeholder { color: #1a2a20; letter-spacing: 0.2em; }
        .pd-input:focus { border-color: #00ff80; box-shadow: 0 0 0 3px rgba(0,255,128,0.08); }
        .pd-hint { font-size: 0.65rem; color: #2a3a2e; text-align: center; margin-top: 1rem; letter-spacing: 0.05em; }
        .pd-footer { text-align: center; margin-top: 1.5rem; }
        .pd-footer-text { font-size: 0.62rem; color: #1e2e22; letter-spacing: 0.1em; text-transform: uppercase; }
        .pd-status { display: inline-flex; align-items: center; gap: 6px; font-size: 0.62rem; color: #3a5040; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 1.5rem; }
        .pd-dot { width: 6px; height: 6px; border-radius: 50%; background: #00ff80; box-shadow: 0 0 8px rgba(0,255,128,0.8); animation: blink 2s ease-in-out infinite; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>

      <div className="pd-root">
        <div className="pd-grid-bg" />
        <div className="pd-glow" />
        <div className="pd-content">
          <div className="pd-header">
            <div className="pd-logo">Print<span>/</span>Drop</div>
            <div className="pd-tagline">zero login · zero trace · instant print</div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div className="pd-status">
              <div className="pd-dot" />
              system online
            </div>
          </div>

          <div className="pd-tabs">
            <button className={`pd-tab ${mode === 'upload' ? 'pd-tab-active' : 'pd-tab-inactive'}`} onClick={() => setMode('upload')}>↑ upload</button>
            <button className={`pd-tab ${mode === 'download' ? 'pd-tab-active' : 'pd-tab-inactive'}`} onClick={() => setMode('download')}>↓ download</button>
          </div>

          <div className="pd-card">
            {mode === 'upload' && (
              <>
                {uploadState === 'done' ? (
                  <>
                    <div className="pd-success-label">your code</div>
                    <div className="pd-code-display">
                      <span className="pd-code">{code}</span>
                      <div className="pd-expiry">expires at <span>{expiresAt}</span> · single use</div>
                    </div>
                    <button className="pd-btn pd-btn-secondary" onClick={copyCode}>{copied ? '✓ copied' : 'copy code'}</button>
                    <button className="pd-btn pd-btn-primary" onClick={resetUpload}>upload another</button>
                  </>
                ) : (
                  <>
                    <div
                      className={`pd-dropzone ${isDragging ? 'pd-dropzone-drag' : ''} ${files.length > 0 ? 'pd-dropzone-active' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" multiple onChange={(e) => e.target.files && handleFile(Array.from(e.target.files))} />
                      {files.length > 0 ? (
                        <>
                          {files.length === 1 ? (
                            <>
                              <div className="pd-file-name">{files[0].name}</div>
                              <div className="pd-file-size">{formatBytes(files[0].size)}</div>
                            </>
                          ) : (
                            <>
                              <div className="pd-file-name">{files.length} files selected</div>
                              <div className="pd-file-size">{files.map((file) => file.name).join(', ')}</div>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          <svg className="pd-drop-icon" viewBox="0 0 36 36" fill="none">
                            <rect x="6" y="4" width="18" height="24" rx="2" stroke="#00ff80" strokeWidth="1.5"/>
                            <path d="M20 4v7h7" stroke="#00ff80" strokeWidth="1.5" strokeLinejoin="round"/>
                            <path d="M18 28v4M15 29l3-3 3 3" stroke="#00ff80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <div className="pd-drop-title">drop files or click to browse</div>
                          <div className="pd-drop-sub">pdf · doc · docx · jpg · png · max 20mb each</div>
                        </>
                      )}
                    </div>
                    {uploadError && <div className="pd-error">{uploadError}</div>}
                    <button className="pd-btn pd-btn-primary" onClick={handleUpload} disabled={files.length === 0 || uploadState === 'uploading'}>
                      {uploadState === 'uploading' ? 'uploading...' : `generate code${files.length > 1 ? ` for ${files.length} files` : ''} →`}
                    </button>
                  </>
                )}
              </>
            )}

            {mode === 'download' && (
              <>
                <input
                  className="pd-input"
                  type="text"
                  value={codeInput}
                  onChange={(e) => { setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setDownloadError('') }}
                  onKeyDown={(e) => e.key === 'Enter' && handleDownload()}
                  placeholder="_ _ _ _ _ _"
                  maxLength={6}
                  autoFocus
                />
                {downloadError && <div className="pd-error">{downloadError}</div>}
                <button className="pd-btn pd-btn-primary" onClick={handleDownload} disabled={codeInput.length !== 6 || downloadState === 'loading'}>
                  {downloadState === 'loading' ? 'fetching...' : 'download file →'}
                </button>
                <div className="pd-hint">file is deleted immediately after download</div>
              </>
            )}
          </div>

          <div className="pd-footer">
            <div className="pd-footer-text">files auto-expire · 2hr window · no account needed</div>
          </div>
        </div>
      </div>
    </>
  )
}