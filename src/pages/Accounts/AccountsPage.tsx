import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, LoaderCircle, LogIn, LogOut, UserRound } from 'lucide-react'
import Button from '../../components/ui/Button'
import { useToast } from '../../hooks/useToast'
import { getAccount, getAccountTextures, microsoftLogin, microsoftLogout, type MsaAccount } from '../../utils/tauri'
import { renderSkinHead } from '../../utils/skinHead'
import { useTranslation } from '../../useTranslation'

type AccountInfo = Pick<MsaAccount, 'username' | 'uuid'>

export default function AccountsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skinUrl, setSkinUrl] = useState<string | null>(null)
  const [skinHead, setSkinHead] = useState<string | null>(null)

  const loadAccount = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const raw = await getAccount()
      const username = raw?.username || ''
      setAccount(raw && username.trim() ? { username: username.trim(), uuid: raw.uuid } : null)
      const texture = raw ? (await getAccountTextures().catch(() => null))?.skin_data_url ?? null : null
      setSkinUrl(texture)
      setSkinHead(texture ? await renderSkinHead(texture, 64) : null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load account.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => { void loadAccount() }, 0)
    return () => window.clearTimeout(id)
  }, [loadAccount])

  const signIn = async () => {
    setBusy(true)
    try {
      const result = await microsoftLogin()
      if (result) {
        toast.pushToast(t('account.connectSuccess'), 'success')
        await loadAccount()
      } else {
        toast.pushToast('Microsoft login requires the desktop app.', 'info')
      }
    } catch (e) {
      toast.pushToast(e instanceof Error ? e.message : 'Login failed.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    setBusy(true)
    try {
      await microsoftLogout()
      setAccount(null)
      toast.pushToast(t('account.signOut'), 'info')
    } catch (e) {
      toast.pushToast(e instanceof Error ? e.message : 'Sign out failed.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <h1 className="page-title">{t('account.title')}</h1>
      </div>

      {error ? (
        <div className="state-banner state-banner--error" role="alert">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void loadAccount()}>{t('common.retry')}</Button>
        </div>
      ) : null}

      {loading ? (
        <div className="account-card">
          <div className="account-card__icon">
            <LoaderCircle size={20} className="spin" />
          </div>
          <div className="account-card__body">
            <span className="account-card__label">{t('account.loading')}</span>
          </div>
        </div>
      ) : (
        <div className="account-card">
          <div className={`account-card__icon ${skinUrl ? 'has-skin' : ''}`}>
            {skinHead ? <img className="account-card__skin" src={skinHead} alt="" /> : <UserRound size={20} />}
          </div>
          <div className="account-card__body">
            <span className="account-card__label">{t('account.microsoft')}</span>
            <strong className="account-card__name">
              {account?.username ?? t('account.notSignedIn')}
            </strong>
            <p className="account-card__hint">
              {account
                ? t('account.authenticated')
                : t('account.signInHint')}
            </p>
          </div>
          {account ? <CheckCircle2 className="account-card__check" size={18} /> : null}
        </div>
      )}

      {!loading && !error ? (
        <div className="account-actions">
          {account ? (
            <>
              <Button variant="ghost" disabled={busy} onClick={() => void signIn()}>
                <LogIn size={15} />
                {t('account.switch')}
              </Button>
              <Button variant="danger" disabled={busy} onClick={() => void signOut()}>
                {busy ? <LoaderCircle size={15} className="spin" /> : <LogOut size={15} />}
                {t('account.signOut')}
              </Button>
            </>
          ) : (
            <Button variant="aqua" disabled={busy} onClick={() => void signIn()}>
              {busy ? <LoaderCircle size={15} className="spin" /> : <LogIn size={15} />}
              {busy ? 'Signing in...' : t('account.signIn')}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  )
}
