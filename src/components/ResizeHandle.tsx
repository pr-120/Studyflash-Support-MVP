"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ResizeHandleProps {
  /** Direction of resize: "horizontal" drags left/right, "vertical" drags up/down */
  direction?: "horizontal" | "vertical";
  /** Called continuously during drag with the delta in pixels */
  onResize: (delta: number) => void;
  /** Additional class name */
  className?: string;
}

export function ResizeHandle({
  direction = "horizontal",
  onResize,
  className,
}: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      startPos.current =
        direction === "horizontal" ? e.clientX : e.clientY;
    },
    [direction]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos =
        direction === "horizontal" ? e.clientX : e.clientY;
      const delta = currentPos - startPos.current;
      startPos.current = currentPos;
      onResize(delta);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    // Prevent text selection during drag
    document.body.style.userSelect = "none";
    document.body.style.cursor =
      direction === "horizontal" ? "col-resize" : "row-resize";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDragging, direction, onResize]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={cn(
        "flex-shrink-0 transition-colors",
        direction === "horizontal"
          ? "w-1 cursor-col-resize hover:bg-blue-400/50"
          : "h-1 cursor-row-resize hover:bg-blue-400/50",
        isDragging && "bg-blue-500/60",
        !isDragging && "bg-transparent",
        className
      )}
    />
  );
}
