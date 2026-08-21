import { useEffect, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Sparkles,
  DownloadCloud,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  X,
  ArrowRight,
} from 'lucide-react'
import Button from '../ui/Button'
import ProgressBar from '../ui/ProgressBar'
import {
  checkForUpdate,
  installUpdate,
  restartApp,
  listen,
  type UpdateInfo,
  type UpdateProgressPayload,
} from '../../utils/tauri'

type UpdateStatus =
  | 'idle'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'ready'
  | 'error'

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function UpdateModal() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [progressPercent, setProgressPercent] = useState<number>(0)
  const [downloadedBytes, setDownloadedBytes] = useState<number>(0)
  const [totalBytes, setTotalBytes] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Initial check and event listeners
  useEffect(() => {
    let unlistenAvailable: (() => void) | null = null
    let unlistenProgress: (() => void) | null = null
    let unlistenComplete: (() => void) | null = null
    let unlistenError: (() => void) | null = null

    const setupListeners = async () => {
      // Listen for background update detection
      const subAvail = await listen<UpdateInfo>('updater-available', (info) => {
        setUpdateInfo(info)
        setStatus('available')
      })
      if (subAvail) unlistenAvailable = subAvail

      // Listen for download progress
      const subProg = await listen<UpdateProgressPayload>(
        'updater-download-progress',
        (payload) => {
          setStatus('downloading')
          setDownloadedBytes(payload.downloaded_bytes)
          if (payload.total_bytes) {
            setTotalBytes(payload.total_bytes)
          }
          if (typeof payload.percent === 'number') {
            setProgressPercent(payload.percent)
          }
        },
      )
      if (subProg) unlistenProgress = subProg

      // Listen for complete
      const subComp = await listen<void>('updater-download-complete', () => {
        setStatus('ready')
        setProgressPercent(100)
      })
      if (subComp) unlistenComplete = subComp

      // Listen for error
      const subErr = await listen<string>('updater-error', (err) => {
        setErrorMessage(err || 'Failed to download or install update')
        setStatus('error')
      })
      if (subErr) unlistenError = subErr

      // Trigger initial check
      try {
        const found = await checkForUpdate()
        if (found) {
          setUpdateInfo(found)
          setStatus('available')
        }
      } catch {
        // Silently ignore startup network hiccups
      }
    }

    setupListeners()

    return () => {
      if (unlistenAvailable) unlistenAvailable()
      if (unlistenProgress) unlistenProgress()
      if (unlistenComplete) unlistenComplete()
      if (unlistenError) unlistenError()
    }
  }, [])

  const handleStartUpdate = useCallback(async () => {
    setStatus('downloading')
    setProgressPercent(0)
    setDownloadedBytes(0)
    setTotalBytes(null)
    setErrorMessage(null)

    try {
      await installUpdate()
      setStatus('ready')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [])

  const handleRestart = useCallback(async () => {
    try {
      await restartApp()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [])

  if (status === 'idle') {
    return null
  }

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 100,
          maxWidth: 420,
          width: 'calc(100vw - 48px)',
        }}
      >
        <motion.div
          className="glass-strong"
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.96 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          style={{
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-primary)',
            boxShadow: 'var(--shadow-lg), 0 0 30px rgba(0, 200, 255, 0.15)',
            padding: 20,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {status === 'available' && (
                <div
                  style={{
                    padding: 8,
                    borderRadius: 10,
                    background: 'rgba(0, 200, 255, 0.12)',
                    color: 'var(--primary)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Sparkles size={18} />
                </div>
              )}
              {status === 'downloading' && (
                <div
                  style={{
                    padding: 8,
                    borderRadius: 10,
                    background: 'rgba(0, 200, 255, 0.12)',
                    color: 'var(--primary)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <DownloadCloud size={18} className="animate-pulse" />
                </div>
              )}
              {status === 'ready' && (
                <div
                  style={{
                    padding: 8,
                    borderRadius: 10,
                    background: 'rgba(34, 197, 94, 0.15)',
                    color: 'var(--success)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <CheckCircle2 size={18} />
                </div>
              )}
              {status === 'error' && (
                <div
                  style={{
                    padding: 8,
                    borderRadius: 10,
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: 'var(--danger)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <AlertTriangle size={18} />
                </div>
              )}

              <div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-strong)' }}>
                  {status === 'available' && 'Update Available'}
                  {status === 'downloading' && 'Downloading Update...'}
                  {status === 'ready' && 'Update Ready to Install'}
                  {status === 'error' && 'Update Failed'}
                </h4>
                <p className="small muted" style={{ margin: 0, marginTop: 2 }}>
                  {status === 'available' && `Aqua Client v${updateInfo?.version || ''}`}
                  {status === 'downloading' && 'Please wait while update downloads'}
                  {status === 'ready' && 'Restart required to complete update'}
                  {status === 'error' && 'An error occurred during update'}
                </p>
              </div>
            </div>

            {(status === 'available' || status === 'error') && (
              <button
                type="button"
                onClick={() => setStatus('idle')}
                aria-label="Dismiss"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Release Notes / Details */}
          {status === 'available' && updateInfo?.body && (
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.25)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                marginBottom: 14,
                maxHeight: 100,
                overflowY: 'auto',
                fontSize: 13,
                color: 'var(--text)',
                lineHeight: 1.4,
              }}
            >
              {updateInfo.body}
            </div>
          )}

          {/* Download Progress */}
          {status === 'downloading' && (
            <div style={{ marginBottom: 14 }}>
              <ProgressBar value={progressPercent} accent="primary" showValue={true} />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 6,
                  fontSize: 12,
                  color: 'var(--muted)',
                }}
              >
                <span>
                  {totalBytes
                    ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
                    : `${formatBytes(downloadedBytes)} downloaded`}
                </span>
                <span>{Math.round(progressPercent)}%</span>
              </div>
            </div>
          )}

          {/* Error Message */}
          {status === 'error' && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                marginBottom: 14,
                fontSize: 13,
                color: 'var(--danger)',
                wordBreak: 'break-word',
              }}
            >
              {errorMessage || 'Unknown updater error'}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {status === 'available' && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setStatus('idle')}>
                  Later
                </Button>
                <Button variant="primary" size="sm" onClick={handleStartUpdate}>
                  <span>Update Now</span>
                  <ArrowRight size={14} />
                </Button>
              </>
            )}

            {status === 'ready' && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setStatus('idle')}>
                  Later
                </Button>
                <Button variant="aqua" size="sm" onClick={handleRestart}>
                  <RotateCw size={14} />
                  <span>Restart Aqua</span>
                </Button>
              </>
            )}

            {status === 'error' && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setStatus('idle')}>
                  Dismiss
                </Button>
                <Button variant="primary" size="sm" onClick={handleStartUpdate}>
                  <RotateCw size={14} />
                  <span>Retry Update</span>
                </Button>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
