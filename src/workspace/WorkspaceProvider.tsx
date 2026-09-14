import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { hasStoredLocalData, loadData } from '../data'
import { entityCounts, mergeWithoutOverwrite, type EntityCounts } from '../migration'
import { createRepository } from '../repository'
import { getSupabase } from '../repository/supabase'
import { SessionExpiredError, type SaveStatus } from '../repository/types'
import type { AppData } from '../types'
import { useAuth } from '../auth/AuthProvider'

interface WorkspaceValue {
  data: AppData
  setData: React.Dispatch<React.SetStateAction<AppData>>
  commit: (next: AppData) => Promise<string | null>
  status: SaveStatus
  lastError: string | null
  kind: 'local' | 'remote'
  retry: () => void
  migration: { counts: EntityCounts, local: AppData } | null
  resolveMigration: (choice: 'upload' | 'keep' | 'cancel') => Promise<void>
  recordAudit: (event: 'data_export' | 'data_import') => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { remote, session, profile } = useAuth()
  const repo = useRef(createRepository(remote ? 'remote' : 'local'))
  const [data, setData] = useState<AppData>(loadData)
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [lastError, setLastError] = useState<string | null>(null)
  const [ready, setReady] = useState(!remote)
  const [migration, setMigration] = useState<WorkspaceValue['migration']>(null)
  const skipSave = useRef(true)

  useEffect(() => { repo.current = createRepository(remote ? 'remote' : 'local') }, [remote])

  useEffect(() => {
    if (!remote || !session || profile?.status !== 'active') return
    let cancelled = false
    skipSave.current = true
    void repo.current.load().then(async remoteData => {
      if (cancelled) return
      if (hasStoredLocalData()) {
        const local = loadData()
        const counts = entityCounts(local)
        if (counts.activities > 0 && remoteData.activities.length === 0) {
          setMigration({ counts, local })
        }
      }
      setData(remoteData)
      setReady(true)
      setStatus(navigator.onLine ? 'saved' : 'offline')
    }).catch(error => {
      setStatus(error instanceof SessionExpiredError ? 'expired' : 'failed')
      setReady(true)
    })
    return () => { cancelled = true }
  }, [remote, session?.userId, profile?.status])

  const persist = useCallback(async (next: AppData) => {
    if (!ready) return
    if (skipSave.current) { skipSave.current = false; return }
    if (remote && !navigator.onLine) { setStatus('offline'); return }
    setStatus('saving')
    try {
      await repo.current.save(next)
      setLastError(null)
      setStatus('saved')
    } catch (error) {
      setLastError(error instanceof Error ? error.message : 'Your changes could not be saved.')
      setStatus(error instanceof SessionExpiredError ? 'expired' : 'failed')
    }
  }, [remote, ready])

  const commit = async (next: AppData) => {
    if (remote && !navigator.onLine) {
      setStatus('offline')
      return 'You appear to be offline. Check your connection and try again.'
    }
    setStatus('saving')
    try {
      await repo.current.save(next)
      skipSave.current = true
      setData(next)
      setLastError(null)
      setStatus('saved')
      return null
    } catch (error) {
      const message = error instanceof SessionExpiredError
        ? 'Your session expired. Please sign in again.'
        : error instanceof Error ? error.message : 'Your hours could not be saved. Try again.'
      setLastError(message)
      setStatus(error instanceof SessionExpiredError ? 'expired' : 'failed')
      return message
    }
  }

  useEffect(() => { void persist(data) }, [data, persist])
  useEffect(() => {
    const online = () => setStatus(current => current === 'offline' ? 'saved' : current)
    const offline = () => setStatus('offline')
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline) }
  }, [])

  const resolveMigration = async (choice: 'upload' | 'keep' | 'cancel') => {
    if (!migration) return
    if (choice === 'upload') {
      const { merged } = mergeWithoutOverwrite(data, migration.local)
      skipSave.current = true
      setData(merged)
      await repo.current.save(merged)
      await recordAudit('data_import')
      setStatus('saved')
    }
    setMigration(null)
  }

  const recordAudit = async (event: 'data_export' | 'data_import') => {
    if (!remote || !session) return
    await getSupabase().from('audit_logs').insert({ actor_id: session.userId, event })
  }

  const retry = () => { void persist(data) }

  if (remote && !ready) return <div className="auth-screen"><div className="auth-card"><p>Loading your workspace…</p></div></div>

  return <WorkspaceContext.Provider value={{ data, setData, commit, status, lastError, kind: repo.current.kind, retry, migration, resolveMigration, recordAudit }}>{children}</WorkspaceContext.Provider>
}

export const useWorkspace = () => {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('WorkspaceProvider required')
  return value
}
