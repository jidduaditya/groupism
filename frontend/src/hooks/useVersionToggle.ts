import { useState } from 'react';

type Version = 'v1' | 'v2';

const STORAGE_KEY = 'groupism:version';

export function useVersionToggle(): [Version, () => void] {
  const [version, setVersion] = useState<Version>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'v2' ? 'v2' : 'v1';
  });

  const toggle = () => {
    const next: Version = version === 'v1' ? 'v2' : 'v1';
    localStorage.setItem(STORAGE_KEY, next);
    setVersion(next);
  };

  return [version, toggle];
}
