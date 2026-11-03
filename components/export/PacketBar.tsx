"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Field, StatusMessage } from "@/components/ui";
import {
  bindExportPacketTarget,
  deletePacket,
  duplicatePacket,
  EMPTY_PACKET_SNAPSHOT,
  getExportPacketTarget,
  listPackets,
  loadPacket,
  packetSnapshotIsDirty,
  readPacketLoadResult,
  removedEntryNotice,
  savePacket,
  subscribeExportPacketTarget,
  uiPacketSnapshot,
  validatePacketName,
  type Packet,
  type PacketLoadResult,
  type PacketSettings,
  type PacketSnapshot,
  type PacketTargetHandlers,
} from "@/lib/packets";

type PendingAction = "save" | "create" | "duplicate" | "delete" | "load";

type Notice = {
  tone: "error" | "success" | "info" | "warning";
  text: string;
};

export type PacketBarProps = {
  getCurrent?: () => PacketSnapshot;
  onLoad?: (settings: PacketSettings, achievementIds: string[]) => number | PacketLoadResult;
};

const SERVER_TARGET = null;

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatSavedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Last saved";
  return `Last saved ${new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)}`;
}

function optionLabel(packet: Packet): string {
  const date = new Date(packet.updated_at);
  if (Number.isNaN(date.getTime())) return packet.name;
  const stamp = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${packet.name} · ${stamp}`;
}

export function useBindPacketTarget(handlers: PacketTargetHandlers): void {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    return bindExportPacketTarget({
      getCurrent: () => handlersRef.current.getCurrent(),
      onLoad: (settings, achievementIds) => handlersRef.current.onLoad(settings, achievementIds),
      hasLocalEdits: () => handlersRef.current.hasLocalEdits(),
      blockReason: () => handlersRef.current.blockReason(),
    });
  }, []);
}

export function PacketBar({ getCurrent: getCurrentProp, onLoad: onLoadProp }: PacketBarProps) {
  const bound = useSyncExternalStore(
    subscribeExportPacketTarget,
    getExportPacketTarget,
    () => SERVER_TARGET,
  );
  const getCurrent = getCurrentProp ?? bound?.getCurrent;
  const onLoad = onLoadProp ?? bound?.onLoad;
  const hasLocalEdits = bound?.hasLocalEdits;
  const blockReason = bound?.blockReason;
  const ready = Boolean(getCurrent && onLoad);

  const [packets, setPackets] = useState<Packet[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listReload, setListReload] = useState(0);
  const [loaded, setLoaded] = useState<Packet | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [status, setStatus] = useState<Notice | null>(null);
  const [dropNotice, setDropNotice] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [pendingLoadId, setPendingLoadId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const baselineRef = useRef<PacketSnapshot>(EMPTY_PACKET_SNAPSHOT);

  function setBaseline(next: PacketSnapshot) {
    baselineRef.current = next;
  }

  useEffect(() => {
    let active = true;

    void listPackets()
      .then((next) => {
        if (!active) return;
        setPackets(next);
        setListError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setListError(messageOf(error, "Could not load saved packets."));
      })
      .finally(() => {
        if (active) setListLoading(false);
      });

    return () => {
      active = false;
    };
  }, [listReload]);

  function pageIsDirty(): boolean {
    if (!getCurrent) return false;
    const current = getCurrent();
    if (packetSnapshotIsDirty(current, baselineRef.current)) return true;
    return hasLocalEdits?.() ?? false;
  }

  function remember(packet: Packet) {
    setPackets((current) => [packet, ...current.filter((item) => item.id !== packet.id)]);
  }

  async function openPacket(id: string) {
    if (!onLoad || pending) return;
    setPending("load");
    setStatus(null);
    try {
      const packet = await loadPacket(id);
      if (!packet) throw new Error("That packet could not be found.");
      const applied = readPacketLoadResult(
        onLoad(packet.settings, packet.achievementIds),
        packet.achievementIds,
      );
      setLoaded(packet);
      remember(packet);
      setBaseline(uiPacketSnapshot(packet.settings, applied.achievementIds));
      setPendingLoadId(null);
      setConfirmingDelete(false);
      setNaming(false);
      setDropNotice(removedEntryNotice(applied.dropped));
      setStatus({ tone: "success", text: `Loaded "${packet.name}".` });
    } catch (error) {
      setStatus({ tone: "error", text: messageOf(error, "Could not load that packet.") });
    } finally {
      setPending(null);
    }
  }

  function choosePacket(id: string) {
    if (pending) return;
    setStatus(null);
    setNameError(null);
    if (!id || id === loaded?.id) {
      setPendingLoadId(null);
      return;
    }
    if (!ready) {
      setStatus({
        tone: "error",
        text: "The export page is not ready yet. Try again in a moment.",
      });
      return;
    }
    try {
      if (pageIsDirty()) {
        setConfirmingDelete(false);
        setNaming(false);
        setPendingLoadId(id);
        return;
      }
    } catch (error) {
      setStatus({ tone: "error", text: messageOf(error, "Could not read the export page.") });
      return;
    }
    setPendingLoadId(null);
    void openPacket(id);
  }

  function blockedReason(): string | null {
    return blockReason?.() ?? null;
  }

  async function saveLoaded() {
    if (!loaded || !getCurrent || pending) return;
    const blocked = blockedReason();
    if (blocked) {
      setStatus({ tone: "error", text: blocked });
      return;
    }
    let current: PacketSnapshot;
    try {
      current = getCurrent();
    } catch (error) {
      setStatus({ tone: "error", text: messageOf(error, "Could not read the export page.") });
      return;
    }

    setPending("save");
    setStatus(null);
    setDropNotice(null);
    setNaming(false);
    setPendingLoadId(null);
    setConfirmingDelete(false);
    try {
      const saved = await savePacket({
        id: loaded.id,
        name: loaded.name,
        settings: current.settings,
        achievementIds: current.achievementIds,
        extraSettings: loaded.extraSettings,
      });
      setLoaded(saved);
      setBaseline(current);
      remember(saved);
      setStatus({ tone: "success", text: "Saved." });
    } catch (error) {
      setStatus({ tone: "error", text: messageOf(error, "Could not save this packet.") });
    } finally {
      setPending(null);
    }
  }

  async function saveAsNew(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!getCurrent || pending) return;
    const blocked = blockedReason();
    if (blocked) {
      setNameError(null);
      setStatus({ tone: "error", text: blocked });
      return;
    }

    let name = "";
    try {
      name = validatePacketName(draftName);
      setNameError(null);
    } catch (error) {
      setNameError(messageOf(error, "Enter a name for this packet."));
      return;
    }

    let current: PacketSnapshot;
    try {
      current = getCurrent();
    } catch (error) {
      setStatus({ tone: "error", text: messageOf(error, "Could not read the export page.") });
      return;
    }

    setPending("create");
    setStatus(null);
    setDropNotice(null);
    try {
      const saved = await savePacket({
        name,
        settings: {
          ...(loaded?.settings ?? {}),
          ...current.settings,
        },
        achievementIds: current.achievementIds,
        extraSettings: loaded?.extraSettings,
      });
      setLoaded(saved);
      setBaseline(current);
      remember(saved);
      setNaming(false);
      setDraftName("");
      setStatus({ tone: "success", text: `Saved as "${saved.name}".` });
    } catch (error) {
      setStatus({ tone: "error", text: messageOf(error, "Could not save this packet.") });
    } finally {
      setPending(null);
    }
  }

  async function duplicateLoaded() {
    if (!loaded || pending) return;
    setPending("duplicate");
    setStatus(null);
    setDropNotice(null);
    setNaming(false);
    setPendingLoadId(null);
    setConfirmingDelete(false);
    try {
      const copy = await duplicatePacket(loaded.id);
      setLoaded(copy);
      remember(copy);
      setStatus({ tone: "success", text: `Duplicated as "${copy.name}".` });
    } catch (error) {
      setStatus({ tone: "error", text: messageOf(error, "Could not duplicate this packet.") });
    } finally {
      setPending(null);
    }
  }

  async function removeLoaded() {
    if (!loaded || pending) return;
    const current = loaded;
    setPending("delete");
    setStatus(null);
    try {
      await deletePacket(current.id);
      setPackets((items) => items.filter((packet) => packet.id !== current.id));
      setLoaded(null);
      setBaseline(EMPTY_PACKET_SNAPSHOT);
      setConfirmingDelete(false);
      setDropNotice(null);
      setStatus({ tone: "success", text: `Deleted "${current.name}".` });
    } catch (error) {
      setStatus({ tone: "error", text: messageOf(error, "Could not delete that packet.") });
    } finally {
      setPending(null);
    }
  }

  const promptOpen = naming || Boolean(pendingLoadId) || confirmingDelete;
  const controlsDisabled = !ready || listLoading || pending !== null || promptOpen;
  const pendingPacket = packets.find((packet) => packet.id === pendingLoadId) ?? null;

  return (
    <section className="card space-y-4" aria-label="Saved packets">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="font-serif text-2xl">Saved packets</p>
          <p className="text-sm text-muted">
            Save this selection, then reopen or duplicate it for the next application.
          </p>
        </div>
        <p className="text-sm text-muted">
          {loaded ? formatSavedAt(loaded.updated_at) : "Not saved yet"}
        </p>
      </div>

      {listLoading ? <StatusMessage tone="info">Loading saved packets…</StatusMessage> : null}
      {listError ? (
        <div className="space-y-3">
          <StatusMessage tone="error">{listError}</StatusMessage>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setListError(null);
              setListLoading(true);
              setListReload((value) => value + 1);
            }}
            disabled={listLoading || pending !== null}
          >
            {listLoading ? "Loading…" : "Try again"}
          </button>
        </div>
      ) : null}

      <label className="space-y-1.5 text-sm font-semibold" htmlFor="packet-select">
        Saved packet
        <select
          id="packet-select"
          className="field-input font-normal"
          value={loaded?.id ?? ""}
          onChange={(event) => choosePacket(event.target.value)}
          disabled={controlsDisabled || packets.length === 0}
        >
          <option value="">{packets.length === 0 ? "No saved packets yet" : "Choose a saved packet"}</option>
          {packets.map((packet) => (
            <option key={packet.id} value={packet.id}>
              {optionLabel(packet)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void saveLoaded()}
          disabled={controlsDisabled || !loaded}
        >
          {pending === "save" ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            if (!getCurrent || pending) return;
            let suggestion = "";
            try {
              suggestion = getCurrent().settings.applicationName.trim();
            } catch {
              suggestion = "";
            }
            setDraftName(suggestion.slice(0, 80));
            setNameError(null);
            setStatus(null);
            setPendingLoadId(null);
            setConfirmingDelete(false);
            setNaming(true);
          }}
          disabled={controlsDisabled}
        >
          Save as new
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void duplicateLoaded()}
          disabled={controlsDisabled || !loaded}
        >
          {pending === "duplicate" ? "Duplicating…" : "Duplicate"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setNaming(false);
            setPendingLoadId(null);
            setStatus(null);
            setConfirmingDelete(true);
          }}
          disabled={controlsDisabled || !loaded}
        >
          Delete
        </button>
      </div>

      {naming ? (
        <form className="space-y-3" onSubmit={(event) => void saveAsNew(event)} noValidate>
          <Field label="Packet name" htmlFor="packet-name" error={nameError ?? undefined}>
            <input
              id="packet-name"
              className="field-input"
              value={draftName}
              onChange={(event) => {
                setDraftName(event.target.value);
                setNameError(null);
              }}
              maxLength={80}
              disabled={pending !== null}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary" disabled={pending !== null || !ready}>
              {pending === "create" ? "Saving…" : "Save packet"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setNaming(false);
                setNameError(null);
                setDraftName("");
              }}
              disabled={pending !== null}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {pendingLoadId ? (
        <div className="space-y-3 rounded-md border border-warning/40 bg-warning-soft p-3">
          <p className="text-sm text-warning">
            This page has unsaved changes. Load &quot;{pendingPacket?.name ?? "this packet"}&quot; anyway?
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void openPacket(pendingLoadId)}
              disabled={pending !== null}
            >
              {pending === "load" ? "Loading packet…" : "Load packet"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPendingLoadId(null)}
              disabled={pending !== null}
            >
              Keep editing
            </button>
          </div>
        </div>
      ) : null}

      {confirmingDelete && loaded ? (
        <div className="space-y-3 rounded-md border border-danger/30 bg-danger-soft p-3">
          <p className="text-sm text-danger">
            Delete &quot;{loaded.name}&quot;? This cannot be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => void removeLoaded()}
              disabled={pending !== null}
            >
              {pending === "delete" ? "Deleting…" : "Delete packet"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirmingDelete(false)}
              disabled={pending !== null}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {dropNotice ? <StatusMessage tone="warning">{dropNotice}</StatusMessage> : null}
      {status ? <StatusMessage tone={status.tone}>{status.text}</StatusMessage> : null}
    </section>
  );
}
