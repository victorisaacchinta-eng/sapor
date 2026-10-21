"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

/**
 * Smooth, inertial scrolling for the whole page. Skipped entirely when the
 * visitor has asked for reduced motion. In-page links (#table, #how) and
 * programmatic scrolls go through Lenis so they glide too.
 */
export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95, anchors: { offset: -72 } });
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // scrollIntoView() calls from the app should glide as well
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
      if (typeof arg === "object" && arg?.behavior === "smooth") {
        lenis.scrollTo(this as HTMLElement, { offset: -72, duration: 1.1 });
        return;
      }
      return original.call(this, arg);
    };

    document.documentElement.classList.add("lenis-on");
    return () => {
      cancelAnimationFrame(raf);
      Element.prototype.scrollIntoView = original;
      document.documentElement.classList.remove("lenis-on");
      lenis.destroy();
    };
  }, []);
  return null;
}
