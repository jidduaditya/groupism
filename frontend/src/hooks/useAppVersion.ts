import { useState } from "react";

export type AppVersion = "v4" | "v5";

export function useAppVersion(): [AppVersion, (v: AppVersion) => void] {
  const [version, setVersionState] = useState<AppVersion>(
    () => (localStorage.getItem("groupism:appVersion") as AppVersion) || "v5"
  );

  const setVersion = (v: AppVersion) => {
    localStorage.setItem("groupism:appVersion", v);
    setVersionState(v);
  };

  return [version, setVersion];
}
