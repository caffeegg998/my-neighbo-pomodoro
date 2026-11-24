import { useCallback, useEffect, useRef, useState } from 'react';
import artwork from './drumArtwork.svg?raw';
import bigTomSample from './assets/drums/Big-Rack-Tom.mp3?url';
import crashSample from './assets/drums/Crash.mp3?url';
import floorTomSample from './assets/drums/Floor-Tom.mp3?url';
import closedHatSample from './assets/drums/Hi-Hat-Closed.mp3?url';
import openHatSample from './assets/drums/High-Hat-Open.mp3?url';
import kickSample from './assets/drums/Kick.mp3?url';
import smallTomSample from './assets/drums/Small-Rack-Tom.mp3?url';
import snareSample from './assets/drums/Snare.mp3?url';
import { strings } from './i18n';
import type { Language } from './types';

type DrumPart = 'crash' | 'leftTom' | 'rightTom' | 'floorTom' | 'kick' | 'snare' | 'hiHat';
type DrumSound = DrumPart | 'openHat';

const keyboard: Record<string, DrumPart> = {
  f: 'crash', t: 'leftTom', y: 'rightTom', g: 'floorTom', b: 'kick', h: 'snare', j: 'hiHat',
};
const keyLabels: Record<DrumPart, string> = {
  crash: 'Key-70', leftTom: 'Key-84', rightTom: 'Key-89',
  floorTom: 'Key-71', kick: 'Key-66', snare: 'Key-72', hiHat: 'Key-74',
};
const parts: DrumPart[] = ['crash', 'leftTom', 'rightTom', 'floorTom', 'kick', 'snare', 'hiHat'];
const samples: Record<DrumSound, string> = {
  crash: crashSample, leftTom: bigTomSample, rightTom: smallTomSample,
  floorTom: floorTomSample, kick: kickSample, snare: snareSample,
  hiHat: closedHatSample, openHat: openHatSample,
};

export function DrumScene({ mini = false, language = 'en' }: { mini?: boolean; language?: Language }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const audioRefs = useRef<Partial<Record<DrumSound, HTMLAudioElement>>>({});
  const hiHatCount = useRef(0);
  const [showKeys, setShowKeys] = useState(false);
  const t = strings(language);

  const strike = useCallback((part: DrumPart) => {
    const target = sceneRef.current?.querySelector<SVGGElement>(`[data-drum-part="${part}"]`);
    if (!target) return;
    target.classList.remove('drum-hit');
    void target.getBoundingClientRect();
    target.classList.add('drum-hit');

    let sound: DrumSound = part;
    if (part === 'hiHat') {
      hiHatCount.current = (hiHatCount.current + 1) % 8;
      const open = hiHatCount.current === 0;
      target.classList.toggle('drum-hat-open', open);
      if (open) sound = 'openHat';
    }

    const audio = audioRefs.current[sound];
    if (audio) {
      try {
        audio.currentTime = 0;
        const playback = audio.play();
        if (playback) void playback.catch(() => { /* Animation still works without audio. */ });
      } catch { /* Animation still works without audio. */ }
    }
  }, []);

  useEffect(() => {
    if (mini) return;
    const labels: Record<DrumPart, string> = {
      crash: `${t.drumCrash} (F)`, leftTom: `${t.drumLeftTom} (T)`,
      rightTom: `${t.drumRightTom} (Y)`, floorTom: `${t.drumFloorTom} (G)`,
      kick: `${t.drumKick} (B)`, snare: `${t.drumSnare} (H)`, hiHat: `${t.drumHiHat} (J)`,
    };
    for (const part of parts) {
      const group = sceneRef.current?.querySelector<SVGGElement>(`[data-drum-part="${part}"]`);
      group?.setAttribute('role', 'button');
      group?.setAttribute('tabindex', '0');
      group?.setAttribute('aria-label', labels[part]);
    }
  }, [mini, language, t]);

  useEffect(() => {
    if (mini) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const part = keyboard[event.key.toLowerCase()];
      if (!part) return;
      event.preventDefault();
      setShowKeys(true);
      const key = sceneRef.current?.querySelector<SVGGElement>(`#${keyLabels[part]}`);
      if (key) {
        key.classList.remove('drum-key-hit');
        void key.getBoundingClientRect();
        key.classList.add('drum-key-hit');
      }
      strike(part);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mini, strike]);

  return <div className={`drum-scene${mini ? ' drum-scene-mini' : ''}${showKeys ? ' drum-show-keys' : ''}`} ref={sceneRef} aria-hidden={mini ? true : undefined}
    onClick={mini ? undefined : (event) => {
      if (!(event.target instanceof Element)) return;
      const part = event.target.closest('[data-drum-part]')?.getAttribute('data-drum-part') as DrumPart | undefined;
      if (part) strike(part);
    }}
    onKeyDown={mini ? undefined : (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (!(event.target instanceof Element)) return;
      const part = event.target.closest('[data-drum-part]')?.getAttribute('data-drum-part') as DrumPart | undefined;
      if (part) { event.preventDefault(); strike(part); }
    }}>
    <div className="drum-art" dangerouslySetInnerHTML={{ __html: artwork }} />
    {!mini && Object.entries(samples).map(([sound, src]) => <audio key={sound} src={src} preload="auto" ref={(node) => {
      if (node) audioRefs.current[sound as DrumSound] = node;
      else delete audioRefs.current[sound as DrumSound];
    }} />)}
  </div>;
}
