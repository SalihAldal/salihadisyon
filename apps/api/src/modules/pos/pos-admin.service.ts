import { BadRequestException, Injectable } from "@nestjs/common";
import { PosConnectionType } from "@prisma/client";
import { PrismaService } from "../../common/database/prisma.service";

type PosActor = { tenantId: string; userId: string; branchIds: string[]; terminalId?: string | null; permissions?: string[] };

@Injectable()
export class PosAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getBootstrapConfig(actor: PosActor, query?: { branchId?: string; terminalId?: string }) {
    const branchId = this.resolveBranchId(actor, query?.branchId);
    const requestedTerminalId = query?.terminalId ?? actor.terminalId ?? undefined;

    const [
      categories,
      products,
      modifierGroups,
      requiredChoiceGroups,
      presetNotes,
      paymentMethods,
      discountTypes,
      customers,
      terminals,
      printers,
      printDestinations,
      activeSettings,
    ] = await Promise.all([
      this.prisma.menuCategory.findMany({
        where: { companyId: actor.tenantId, OR: [{ branchId: null }, { branchId }] },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      this.prisma.menuProduct.findMany({
        where: { companyId: actor.tenantId, OR: [{ branchId: null }, { branchId }], isVisible: true, isActive: true },
        include: { variants: { orderBy: { sortOrder: "asc" } }, branchPrices: true, stockItem: true, recipe: { select: { id: true } } },
        orderBy: [{ categoryId: "asc" }, { name: "asc" }],
      }),
      this.prisma.modifierGroup.findMany({
        where: { companyId: actor.tenantId },
        include: { options: { orderBy: { sortOrder: "asc" }, include: { inventoryItem: true } } },
        orderBy: { name: "asc" },
      }),
      this.prisma.requiredChoiceGroup.findMany({
        where: { companyId: actor.tenantId },
        include: { options: { include: { inventoryItem: true } } },
        orderBy: { name: "asc" },
      }),
      this.prisma.presetNote.findMany({
        where: { companyId: actor.tenantId, OR: [{ branchId: null }, { branchId }], isActive: true },
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      }),
      this.prisma.paymentMethodConfig.findMany({
        where: { companyId: actor.tenantId, OR: [{ branchId: null }, { branchId }] },
        orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      }),
      this.prisma.discountTypeConfig.findMany({
        where: { companyId: actor.tenantId, isActive: true, OR: [{ branchId: null }, { branchId }] },
        orderBy: [{ branchId: "desc" }, { updatedAt: "desc" }, { name: "asc" }],
      }),
      this.prisma.customer.findMany({
        where: { companyId: actor.tenantId },
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
      this.prisma.terminal.findMany({ where: { branchId }, orderBy: { name: "asc" } }),
      this.prisma.printer.findMany({ where: { branchId }, include: { printDestination: true }, orderBy: { name: "asc" } }),
      this.prisma.printDestination.findMany({ where: { branchId, companyId: actor.tenantId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      this.prisma.posSetting.findMany({
        where: { companyId: actor.tenantId, isActive: true, OR: [{ branchId: null }, { branchId }] },
        orderBy: [{ branchId: "desc" }, { updatedAt: "desc" }],
      }),
    ]);

    const terminal = this.resolveTerminal(terminals, requestedTerminalId);
    const warnings: string[] = [];
    if (requestedTerminalId && terminal && terminal.id !== requestedTerminalId) {
      warnings.push("Istenen terminal bulunamadi. Ilk uygun terminal fallback olarak secildi.");
    }
    if (!terminal) {
      warnings.push("Bu sube icin terminal kaydi bulunamadi.");
    }
    const deviceAssignments = terminal
      ? await this.prisma.posDeviceAssignment.findMany({
          where: {
            branchId,
            terminalId: terminal.id,
            isActive: true,
            posDevice: { isActive: true, deletedAt: null },
          },
          include: {
            posDevice: true,
          },
          orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
        })
      : [];
    const defaultDeviceAssignment = deviceAssignments.find((item) => item.isDefault) ?? null;
    const resolvedDeviceAssignment =
      deviceAssignments.find((item) => this.isPosDeviceReady(item.posDevice)) ?? defaultDeviceAssignment;
    if (!defaultDeviceAssignment && resolvedDeviceAssignment) {
      warnings.push("Varsayilan cihaz atamasi bulunamadi. Ilk uygun aktif cihaz fallback olarak secildi.");
    } else if (defaultDeviceAssignment && resolvedDeviceAssignment && defaultDeviceAssignment.id !== resolvedDeviceAssignment.id) {
      warnings.push("Varsayilan cihaz hazir degildi. Baska bir aktif cihaz fallback olarak secildi.");
    } else if (terminal && !resolvedDeviceAssignment) {
      warnings.push("Bu terminal icin hazir durumda bir POS cihazi bulunamadi.");
    }

    const settingsMap = this.buildSettingsMap(activeSettings);
    const hasTerminalSettings = Boolean(terminal && Object.keys(settingsMap.terminals[terminal.id] ?? {}).length > 0);
    const hasDeviceSettings = Boolean(resolvedDeviceAssignment && Object.keys(settingsMap.devices[resolvedDeviceAssignment.posDeviceId] ?? {}).length > 0);
    if (terminal && !hasTerminalSettings) {
      warnings.push("Terminal ayarlari eksik. Sube geneli fallback kullaniliyor.");
    }
    if (resolvedDeviceAssignment && !hasDeviceSettings) {
      warnings.push("Cihaz ayarlari eksik. Sube veya terminal fallback ayarlari kullaniliyor.");
    }

    const defaultPrinterId = this.resolveDefaultPrinterId(settingsMap, terminal?.id, resolvedDeviceAssignment?.posDeviceId);
    const defaultReceiptPrinterId = this.resolveNamedPrinterId(settingsMap, "pos.receiptPrinter", terminal?.id, resolvedDeviceAssignment?.posDeviceId);
    const defaultKitchenPrinterId = this.resolveNamedPrinterId(settingsMap, "pos.kitchenPrinter", terminal?.id, resolvedDeviceAssignment?.posDeviceId);
    const defaultLabelPrinterId = this.resolveNamedPrinterId(settingsMap, "pos.labelPrinter", terminal?.id, resolvedDeviceAssignment?.posDeviceId);

    const printerRows = printers.map((printer) => ({
      id: printer.id,
      branchId: printer.branchId,
      displayName: printer.displayName,
      name: printer.name,
      type: printer.type,
      connectionUri: printer.connectionUri,
      isKitchen: printer.isKitchen,
      isActive: printer.isActive,
      printDestinationId: printer.printDestinationId,
      printDestinationCode: printer.printDestination?.code ?? null,
      isDefault: printer.id === defaultPrinterId || printer.id === defaultReceiptPrinterId,
      isDefaultKitchen: printer.id === defaultKitchenPrinterId,
      isDefaultLabel: printer.id === defaultLabelPrinterId,
      isConfigured: Boolean(printer.connectionUri?.trim()),
    }));
    const resolvedDefaultPrinter = this.resolvePrinterRecord(printerRows, defaultPrinterId ?? defaultReceiptPrinterId, "receipt");
    const resolvedKitchenPrinter = this.resolvePrinterRecord(printerRows, defaultKitchenPrinterId, "kitchen");
    const resolvedLabelPrinter = this.resolvePrinterRecord(printerRows, defaultLabelPrinterId, "label");
    if (!printers.length) {
      warnings.push("Bu sube icin yazici tanimi bulunamadi.");
    } else {
      if ((defaultPrinterId || defaultReceiptPrinterId) && !resolvedDefaultPrinter) {
        warnings.push("Varsayilan fis yazicisi hazir degil.");
      }
      if (defaultKitchenPrinterId && !resolvedKitchenPrinter) {
        warnings.push("Mutfak yazicisi hazir degil.");
      }
      if (defaultLabelPrinterId && !resolvedLabelPrinter) {
        warnings.push("Etiket yazicisi hazir degil.");
      }
    }

    const paymentRows = paymentMethods.map((item) => ({
      id: item.id,
      name: item.name,
      code: item.code,
      providerKey: item.providerKey,
      paymentMethod: item.paymentMethod,
      isActive: item.isActive,
      sortOrder: item.sortOrder,
      feeRate: item.feeRate == null ? null : Number(item.feeRate),
      branchId: item.branchId,
    }));

    const categoryMap = new Map<string, { id: string; name: string; parentId?: string | null }>();
    for (const category of categories) {
      categoryMap.set(category.id, { id: category.id, name: category.name, parentId: category.parentId });
    }
    const isSweetCategory = (categoryId: string) => {
      const current = categoryMap.get(categoryId);
      if (!current) return false;
      const name = current.name.toLowerCase();
      if (name.includes("tatli")) return true;
      const parent = current.parentId ? categoryMap.get(current.parentId) : null;
      return parent ? parent.name.toLowerCase().includes("tatli") : false;
    };
    const isSweetExtrasGroup = (group: { name?: string }) => {
      const name = String(group.name ?? "").toLowerCase();
      return name.includes("tatli") && (name.includes("ekstra") || name.includes("extra"));
    };

    return {
      branchId,
      printDestinations: printDestinations.map((destination) => ({
        id: destination.id,
        code: destination.code,
        name: destination.name,
        isCashRegister: destination.isCashRegister,
        sortOrder: destination.sortOrder,
      })),
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        parentId: category.parentId,
        printerType: category.printerType ?? "kitchen",
      })),
      products: products.map((product) => {
        const branchPrice = product.branchPrices.find((price) => price.branchId === branchId);
        const scopedModifierGroups = modifierGroups.filter((group) => {
          if (!isSweetExtrasGroup(group)) return true;
          return isSweetCategory(product.categoryId);
        });
        return {
          id: product.id,
          categoryId: product.categoryId,
          name: product.name,
          description: product.description,
          price: Number(branchPrice?.price ?? product.basePrice),
          showInQr: product.showInQr,
          stockItemId: product.stockItemId,
          stockTracked: Boolean(product.stockItemId || product.recipe || false),
          variants: product.variants.map((variant) => ({
            id: variant.id,
            name: variant.name,
            priceDiff: Number(variant.priceDiff),
          })),
          modifierGroups: scopedModifierGroups.map((group) => ({
            id: group.id,
            name: group.name,
            selectionMin: group.selectionMin,
            selectionMax: group.selectionMax,
            options: group.options.map((option) => ({
              id: option.id,
              name: option.name,
              priceDiff: Number(option.priceDiff),
              inventoryItemId: option.inventoryItemId,
              stockQuantity: option.stockQuantity == null ? null : Number(option.stockQuantity),
              stockTracked: Boolean(option.inventoryItemId && Number(option.stockQuantity ?? 0) > 0),
            })),
          })),
          requiredChoiceGroups: requiredChoiceGroups.map((group) => ({
            id: group.id,
            name: group.name,
            selectionMin: group.selectionMin,
            selectionMax: group.selectionMax,
            options: group.options.map((option) => ({
              id: option.id,
              name: option.name,
              priceDiff: Number(option.priceDiff),
              inventoryItemId: option.inventoryItemId,
              stockQuantity: option.stockQuantity == null ? null : Number(option.stockQuantity),
              stockTracked: Boolean(option.inventoryItemId && Number(option.stockQuantity ?? 0) > 0),
            })),
          })),
        };
      }),
      presetNotes: presetNotes.map((note) => ({
        id: note.id,
        title: note.title,
        content: note.content,
        noteType: note.noteType,
      })),
      paymentMethods: paymentRows.filter((item) => item.isActive),
      discountTypes: discountTypes.map((item) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        discountType: item.discountType,
        defaultValue: Number(item.defaultValue ?? 0),
        approvalRequired: item.approvalRequired,
        branchId: item.branchId,
      })),
      customers: customers.map((customer) => ({
        id: customer.id,
        fullName: customer.businessName ?? customer.fullName,
        phone: customer.phone,
      })),
      terminals: terminals.map((row) => ({
        id: row.id,
        branchId: row.branchId,
        name: row.name,
        code: row.code,
        ipAddress: row.ipAddress,
        status: row.status,
        heartbeatAt: row.heartbeatAt,
        isSelected: terminal ? row.id === terminal.id : false,
      })),
      printers: printerRows,
      deviceConfig: {
        terminalId: terminal?.id ?? null,
        terminalCode: terminal?.code ?? null,
        terminalName: terminal?.name ?? null,
        defaultDevice: resolvedDeviceAssignment
          ? {
              id: resolvedDeviceAssignment.posDevice.id,
              code: resolvedDeviceAssignment.posDevice.code,
              name: resolvedDeviceAssignment.posDevice.name,
              deviceType: resolvedDeviceAssignment.posDevice.deviceType,
              status: resolvedDeviceAssignment.posDevice.status,
              isFallback: Boolean(defaultDeviceAssignment && defaultDeviceAssignment.id !== resolvedDeviceAssignment.id) || Boolean(!defaultDeviceAssignment),
            }
          : null,
        defaultPrinter: resolvedDefaultPrinter ?? null,
        defaultKitchenPrinter: resolvedKitchenPrinter ?? null,
        defaultLabelPrinter: resolvedLabelPrinter ?? null,
        settings: {
          branch: settingsMap.branch,
          terminal: terminal ? settingsMap.terminals[terminal.id] ?? {} : {},
          device: resolvedDeviceAssignment ? settingsMap.devices[resolvedDeviceAssignment.posDeviceId] ?? {} : {},
        },
        diagnostics: {
          status: !terminal || !resolvedDefaultPrinter ? "warning" : "ok",
          warnings,
          hasTerminalSettings,
          hasDeviceSettings,
          canPrintReceipt: Boolean(resolvedDefaultPrinter),
          canProcessCardPayment: Boolean(resolvedDeviceAssignment && this.isPosDeviceReady(resolvedDeviceAssignment.posDevice)),
          fallbackTerminalUsed: Boolean(requestedTerminalId && terminal && terminal.id !== requestedTerminalId),
          fallbackDeviceUsed:
            Boolean(defaultDeviceAssignment && resolvedDeviceAssignment && defaultDeviceAssignment.id !== resolvedDeviceAssignment.id) ||
            Boolean(!defaultDeviceAssignment && resolvedDeviceAssignment),
        },
      },
      userContext: {
        userId: actor.userId,
        branchIds: actor.branchIds,
        terminalId: terminal?.id ?? null,
        permissions: actor.permissions ?? [],
      },
    };
  }

  async listAdminPaymentMethods(actor: PosActor, query?: { branchId?: string; includeInactive?: string }) {
    const branchId = query?.branchId ? this.resolveBranchId(actor, query.branchId) : undefined;
    const includeInactive = query?.includeInactive === "true";
    const rows = await this.prisma.paymentMethodConfig.findMany({
      where: {
        companyId: actor.tenantId,
        ...(branchId ? { OR: [{ branchId: null }, { branchId }] } : {}),
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: { branch: true },
    });

    return {
      items: rows.map((item) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        providerKey: item.providerKey,
        paymentMethod: item.paymentMethod,
        isActive: item.isActive,
        sortOrder: item.sortOrder,
        feeRate: item.feeRate == null ? null : Number(item.feeRate),
        settingsJson: item.settingsJson,
        branchId: item.branchId,
        branchName: item.branch?.name ?? null,
      })),
    };
  }

  async listAdminDevices(actor: PosActor, query?: { branchId?: string; includeInactive?: string }) {
    const branchId = query?.branchId ? this.resolveBranchId(actor, query.branchId) : undefined;
    const includeInactive = query?.includeInactive === "true";
    const rows = await this.prisma.posDevice.findMany({
      where: {
        deletedAt: null,
        branchId: branchId ? branchId : { in: actor.branchIds },
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        branch: true,
        assignments: {
          where: { isActive: true },
          include: { terminal: true },
          orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
        },
      },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    });

    return {
      items: rows.map((row) => {
        const defaultAssignment = row.assignments.find((item) => item.isDefault);
        return {
          id: row.id,
          branchId: row.branchId,
          branchName: row.branch.name,
          name: row.name,
          code: row.code,
          deviceType: row.deviceType,
          platform: row.platform,
          status: row.status,
          isActive: row.isActive,
          ipAddress: row.ipAddress,
          settingsJson: row.settingsJson,
          capabilitiesJson: row.capabilitiesJson,
          defaultTerminalId: defaultAssignment?.terminalId ?? null,
          defaultTerminalName: defaultAssignment?.terminal?.name ?? null,
        };
      }),
    };
  }

  private resolveBranchId(actor: PosActor, branchId?: string) {
    const resolved = branchId ?? actor.branchIds[0];
    if (!resolved) {
      throw new BadRequestException("Sube secimi gerekli.");
    }
    if (!actor.branchIds.includes(resolved)) {
      throw new BadRequestException("Bu sube icin yetkiniz yok.");
    }
    return resolved;
  }

  private resolveTerminal(terminals: Array<{ id: string; code: string; name: string }>, terminalId?: string) {
    if (!terminals.length) {
      return null;
    }
    if (terminalId) {
      const matched = terminals.find((item) => item.id === terminalId);
      if (matched) {
        return matched;
      }
    }
    return terminals[0];
  }

  private buildSettingsMap(rows: Array<{ key: string; valueJson: any }>) {
    const branch: Record<string, unknown> = {};
    const terminals: Record<string, Record<string, unknown>> = {};
    const devices: Record<string, Record<string, unknown>> = {};

    for (const row of rows) {
      if (row.key.startsWith("pos.terminal.") && row.key.endsWith(".config")) {
        const terminalId = row.key.slice("pos.terminal.".length, -".config".length);
        terminals[terminalId] = typeof row.valueJson === "object" && row.valueJson ? row.valueJson : {};
        continue;
      }
      if (row.key.startsWith("pos.device.") && row.key.endsWith(".config")) {
        const deviceId = row.key.slice("pos.device.".length, -".config".length);
        devices[deviceId] = typeof row.valueJson === "object" && row.valueJson ? row.valueJson : {};
        continue;
      }
      branch[row.key] = row.valueJson;
    }

    return { branch, terminals, devices };
  }

  private resolveDefaultPrinterId(
    settingsMap: ReturnType<PosAdminService["buildSettingsMap"]>,
    terminalId?: string | null,
    deviceId?: string | null,
  ) {
    return (
      this.resolveNamedPrinterId(settingsMap, "pos.defaultPrinter", terminalId, deviceId) ??
      this.resolveNamedPrinterId(settingsMap, "pos.receiptPrinter", terminalId, deviceId)
    );
  }

  private resolveNamedPrinterId(
    settingsMap: ReturnType<PosAdminService["buildSettingsMap"]>,
    key: string,
    terminalId?: string | null,
    deviceId?: string | null,
  ) {
    if (deviceId && typeof settingsMap.devices[deviceId]?.[key] === "string") {
      return settingsMap.devices[deviceId][key] as string;
    }
    if (terminalId && typeof settingsMap.terminals[terminalId]?.[key] === "string") {
      return settingsMap.terminals[terminalId][key] as string;
    }
    return typeof settingsMap.branch[key] === "string" ? (settingsMap.branch[key] as string) : null;
  }

  async getTerminalConnectionDiagnostics(actor: PosActor, query?: { branchId?: string; terminalId?: string }) {
    const config = await this.getBootstrapConfig(actor, query);
    const selectedTerminal =
      (config.terminals as Array<Record<string, unknown>>).find((item) => Boolean(item.isSelected)) ??
      (config.terminals as Array<Record<string, unknown>>)[0] ??
      null;
    const deviceConfig = config.deviceConfig as Record<string, any>;
    const diagnostics = (deviceConfig.diagnostics ?? {}) as Record<string, any>;
    const printerIds = [deviceConfig.defaultPrinter?.id, deviceConfig.defaultKitchenPrinter?.id, deviceConfig.defaultLabelPrinter?.id]
      .filter(Boolean)
      .map((item) => String(item));
    const [recentDeviceLogs, recentPrinterJobs, deviceAssignments] = await Promise.all([
      deviceConfig.defaultDevice?.id
        ? this.prisma.posDeviceLog.findMany({
            where: { posDeviceId: String(deviceConfig.defaultDevice.id), branchId: config.branchId },
            orderBy: { createdAt: "desc" },
            take: 10,
          })
        : Promise.resolve([]),
      this.prisma.printerJob.findMany({
        where: {
          companyId: actor.tenantId,
          branchId: config.branchId,
          ...(printerIds.length ? { printerId: { in: printerIds } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      selectedTerminal?.id
        ? this.prisma.posDeviceAssignment.findMany({
            where: {
              branchId: config.branchId,
              terminalId: String(selectedTerminal.id),
              isActive: true,
              posDevice: { isActive: true, deletedAt: null },
            },
            include: { posDevice: true },
            orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
          })
        : Promise.resolve([]),
    ]);

    return {
      branchId: config.branchId,
      terminal: selectedTerminal
        ? {
            id: String(selectedTerminal.id),
            code: String(selectedTerminal.code ?? ""),
            name: String(selectedTerminal.name ?? ""),
            status: String(selectedTerminal.status ?? "unknown"),
            heartbeatAt: selectedTerminal.heartbeatAt ?? null,
            hasSettings: Boolean(diagnostics.hasTerminalSettings),
          }
        : null,
      device: deviceConfig.defaultDevice
        ? {
            ...deviceConfig.defaultDevice,
            recentLogs: recentDeviceLogs,
          }
        : null,
      printers: ((config.printers as Array<Record<string, any>>) ?? []).map((printer) => ({
        ...printer,
        status: printer.isConfigured ? "ready" : "warning",
        message: printer.isConfigured ? "Yazici config hazir." : "Yazici baglanti adresi eksik.",
      })),
      printerJobs: recentPrinterJobs,
      deviceAssignments: deviceAssignments.map((assignment) => ({
        id: assignment.id,
        posDeviceId: assignment.posDeviceId,
        isDefault: assignment.isDefault,
        isReady: this.isPosDeviceReady(assignment.posDevice),
        deviceName: assignment.posDevice.name,
        deviceCode: assignment.posDevice.code,
        deviceStatus: assignment.posDevice.status,
      })),
      diagnostics,
    };
  }

  private isPosDeviceReady(device: {
    isActive: boolean;
    deletedAt: Date | null;
    connectionType: PosConnectionType | null;
    ipAddress: string | null;
    port: number | null;
  }) {
    if (!device.isActive || device.deletedAt) {
      return false;
    }
    if (!device.connectionType) {
      return false;
    }
    if (device.connectionType === PosConnectionType.NETWORK && (!device.ipAddress || !device.port)) {
      return false;
    }
    return true;
  }

  private resolvePrinterRecord(
    printers: Array<{ id: string; type: string; name: string; isKitchen: boolean; isConfigured?: boolean }>,
    preferredPrinterId: string | null | undefined,
    documentType: "receipt" | "kitchen" | "label",
  ) {
    const readyPrinters = printers.filter((printer) => Boolean(printer.isConfigured));
    if (preferredPrinterId) {
      const preferred = readyPrinters.find((printer) => printer.id === preferredPrinterId);
      if (preferred) {
        return preferred;
      }
    }
    if (!readyPrinters.length) {
      return null;
    }
    if (documentType === "kitchen") {
      return readyPrinters.find((printer) => printer.isKitchen) ?? readyPrinters[0];
    }
    if (documentType === "label") {
      return readyPrinters.find((printer) => `${printer.type} ${printer.name}`.toLowerCase().includes("label")) ?? readyPrinters[0];
    }
    return readyPrinters.find((printer) => !printer.isKitchen) ?? readyPrinters[0];
  }
}
