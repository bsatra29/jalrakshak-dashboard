import { collection, doc } from "firebase/firestore";
import { audited } from "./audit";
import { getDb } from "./firebase";
import type { Alert, Cartridge, CitizenReport, FieldTest, FieldTestType, MaintenanceEntry, Officer, Unit } from "./types";

/**
 * Every write the dashboard makes goes through `audited`, which commits the
 * change and its hash-chained audit line in one transaction.
 */

export function acknowledgeAlert(officer: Officer, alert: Alert) {
  const now = Date.now();
  return audited(officer, "alert.acknowledge", `alerts/${alert.id}`, { unitId: alert.unitId, type: alert.type, raisedAt: alert.raisedAt, responseMs: now - alert.raisedAt }, [
    { ref: doc(getDb(), "alerts", alert.id), mode: "update", data: { acknowledgedBy: officer.name, acknowledgedByUid: officer.uid, acknowledgedAt: now } },
  ]);
}

export function acknowledgeReport(officer: Officer, report: CitizenReport) {
  const now = Date.now();
  return audited(officer, "citizenReport.acknowledge", `citizenReports/${report.id}`, { unitId: report.unitId, type: report.type, reportedAt: report.reportedAt, responseMs: now - report.reportedAt }, [
    { ref: doc(getDb(), "citizenReports", report.id), mode: "update", data: { acknowledgedBy: officer.name, acknowledgedByUid: officer.uid, acknowledgedAt: now } },
  ]);
}

export function enterLabResult(
  officer: Officer,
  test: FieldTest,
  result: "pass" | "fail",
  value: number | null,
  notes: string,
) {
  const now = Date.now();
  const data: Record<string, unknown> = { status: "resulted", result, value, resultDate: now, enteredBy: officer.name };
  if (notes) data.notes = notes;
  return audited(officer, "fieldTest.result", `fieldTests/${test.id}`, { unitId: test.unitId, sampleId: test.sampleId, type: test.type, result, value }, [
    { ref: doc(getDb(), "fieldTests", test.id), mode: "update", data },
  ]);
}

export function requestSample(officer: Officer, unit: Unit, type: FieldTestType) {
  const db = getDb();
  const ref = doc(collection(db, "fieldTests"));
  const now = Date.now();
  const stamp = new Date(now).toISOString().slice(0, 10).replaceAll("-", "");
  const sampleId = `${type.slice(0, 3).toUpperCase()}-${unit.id}-${stamp}-${ref.id.slice(0, 4).toUpperCase()}`;
  const data: Omit<FieldTest, "id"> = {
    unitId: unit.id,
    sampleId,
    type,
    gps: { lat: unit.lat, lng: unit.lng },
    collectedDate: now,
    status: "pending",
    result: null,
    value: null,
    resultDate: null,
    enteredBy: null,
    notes: `Requested by ${officer.name}`,
  };
  return audited(officer, "fieldTest.request", `fieldTests/${ref.id}`, { unitId: unit.id, sampleId, type }, [{ ref, mode: "set", data }]);
}

export function logMaintenance(officer: Officer, unit: Unit, kind: MaintenanceEntry["kind"], note: string) {
  const ref = doc(collection(getDb(), "units", unit.id, "maintenance"));
  const data: Omit<MaintenanceEntry, "id"> = { unitId: unit.id, timestamp: Date.now(), kind, note, officerName: officer.name };
  return audited(officer, "maintenance.log", `units/${unit.id}/maintenance/${ref.id}`, { unitId: unit.id, kind, note }, [{ ref, mode: "set", data }]);
}

export function setDisposal(officer: Officer, cartridge: Cartridge, disposal: "collected" | "disposed") {
  return audited(officer, "cartridge.disposal", `cartridges/${cartridge.id}`, { unitId: cartridge.unitId, mediaType: cartridge.mediaType, disposal }, [
    { ref: doc(getDb(), "cartridges", cartridge.id), mode: "update", data: { disposal } },
  ]);
}

export function logExport(officer: Officer, what: string, sha256: string, details: Record<string, unknown>) {
  return audited(officer, `export.${what}`, "export", { sha256, ...details });
}
