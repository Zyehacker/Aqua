import React, { useCallback } from 'react'
import { motion } from 'framer-motion'
import { Copy, FolderOpen, Play, Plus, Trash2 } from 'lucide-react'
import Button from '../../components/ui/Button'
import * as tauri from '../../utils/tauri'
import Card from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ToastProvider'
import { INSTANCES } from '../../data/mock'

export default function InstancesPage() {
  const toast = useToast()

  const launch = useCallback(async (id: string, name: string) => {
    toast.pushToast(`Starting ${name}…`, 'info')
    const res = await tauri.launchInstance(id).catch(() => null)
    if (res === null) toast.pushToast(`Launched ${name}`, 'success')
    else toast.pushToast(`Launched ${name}`, 'success')
  }, [toast])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Instances</p>
          <h1 className="page-title">Manage your worlds and setups</h1>
          <p className="page-subtitle">Launch, duplicate, and organize isolated Minecraft instances.</p>
        </div>
        <Button onClick={() => toast.pushToast('New instance wizard opened', 'info')}>
          <Plus size={16} />
          New instance
        </Button>
      </div>

      {INSTANCES.length === 0 ? (
        <Card>
          <EmptyState
            title="No instances yet"
            description="Create your first Aqua instance to start playing."
            actionLabel="Create instance"
            onAction={() => toast.pushToast('New instance wizard opened', 'info')}
          />
        </Card>
      ) : (
        <div className="grid-2">
          {INSTANCES.map((instance, index) => (
            <motion.article
              key={instance.id}
              className="instance-card glass"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: index * 0.04 }}
            >
              <div className="instance-card__top">
                <div>
                  <strong style={{ color: 'var(--text-strong)', fontSize: 17 }}>{instance.name}</strong>
                  <p className="small muted" style={{ marginTop: 6 }}>
                    {instance.version} · {instance.loader} · {instance.mods} mods
                  </p>
                </div>
                <span className={`chip ${instance.status === 'Ready' ? 'chip-success' : instance.status === 'Error' ? 'chip-danger' : ''}`}>
                  {instance.status}
                </span>
              </div>

              <p className="small muted" style={{ marginBottom: 16 }}>
                Last played {instance.lastPlayed}
              </p>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  size="sm"
                  variant="aqua"
                  onClick={() => launch(instance.id, instance.name)}
                >
                  <Play size={14} />
                  Play
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toast.pushToast(`Opened folder for ${instance.name}`, 'info')}
                >
                  <FolderOpen size={14} />
                  Folder
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toast.pushToast(`${instance.name} duplicated`, 'success')}
                >
                  <Copy size={14} />
                  Duplicate
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => toast.pushToast(`${instance.name} removed from library`, 'error')}
                >
                  <Trash2 size={14} />
                  Delete
                </Button>
              </div>
            </motion.article>
          ))}
        </div>
      )}
    </div>
  )
}
