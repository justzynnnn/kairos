"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Group } from "three";
import { moriAnimationMap, type MoriState } from "@/config/mori-assets";

function MoriModel({
  modelPath,
  state,
  paused,
  onAnimationAvailability,
}: {
  modelPath: string;
  state: MoriState;
  paused: boolean;
  onAnimationAvailability: (available: boolean) => void;
}) {
  const group = useRef<Group>(null);
  const model = useGLTF(modelPath);
  const { actions } = useAnimations(model.animations, group);
  const clip = useMemo(
    () =>
      moriAnimationMap[state].find((name) => actions[name]) ??
      Object.keys(actions)[0],
    [actions, state],
  );

  useEffect(() => {
    const action = clip ? actions[clip] : undefined;
    onAnimationAvailability(Boolean(action) && !paused);
    if (!action || paused) return;
    action.reset().fadeIn(0.2).play();
    return () => {
      action.fadeOut(0.15);
      action.stop();
    };
  }, [actions, clip, onAnimationAvailability, paused]);

  return (
    <group ref={group} dispose={null} rotation={[0, 0.08, 0]}>
      <primitive object={model.scene} />
    </group>
  );
}

class SceneErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function MoriScene({
  state,
  modelPath,
  active,
  reducedMotion,
  onError,
}: {
  state: MoriState;
  modelPath: string;
  active: boolean;
  reducedMotion: boolean;
  onError: () => void;
}) {
  const paused = !active || reducedMotion;
  const [hasAnimation, setHasAnimation] = useState(false);
  const updateAnimationAvailability = useCallback(
    (available: boolean) => setHasAnimation(available),
    [],
  );

  return (
    <SceneErrorBoundary onError={onError}>
      <Canvas
        aria-hidden="true"
        camera={{ fov: 32, position: [0, 0.15, 5.5] }}
        dpr={[1, 1.5]}
        frameloop={paused || !hasAnimation ? "demand" : "always"}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        onCreated={({ gl }) => {
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        }}
        style={{ pointerEvents: "none" }}
      >
        <ambientLight intensity={1.45} />
        <directionalLight intensity={1.2} position={[2, 3, 4]} />
        <MoriModel
          modelPath={modelPath}
          state={state}
          paused={paused}
          onAnimationAvailability={updateAnimationAvailability}
        />
      </Canvas>
    </SceneErrorBoundary>
  );
}
