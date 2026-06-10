import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Renders its children into the page header's top-right actions slot, so each
// tab can place its own controls in the top-right corner by convention.
export default function PageActions({ children }) {
  const [el, setEl] = useState(null);
  useEffect(() => {
    setEl(document.getElementById("page-actions"));
  }, []);
  return el ? createPortal(children, el) : null;
}
