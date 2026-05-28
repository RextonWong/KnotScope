"use client";

import type { EditableKnot, KnotShape, KnotType, TunnelSpec } from "@/lib/plank";
import { KNOT_SHAPES, makeDefaultTunnel, oppositeSurface } from "@/lib/plank";
import { Trash2, Circle, Egg, Slash, Zap, Sparkles, Cylinder } from "lucide-react";

interface KnotInspectorProps {
  knot: EditableKnot | null;
  onUpdate: (patch: Partial<EditableKnot>) => void;
  onDelete: () => void;
}

const SHAPE_ICONS: Record<KnotShape, React.ComponentType<{ size?: number; className?: string }>> = {
  circle: Circle,
  ellipse: Egg,
  oval: Egg,
  spike: Slash,
  irregular: Sparkles,
};

const SHAPE_LABEL: Record<KnotShape, string> = {
  circle: "Circle",
  ellipse: "Ellipse",
  oval: "Oval",
  spike: "Spike",
  irregular: "Irregular",
};

const TYPE_OPTIONS: { value: KnotType; label: string; color: string }[] = [
  { value: "live", label: "Live", color: "border-emerald-500 text-emerald-300" },
  { value: "dead", label: "Dead", color: "border-orange-500 text-orange-300" },
];

export function KnotInspector({ knot, onUpdate, onDelete }: KnotInspectorProps) {
  if (!knot) {
    return (
      <aside className="w-full bg-neutral-900 rounded-2xl border border-neutral-800 p-5 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-neutral-300">Knot Inspector</h3>
        <p className="text-xs text-neutral-500 leading-relaxed">
          Rotate the 3D plank with your mouse. Click a face to drop a knot, or
          switch to <span className="text-amber-400">Flat Edit</span> for precise placement.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-neutral-600">
          <div>• Click face → add knot</div>
          <div>• Click knot → select</div>
          <div>• Drag → move</div>
          <div>• Sliders → resize / rotate</div>
        </div>
      </aside>
    );
  }

  const ar = Math.max(0.3, Math.min(3, knot.aspect_ratio));

  return (
    <aside className="w-full bg-neutral-900 rounded-2xl border border-neutral-800 p-5 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-300">Knot Inspector</h3>
        <span className="text-xs text-neutral-600 font-mono">{knot.surface}</span>
      </div>

      {/* Type */}
      <div className="flex flex-col gap-2">
        <label className="text-xs uppercase tracking-wider text-neutral-500">Type</label>
        <div className="grid grid-cols-2 gap-2">
          {TYPE_OPTIONS.map((opt) => {
            const active = knot.type === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onUpdate({ type: opt.value })}
                className={`text-xs py-2 rounded-lg border font-medium transition-colors ${
                  active
                    ? `${opt.color} bg-neutral-800`
                    : "border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Shape */}
      <div className="flex flex-col gap-2">
        <label className="text-xs uppercase tracking-wider text-neutral-500">Shape</label>
        <div className="grid grid-cols-5 gap-1.5">
          {KNOT_SHAPES.map((shape) => {
            const Icon = SHAPE_ICONS[shape] ?? Zap;
            const active = knot.shape === shape;
            return (
              <button
                key={shape}
                type="button"
                title={SHAPE_LABEL[shape]}
                onClick={() => onUpdate({ shape })}
                className={`flex items-center justify-center py-2 rounded-lg border transition-colors ${
                  active
                    ? "border-amber-500 text-amber-300 bg-amber-500/10"
                    : "border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"
                }`}
              >
                <Icon size={14} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Diameter */}
      <SliderRow
        label="Diameter"
        value={knot.diameter_mm}
        unit="mm"
        min={5}
        max={80}
        step={1}
        onChange={(v) => onUpdate({ diameter_mm: v })}
      />

      {/* Aspect ratio — only meaningful when shape is not 'circle' */}
      <SliderRow
        label="Aspect ratio"
        value={Number(ar.toFixed(2))}
        unit=""
        min={0.4}
        max={2.5}
        step={0.05}
        onChange={(v) => onUpdate({ aspect_ratio: v })}
        disabled={knot.shape === "circle"}
      />

      {/* Rotation */}
      <SliderRow
        label="Rotation"
        value={knot.rotation_deg}
        unit="°"
        min={0}
        max={359}
        step={1}
        onChange={(v) => onUpdate({ rotation_deg: v })}
      />

      {/* Darkness */}
      <SliderRow
        label="Darkness"
        value={Number(knot.darkness.toFixed(2))}
        unit=""
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => onUpdate({ darkness: v })}
      />

      {/* Tunnel — promotes a surface knot into a 3D tunnel through the plank */}
      <TunnelSection knot={knot} onUpdate={onUpdate} />

      <button
        type="button"
        onClick={onDelete}
        className="mt-2 flex items-center justify-center gap-2 py-2 rounded-lg border border-red-900 text-red-400 text-xs font-medium hover:bg-red-950/40 transition-colors"
      >
        <Trash2 size={13} />
        Delete knot
      </button>
    </aside>
  );
}

interface TunnelSectionProps {
  knot: EditableKnot;
  onUpdate: (patch: Partial<EditableKnot>) => void;
}

function TunnelSection({ knot, onUpdate }: TunnelSectionProps) {
  const tunnel = knot.tunnel;
  const isOn = tunnel != null;

  const patchTunnel = (p: Partial<TunnelSpec>) => {
    if (!tunnel) return;
    onUpdate({ tunnel: { ...tunnel, ...p } });
  };

  return (
    <div className="flex flex-col gap-3 pt-4 border-t border-neutral-800">
      <div className="flex items-center justify-between">
        <label className="text-xs uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
          <Cylinder size={12} className="text-amber-500" />
          Tunnel
        </label>
        <button
          type="button"
          onClick={() => {
            if (isOn) onUpdate({ tunnel: undefined });
            else onUpdate({ tunnel: makeDefaultTunnel(knot) });
          }}
          className={`text-xs px-2.5 py-1 rounded border font-medium transition-colors ${
            isOn
              ? "border-amber-500 text-amber-300 bg-amber-500/10"
              : "border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"
          }`}
        >
          {isOn ? "On" : "Off"}
        </button>
      </div>

      {!isOn && (
        <p className="text-[10px] text-neutral-600 leading-relaxed">
          Turn on to make this knot pass through the plank in 3D. The exit
          appears on the opposite face (or ends inside the wood, if blind).
        </p>
      )}

      {tunnel && (
        <>
          {/* Mode */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => patchTunnel({ exit_kind: "through" })}
              className={`text-xs py-1.5 rounded border font-medium transition-colors ${
                tunnel.exit_kind === "through"
                  ? "border-amber-500 text-amber-300 bg-amber-500/10"
                  : "border-neutral-800 text-neutral-500 hover:border-neutral-700"
              }`}
            >
              Through
            </button>
            <button
              type="button"
              onClick={() => patchTunnel({ exit_kind: "blind" })}
              className={`text-xs py-1.5 rounded border font-medium transition-colors ${
                tunnel.exit_kind === "blind"
                  ? "border-amber-500 text-amber-300 bg-amber-500/10"
                  : "border-neutral-800 text-neutral-500 hover:border-neutral-700"
              }`}
            >
              Blind
            </button>
          </div>

          {tunnel.exit_kind === "through" && (
            <p className="text-[10px] text-neutral-600">
              Exits on:{" "}
              <span className="text-amber-400 font-mono uppercase">
                {oppositeSurface(knot.surface)}
              </span>
            </p>
          )}
          {tunnel.exit_kind === "blind" && (
            <p className="text-[10px] text-neutral-600">
              Tip ends inside the wood. Depth controls how far in.
            </p>
          )}

          <SliderRow
            label={tunnel.exit_kind === "blind" ? "Tip drift u" : "Exit offset u"}
            value={Number(tunnel.exit_du.toFixed(2))}
            unit=""
            min={-0.4}
            max={0.4}
            step={0.02}
            onChange={(v) => patchTunnel({ exit_du: v })}
          />
          <SliderRow
            label={tunnel.exit_kind === "blind" ? "Tip drift v" : "Exit offset v"}
            value={Number(tunnel.exit_dv.toFixed(2))}
            unit=""
            min={-0.4}
            max={0.4}
            step={0.02}
            onChange={(v) => patchTunnel({ exit_dv: v })}
          />
          <SliderRow
            label={tunnel.exit_kind === "blind" ? "Tip diameter" : "Exit diameter"}
            value={tunnel.exit_diameter_mm}
            unit="mm"
            min={3}
            max={80}
            step={1}
            onChange={(v) => patchTunnel({ exit_diameter_mm: v })}
          />
          {tunnel.exit_kind === "blind" && (
            <SliderRow
              label="Depth"
              value={Number(tunnel.depth_factor.toFixed(2))}
              unit=""
              min={0.1}
              max={0.95}
              step={0.05}
              onChange={(v) => patchTunnel({ depth_factor: v })}
            />
          )}
        </>
      )}
    </div>
  );
}

interface SliderRowProps {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}

function SliderRow({ label, value, unit, min, max, step, disabled, onChange }: SliderRowProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs uppercase tracking-wider text-neutral-500">{label}</label>
        <span className="text-xs font-mono text-neutral-300 tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full accent-amber-500 ${disabled ? "opacity-40" : ""}`}
      />
    </div>
  );
}
