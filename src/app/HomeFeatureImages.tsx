import { useMemo } from 'react';

const IMAGES = [
  '/images/ChatGPT Image Jan 11, 2026, 05_02_30 PM.png',
  '/images/ChatGPT Image Jan 11, 2026, 05_04_39 PM.png',
  '/images/ChatGPT Image Jan 11, 2026, 05_08_58 PM.png',
  '/images/ChatGPT Image Jan 11, 2026, 05_10_23 PM.png',
  '/images/ChatGPT Image Jan 11, 2026, 05_12_27 PM.png',
  '/images/ChatGPT Image Jan 11, 2026, 05_15_19 PM.png',
] as const;

export function HomeFeatureImages() {
  // Push each image further “away” (negative Z) so it recedes into the screen.
  const depth = useMemo(() => IMAGES.map((_, i) => -i * 260), []);

  return (
    <div className="homeFeatureStack" aria-hidden="true">
      {IMAGES.map((src, i) => (
        <img
          key={src}
          className="homeFeatureImg"
          src={src}
          alt=""
          draggable={false}
          style={{
            ['--hfs-x' as any]: `${i * 10}px`,
            ['--hfs-y' as any]: `${i * 10}px`,
            ['--hfs-z' as any]: `${depth[i]}px`,
            ['--hfs-delay' as any]: `${-i * 2.8}s`,
          }}
        />
      ))}
    </div>
  );
}
