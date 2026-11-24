import { useEffect, useRef, useState } from 'react';
import amplyArtwork from './amplyArtwork.svg?url';
import amplyArtworkDark from './amplyArtworkDark.svg?url';
import amplyGuitarArtwork from './amplyGuitarArtwork.svg?url';
import amplyGuitarArtworkDark from './amplyGuitarArtworkDark.svg?url';

// The six visible strings are drawn here so their middle points can move when strummed.
const strings = [
  [[1401.5, 629.3], [1084.1, 1192.6], [1023.7, 1299.8]],
  [[1408.9, 633.5], [1091.6, 1196.8], [1031.2, 1304]],
  [[1416.4, 637.7], [1099, 1201], [1038.6, 1308.2]],
  [[1423.8, 641.9], [1106.5, 1205.2], [1046.1, 1312.4]],
  [[1431.3, 646.1], [1113.9, 1209.4], [1053.5, 1316.6]],
  [[1438.7, 650.3], [1121.4, 1213.6], [1061, 1320.7]],
] as const;

export function AmplyScene({ mini = false }: { mini?: boolean }) {
  return <div className={`amply-scene${mini ? ' amply-scene-mini' : ''}`} aria-hidden="true">
    <img className="amply-art amply-art-light" src={amplyArtwork} alt="" draggable="false" />
    <img className="amply-art amply-art-dark" src={amplyArtworkDark} alt="" draggable="false" />
  </div>;
}

export function AmplyGuitar({ onStrum, label }: { onStrum?: () => void; label?: string }) {
  const [pluckOffset, setPluckOffset] = useState(0);
  const frameRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
  }, []);

  function strum() {
    onStrum?.();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    setPluckOffset(12);
    if (typeof window.requestAnimationFrame !== 'function') {
      timeoutRef.current = window.setTimeout(() => setPluckOffset(0), 650);
      return;
    }
    const startedAt = performance.now();
    const animate = (time: number) => {
      const elapsed = time - startedAt;
      if (elapsed >= 650) { setPluckOffset(0); frameRef.current = null; return; }
      setPluckOffset(12 * Math.exp(-elapsed / 190) * Math.cos(elapsed / 28));
      frameRef.current = window.requestAnimationFrame(animate);
    };
    frameRef.current = window.requestAnimationFrame(animate);
  }

  return <div className="amply-guitar-layer" aria-hidden={onStrum ? undefined : true}>
    <img className="amply-guitar-art amply-guitar-art-light" src={amplyGuitarArtwork} alt="" aria-hidden="true" draggable="false" />
    <img className="amply-guitar-art amply-guitar-art-dark" src={amplyGuitarArtworkDark} alt="" aria-hidden="true" draggable="false" />
    <svg className="amply-strings" viewBox="470 450 1200 1200" aria-hidden="true">
      <g transform="translate(85 0)">{strings.map(([start, middle, end], index) => <polyline key={index} className="amply-string" points={`${start[0]},${start[1]} ${middle[0] + pluckOffset * (1 + index * .06)},${middle[1]} ${end[0]},${end[1]}`} />)}</g>
    </svg>
    {onStrum && <button className="amply-guitar-hit" type="button" aria-label={label} title={label} onClick={strum} />}
  </div>;
}
