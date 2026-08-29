import React, { useEffect, useRef } from "react";
import { colors, button } from "../lib/tokens";

// In-person signing: staff hands their phone/tablet to the renter, who draws
// their signature with a finger or stylus. Backing canvas resolution is scaled
// by devicePixelRatio so it isn't blurry on high-density mobile screens.
export default function SignaturePad({ onChange, height = 160 }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);
  const lastPoint = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#23302f";
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  function getPoint(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    drawing.current = true;
    lastPoint.current = getPoint(e);
  }
  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const point = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
    hasDrawn.current = true;
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(hasDrawn.current ? canvasRef.current.toDataURL("image/png") : null);
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height, border: `1px solid ${colors.border}`, borderRadius: 8, touchAction: "none", background: "#fff", cursor: "crosshair" }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <div style={{ fontSize: 11, color: colors.textTertiary }}>Sign above with your finger or a stylus</div>
        <button type="button" style={{ ...button.ghost, padding: "4px 10px", fontSize: 12 }} onClick={clear}>Clear</button>
      </div>
    </div>
  );
}
