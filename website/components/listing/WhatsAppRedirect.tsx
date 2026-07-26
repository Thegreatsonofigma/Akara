"use client";

import { useEffect } from "react";

export function WhatsAppRedirect({ url }: { url: string }) {
  useEffect(() => {
    if (!url) return;
    window.location.replace(url);
  }, [url]);

  return null;
}
