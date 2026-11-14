import { useEffect, useState } from 'react';
import type { GuideDogCoat } from './GuideDogIllustration';
import './LoadingScreen.css';

const DURATION_MS = 1800;

export function LoadingScreen({ onFinish }: {
  coat: GuideDogCoat;
  onFinish: () => void;
}) {
  const [fadingOut, setFadingOut] = useState(false);
  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadingOut(true), DURATION_MS - 300);
    const doneTimer = setTimeout(onFinish, DURATION_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onFinish]);

  return (
    <div className={`painted-loading${fadingOut ? ' is-leaving' : ''}`}>
      <div className="painted-loading__scene">
        <img className="painted-loading__art" src={`${import.meta.env.BASE_URL}loading-park.webp`} alt="" />
        <h1 className="painted-loading__title"><span>Tanzer</span><span>Training Tracker</span></h1>
        <div className="painted-loading__status" role="status">
          <div className="painted-loading__dots" aria-hidden="true"><span /><span /><span /></div>
          <p>Opening your training space</p>
        </div>
      </div>
    </div>
  );
}
