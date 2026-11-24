import { useEffect, useRef, useState } from 'react';
import { ArrowClockwise, DownloadSimple } from '@phosphor-icons/react';
import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import packageInfo from '../package.json';
import { strings } from './i18n';
import type { Language } from './types';

type Status = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'installing' | 'error';

export function UpdatePanel({ language, native, timerActive }: { language: Language; native: boolean; timerActive: boolean }) {
  const t = strings(language);
  const [version, setVersion] = useState(packageInfo.version);
  const [status, setStatus] = useState<Status>('idle');
  const [available, setAvailable] = useState<Update | null>(null);
  const [errorText, setErrorText] = useState('');
  const [downloaded, setDownloaded] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const updateRef = useRef<Update | null>(null);
  const installingRef = useRef(false);
  const unmountedRef = useRef(false);

  useEffect(() => {
    if (!native) return;
    let alive = true;
    void getVersion().then((value) => { if (alive) setVersion(value); }).catch(() => {});
    return () => { alive = false; };
  }, [native]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (!installingRef.current) void updateRef.current?.close();
    };
  }, []);

  async function checkForUpdate() {
    if (!native || status === 'checking' || status === 'downloading' || status === 'installing') return;
    setStatus('checking');
    setErrorText('');
    try {
      await updateRef.current?.close();
      updateRef.current = null;
      setAvailable(null);
      const next = await check();
      if (unmountedRef.current) {
        await next?.close();
        return;
      }
      updateRef.current = next;
      setAvailable(next);
      setStatus(next ? 'available' : 'current');
    } catch (error) {
      console.warn('Update check failed:', error);
      setErrorText(t.updateCheckFailed);
      setStatus('error');
    }
  }

  async function installUpdate() {
    if (!available || timerActive || status !== 'available') return;
    setStatus('downloading');
    setErrorText('');
    setDownloaded(0);
    setTotal(null);
    installingRef.current = true;
    let received = 0;
    try {
      await available.downloadAndInstall((event) => {
        if (event.event === 'Started') setTotal(event.data.contentLength ?? null);
        if (event.event === 'Progress') {
          received += event.data.chunkLength;
          setDownloaded(received);
        }
      });
      setStatus('installing');
      if (!/Win/i.test(navigator.userAgent)) await relaunch();
    } catch (error) {
      console.warn('Update installation failed:', error);
      setErrorText(t.updateInstallFailed);
      setStatus('error');
    } finally {
      installingRef.current = false;
      if (unmountedRef.current) void updateRef.current?.close();
    }
  }

  const percent = total && total > 0 ? Math.min(100, Math.round(downloaded / total * 100)) : null;
  const busy = status === 'checking' || status === 'downloading' || status === 'installing';

  return <section className="panel settings-panel update-panel">
    <div className="settings-header"><span className="settings-icon"><ArrowClockwise size={21} /></span><div><h2>{t.updates}</h2><p>{t.updatesHint}</p></div></div>
    <div className="update-content">
      <div className="update-version"><span>{t.currentVersion}</span><strong>v{version}</strong></div>
      {!native && <p className="update-message">{t.updatesDesktopOnly}</p>}
      {native && status === 'current' && <p className="update-message" role="status">{t.upToDate}</p>}
      {native && status === 'checking' && <p className="update-message" role="status">{t.checkingUpdates}</p>}
      {native && status === 'error' && <p className="update-message update-error" role="alert">{errorText}</p>}
      {native && available && (status === 'available' || status === 'downloading' || status === 'installing') && <div className="update-available">
        <strong>{t.updateAvailable.replace('{version}', available.version)}</strong>
        {available.body && <p>{available.body}</p>}
        {status === 'downloading' && <div className="update-progress" role="status"><span>{t.downloadingUpdate}{percent === null ? '' : ` · ${percent}%`}</span><div className="update-progress-track"><span style={{ width: `${percent ?? 5}%` }} /></div></div>}
        {status === 'installing' && <p className="update-message" role="status">{t.installingUpdate}</p>}
        {timerActive && status === 'available' && <p className="update-message">{t.finishSessionBeforeUpdate}</p>}
      </div>}
      <div className="update-actions">
        <button className="control-button update-check-button" type="button" disabled={!native || busy} onClick={() => void checkForUpdate()}><ArrowClockwise size={16} />{t.checkForUpdates}</button>
        {native && available && status === 'available' && <button className="primary-button update-install-button" type="button" disabled={timerActive} onClick={() => void installUpdate()}><DownloadSimple size={16} />{t.installUpdate}</button>}
      </div>
    </div>
  </section>;
}
