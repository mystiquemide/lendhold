"use client";

import { useEffect } from "react";

/**
 * Scrolls to a landing section when it is opened by its own path, like /how-it-works.
 * Some sections stream in, so it retries briefly until the section exists.
 */
export function ScrollToSection({ id }: { id: string }) {
  useEffect(() => {
    let tries = 0;
    const timer = setInterval(() => {
      const el = document.getElementById(id);
      if (el || ++tries > 40) clearInterval(timer);
      el?.scrollIntoView({ block: "start" });
    }, 50);
    return () => clearInterval(timer);
  }, [id]);
  return null;
}
