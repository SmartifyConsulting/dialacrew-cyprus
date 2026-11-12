import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/AppShell";
import { EquipmentAdmin } from "@/components/admin/EquipmentAdmin";

export const Route = createFileRoute("/_authenticated/inventory")({ component: InventoryLibrary });

function InventoryLibrary() {
  return <Page title="Inventory" subtitle="Request equipment, track approvals and confirm collection." open><EquipmentAdmin /></Page>;
}
