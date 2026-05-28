"use client";

import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import { Fragment, Suspense, useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import type {
  EditableKnot,
  PlankDimensions,
  SurfaceId,
} from "@/lib/plank";
import {
  getSurfaceSize,
  oppositeSurface,
  throughAxisMm,
  tunnelExitOnOpposite,
} from "@/lib/plank";

const MM_TO_WORLD = 0.01;

interface Plank3DProps {
  dimensions: PlankDimensions;
  knots: EditableKnot[];
  selectedKnotId: string | null;
  onAddKnot: (surface: SurfaceId, u: number, v: number) => void;
  onSelectKnot: (id: string | null) => void;
  onSelectSurface?: (surface: SurfaceId) => void;
}

// ── Helpers: place a face plane on each side of the box ──────────────────────

interface FaceConfig {
  id: SurfaceId;
  position: [number, number, number];   // center of the face in world space
  rotation: [number, number, number];   // plane normal aligned outward
  width: number;                        // face width in world units (u axis)
  height: number;                       // face height in world units (v axis)
  /** Map a plane-local (x,y) point [-w/2..w/2, -h/2..h/2] to (u,v) [0..1]. */
  uvFromLocal: (lx: number, ly: number) => { u: number; v: number };
  /** Map (u,v) [0..1] back to plane-local (x,y) for placing knot meshes. */
  localFromUv: (u: number, v: number) => { lx: number; ly: number };
}

function buildFaces(dims: PlankDimensions): FaceConfig[] {
  const L = dims.length_mm * MM_TO_WORLD;
  const W = dims.width_mm * MM_TO_WORLD;
  const T = dims.thickness_mm * MM_TO_WORLD;

  const half = { L: L / 2, W: W / 2, T: T / 2 };

  // Convention: when looking at a face, u increases to the right, v increases
  // downward (matching 2D editor / Gemini bbox convention).
  return [
    {
      id: "front",
      position: [0, 0, half.T],
      rotation: [0, 0, 0],
      width: L,
      height: W,
      uvFromLocal: (lx, ly) => ({ u: lx / L + 0.5, v: 0.5 - ly / W }),
      localFromUv: (u, v) => ({ lx: (u - 0.5) * L, ly: (0.5 - v) * W }),
    },
    {
      id: "back",
      position: [0, 0, -half.T],
      rotation: [0, Math.PI, 0],
      width: L,
      height: W,
      // When the plane is rotated 180° around Y, local +x in plane space is
      // already mirrored, so u increases to the (world-space) left — this is
      // exactly the "flipped board" semantic we want for through-knot pairing.
      uvFromLocal: (lx, ly) => ({ u: lx / L + 0.5, v: 0.5 - ly / W }),
      localFromUv: (u, v) => ({ lx: (u - 0.5) * L, ly: (0.5 - v) * W }),
    },
    {
      id: "top",
      position: [0, half.W, 0],
      rotation: [-Math.PI / 2, 0, 0],
      width: L,
      height: T,
      uvFromLocal: (lx, ly) => ({ u: lx / L + 0.5, v: 0.5 - ly / T }),
      localFromUv: (u, v) => ({ lx: (u - 0.5) * L, ly: (0.5 - v) * T }),
    },
    {
      id: "bottom",
      position: [0, -half.W, 0],
      rotation: [Math.PI / 2, 0, 0],
      width: L,
      height: T,
      uvFromLocal: (lx, ly) => ({ u: lx / L + 0.5, v: 0.5 - ly / T }),
      localFromUv: (u, v) => ({ lx: (u - 0.5) * L, ly: (0.5 - v) * T }),
    },
    {
      id: "left",
      position: [-half.L, 0, 0],
      // Rotation chosen so plane local-x runs along world -y (=W axis) and
      // plane local-y runs along world +z (=T axis). Normal faces world -x.
      // This matches the actual LEFT face shape on the box.
      rotation: [Math.PI / 2, -Math.PI / 2, 0],
      width: W,
      height: T,
      uvFromLocal: (lx, ly) => ({ u: lx / W + 0.5, v: 0.5 - ly / T }),
      localFromUv: (u, v) => ({ lx: (u - 0.5) * W, ly: (0.5 - v) * T }),
    },
    {
      id: "right",
      position: [half.L, 0, 0],
      // Mirror of LEFT — plane local-x runs along world +y, normal faces +x.
      rotation: [Math.PI / 2, Math.PI / 2, 0],
      width: W,
      height: T,
      uvFromLocal: (lx, ly) => ({ u: lx / W + 0.5, v: 0.5 - ly / T }),
      localFromUv: (u, v) => ({ lx: (u - 0.5) * W, ly: (0.5 - v) * T }),
    },
  ];
}

// ── Face plane component — clickable, displays its knots ─────────────────────

interface FacePlaneProps {
  face: FaceConfig;
  knots: EditableKnot[];
  selectedKnotId: string | null;
  dimensions: PlankDimensions;
  onAddKnot: (surface: SurfaceId, u: number, v: number) => void;
  onSelectKnot: (id: string | null) => void;
  onSelectSurface?: (surface: SurfaceId) => void;
}

function FacePlane({
  face,
  knots,
  selectedKnotId,
  dimensions,
  onAddKnot,
  onSelectKnot,
  onSelectSurface,
}: FacePlaneProps) {
  const mineKnots = knots.filter((k) => k.surface === face.id);
  const size = getSurfaceSize(face.id, dimensions);
  const scale = face.width / size.width_mm; // world per mm on this face

  const handleClickPlane = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // intersection point is in world space; uv is computed using the local
    // coordinate of the intersection on the plane mesh
    const localPoint = e.object.worldToLocal(e.point.clone());
    const { u, v } = face.uvFromLocal(localPoint.x, localPoint.y);
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    onSelectSurface?.(face.id);
    onAddKnot(face.id, u, v);
  };

  return (
    <group position={face.position} rotation={face.rotation as [number, number, number]}>
      {/* The clickable face plane sits ~0.001 in front of the box body so the
          raycaster always hits it first. Material is transparent so the wood
          color underneath shows through. */}
      <mesh onClick={handleClickPlane} position={[0, 0, 0.001]}>
        <planeGeometry args={[face.width, face.height]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* A subtle face outline */}
      <lineSegments position={[0, 0, 0.002]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(face.width, face.height)]} />
        <lineBasicMaterial color="#8b5a2b" linewidth={1} transparent opacity={0.45} />
      </lineSegments>

      {/* Face label — small chip floating at the face center, always camera-facing */}
      <Html
        position={[0, 0, 0.05]}
        center
        distanceFactor={8}
        zIndexRange={[0, 10]}
        pointerEvents="none"
      >
        <div className="px-2 py-0.5 rounded bg-neutral-950/80 text-amber-400 text-[10px] font-bold uppercase tracking-widest border border-amber-500/30 whitespace-nowrap select-none">
          {face.id}
        </div>
      </Html>

      {/* Knot markers */}
      {mineKnots.map((k) => {
        const { lx, ly } = face.localFromUv(k.u, k.v);
        const r = (k.diameter_mm / 2) * scale;
        const selected = k.id === selectedKnotId;
        return (
          <KnotMarker
            key={k.id}
            x={lx}
            y={ly}
            radius={Math.max(0.02, r)}
            knot={k}
            selected={selected}
            onSelect={() => onSelectKnot(k.id)}
          />
        );
      })}
    </group>
  );
}

function knotColor(k: EditableKnot): string {
  const t = k.darkness;
  if (k.type === "dead") return t > 0.5 ? "#3a200d" : "#5a3818";
  // live
  return t > 0.5 ? "#6b3a12" : "#8b5a26";
}

// ── Tunnel rendering ─────────────────────────────────────────────────────────

function surfaceWorldFromUv(face: FaceConfig, u: number, v: number): THREE.Vector3 {
  const { lx, ly } = face.localFromUv(u, v);
  const v3 = new THREE.Vector3(lx, ly, 0);
  v3.applyEuler(new THREE.Euler(face.rotation[0], face.rotation[1], face.rotation[2]));
  v3.add(new THREE.Vector3(face.position[0], face.position[1], face.position[2]));
  return v3;
}

function faceInwardNormal(face: FaceConfig): THREE.Vector3 {
  const n = new THREE.Vector3(0, 0, 1);
  n.applyEuler(new THREE.Euler(face.rotation[0], face.rotation[1], face.rotation[2]));
  return n.negate();
}

interface TunnelInfo {
  knot: EditableKnot;
  fromWorld: THREE.Vector3;
  toWorld: THREE.Vector3;
  fromRadius: number;
  toRadius: number;
  exitFace: FaceConfig | null;
  exitUv: { u: number; v: number } | null;
}

function buildTunnelInfos(
  knots: EditableKnot[],
  faces: FaceConfig[],
  dims: PlankDimensions
): TunnelInfo[] {
  const out: TunnelInfo[] = [];
  for (const k of knots) {
    if (!k.tunnel) continue;
    const face = faces.find((f) => f.id === k.surface);
    if (!face) continue;
    const fromWorld = surfaceWorldFromUv(face, k.u, k.v);
    const fromRadius = Math.max(0.015, (k.diameter_mm / 2) * MM_TO_WORLD);
    const toRadius = Math.max(0.015, (k.tunnel.exit_diameter_mm / 2) * MM_TO_WORLD);

    if (k.tunnel.exit_kind === "through") {
      const exit = tunnelExitOnOpposite(k);
      if (!exit) continue;
      const exitFace = faces.find((f) => f.id === oppositeSurface(k.surface));
      if (!exitFace) continue;
      out.push({
        knot: k,
        fromWorld,
        toWorld: surfaceWorldFromUv(exitFace, exit.u, exit.v),
        fromRadius,
        toRadius,
        exitFace,
        exitUv: exit,
      });
    } else {
      const driftedEntry = surfaceWorldFromUv(
        face,
        Math.max(0, Math.min(1, k.u + k.tunnel.exit_du)),
        Math.max(0, Math.min(1, k.v + k.tunnel.exit_dv))
      );
      const inward = faceInwardNormal(face);
      const throughLen = throughAxisMm(k.surface, dims) * MM_TO_WORLD;
      const tipWorld = driftedEntry.add(
        inward.multiplyScalar(throughLen * k.tunnel.depth_factor)
      );
      out.push({
        knot: k,
        fromWorld,
        toWorld: tipWorld,
        fromRadius,
        toRadius,
        exitFace: null,
        exitUv: null,
      });
    }
  }
  return out;
}

interface TunnelCylinderProps {
  info: TunnelInfo;
  selected: boolean;
}

function TunnelCylinder({ info, selected }: TunnelCylinderProps) {
  const { fromWorld, toWorld, fromRadius, toRadius, knot } = info;
  const length = fromWorld.distanceTo(toWorld);
  if (length < 1e-4) return null;
  const mid = fromWorld.clone().add(toWorld).multiplyScalar(0.5);
  const dir = toWorld.clone().sub(fromWorld).normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir
  );
  // cylinderGeometry top end (+Y/2) is now in `dir` direction → top = exit/tip,
  // bottom = entry. So radiusTop = toRadius, radiusBottom = fromRadius.
  const color = selected ? "#f59e0b" : knotColor(knot);
  return (
    <mesh
      position={[mid.x, mid.y, mid.z]}
      quaternion={quat}
      renderOrder={2}
    >
      <cylinderGeometry args={[toRadius, fromRadius, length, 24, 1, false]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={selected ? 0.85 : 0.6}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

interface TunnelExitMarkerProps {
  info: TunnelInfo;
  selected: boolean;
  onSelect: () => void;
}

function TunnelExitMarker({ info, selected, onSelect }: TunnelExitMarkerProps) {
  if (!info.exitFace || !info.exitUv) return null;
  const face = info.exitFace;
  const { lx, ly } = face.localFromUv(info.exitUv.u, info.exitUv.v);
  const r = info.toRadius;
  const ar = Math.max(0.3, Math.min(3, info.knot.aspect_ratio || 1));
  const rx = r * (ar >= 1 ? ar : 1);
  const ry = r * (ar >= 1 ? 1 : 1 / ar);
  return (
    <group position={face.position} rotation={face.rotation}>
      <group
        position={[lx, ly, 0.004]}
        rotation={[0, 0, (info.knot.rotation_deg * Math.PI) / 180]}
      >
        <mesh
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          scale={[rx, ry, 1]}
        >
          <circleGeometry args={[1, 32]} />
          <meshBasicMaterial color={knotColor(info.knot)} />
        </mesh>
        {selected && (
          <mesh scale={[rx * 1.25, ry * 1.25, 1]} position={[0, 0, 0.001]}>
            <ringGeometry args={[0.85, 1, 48]} />
            <meshBasicMaterial color="#f59e0b" />
          </mesh>
        )}
      </group>
    </group>
  );
}

interface KnotMarkerProps {
  x: number;
  y: number;
  radius: number;
  knot: EditableKnot;
  selected: boolean;
  onSelect: () => void;
}

function KnotMarker({ x, y, radius, knot, selected, onSelect }: KnotMarkerProps) {
  const ringRef = useRef<THREE.Mesh>(null);
  const ar = Math.max(0.3, Math.min(3, knot.aspect_ratio || 1));
  const rx = radius * (ar >= 1 ? ar : 1);
  const ry = radius * (ar >= 1 ? 1 : 1 / ar);

  return (
    <group position={[x, y, 0.004]} rotation={[0, 0, (knot.rotation_deg * Math.PI) / 180]}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        scale={[rx, ry, 1]}
      >
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial color={knotColor(knot)} />
      </mesh>
      {selected && (
        <mesh ref={ringRef} scale={[rx * 1.25, ry * 1.25, 1]} position={[0, 0, 0.001]}>
          <ringGeometry args={[0.85, 1, 48]} />
          <meshBasicMaterial color="#f59e0b" />
        </mesh>
      )}
    </group>
  );
}

// ── Camera framing — auto-fit the plank in the view on dimension changes ────

function FitCamera({ dimensions }: { dimensions: PlankDimensions }) {
  const { camera } = useThree();
  // Track previous dimension VALUES so refit only happens when the user
  // actually changes a slider — not when the parent re-renders for any
  // other reason (e.g. selecting a knot, dragging a slider).
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
    const dist = (radius / Math.sin((fov * Math.PI) / 360)) * 1.4;
    camera.position.set(dist * 0.5, dist * 0.45, dist * 0.7);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [dimensions, camera]);
  return null;
}

// ── Main 3D viewer ──────────────────────────────────────────────────────────

export function Plank3D(props: Plank3DProps) {
  const faces = useMemo(() => buildFaces(props.dimensions), [props.dimensions]);
  const tunnels = useMemo(
    () => buildTunnelInfos(props.knots, faces, props.dimensions),
    [props.knots, faces, props.dimensions]
  );
  const L = props.dimensions.length_mm * MM_TO_WORLD;
  const W = props.dimensions.width_mm * MM_TO_WORLD;
  const T = props.dimensions.thickness_mm * MM_TO_WORLD;

  return (
    <div className="w-full h-full bg-neutral-950">
      <Canvas
        camera={{ position: [6, 4, 8], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#0a0a0a"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[10, 10, 6]} intensity={0.7} />
        <directionalLight position={[-6, -4, -6]} intensity={0.3} />

        <Suspense fallback={null}>
          {/* The plank body */}
          <mesh
            onClick={(e) => {
              // Click on bare body deselects
              if (e.intersections.length === 1) props.onSelectKnot(null);
            }}
          >
            <boxGeometry args={[L, W, T]} />
            <meshStandardMaterial color="#a07043" roughness={0.85} />
          </mesh>

          {/* Six clickable face overlays */}
          {faces.map((face) => (
            <FacePlane
              key={face.id}
              face={face}
              knots={props.knots}
              selectedKnotId={props.selectedKnotId}
              dimensions={props.dimensions}
              onAddKnot={props.onAddKnot}
              onSelectKnot={props.onSelectKnot}
              onSelectSurface={props.onSelectSurface}
            />
          ))}

          {/* Tunnel cylinders + their opposite-face exit discs */}
          {tunnels.map((info) => {
            const selected = info.knot.id === props.selectedKnotId;
            return (
              <Fragment key={info.knot.id}>
                <TunnelCylinder info={info} selected={selected} />
                <TunnelExitMarker
                  info={info}
                  selected={selected}
                  onSelect={() => props.onSelectKnot(info.knot.id)}
                />
              </Fragment>
            );
          })}

          <FitCamera dimensions={props.dimensions} />
        </Suspense>

        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.7}
          enablePan={false}
          maxDistance={30}
          minDistance={2}
        />
      </Canvas>
    </div>
  );
}
