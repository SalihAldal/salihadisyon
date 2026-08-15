import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { QueryClient, QueryClientProvider, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCard, BottomTabMock, MetricCard, SectionHeader, TabChip } from "./components/dashboard-primitives";
import { mobileApi, type MobileSession } from "./app/mobile-api";
import { mobileTheme } from "./theme";

type MobileTab = "dashboard" | "operations" | "alerts" | "reports" | "profile";

const SESSION_KEY = "mobile-manager-session";
const queryClient = new QueryClient();

function parseStoredSession(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MobileSession;
  } catch {
    return null;
  }
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

function formatCurrency(value: number | undefined) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value ?? 0);
}

function Surface({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "dark" }) {
  return (
    <View
      style={{
        borderRadius: mobileTheme.radius.xl,
        backgroundColor: tone === "dark" ? mobileTheme.colors.surfaceDark : mobileTheme.colors.surface,
        padding: 18,
        gap: 14,
        ...(tone === "dark" ? {} : mobileTheme.shadow.card),
      }}
    >
      {children}
    </View>
  );
}

function ActionChip({ label, onPress, active = false }: { label: string; onPress?: () => void; active?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: mobileTheme.radius.md,
        backgroundColor: active ? mobileTheme.colors.surfaceDark : "#eef2ff",
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <Text style={{ color: active ? mobileTheme.colors.textOnDark : mobileTheme.colors.primaryStrong, fontWeight: "700", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function RowItem({ title, subtitle, right }: { title: string; subtitle?: string; right?: string }) {
  return (
    <View
      style={{
        borderRadius: mobileTheme.radius.md,
        backgroundColor: mobileTheme.colors.surfaceMuted,
        padding: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: mobileTheme.colors.text, fontWeight: "700", fontSize: 14 }}>{title}</Text>
        {subtitle ? <Text style={{ color: mobileTheme.colors.textMuted, fontSize: 13, marginTop: 4 }}>{subtitle}</Text> : null}
      </View>
      {right ? <Text style={{ color: mobileTheme.colors.textSecondary, fontWeight: "700", fontSize: 13 }}>{right}</Text> : null}
    </View>
  );
}

function LoginCard({
  onLogin,
  loading,
  error,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState("manager@aldal.local");
  const [password, setPassword] = useState("Branch123!");

  return (
    <View style={{ flex: 1, backgroundColor: mobileTheme.colors.bg, justifyContent: "center", padding: 20 }}>
      <Surface tone="dark">
        <Text style={{ color: "#94a3b8", fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>Mobile Manager</Text>
        <Text style={{ color: "white", fontSize: 30, fontWeight: "700", lineHeight: 34 }}>Isletmeyi cebinden production-grade yonet</Text>
        <Text style={{ color: "#cbd5e1", fontSize: 14 }}>Login, şube seçimi, dashboard özetleri ve push-ready yapı hazır.</Text>
        <View style={{ gap: 12 }}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="E-posta"
            placeholderTextColor="#94a3b8"
            style={{ borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", color: "white", padding: 16 }}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Şifre"
            placeholderTextColor="#94a3b8"
            secureTextEntry
            style={{ borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", color: "white", padding: 16 }}
          />
        </View>
        {error ? <Text style={{ color: "#fecaca", fontWeight: "700" }}>{error}</Text> : null}
        <Pressable
          onPress={() => void onLogin(email, password)}
          style={{ borderRadius: mobileTheme.radius.md, backgroundColor: mobileTheme.colors.primary, padding: 16, alignItems: "center" }}
        >
          <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>{loading ? "Giriş yapılıyor..." : "Giriş Yap"}</Text>
        </Pressable>
      </Surface>
    </View>
  );
}

function MainApp({ session, onLogout }: { session: MobileSession; onLogout: () => Promise<void> }) {
  const queryClient = useQueryClient();
  const [selectedBranchId, setSelectedBranchId] = useState(session.user.defaultBranchId ?? session.user.branchIds[0] ?? "");
  const [activeTab, setActiveTab] = useState<MobileTab>("dashboard");
  const [pushState, setPushState] = useState<{ status: "idle" | "ready" | "registered" | "denied"; token?: string; error?: string }>({
    status: "idle",
  });

  const meQuery = useQuery({
    queryKey: ["mobile-me", session.accessToken],
    queryFn: () => mobileApi.me(session.accessToken),
  });

  const [dashboardQuery, attendanceQuery, inventoryQuery, revenueQuery, notificationsQuery] = useQueries({
    queries: [
      {
        queryKey: ["mobile-dashboard", session.accessToken, selectedBranchId],
        queryFn: () => mobileApi.dashboard(session.accessToken, selectedBranchId),
        enabled: Boolean(selectedBranchId),
      },
      {
        queryKey: ["mobile-attendance", session.accessToken, selectedBranchId],
        queryFn: () => mobileApi.attendance(session.accessToken, selectedBranchId),
        enabled: Boolean(selectedBranchId),
      },
      {
        queryKey: ["mobile-inventory", session.accessToken, selectedBranchId],
        queryFn: () => mobileApi.inventory(session.accessToken, selectedBranchId),
        enabled: Boolean(selectedBranchId),
      },
      {
        queryKey: ["mobile-revenue", session.accessToken, selectedBranchId],
        queryFn: () => mobileApi.branchRevenue(session.accessToken, selectedBranchId),
        enabled: Boolean(selectedBranchId),
      },
      {
        queryKey: ["mobile-notifications", session.accessToken, selectedBranchId],
        queryFn: () => mobileApi.notifications(session.accessToken, selectedBranchId),
        enabled: Boolean(selectedBranchId),
      },
    ],
  });

  useEffect(() => {
    async function setupPush() {
      try {
        if (!Device.isDevice) {
          setPushState({ status: "ready", error: "Gerçek cihazda push kaydı yapılır." });
          return;
        }

        const permissionState = await Notifications.getPermissionsAsync();
        let finalStatus = permissionState.status;
        if (finalStatus !== "granted") {
          const requested = await Notifications.requestPermissionsAsync();
          finalStatus = requested.status;
        }

        if (finalStatus !== "granted") {
          setPushState({ status: "denied", error: "Push izni verilmedi." });
          return;
        }

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          Constants.easConfig?.projectId ??
          undefined;

        if (!projectId) {
          setPushState({ status: "ready", error: "EAS projectId eklenince token register edilir." });
          return;
        }

        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        await mobileApi.registerPushToken(session.accessToken, {
          pushToken: token,
          platform: Device.osName ?? "unknown",
          deviceType: Device.deviceType ? String(Device.deviceType) : "mobile",
          fingerprint: `${Device.modelName ?? "device"}-${Device.osInternalBuildId ?? "build"}`,
        });
        setPushState({ status: "registered", token });
      } catch (pushError) {
        setPushState({
          status: "ready",
          error: pushError instanceof Error ? pushError.message : "Push altyapısı hazır ama kayıt tamamlanamadı.",
        });
      }
    }

    void setupPush();
  }, [session.accessToken]);

  const dashboard = (dashboardQuery.data ?? {}) as Record<string, any>;
  const attendance = (attendanceQuery.data ?? {}) as Record<string, any>;
  const inventory = (inventoryQuery.data ?? {}) as Record<string, any>;
  const revenue = (revenueQuery.data ?? {}) as Record<string, any>;
  const notifications = (notificationsQuery.data ?? {}) as Record<string, any>;

  const topMetrics = useMemo(() => {
    const cards = (dashboard.cards as Array<Record<string, any>> | undefined) ?? [];
    return cards.map((card) => ({
      label: String(card.label),
      value: typeof card.value === "number" && String(card.key).includes("revenue") ? formatCurrency(card.value) : String(card.value),
      delta: card.meta ? String(card.meta) : undefined,
      tone: card.tone === "success" || card.tone === "warning" || card.tone === "danger" || card.tone === "info" ? card.tone : "default",
    }));
  }, [dashboard]);

  async function markNotificationRead(id: string) {
    await mobileApi.markNotificationRead(session.accessToken, id);
    await queryClient.invalidateQueries({ queryKey: ["mobile-notifications"] });
  }

  async function markAllNotificationsRead() {
    await mobileApi.markAllNotificationsRead(session.accessToken, selectedBranchId);
    await queryClient.invalidateQueries({ queryKey: ["mobile-notifications"] });
  }

  const isLoading = dashboardQuery.isLoading || attendanceQuery.isLoading || inventoryQuery.isLoading || revenueQuery.isLoading || notificationsQuery.isLoading;

  return (
    <View style={{ flex: 1, backgroundColor: mobileTheme.colors.bg }}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: 120,
          gap: 18,
        }}
      >
        <Surface tone="dark">
          <View style={{ gap: 6 }}>
            <Text style={{ color: "#94a3b8", fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>Yönetici Kontrol Merkezi</Text>
            <Text style={{ color: "white", fontSize: 30, fontWeight: "700", lineHeight: 34 }}>Mobil yönetici uygulaması</Text>
            <Text style={{ color: "#cbd5e1", fontSize: 14 }}>
              {`Seçili şube: ${selectedBranchId || "-"}. Rol: ${session.user.role}. Push: ${pushState.status}.`}
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            {session.user.branchIds.map((branchId) => (
              <TabChip key={branchId} label={branchId} active={selectedBranchId === branchId} onPress={() => setSelectedBranchId(branchId)} />
            ))}
          </View>
        </Surface>

        {isLoading ? (
          <View style={{ paddingVertical: 32, alignItems: "center" }}>
            <ActivityIndicator size="large" color={mobileTheme.colors.primaryStrong} />
          </View>
        ) : null}

        {activeTab === "dashboard" ? (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {topMetrics.map((metric: { label: string; value: string; delta?: string; tone?: "default" | "success" | "warning" | "danger" | "info" }) => (
                <MetricCard key={metric.label} {...metric} />
              ))}
            </View>

            <View style={{ gap: 12 }}>
              <SectionHeader eyebrow="Ciro Özetleri" title="Şube ciro karşılaştırmaları" />
              <Surface>
                {((revenue.items as Array<Record<string, any>> | undefined) ?? []).slice(0, 6).map((item) => (
                  <RowItem
                    key={String(item.branchId ?? item.branchName)}
                    title={String(item.branchName ?? "-")}
                    subtitle={`Adisyon: ${item.ticketCount ?? "-"} / Ortalama Sepet: ${formatCurrency(Number(item.averageBasket ?? 0))}`}
                    right={formatCurrency(Number(item.revenue ?? 0))}
                  />
                ))}
              </Surface>
            </View>

            <View style={{ gap: 12 }}>
              <SectionHeader eyebrow="Rapor Özetleri" title="Ödeme ve performans snapshot" />
              <Surface>
                {((dashboard.paymentBreakdown as Array<Record<string, any>> | undefined) ?? []).slice(0, 5).map((item) => (
                  <RowItem
                    key={String(item.method)}
                    title={String(item.method)}
                    subtitle={`Oran: ${Number(item.ratio ?? 0).toFixed(1)}%`}
                    right={formatCurrency(Number(item.amount ?? 0))}
                  />
                ))}
              </Surface>
            </View>
          </>
        ) : null}

        {activeTab === "operations" ? (
          <>
            <View style={{ gap: 12 }}>
              <SectionHeader eyebrow="Personel Mesaileri" title="Günlük mesai planı" />
              <Surface>
                {((dashboard.dailyShifts as Array<Record<string, any>> | undefined) ?? []).slice(0, 8).map((shift) => (
                  <RowItem
                    key={String(shift.id)}
                    title={String(shift.employeeName)}
                    subtitle={`${shift.department} / ${new Date(String(shift.scheduledStartAt)).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} - ${new Date(String(shift.scheduledEndAt)).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`}
                    right={String(shift.branchName)}
                  />
                ))}
              </Surface>
            </View>

            <View style={{ gap: 12 }}>
              <SectionHeader eyebrow="Mola Durumları" title="Onay bekleyen molalar ve olaylar" />
              <Surface>
                {((attendance.pendingApprovals?.breaks as Array<Record<string, any>> | undefined) ?? []).map((item) => (
                  <RowItem key={String(item.id)} title={String(item.employeeName)} subtitle={`Onay: ${item.approvalStatus}`} right={`${item.totalMinutes} dk`} />
                ))}
                {((attendance.pendingApprovals?.events as Array<Record<string, any>> | undefined) ?? []).slice(0, 4).map((item) => (
                  <RowItem key={String(item.id)} title={String(item.employeeName)} subtitle={String(item.action)} right={String(item.approvalStatus)} />
                ))}
              </Surface>
            </View>

            <View style={{ gap: 12 }}>
              <SectionHeader eyebrow="Görevler" title="Günlük görev listesi" />
              <Surface>
                {((dashboard.todoItems as Array<Record<string, any>> | undefined) ?? []).map((task) => (
                  <RowItem key={String(task.id)} title={String(task.title)} subtitle={String(task.description ?? "Açıklama yok")} right={String(task.status)} />
                ))}
              </Surface>
            </View>

            <View style={{ gap: 12 }}>
              <SectionHeader eyebrow="Kampanya Özetleri" title="Aktif kampanyalar" />
              <Surface>
                {((dashboard.activeCampaigns as Array<Record<string, any>> | undefined) ?? []).map((campaign) => (
                  <RowItem key={String(campaign.id)} title={String(campaign.name)} subtitle={`${campaign.branchName} / ${campaign.type}`} right="Aktif" />
                ))}
              </Surface>
            </View>
          </>
        ) : null}

        {activeTab === "alerts" ? (
          <>
            <View style={{ gap: 12 }}>
              <SectionHeader eyebrow="Operasyon Uyarıları" title="Canlı operasyon akışı" />
              {((dashboard.statusFlow as Array<Record<string, any>> | undefined) ?? []).map((item, index) => (
                <AlertCard key={`${item.title}-${index}`} title={String(item.title)} subtitle={String(item.meta)} tone={(item.tone as "danger" | "warning" | "info") ?? "info"} />
              ))}
            </View>

            <View style={{ gap: 12 }}>
              <SectionHeader eyebrow="Kritik Stoklar" title="Minimum stok alarmları" />
              <Surface>
                {((inventory.alerts as Array<Record<string, any>> | undefined) ?? []).map((item) => (
                  <RowItem
                    key={String(item.id)}
                    title={String(item.productName)}
                    subtitle={`${item.warehouseName} / Eşik: ${item.threshold} ${item.unit}`}
                    right={`${item.currentStock} ${item.unit}`}
                  />
                ))}
              </Surface>
            </View>

            <View style={{ gap: 12 }}>
              <SectionHeader eyebrow="Bildirim Merkezi" title={`Okunmamış ${notifications.unreadCount ?? 0}`} action="Hepsini Oku" onActionPress={() => void markAllNotificationsRead()} />
              <Surface>
                <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                  <ActionChip label="Tumunu okundu yap" onPress={() => void markAllNotificationsRead()} />
                </View>
                {((notifications.items as Array<Record<string, any>> | undefined) ?? []).map((item) => (
                  <Pressable key={String(item.id)} onPress={() => void markNotificationRead(String(item.id))}>
                    <RowItem
                      title={String(item.title)}
                      subtitle={`${item.branchName} / ${item.message}`}
                      right={item.isRead ? "Okundu" : "Yeni"}
                    />
                  </Pressable>
                ))}
              </Surface>
            </View>
          </>
        ) : null}

        {activeTab === "reports" ? (
          <>
            <View style={{ gap: 12 }}>
              <SectionHeader eyebrow="Raporlar" title="Şube performans tablosu" />
              <Surface>
                {((dashboard.branchComparison as Array<Record<string, any>> | undefined) ?? []).map((item) => (
                  <RowItem
                    key={String(item.branchId)}
                    title={String(item.branchName)}
                    subtitle={`Adisyon ${item.ticketCount} / Sepet ${formatCurrency(Number(item.averageBasket ?? 0))}`}
                    right={formatCurrency(Number(item.revenue ?? 0))}
                  />
                ))}
              </Surface>
            </View>

            <View style={{ gap: 12 }}>
              <SectionHeader eyebrow="Trend" title="Yaklaşan doğum günleri ve operasyon takvimi" />
              <Surface>
                {((dashboard.upcomingBirthdays as Array<Record<string, any>> | undefined) ?? []).map((item) => (
                  <RowItem
                    key={String(item.id)}
                    title={String(item.employeeName)}
                    subtitle={String(item.branchName)}
                    right={`${item.daysLeft} gün`}
                  />
                ))}
              </Surface>
            </View>
          </>
        ) : null}

        {activeTab === "profile" ? (
          <>
            <Surface>
              <SectionHeader eyebrow="Profil" title={session.user.fullName} />
              <RowItem title="E-posta" subtitle={session.user.email} right={session.user.role} />
              <RowItem title="Varsayılan Şube" subtitle={session.user.defaultBranchId ?? "-"} right={`${session.user.branchIds.length} şube`} />
              <RowItem title="Push Altyapısı" subtitle={pushState.error ?? "Expo Notifications hazır"} right={pushState.status} />
              <RowItem title="Yetki Sayısı" subtitle="Aktif permission seti" right={String(session.user.permissions.length)} />
              {meQuery.data ? <RowItem title="Tenant" subtitle={String((meQuery.data.tenant as Record<string, any> | undefined)?.name ?? "-")} right={String((meQuery.data.defaultBranch as Record<string, any> | undefined)?.name ?? "-")} /> : null}
              <Pressable onPress={() => void onLogout()} style={{ borderRadius: 18, backgroundColor: "#fee2e2", padding: 16, alignItems: "center" }}>
                <Text style={{ color: "#991b1b", fontWeight: "700" }}>Çıkış Yap</Text>
              </Pressable>
            </Surface>
          </>
        ) : null}
      </ScrollView>

      <View style={{ position: "absolute", left: 16, right: 16, bottom: 18 }}>
        <BottomTabMock
          items={[
            { label: "Dashboard", active: activeTab === "dashboard", onPress: () => setActiveTab("dashboard") },
            { label: "Operasyon", active: activeTab === "operations", onPress: () => setActiveTab("operations") },
            { label: "Uyarılar", active: activeTab === "alerts", onPress: () => setActiveTab("alerts") },
            { label: "Raporlar", active: activeTab === "reports", onPress: () => setActiveTab("reports") },
            { label: "Profil", active: activeTab === "profile", onPress: () => setActiveTab("profile") },
          ]}
        />
      </View>
    </View>
  );
}

function AppContainer() {
  const [session, setSession] = useState<MobileSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function restoreSession() {
      const raw = await SecureStore.getItemAsync(SESSION_KEY);
      const nextSession = parseStoredSession(raw);
      if (nextSession) {
        setSession(nextSession);
      } else if (raw) {
        await SecureStore.deleteItemAsync(SESSION_KEY);
      }
      setLoading(false);
    }

    void restoreSession();
  }, []);

  async function handleLogin(email: string, password: string) {
    try {
      setLoginLoading(true);
      setError(null);
      const nextSession = await mobileApi.login(email, password);
      await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Giriş başarısız.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    setSession(null);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: mobileTheme.colors.bg }}>
        <ActivityIndicator size="large" color={mobileTheme.colors.primaryStrong} />
      </View>
    );
  }

  if (!session) {
    return <LoginCard onLogin={handleLogin} loading={loginLoading} error={error} />;
  }

  return <MainApp session={session} onLogout={handleLogout} />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContainer />
    </QueryClientProvider>
  );
}
