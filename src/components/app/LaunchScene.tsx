import { useEffect, useId, useRef } from "react";
import { hasLaunchedThisDocument } from "@/lib/launch-session";

/** One locally hosted video, shared across the mask, with a still-image fallback. */
export function LaunchScene({ onSettled }: { onSettled?: (() => void) | undefined }) {
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const id = `qs-service-mask-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    const element = stage.current;
    const player = video.current;
    if (!element || !player || element.closest("#qs-boot")) return;
    const launch = element.closest<HTMLElement>(".qs-launch-simple");
    if (!launch) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }
    ).connection;
    let generation = 0,
      disposed = false;
    let cleanup = () => {};
    let played = false;
    let lastDisabled: boolean | undefined;
    const stop = () => {
      cleanup();
      cleanup = () => {};
      player.pause();
      player.removeAttribute("src");
      player.load();
      launch.classList.remove("qs-motion-active");
    };
    const update = () => {
      const disabled = Boolean(
        media.matches ||
        connection?.saveData ||
        document.documentElement.dataset.qsNavigationMotion === "reduced",
      );
      // Navigation can publish "full" repeatedly while the loader is playing.
      // Ignore updates that do not actually change the effective motion setting.
      if (lastDisabled === disabled) return;
      lastDisabled = disabled;
      const current = ++generation;
      stop();
      if (disposed || played || hasLaunchedThisDocument() || disabled) {
        onSettled?.();
        return;
      }
      played = true;
      const start = performance.now();
      launch.classList.add("qs-motion-active");
      const onError = () => {
        player.pause();
        player.removeAttribute("src");
        player.load();
        onSettled?.();
      };
      const onEnded = () => onSettled?.();
      player.addEventListener("error", onError);
      player.addEventListener("ended", onEnded);
      player.defaultMuted = true;
      player.muted = true;
      player.defaultPlaybackRate = 0.8;
      player.src = "/loading/service-motion/service.mp4";
      player.load();
      player.playbackRate = 0.8;
      if (!document.hidden)
        void player.play().catch(() => {
          /* Poster stays visible if autoplay is blocked. */
          onSettled?.();
        });
      const visibility = () => {
        if (document.hidden) player.pause();
        else if (!player.ended && player.getAttribute("src"))
          void player.play().catch(() => onSettled?.());
      };
      document.addEventListener("visibilitychange", visibility);
      let releaseTimeline = () => {};
      cleanup = () => {
        document.removeEventListener("visibilitychange", visibility);
        player.removeEventListener("error", onError);
        player.removeEventListener("ended", onEnded);
        releaseTimeline();
      };
      void Promise.all([import("gsap"), import("gsap/SplitText")])
        .then(([{ gsap }, { SplitText }]) => {
          if (disposed || current !== generation) return;
          gsap.registerPlugin(SplitText);
          const title = launch.querySelector<HTMLElement>(".qs-service-title");
          const subheading = launch.querySelector<HTMLElement>(".qs-service-eyebrow");
          const brand = launch.querySelector<HTMLElement>(".qs-service-brand");
          if (!title || !subheading || !brand) return;
          const split = SplitText.create(title, { type: "words", mask: "words", aria: "auto" });
          const timeline = gsap
            .timeline({ paused: true })
            .fromTo(
              subheading,
              { y: 10, opacity: 0 },
              { y: 0, opacity: 1, duration: 0.55, ease: "power2.out" },
              0.5,
            )
            .fromTo(
              split.words,
              { yPercent: 110, opacity: 0 },
              { yPercent: 0, opacity: 1, duration: 0.95, stagger: 0.1, ease: "power3.out" },
              0.68,
            )
            .fromTo(
              brand,
              { y: 12, opacity: 0 },
              { y: 0, opacity: 1, duration: 0.65, ease: "power2.out" },
              1.1,
            );
          timeline
            .seek(Math.min((performance.now() - start) / 1000, timeline.duration()), true)
            .play();
          releaseTimeline = () => {
            timeline.kill();
            split.revert();
            gsap.set([subheading, brand], { clearProps: "all" });
          };
        })
        .catch(() => {
          /* Static text remains readable if animation cannot load. */
        });
    };
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-qs-navigation-motion"],
    });
    media.addEventListener("change", update);
    connection?.addEventListener?.("change", update);
    update();
    return () => {
      disposed = true;
      generation++;
      stop();
      observer.disconnect();
      media.removeEventListener("change", update);
      connection?.removeEventListener?.("change", update);
    };
  }, [onSettled]);

  return (
    <div ref={stage} className="qs-service-media" aria-hidden="true">
      <svg className="qs-service-mask-def" focusable="false">
        <defs>
          <clipPath id={id} clipPathUnits="objectBoundingBox">
            <rect x="-.17" y="-.2" width=".39" height=".63" rx=".07" />
            <rect x=".13" y=".28" width=".39" height=".72" rx=".07" />
            <rect x=".43" y="-.2" width=".39" height=".63" rx=".07" />
            <rect x=".73" y=".28" width=".39" height=".72" rx=".07" />
          </clipPath>
        </defs>
      </svg>
      <div className="qs-service-video-mask" style={{ clipPath: `url(#${id})` }}>
        <video
          ref={video}
          poster="/loading/service-motion/poster.webp"
          muted
          playsInline
          preload="none"
        />
      </div>
    </div>
  );
}
