import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import HTMLFlipBook from "react-pageflip";

const PINCH_SCALE_MIN = 1;
const PINCH_SCALE_MAX = 4;

/** Two-finger pinch zoom + two-finger pan; stops events before page-flip’s window listeners. */
function useBrochurePinchZoom(wrapRef: RefObject<HTMLDivElement | null>) {
  const scaleRef = useRef(1);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const panRef = { x: 0, y: 0 };

    type Session = {
      startDist: number;
      startScale: number;
      lastMid: { x: number; y: number };
    };
    let session: Session | null = null;

    const pinchDistance = (e: TouchEvent): number => {
      if (e.touches.length < 2) return 0;
      const a = e.touches[0];
      const b = e.touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };

    const pinchMidpoint = (e: TouchEvent): { x: number; y: number } => {
      const a = e.touches[0];
      const b = e.touches[1];
      return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    };

    const clampPan = () => {
      const s = Math.max(1, scaleRef.current);
      const maxX = Math.max(120, window.innerWidth * 0.5 * s);
      const maxY = Math.max(120, window.innerHeight * 0.5 * s);
      panRef.x = Math.min(maxX, Math.max(-maxX, panRef.x));
      panRef.y = Math.min(maxY, Math.max(-maxY, panRef.y));
    };

    const applyTransform = () => {
      const s = Math.min(
        PINCH_SCALE_MAX,
        Math.max(PINCH_SCALE_MIN, scaleRef.current)
      );
      scaleRef.current = s;
      wrap.style.transform = `translate(${panRef.x}px, ${panRef.y}px) scale(${s})`;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        e.stopImmediatePropagation();
        const d = pinchDistance(e);
        if (d > 8) {
          session = {
            startDist: d,
            startScale: scaleRef.current,
            lastMid: pinchMidpoint(e),
          };
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length < 2) return;

      const d = pinchDistance(e);
      if (d <= 8) return;

      const mid = pinchMidpoint(e);

      if (session === null) {
        session = {
          startDist: d,
          startScale: scaleRef.current,
          lastMid: mid,
        };
      }

      e.preventDefault();
      e.stopImmediatePropagation();

      scaleRef.current = session.startScale * (d / session.startDist);
      panRef.x += mid.x - session.lastMid.x;
      panRef.y += mid.y - session.lastMid.y;
      session.lastMid = mid;

      clampPan();
      applyTransform();
    };

    const endPinch = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        session = null;
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      const factor = 1 - e.deltaY * 0.01;
      scaleRef.current *= factor;
      clampPan();
      applyTransform();
    };

    wrap.addEventListener("touchstart", onTouchStart, { capture: true });
    wrap.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    wrap.addEventListener("touchend", endPinch, { capture: true });
    wrap.addEventListener("touchcancel", endPinch, { capture: true });
    wrap.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      wrap.removeEventListener("touchstart", onTouchStart, { capture: true });
      wrap.removeEventListener("touchmove", onTouchMove, { capture: true });
      wrap.removeEventListener("touchend", endPinch, { capture: true });
      wrap.removeEventListener("touchcancel", endPinch, { capture: true });
      wrap.removeEventListener("wheel", onWheel);
      wrap.style.transform = "";
    };
  }, [wrapRef]);
}

const PAGE_SRC = [
  "/images/page01.jpg",
  "/images/page02.jpg",
  "/images/page03.jpg",
  "/images/page04.jpg",
  "/images/page05.jpg",
] as const;

/** Viewport width at or below this uses one page at a time (portrait book mode). */
const MOBILE_MAX_WIDTH_PX = 768;

type FlipCorner = "top" | "bottom";

type PageFlipApi = {
  flipNext: (corner?: FlipCorner) => void;
  flipPrev: (corner?: FlipCorner) => void;
  flip: (page: number, corner?: FlipCorner) => void;
  turnToPage: (page: number) => void;
  getCurrentPageIndex: () => number;
  getPageCount: () => number;
};

type FlipBookRef = {
  pageFlip: () => PageFlipApi | undefined;
};

const Page = forwardRef<HTMLDivElement, { src: string; index: number }>(
  ({ src, index }, ref) => (
    <div className="brochure-page" ref={ref}>
      <img
        src={src}
        alt=""
        loading={index === 0 ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
      />
    </div>
  )
);
Page.displayName = "Page";

function useIsMobileLayout() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

export default function BrochureFlip() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pinchWrapRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<FlipBookRef>(null);
  useBrochurePinchZoom(pinchWrapRef);
  const [dims, setDims] = useState({ width: 400, height: 560 });
  const [aspect, setAspect] = useState(3 / 4);
  const isMobile = useIsMobileLayout();

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setAspect(img.naturalWidth / img.naturalHeight);
      }
    };
    img.src = PAGE_SRC[0];
  }, []);

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const vv = window.visualViewport;
    const vh = vv?.height ?? window.innerHeight;
    const vw = vv?.width ?? window.innerWidth;

    const pad = 4;
    // Prefer flex layout box so the book fills the stage, not only raw viewport height.
    const stageW = el.clientWidth;
    const stageH = el.clientHeight;
    const availW = Math.max(0, Math.min(stageW, vw) - pad * 2);
    const availH = Math.max(0, (stageH > 80 ? stageH : vh) - pad * 2);

    let pageW: number;
    let h: number;

    if (isMobile) {
      // One page fills the width; portrait orientation in page-flip.
      pageW = Math.max(100, availW);
      h = pageW / aspect;
      if (h > availH) {
        h = Math.max(120, availH);
        pageW = h * aspect;
      }
    } else {
      // Open book = two leaves side by side (~½ width each so the block stays in landscape mode).
      pageW = Math.max(120, (availW * 0.99) / 2);
      h = pageW / aspect;
      if (h > availH) {
        h = Math.max(200, availH);
        pageW = h * aspect;
      }
    }

    pageW = Math.round(pageW);
    h = Math.round(h);

    setDims((d) =>
      d.width === pageW && d.height === h ? d : { width: pageW, height: h }
    );
  }, [aspect, isMobile]);

  useEffect(() => {
    const scheduleMeasure = () => {
      requestAnimationFrame(() => measure());
    };
    scheduleMeasure();
    const ro = new ResizeObserver(() => scheduleMeasure());
    const el = containerRef.current;
    if (el) ro.observe(el);

    const vv = window.visualViewport;
    vv?.addEventListener("resize", scheduleMeasure);
    vv?.addEventListener("scroll", scheduleMeasure);
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      ro.disconnect();
      vv?.removeEventListener("resize", scheduleMeasure);
      vv?.removeEventListener("scroll", scheduleMeasure);
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [measure]);

  /** Forward: peel from upper-right. */
  const flipNext = useCallback(() => {
    bookRef.current?.pageFlip()?.flipNext("top");
  }, []);

  /** Back: peel from lower-left so the page visibly turns backward. */
  const flipPrev = useCallback(() => {
    bookRef.current?.pageFlip()?.flipPrev("bottom");
  }, []);

  const goToFirst = useCallback(() => {
    const api = bookRef.current?.pageFlip();
    if (!api) return;
    api.flip(0, "bottom");
  }, []);

  const goToLast = useCallback(() => {
    const api = bookRef.current?.pageFlip();
    if (!api) return;
    const last = api.getPageCount() - 1;
    api.flip(last, "top");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        flipNext();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        flipPrev();
      } else if (e.key === "Home") {
        e.preventDefault();
        goToFirst();
      } else if (e.key === "End") {
        e.preventDefault();
        goToLast();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipNext, flipPrev, goToFirst, goToLast]);

  return (
    <div className="brochure-flip-root">
      <div className="brochure-flip-stage" ref={containerRef}>
        <div className="brochure-pinch-zoom" ref={pinchWrapRef}>
          <HTMLFlipBook
            key={isMobile ? "portrait" : "landscape"}
            ref={bookRef}
            className="brochure-flip-book"
            style={{
              width: "100%",
              height: "100%",
              minHeight: 0,
            }}
            width={dims.width}
            height={dims.height}
            size="fixed"
            minWidth={dims.width}
            maxWidth={dims.width}
            minHeight={dims.height}
            maxHeight={dims.height}
            drawShadow
            flippingTime={650}
            startPage={0}
            usePortrait={isMobile}
            startZIndex={0}
            autoSize={false}
            maxShadowOpacity={0.45}
            showCover={!isMobile}
            mobileScrollSupport
            clickEventForward
            useMouseEvents
            swipeDistance={36}
            showPageCorners
            disableFlipByClick={false}
          >
            {PAGE_SRC.map((src, i) => (
              <Page key={src} src={src} index={i} />
            ))}
          </HTMLFlipBook>
        </div>
      </div>
    </div>
  );
}
