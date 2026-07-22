"use client";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
// Marks the document when Kairos runs inside the Capacitor shell so native-only
// chrome stays out of the browser build, which keeps its default web behavior.
export function NativeShell() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const root = document.documentElement;
    root.dataset.native = Capacitor.getPlatform();
    return () => {
      delete root.dataset.native;
    };
  }, []);
  return null;
}
