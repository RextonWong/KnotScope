"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Analysis6, Knot } from "@/lib/schema";
import type { PlankDimensions, SurfaceId } from "@/lib/plank";
import { getSurfaceSize } from "@/lib/plank";
import { bboxCenter } from "@/lib/bbox";

const MM_TO_WORLD = 0.01;

interface ResultPlank3DProps {
  analysis: Analysis6;
  dimensions: PlankDimensions;
  surfaceImages: Record<SurfaceId, string>;
  selectedKnot: { surface: SurfaceId; id: number } | null;
}

interface FaceMeta {
  id: SurfaceId;
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
  // Convert bbox center (u,v in 0..1) to a world-space 3D point on this face
  worldFromUv: (u: number, v: number) => THREE.Vector3;
}

function buildFaces(dims: PlankDimensions): Record<SurfaceId, FaceMeta> {
  const L = dims.length_mm * MM_TO_WORLD;
  const W = dims.width_mm * MM_TO_WORLD;
  const T = dims.thickness_mm * MM_TO_WORLD;
  const halfL = L / 2, halfW = W / 2, halfT = T / 2;

  const make = (
    id: SurfaceId,
    pos: [number, number, number],
    rot: [number, number, number],
    w: number,
    h: number,
    worldFromUv: (u: number, v: number) => THREE.Vector3
  ): FaceMeta => ({ id, position: pos, rotation: rot, width: w, height: h, worldFromUv });

  return {
    front: make(
      "front", [0, 0, halfT], [0, 0, 0], L, W,
      (u, v) => new THREE.Vector3((u - 0.5) * L, (0.5 - v) * W, halfT)
    ),
    back: make(
      "back", [0, 0, -halfT], [0, Math.PI, 0], L, W,
      // Mirror u for the back face — the plane is rotated 180° around Y,
      // so a point at local +x is at world -x; the through-knot mirror is
      // captured naturally by Gemini, we just project onto the back plane.
      (u, v) => new THREE.Vector3(-(u - 0.5) * L, (0.5 - v) * W, -halfT)
    ),
    top: make(
      "top", [0, halfW, 0], [-Math.PI / 2, 0, 0], L, T,
      (u, v) => new THREE.Vector3((u - 0.5) * L, halfW, -(0.5 - v) * T)
    ),
    bottom: make(
      "bottom", [0, -halfW, 0], [Math.PI / 2, 0, 0], L, T,
      (u, v) => new THREE.Vector3((u - 0.5) * L, -halfW, (0.5 - v) * T)
    ),
    left: make(
      "left", [-halfL, 0, 0], [0, -Math.PI / 2, 0], W, T,
      (u, v) => new THREE.Vector3(-halfL, (0.5 - v) * T, -(u - 0.5) * W)
    ),
    right: make(
      "right", [halfL, 0, 0], [0, Math.PI / 2, 0], W, T,
      (u, v) => new THREE.Vector3(halfL, (0.5 - v) * T, (u - 0.5) * W)
    ),
  };
}

// ── Texture-from-image hook ──────────────────────────────────────────────────

function useBase64Texture(base64: string | undefined): THREE.Texture | null {
  return useMemo(() => {
    if (!base64) return null;
    const img = new Image();
    img.src = `data:image/jpeg;base64,${base64}`;
    const tex = new THREE.Texture(img);
    img.onload = () => {
      tex.needsUpdate = true;
    };
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [base64]);
}

function FaceTexturedPlane({ face, image }: { face: FaceMeta; image: string }) {
  const tex = useBase64Texture(image);
  return (
    <mesh position={face.position} rotation={face.rotation as [number, number, number]}>
      <planeGeometry args={[face.width, face.height]} />
      {tex ? (
        <meshBasicMaterial map={tex} toneMapped={false} />
      ) : (
        <meshBasicMaterial color="#a07043" />
      )}
    </mesh>
  );
}

function KnotMarker3D({
  position,
  color,
  selected,
}: {
  position: THREE.Vector3;
  color: string;
  selected: boolean;
}) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[selected ? 0.12 : 0.07, 16, 16]} />
      <meshBasicMaterial color={selected ? "#f59e0b" : color} />
    </mesh>
  );
}

function PairLine3D({
  a,
  b,
  selected,
}: {
  a: THREE.Vector3;
  b: THREE.Vector3;
  selected: boolean;
}) {
  const geometry = useMemo(() => {
    const points = [a, b];
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [a, b]);
  return (
    <line>
      <primitive attach="geometry" object={geometry} />
      <lineBasicMaterial
        color={selected ? "#f59e0b" : "#d97706"}
        linewidth={1}
        transparent
        opacity={selected ? 1 : 0.7}
      />
    </line>
  );
}

function FitCamera({ dimensions }: { dimensions: PlankDimensions }) {
  const { camera } = useThree();
  const prevDimsRef = useRef<PlankDimensions | null>(null);
  useEffect(() => {
    const prev = prevDimsRef.current;
    const changed =
      !prev ||
      prev.length_mm !== dimensions.length_mm ||
      prev.width_mm !== dimensions.width_mm ||
      prev.thickness_mm !== dimensions.thickness_mm;
    if (!changed) return;
    prevDimsRef.current = dimensions;

    const L = dimensions.length_mm * MM_TO_WORLD;
    const W = dimensions.width_mm * MM_TO_WORLD;
    const T = dimensions.thickness_mm * MM_TO_WORLD;
    const radius = Math.sqrt(L * L + W * W + T * T) / 2;
    const fov = (camera as THREE.PerspectiveCamera).fov;
    const dist = (radius / Math.sin((fov * Math.PI) / 360)) * 1.45;
    camera.position.set(dist * 0.55, dist * 0.5, dist * 0.7);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [dimensions, camera]);
  return null;
}

export function ResultPlank3D({ analysis, dimensions, surfaceImages, selectedKnot }: ResultPlank3DProps) {
  const faces = useMemo(() => buildFaces(dimensions), [dimensions]);

  // Resolve knot positions in 3D for both markers and pair lines
  const knotPositions = useMemo(() => {
    const out: Record<string, THREE.Vector3> = {};
    (Object.keys(faces) as SurfaceId[]).forEach((s) => {
      const face = faces[s];
      for (const k of analysis.surfaces[s]) {
        const size = getSurfaceSize(s, dimensions);
        const c = bboxCenter(k.bbox, size.width_mm, size.height_mm);
        const u = c.x / size.width_mm;
        const v = c.y / size.height_mm;
        out[`${s}:${k.id}`] = face.worldFromUv(u, v);
      }
    });
    return out;
  }, [analysis, faces, dimensions]);

  const knotColorFor = (k: Knot) => {
    if (k.type === "knot_hole") return "#ef4444";
    if (k.type === "dead") return "#f97316";
    return "#10b981";
  };

  return (
    <div className="w-full h-full bg-neutral-950">
      <Canvas
        camera={{ position: [6, 4, 8], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#0a0a0a"]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[10, 10, 6]} intensity={0.5} />

        <Suspense fallback={null}>
          {/* Textured faces */}
          {(Object.keys(faces) as SurfaceId[]).map((s) => (
            <FaceTexturedPlane key={s} face={faces[s]} image={surfaceImages[s]} />
          ))}

          {/* Knot markers, slightly offset outward from each face */}
          {(Object.keys(faces) as SurfaceId[]).flatMap((s) =>
            analysis.surfaces[s].map((k) => {
              const pos = knotPositions[`${s}:${k.id}`];
              if (!pos) return null;
              const selected =
                selectedKnot?.surface === s && selectedKnot.id === k.id;
              return (
                <KnotMarker3D
                  key={`${s}-${k.id}`}
                  position={pos}
                  color={knotColorFor(k)}
                  selected={selected}
                />
              );
            })
          )}

          {/* Through-knot pair lines passing through the volume */}
          {analysis.pairs.map((p, i) => {
            const a = knotPositions[`${p.a.surface}:${p.a.id}`];
            const b = knotPositions[`${p.b.surface}:${p.b.id}`];
            if (!a || !b) return null;
            const sel =
              (selectedKnot?.surface === p.a.surface && selectedKnot.id === p.a.id) ||
              (selectedKnot?.surface === p.b.surface && selectedKnot.id === p.b.id);
            return <PairLine3D key={i} a={a} b={b} selected={sel} />;
          })}

          <FitCamera dimensions={dimensions} />
        </Suspense>

        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.7}
          enablePan={false}
          minDistance={2}
          maxDistance={30}
        />
      </Canvas>
    </div>
  );
}
