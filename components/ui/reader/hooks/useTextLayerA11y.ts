"use client";

import { useEffect, type RefObject } from "react";

/**
 * Sanitise pdf.js's text-layer ARIA.
 *
 * pdf.js links every text-layer span to a structure-tree element via
 * aria-owns, but react-pdf never renders the structure tree, so each reference
 * dangles (axe: aria-valid-attr-value, critical). It also emits hyphenation
 * markers as <span aria-label="-"> with no role — aria-label is prohibited on
 * a generic span (axe: aria-prohibited-attr, serious). Removing both restores
 * natural DOM reading order. Scanned/converted PDFs often carry malformed
 * table tagging (rows and columnheaders without the required ancestry —
 * axe: aria-required-children/parent, critical); a broken table announcement
 * is worse for AT than the text layer's natural reading order, so those
 * trees are hidden.
 */
export function useTextLayerA11y(docAreaRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = docAreaRef.current;
    if (!root) return;
    // querySelectorAll never matches the scope itself, and a mutated node can
    // be the offending element — so the scope is checked as well.
    const matching = (scope: ParentNode, selector: string): Element[] => {
      const list = Array.from(scope.querySelectorAll(selector));
      if (scope instanceof Element && scope.matches(selector)) list.unshift(scope);
      return list;
    };
    const strip = (scope: ParentNode) => {
      matching(scope, "[aria-owns]").forEach((el) => {
        const ids = el.getAttribute("aria-owns")?.split(/\s+/).filter(Boolean) ?? [];
        if (!ids.length || ids.some((id) => !document.getElementById(id))) {
          el.removeAttribute("aria-owns");
        }
      });
      matching(scope, "span[aria-label]:not([role])").forEach((el) => {
        if (el.closest(".textLayer, .react-pdf__Page__structTree")) {
          el.removeAttribute("aria-label");
        }
      });
      // Anchored on root: the tree element itself can be the mutated node,
      // and querySelectorAll never matches the scope element itself.
      root.querySelectorAll(".react-pdf__Page__structTree").forEach((tree) => {
        if (
          tree.querySelector(
            '[role="table"], [role="row"], [role="rowgroup"], [role="columnheader"], [role="rowheader"], [role="cell"], [role="gridcell"]',
          )
        ) {
          tree.setAttribute("aria-hidden", "true");
        }
      });
    };
    strip(root);
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "attributes" && m.target instanceof Element) {
          strip(m.target.parentNode ?? root);
          continue;
        }
        for (const node of m.addedNodes) {
          if (node instanceof Element) strip(node);
        }
      }
    });
    mo.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-owns", "aria-label"],
    });
    return () => mo.disconnect();
  }, [docAreaRef]);
}
