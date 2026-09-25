import { CheckCircle2, ChevronRight, CircleAlert, LoaderCircle, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLauncherData } from '../../hooks/useLauncherDataHook'
import { instanceStatus } from '../../utils/instanceStatus'
import { formatInstanceHeading } from '../../utils/instanceDisplay'
import * as tauri from '../../utils/tauri'
import InstanceIcon from '../ui/InstanceIcon'
import Button from '../ui/Button'
import { GlowingEffect, TextMorph } from '../motion'

export default function InstanceContextBar() {
  const { activeInstance, instances, activeInstanceId, selectInstance, busy, processRunning } = useLauncherData()
  if (!activeInstance) {
    return <div className="instance-context instance-context--empty"><span>No Minecraft instance selected</span><Link className="btn btn-aqua btn-sm" to="/instances">Create or select an instance <ChevronRight size={13} /></Link></div>
  }

  const status = processRunning ? 'Running' : instanceStatus(activeInstance)
  const statusClass = processRunning || status === 'Ready' ? 'ready' : status === 'Failed' || status === 'Not installed' ? 'attention' : 'muted'

  return <GlowingEffect active={status === 'Ready' || status === 'Running'} className="instance-context-glow"><section className="instance-context" aria-label="Selected Minecraft instance">
    <div className="instance-context__identity"><InstanceIcon instance={activeInstance} size={28} /><div><span className="instance-context__eyebrow">Selected instance</span><strong>{formatInstanceHeading(activeInstance)}</strong><small>{activeInstance.mc_version} · {activeInstance.loader || 'Vanilla'}</small></div></div>
    <label className="instance-context__select"><span>Instance</span><select value={activeInstanceId ?? activeInstance.id} onChange={(event) => void selectInstance(event.target.value)} aria-label="Selected instance">{instances.map((instance) => <option key={instance.id} value={instance.id}>{formatInstanceHeading(instance)}</option>)}</select></label>
    <span className={`instance-context__status ${statusClass}`}>{status === 'Running' || status === 'Ready' ? <CheckCircle2 size={14} /> : status === 'Failed' || status === 'Not installed' ? <CircleAlert size={14} /> : <LoaderCircle size={14} />} <TextMorph>{status}</TextMorph></span>
    <div className="instance-context__actions"><Link className="btn btn-ghost btn-sm" to="/instances">Instance properties</Link><Button variant="aqua" size="sm" disabled={Boolean(busy) || processRunning} onClick={() => void tauri.launchInstance(activeInstance)}><Play size={13} /> Launch</Button></div>
  </section></GlowingEffect>
}
