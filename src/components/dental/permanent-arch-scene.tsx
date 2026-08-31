"use client";

import { Canvas } from "@react-three/fiber";
import { Edges, OrbitControls } from "@react-three/drei";
import { useMemo, useState } from "react";
import type { ColorRepresentation } from "three";

import { permanentArchPlacements } from "@/lib/dental/permanent-arch";
import type { ToothStatus } from "@/lib/dental/tooth-status";

export function PermanentArchScene({
  status,
  focused,
  onFocus,
}: {
  status?: ReadonlyMap<number, ToothStatus>;
  focused: number | null;
  onFocus: (fdi: number) => void;
}) {
  const placements = useMemo(() => permanentArchPlacements(), []);

  return (
    <Canvas
      aria-hidden="true"
      orthographic
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 10], zoom: 72, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      onPointerMissed={() => onFocus(0)}
    >
      <color attach="background" args={["#f7faf9"]} />
      <ambientLight intensity={1.8} />
      <directionalLight position={[-4, 5, 8]} intensity={2.2} />
      <directionalLight position={[5, -2, 5]} intensity={0.8} />

      <group rotation={[-0.12, 0, 0]}>
        {placements.map((placement) => (
          <ProceduralTooth
            key={placement.fdi}
            {...placement}
            status={status?.get(placement.fdi)}
            focused={focused === placement.fdi}
            onFocus={onFocus}
          />
        ))}
      </group>

      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={false}
        minAzimuthAngle={-0.72}
        maxAzimuthAngle={0.72}
        minPolarAngle={Math.PI / 2 - 0.45}
        maxPolarAngle={Math.PI / 2 + 0.45}
      />
    </Canvas>
  );
}

function ProceduralTooth({
  fdi,
  position,
  rotation,
  crownScale,
  toothClass,
  status,
  focused,
  onFocus,
}: ReturnType<typeof permanentArchPlacements>[number] & {
  status?: ToothStatus;
  focused: boolean;
  onFocus: (fdi: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const visual = toothVisual(status);
  const roots = toothClass === "molar" ? [-0.18, 0.18] : [0];
  const rootDirection = fdi < 30 ? 1 : -1;

  return (
    <group
      position={position}
      rotation={rotation}
      scale={focused ? 1.12 : hovered ? 1.06 : 1}
      onClick={(event) => {
        event.stopPropagation();
        onFocus(fdi);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "default";
      }}
    >
      {status?.missing && !status.implant ? (
        <mesh scale={crownScale}>
          <sphereGeometry args={[0.52, 12, 8]} />
          <meshBasicMaterial color="#9ca3af" wireframe transparent opacity={0.42} />
          {focused && <Edges color="#176c62" lineWidth={2} />}
        </mesh>
      ) : (
        <>
          <mesh scale={crownScale}>
            <sphereGeometry args={[0.62, 16, 12]} />
            <meshStandardMaterial
              color={visual.colour}
              roughness={visual.metallic ? 0.32 : 0.7}
              metalness={visual.metallic ? 0.78 : 0.02}
            />
            {(focused || hovered) && <Edges color={focused ? "#176c62" : "#5d7c76"} lineWidth={focused ? 2.4 : 1.2} />}
          </mesh>
          {roots.map((offset) => (
            <mesh key={offset} position={[offset, rootDirection * 0.39, -0.05]} scale={[0.16, 0.43, 0.16]}>
              <coneGeometry args={[0.5, 1.25, 9]} />
              <meshStandardMaterial color={visual.rootColour} roughness={0.82} metalness={visual.metallic ? 0.6 : 0} />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}

function toothVisual(status?: ToothStatus): { colour: ColorRepresentation; rootColour: ColorRepresentation; metallic: boolean } {
  if (status?.activeFindings.length) return { colour: "#e9a46f", rootColour: "#c97c48", metallic: false };
  if (status?.implant) return { colour: "#a8b1b5", rootColour: "#748087", metallic: true };
  if (status?.crowned) return { colour: "#87b9d8", rootColour: "#d7c5a4", metallic: false };
  if (status?.rootTreated) return { colour: "#edc47b", rootColour: "#c99945", metallic: false };
  if (status && status.restoredSurfaces.length > 0) return { colour: "#8fc9bd", rootColour: "#d7c5a4", metallic: false };
  if (status?.sealed) return { colour: "#b8d2ee", rootColour: "#d7c5a4", metallic: false };
  return { colour: "#f0e4cc", rootColour: "#d7c5a4", metallic: false };
}
