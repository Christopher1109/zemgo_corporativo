// Minimal React-PDF document used to verify @react-pdf/renderer runs in the
// Cloudflare Worker SSR runtime. Do NOT use as a real template.
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 12 },
  title: { fontSize: 18, marginBottom: 12 },
  box: { padding: 8, borderWidth: 1, borderColor: "#888" },
});

export function SmokeTestDoc({ label }: { label: string }) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>React-PDF smoke test</Text>
        <View style={styles.box}>
          <Text>Label: {label}</Text>
          <Text>Generated at: {new Date().toISOString()}</Text>
        </View>
      </Page>
    </Document>
  );
}
