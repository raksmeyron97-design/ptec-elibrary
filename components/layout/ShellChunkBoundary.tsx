"use client";

// components/layout/ShellChunkBoundary.tsx
// Keeps a failed chunk from taking down the page around it.
//
// The phone shell loads its sheets and its search overlay at browser idle
// (components/layout/MobileBottomNav.tsx). On a flaky connection — a campus
// wifi that drops, a phone that walks out of range — that request can fail
// mid-flight, and an unhandled dynamic-import rejection travels up to the
// nearest error boundary, which is the PAGE's. The reader loses the page they
// were reading because a control they had not touched could not be fetched.
//
// So the shell's optional parts fail to nothing: the tab bar stays, every
// link in it still navigates, and the sheets return on the next load. There
// is deliberately no retry loop and no visible error — a reader who never
// opened the sheet has nothing to be told.

import { Component, type ReactNode } from "react";

export default class ShellChunkBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
