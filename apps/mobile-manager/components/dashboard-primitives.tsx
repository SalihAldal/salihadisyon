import { Pressable, Text, View } from "react-native";
import { mobileTheme } from "../theme";

export function SectionHeader({
  eyebrow,
  title,
  action,
  onActionPress,
}: {
  eyebrow: string;
  title: string;
  action?: string;
  onActionPress?: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: "#64748b", fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>{eyebrow}</Text>
        <Text style={{ color: mobileTheme.colors.text, fontSize: 20, fontWeight: "700" }}>{title}</Text>
      </View>
      {action ? (
        <Pressable
          onPress={onActionPress}
          style={{
            borderRadius: mobileTheme.radius.sm,
            backgroundColor: "#eef2ff",
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: "#4338ca", fontWeight: "700", fontSize: 13 }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function MetricCard({
  label,
  value,
  delta,
  tone = "default",
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const toneMap = {
    default: { bg: mobileTheme.colors.surface, badge: "#e2e8f0", color: mobileTheme.colors.textSecondary },
    success: { bg: mobileTheme.colors.surface, badge: "#dcfce7", color: "#166534" },
    warning: { bg: mobileTheme.colors.surface, badge: "#fef3c7", color: "#92400e" },
    danger: { bg: mobileTheme.colors.surface, badge: "#fee2e2", color: "#991b1b" },
    info: { bg: mobileTheme.colors.surface, badge: "#dbeafe", color: "#1d4ed8" },
  }[tone];

  return (
    <View
      style={{
        flex: 1,
        minWidth: 150,
        backgroundColor: toneMap.bg,
        borderRadius: mobileTheme.radius.xl,
        padding: 18,
        ...mobileTheme.shadow.card,
      }}
    >
      <Text style={{ color: mobileTheme.colors.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: mobileTheme.colors.text, fontSize: 28, fontWeight: "700", marginTop: 8 }}>{value}</Text>
      {delta ? (
        <View
          style={{
            marginTop: 12,
            alignSelf: "flex-start",
            borderRadius: 999,
            backgroundColor: toneMap.badge,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
        >
          <Text style={{ color: toneMap.color, fontWeight: "700", fontSize: 12 }}>{delta}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function AlertCard({
  title,
  subtitle,
  tone,
}: {
  title: string;
  subtitle: string;
  tone: "danger" | "warning" | "info";
}) {
  const colorMap = {
    danger: { dot: "#dc2626", bg: "#fef2f2" },
    warning: { dot: "#d97706", bg: "#fffbeb" },
    info: { dot: "#0284c7", bg: "#eff6ff" },
  }[tone];

  return (
    <View
      style={{
        borderRadius: 20,
        backgroundColor: colorMap.bg,
        padding: 16,
        flexDirection: "row",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          backgroundColor: colorMap.dot,
          marginTop: 6,
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ color: mobileTheme.colors.text, fontWeight: "700", fontSize: 15 }}>{title}</Text>
        <Text style={{ color: "#475569", fontSize: 13, marginTop: 4 }}>{subtitle}</Text>
      </View>
    </View>
  );
}

export function TabChip({ label, active = false, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: mobileTheme.radius.pill,
        backgroundColor: active ? mobileTheme.colors.surfaceDark : mobileTheme.colors.surface,
        paddingHorizontal: 14,
        paddingVertical: 10,
        shadowColor: mobileTheme.colors.surfaceDark,
        shadowOpacity: active ? 0 : 0.04,
        shadowRadius: 12,
      }}
    >
      <Text style={{ color: active ? mobileTheme.colors.textOnDark : mobileTheme.colors.textSecondary, fontWeight: "700", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function BottomTabMock({ items }: { items: Array<{ label: string; active?: boolean; onPress?: () => void }> }) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        borderRadius: 26,
        backgroundColor: "rgba(15, 23, 42, 0.94)",
        padding: 10,
      }}
    >
      {items.map((item) => (
        <Pressable
          key={item.label}
          onPress={item.onPress}
          style={{
            flex: 1,
            borderRadius: mobileTheme.radius.md,
            backgroundColor: item.active ? mobileTheme.colors.primary : "transparent",
            paddingVertical: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#ffffff", fontSize: 12, fontWeight: "700" }}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
