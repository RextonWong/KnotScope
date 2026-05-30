"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Analysis6, Knot } from "@/lib/schema";
import type { PlankDimensions, SurfaceId } from "@/lib/plank";

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
  outNormal: THREE.Vector3;
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
    outNormal: THREE.Vector3,
    worldFromUv: (u: number, v: number) => THREE.Vector3
  ): FaceMeta => ({ id, position: pos, rotation: rot, width: w, height: h, outNormal, worldFromUv });

  return {
    front:  make("front",  [0,  0,  halfT], [0, 0,               0],         L, W, new THREE.Vector3( 0,  0,  1), (u, v) => new THREE.Vector3( (u-0.5)*L,  (0.5-v)*W,  halfT)),
    back:   make("back",   [0,  0, -halfT], [0, Math.PI,          0],         L, W, new THREE.Vector3( 0,  0, -1), (u, v) => new THREE.Vector3(-(u-0.5)*L,  (0.5-v)*W, -halfT)),
    top:    make("top",    [0,  halfW, 0],  [-Math.PI/2, 0,       0],         L, T, new THREE.Vector3( 0,  1,  0), (u, v) => new THREE.Vector3( (u-0.5)*L,  halfW,     -(0.5-v)*T)),
    bottom: make("bottom", [0, -halfW, 0],  [ Math.PI/2, 0,       0],         L, T, new THREE.Vector3( 0, -1,  0), (u, v) => new THREE.Vector3( (u-0.5)*L, -halfW,      (0.5-v)*T)),
    left:   make("left",  [-halfL, 0,  0],  [ Math.PI/2, -Math.PI/2, 0],      W, T, new THREE.Vector3(-1,  0,  0), (u, v) => new THREE.Vector3(-halfL,      (0.5-u)*W,  (0.5-v)*T)),
    right:  make("right", [ halfL, 0,  0],  [ Math.PI/2,  Math.PI/2, 0],      W, T, new THREE.Vector3( 1,  0,  0), (u, v) => new THREE.Vector3( halfL,      (u-0.5)*W,  (0.5-v)*T)),
  };
}

// ── Texture helper ───────────────────────────────────────────────────────────

function useBase64Texture(base64: string | undefined): THREE.Texture | null {
  return useMemo(() => {
    if (!base64) return null;
    const img = new Image();
    img.src = `data:image/jpeg;base64,${base64}`;
    const tex = new THREE.Texture(img);
    img.onload = () => { tex.needsUpdate = true; };
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [base64]);
}

function FaceTexturedPlane({ face, image }: { face: FaceMeta; image: string }) {
  const tex = useBase64Texture(image);
  return (
    <mesh position={face.position} rotation={face.rotation as [number, number, number]}>
      <planeGeometry args={[face.width, face.height]} />
      {tex
        ? <meshBasicMaterial map={tex} toneMapped={false} />
        : <meshBasicMaterial color="#a07043" />}
    </mesh>
  );
}

// ── Cylinder-edge primitive (WebGL linewidth=1 is ignored — use cylinders) ───

function CylEdge({
  a, b, radius, color, opacity = 1,
}: {
  a: THREE.Vector3; b: THREE.Vector3;
  radius: number; color: string; opacity?: number;
}) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  if (len < 1e-4) return null;
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.divideScalar(len)
  );
  return (
    <mesh position={[mid.x, mid.y, mid.z]} quaternion={quat}>
      <cylinderGeometry args={[radius, radius, len, 6, 1]} />
      <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

// ── Bounding-box outline on a surface face ───────────────────────────────────

interface KnotBboxData {
  center: THREE.Vector3;
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  color: string;
}

function KnotBbox3D({ data, selected }: { data: KnotBboxData; selected: boolean }) {
  const [c0, c1, c2, c3] = data.corners;
  const thickness = selected ? 0.024 : 0.013;
  const col = selected ? "#f59e0b" : data.color;
  const edgePairs: [THREE.Vector3, THREE.Vector3][] = [
    [c0, c1], [c1, c2], [c2, c3], [c3, c0],
  ];
  return (
    <>
      {edgePairs.map(([a, b], i) => (
        <CylEdge key={i} a={a} b={b} radius={thickness} color={col} />
      ))}
      <mesh position={[data.center.x, data.center.y, data.center.z]}>
        <sphereGeometry args={[selected ? 0.04 : 0.025, 8, 8]} />
        <meshBasicMaterial color={col} />
      </mesh>
    </>
  );
}

// ── Pair tube (connects two bbox centers through the plank volume) ────────────

function PairTube3D({
  a, b, selected, kind = "through",
}: {
  a: THREE.Vector3; b: THREE.Vector3;
  selected: boolean; kind?: "through" | "arris";
}) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  if (len < 1e-4) return null;
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.divideScalar(len)
  );
  const radius = selected ? 0.032 : 0.018;
  const color  = selected ? "#f59e0b" : kind === "arris" ? "#60a5fa" : "#f59e0b";
  const opacity = selected ? 1 : 0.85;
  return (
    <mesh position={[mid.x, mid.y, mid.z]} quaternion={quat} renderOrder={2}>
      <cylinderGeometry args={[radius, radius, len, 8, 1]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── Camera fit ───────────────────────────────────────────────────────────────

function FitCamera({ dimensions }: { dimensions: PlankDimensions }) {
  const { camera } = useThree();
  const prevRef = useRef<PlankDimensions | null>(null);
  useEffect(() => {
    const prev = prevRef.current;
    if (
      prev &&
      prev.length_mm === dimensions.length_mm &&
      prev.width_mm  === dimensions.width_mm &&
      prev.thickness_mm === dimensions.thickness_mm
    ) return;
    prevRef.current = dimensions;
    const L = dimensions.length_mm * MM_TO_WORLD;
    const W = dimensions.width_mm  * MM_TO_WORLD;
    const T = dimensions.thickness_mm * MM_TO_WORLD;
    const radius = Math.sqrt(L*L + W*W + T*T) / 2;
    const fov  = (camera as THREE.PerspectiveCamera).fov;
    const dist = (radius / Math.sin((fov * Math.PI) / 360)) * 1.45;
    camera.position.set(dist * 0.55, dist * 0.5, dist * 0.7);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [dimensions, camera]);
  return null;
}

// ── Main component ───────────────────────────────────────────────────────────

const KNOT_COLORS: Record<Knot["type"], string> = {
  live: "#10b981",
  dead: "#f97316",
  knot_hole: "#ef4444",
};

const BBOX_OFFSET = 0.009; // world units offset outward to avoid z-fighting

export function ResultPlank3D({
  analysis, dimensions, surfaceImages, selectedKnot,
}: ResultPlank3DProps) {
  const faces = useMemo(() => buildFaces(dimensions), [dimensions]);

  // Pre-compute bbox corners and centers in world space for every detected knot.
  const knotData = useMemo(() => {
    const out: Record<string, KnotBboxData> = {};
    (Object.keys(faces) as SurfaceId[]).forEach((s) => {
      const face = faces[s];
      const n = face.outNormal.clone().multiplyScalar(BBOX_OFFSET);
      for (const k of analysis.surfaces[s]) {
        const [ymin, xmin, ymax, xmax] = k.bbox;
        const wv = (u: number, v: number) => face.worldFromUv(u, v).add(n);
        const tl = wv(xmin / 1000, ymin / 1000);
        const tr = wv(xmax / 1000, ymin / 1000);
        const br = wv(xmax / 1000, ymax / 1000);
        const bl = wv(xmin / 1000, ymax / 1000);
        const center = wv((xmin + xmax) / 2000, (ymin + ymax) / 2000);
        out[`${s}:${k.id}`] = {
          center,
          corners: [tl, tr, br, bl],
          color: KNOT_COLORS[k.type] ?? "#10b981",
        };
      }
    });
    return out;
  }, [analysis, faces]);

  return (
    <div className="w-full h-full bg-neutral-950">
      <Canvas camera={{ position: [6, 4, 8], fov: 45 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={["#0a0a0a"]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[10, 10, 6]} intensity={0.5} />

        <Suspense fallback={null}>
          {/* Textured face planes */}
          {(Object.keys(faces) as SurfaceId[]).map((s) => (
            <FaceTexturedPlane key={s} face={faces[s]} image={surfaceImages[s]} />
          ))}

          {/* Bounding-box outlines for every detected knot */}
          {(Object.keys(faces) as SurfaceId[]).flatMap((s) =>
            analysis.surfaces[s].map((k) => {
              const data = knotData[`${s}:${k.id}`];
              if (!data) return null;
              const selected =
                selectedKnot?.surface === s && selectedKnot.id === k.id;
              return (
                <KnotBbox3D
                  key={`${s}-${k.id}`}
                  data={data}
                  selected={selected}
                />
              );
            })
          )}

          {/* Pair tubes — rendered through the plank with depthTest:false */}
          {analysis.pairs.map((p, i) => {
            const a = knotData[`${p.a.surface}:${p.a.id}`]?.center;
            const b = knotData[`${p.b.surface}:${p.b.id}`]?.center;
            if (!a || !b) return null;
            const sel =
              (selectedKnot?.surface === p.a.surface && selectedKnot.id === p.a.id) ||
              (selectedKnot?.surface === p.b.surface && selectedKnot.id === p.b.id);
            return (
              <PairTube3D
                key={i}
                a={a}
                b={b}
                selected={sel}
                kind={p.kind ?? "through"}
              />
            );
          })}

          <FitCamera dimensions={dimensions} />
        </Suspense>

        <OrbitControls
          enableDamping dampingFactor={0.08} rotateSpeed={0.7}
          enablePan={false} minDistance={2} maxDistance={30}
        />
      </Canvas>
    </div>
  );
}
