import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import HTMLFlipBook from "react-pageflip";

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
  const bookRef = useRef<FlipBookRef>(null);
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
  );
}
