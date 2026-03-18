import { useEffect, useState } from "react";

const navigationEvent = "monra:navigate";

export function navigateTo(pathname: string) {
  if (window.location.pathname === pathname) {
    return;
  }

  window.history.pushState({}, "", pathname);
  window.dispatchEvent(new Event(navigationEvent));
}

export function usePathname() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const syncPathname = () => {
      setPathname(window.location.pathname);
    };

    window.addEventListener("popstate", syncPathname);
    window.addEventListener(navigationEvent, syncPathname);

    return () => {
      window.removeEventListener("popstate", syncPathname);
      window.removeEventListener(navigationEvent, syncPathname);
    };
  }, []);

  return pathname;
}
