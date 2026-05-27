import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { Analysis } from "./schema";

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#0a0a0a",
    color: "#e5e5e5",
    fontFamily: "Helvetica",
    padding: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: "1 solid #262626",
  },
  title: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#f59e0b",
  },
  subtitle: {
    fontSize: 10,
    color: "#737373",
    marginTop: 4,
  },
  gradeBox: {
    alignItems: "center",
    padding: "8 16",
    borderRadius: 8,
    backgroundColor: "#1c1917",
  },
  gradeLabel: {
    fontSize: 8,
    color: "#737373",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  gradeValue: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: "#f59e0b",
  },
  imagesRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  imageContainer: {
    flex: 1,
  },
  imageLabel: {
    fontSize: 8,
    color: "#737373",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  boardImage: {
    width: "100%",
    borderRadius: 6,
    objectFit: "cover",
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#171717",
    borderRadius: 8,
    padding: "10 12",
  },
  statLabel: {
    fontSize: 8,
    color: "#737373",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#e5e5e5",
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#a3a3a3",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#171717",
    padding: "6 10",
    borderRadius: "4 4 0 0",
  },
  tableRow: {
    flexDirection: "row",
    padding: "6 10",
    borderBottom: "1 solid #262626",
  },
  tableCell: {
    flex: 1,
    fontSize: 9,
    color: "#e5e5e5",
  },
  tableHeaderCell: {
    flex: 1,
    fontSize: 8,
    color: "#737373",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  reasoning: {
    marginTop: 16,
    backgroundColor: "#171717",
    borderRadius: 8,
    padding: 12,
  },
  reasoningText: {
    fontSize: 10,
    color: "#a3a3a3",
    lineHeight: 1.6,
    fontStyle: "italic",
  },
});

interface ReportDocumentProps {
  analysis: Analysis;
  frontImage: string;
  backImage: string;
  boardId?: string;
  timestamp: string;
}

export function ReportDocument({
  analysis,
  frontImage,
  backImage,
  boardId,
  timestamp,
}: ReportDocumentProps) {
  const allKnots = [
    ...analysis.front.map((k) => ({ ...k, face: "Front" as const })),
    ...analysis.back.map((k) => ({ ...k, face: "Back" as const })),
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>KnotScope Report</Text>
            <Text style={styles.subtitle}>
              Board {boardId ?? "Unknown"} — {timestamp}
            </Text>
          </View>
          <View style={styles.gradeBox}>
            <Text style={styles.gradeLabel}>Grade</Text>
            <Text style={styles.gradeValue}>{analysis.estimated_grade}</Text>
          </View>
        </View>

        {/* Images */}
        <View style={styles.imagesRow}>
          <View style={styles.imageContainer}>
            <Text style={styles.imageLabel}>Front Face</Text>
            <Image
              src={`data:image/jpeg;base64,${frontImage}`}
              style={styles.boardImage}
            />
          </View>
          <View style={styles.imageContainer}>
            <Text style={styles.imageLabel}>Back Face</Text>
            <Image
              src={`data:image/jpeg;base64,${backImage}`}
              style={styles.boardImage}
            />
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Total Knots</Text>
            <Text style={styles.statValue}>{analysis.total_knots}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Through Knots</Text>
            <Text style={styles.statValue}>{analysis.through_knot_count}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Max Diameter</Text>
            <Text style={styles.statValue}>{analysis.max_knot_diameter_mm} mm</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Pairs Found</Text>
            <Text style={styles.statValue}>{analysis.pairs.length}</Text>
          </View>
        </View>

        {/* Knot table */}
        <Text style={styles.sectionTitle}>Knot Inventory</Text>
        <View style={styles.tableHeader}>
          <Text style={styles.tableHeaderCell}>ID</Text>
          <Text style={styles.tableHeaderCell}>Face</Text>
          <Text style={styles.tableHeaderCell}>Type</Text>
          <Text style={styles.tableHeaderCell}>Diameter</Text>
          <Text style={styles.tableHeaderCell}>Confidence</Text>
          <Text style={styles.tableHeaderCell}>Paired</Text>
        </View>
        {allKnots.map((knot) => {
          const isPaired =
            knot.face === "Front"
              ? analysis.pairs.some(([f]) => f === knot.id)
              : analysis.pairs.some(([, b]) => b === knot.id);
          return (
            <View key={`${knot.face}-${knot.id}`} style={styles.tableRow}>
              <Text style={styles.tableCell}>#{knot.id}</Text>
              <Text style={styles.tableCell}>{knot.face}</Text>
              <Text style={styles.tableCell}>{knot.type}</Text>
              <Text style={styles.tableCell}>{knot.diameter_estimate_mm} mm</Text>
              <Text style={styles.tableCell}>{Math.round(knot.confidence * 100)}%</Text>
              <Text style={styles.tableCell}>{isPaired ? "Yes" : "No"}</Text>
            </View>
          );
        })}

        {/* Reasoning */}
        <View style={styles.reasoning}>
          <Text style={styles.reasoningText}>{analysis.reasoning}</Text>
        </View>
      </Page>
    </Document>
  );
}
