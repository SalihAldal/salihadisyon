import { ScrollView, Text, View } from "react-native";
import { AlertCard, BottomTabMock, MetricCard, SectionHeader, TabChip } from "../components/dashboard-primitives";

const metrics = [
  { label: "Anlik Ciro", value: "₺84.250", delta: "+9.4%", tone: "success" as const },
  { label: "Aktif Siparis", value: "42", delta: "+6 yeni", tone: "info" as const },
  { label: "Mesai Durumu", value: "19 Aktif", delta: "3 mola", tone: "default" as const },
  { label: "Kritik Stok", value: "4 Alarm", delta: "2 acil", tone: "danger" as const },
];

const alerts = [
  { title: "Kasa kapanis farki var", subtitle: "Etiler subesi / Terminal 02 / ₺420 fark", tone: "danger" as const },
  { title: "Espresso cekirdegi kritik seviyede", subtitle: "Nisantasi deposu / tahmini 6 saatlik stok", tone: "warning" as const },
  { title: "3 personel icin onay bekliyor", subtitle: "Mesai gecikme kayitlari ve mola uzatma talepleri", tone: "info" as const },
];

const quickApprovals = ["Mesai Onayi", "Kampanya Ac/Kapat", "Stok Transferi", "Kasa Farki"];
const branchComparison = [
  "Nisantasi / ₺84.250 / Hedef %112",
  "Etiler / ₺63.440 / Hedef %97",
  "Kadikoy / ₺58.920 / Hedef %104",
];
const tasks = ["Happy hour performansini kontrol et", "Kritik stok satin alma onayi ver", "Gun sonu closure bekleyen subeyi ara"];

export default function HomeScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: "#eef2f7" }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: 120,
          gap: 18,
        }}
      >
        <View
          style={{
            borderRadius: 28,
            backgroundColor: "#0f172a",
            padding: 20,
            gap: 14,
          }}
        >
          <View style={{ gap: 6 }}>
            <Text style={{ color: "#94a3b8", fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>
              Yonetici Kontrol Merkezi
            </Text>
            <Text style={{ color: "white", fontSize: 30, fontWeight: "700", lineHeight: 34 }}>
              Isletmeyi cebinden yonet
            </Text>
            <Text style={{ color: "#cbd5e1", fontSize: 14 }}>
              Secili sube: Nisantasi. Canli veri acik, offline fallback hazir.
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <TabChip label="Nisantasi" active />
            <TabChip label="Etiler" />
            <TabChip label="Kadikoy" />
            <TabChip label="Bugun" />
          </View>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </View>

        <View style={{ gap: 12 }}>
          <SectionHeader eyebrow="Anlik Uyarilar" title="Kritik operasyon alarmlari" action="Tumunu Gor" />
          {alerts.map((alert) => (
            <AlertCard key={alert.title} {...alert} />
          ))}
        </View>

        <View
          style={{
            borderRadius: 24,
            backgroundColor: "white",
            padding: 18,
            gap: 14,
            shadowColor: "#0f172a",
            shadowOpacity: 0.08,
            shadowRadius: 24,
            elevation: 2,
          }}
        >
          <SectionHeader eyebrow="Onay Merkezi" title="Hizli onay aksiyonlari" action="Queue" />
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            {quickApprovals.map((item) => (
              <View
                key={item}
                style={{
                  borderRadius: 18,
                  backgroundColor: "#f8fafc",
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                }}
              >
                <Text style={{ color: "#0f172a", fontWeight: "700", fontSize: 13 }}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View
          style={{
            borderRadius: 24,
            backgroundColor: "white",
            padding: 18,
            gap: 14,
            shadowColor: "#0f172a",
            shadowOpacity: 0.08,
            shadowRadius: 24,
            elevation: 2,
          }}
        >
          <SectionHeader eyebrow="Sube Karsilastirma" title="Bugunku performans" action="Detay" />
          {branchComparison.map((item) => (
            <View
              key={item}
              style={{
                borderRadius: 18,
                backgroundColor: "#f8fafc",
                padding: 14,
              }}
            >
              <Text style={{ color: "#334155", fontSize: 14, fontWeight: "600" }}>{item}</Text>
            </View>
          ))}
        </View>

        <View
          style={{
            borderRadius: 24,
            backgroundColor: "white",
            padding: 18,
            gap: 14,
            shadowColor: "#0f172a",
            shadowOpacity: 0.08,
            shadowRadius: 24,
            elevation: 2,
          }}
        >
          <SectionHeader eyebrow="Gunluk Gorevler" title="Masaustu olmadan yonet" action="Planla" />
          {tasks.map((task) => (
            <View
              key={task}
              style={{
                borderRadius: 18,
                backgroundColor: "#eef2ff",
                padding: 14,
              }}
            >
              <Text style={{ color: "#312e81", fontWeight: "700", fontSize: 14 }}>{task}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 18,
        }}
      >
        <BottomTabMock
          items={[
            { label: "Dashboard", active: true },
            { label: "Operasyon" },
            { label: "Uyarilar" },
            { label: "Raporlar" },
            { label: "Profil" },
          ]}
        />
      </View>
    </View>
  );
}
