import type { Analysis } from "./schema";

export type GradeColor = "emerald" | "amber" | "orange" | "red";

export function gradeColor(grade: Analysis["estimated_grade"]): GradeColor {
  switch (grade) {
    case "Select":
    case "A":
      return "emerald";
    case "B":
      return "amber";
    case "C":
      return "orange";
    case "Reject":
      return "red";
  }
}

export function gradeTailwind(grade: Analysis["estimated_grade"]) {
  switch (grade) {
    case "Select":
    case "A":
      return {
        bg: "bg-emerald-500/10",
        text: "text-emerald-400",
        border: "border-emerald-500/30",
        badge: "bg-emerald-500/20 text-emerald-300",
      };
    case "B":
      return {
        bg: "bg-amber-500/10",
        text: "text-amber-400",
        border: "border-amber-500/30",
        badge: "bg-amber-500/20 text-amber-300",
      };
    case "C":
      return {
        bg: "bg-orange-500/10",
        text: "text-orange-400",
        border: "border-orange-500/30",
        badge: "bg-orange-500/20 text-orange-300",
      };
    case "Reject":
      return {
        bg: "bg-red-500/10",
        text: "text-red-400",
        border: "border-red-500/30",
        badge: "bg-red-500/20 text-red-300",
      };
  }
}

export function knotTypeBadge(type: "live" | "dead" | "knot_hole") {
  switch (type) {
    case "live":
      return { label: "Live", className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" };
    case "dead":
      return { label: "Dead", className: "bg-orange-500/20 text-orange-300 border-orange-500/30" };
    case "knot_hole":
      return { label: "Hole", className: "bg-red-500/20 text-red-300 border-red-500/30" };
  }
}
