import React, { useState, useEffect, useMemo, useRef } from "react";
import { Search, X, Check, Clock, Calendar, ChevronRight, Trash2, AlertCircle, Radio } from "lucide-react";
import { supabase } from "./supabaseClient";

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
const T = {
  bg: "#12151A",
  panel: "#1A1F26",
  panelRaised: "#20262E",
  border: "#2A313A",
  borderBright: "#3A434F",
  text: "#E7E9EC",
  textMuted: "#8A94A0",
  textFaint: "#5B6470",
  live: "#5EE6A0",
  busy: "#F0A857",
  focus: "#5FC7DB",
  danger: "#E2685C",
  mono: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 08:00 .. 21:00, lab closes 22:00
const DURATIONS = [1, 2, 3, 4, 5, 6];

const EQUIPMENT = [
  { id: "freeze-dryer", name: "Freeze Dryer FMD1010", cat: "Thermal" },
  { id: "extruder", name: "Triple Screw Extruder IMC-1979", cat: "Processing" },
  { id: "rotavap", name: "Rotary Evaporator Eyela OSB-2100", cat: "Processing" },
  { id: "xrd", name: "XRD Miniflex 600", cat: "Structural" },
  { id: "ftir-is5", name: "Nicolet iS5 FT-IR Spectrometer", cat: "Spectroscopy" },
  { id: "hotpress-new", name: "Hot Press Machine HC300-15", cat: "Processing" },
  { id: "hotpress-old", name: "Hot Press Machine (Old version)", cat: "Processing" },
  { id: "minimixer", name: "Mini Mixer MS-1N 1&2", cat: "Processing" },
  { id: "tensile-18e0", name: "Tensile & Compression Tester IMC-18E0", cat: "Mechanical" },
  { id: "tgdta", name: "EXSTAR TG/DTA 7200", cat: "Thermal" },
  { id: "dsc", name: "EXSTAR DSC 6220", cat: "Thermal" },
  { id: "injection", name: "Injection Molding HAAKE MINIJET PRO", cat: "Processing" },
  { id: "autoclave", name: "Autoclave Tomy LBS-325", cat: "Thermal" },
  { id: "sem", name: "SEM JCM6000", cat: "Structural" },
  { id: "oilbath-1", name: "Oil Bath 1", cat: "Thermal" },
  { id: "oilbath-2", name: "Oil Bath 2", cat: "Thermal" },
  { id: "gpc", name: "GPC HLC-8320", cat: "Spectroscopy" },
  { id: "gcms", name: "GCMS-QP2010", cat: "Spectroscopy" },
  { id: "contrast-micro", name: "Contrast Microscopy KEYENCE VH-Z500", cat: "Structural" },
  { id: "starburst", name: "Star Burst Mini Sugino", cat: "Processing" },
  { id: "afm", name: "NanoNavi E-sweep AFM/DFM", cat: "Structural" },
  { id: "laser-micro", name: "Laser Microscopy Keyence VK-X100", cat: "Structural" },
  { id: "uvvis", name: "UV-vis Genesys 50", cat: "Spectroscopy" },
  { id: "contact-angle", name: "Contact Angle Measurement DMs-401", cat: "Structural" },
  { id: "centrifuge", name: "ST8R Microcentrifuge", cat: "Processing" },
  { id: "ftir-in10", name: "Nicolet iN10 Imaging FTIR", cat: "Spectroscopy" },
  { id: "homogenizer", name: "Ultrasonic Homogenizer LUH150", cat: "Processing" },
  { id: "titrator", name: "KEM Potentiometric Titrator AT-710", cat: "Spectroscopy" },
  { id: "kyowa-tensile", name: "KYOWA Tensile Machine", cat: "Mechanical" },
];

const CATEGORIES = ["All", ...Array.from(new Set(EQUIPMENT.map((e) => e.cat)))];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function hourLabel(h) {
  return `${String(h).padStart(2, "0")}:00`;
}
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}
function currentHourNow() {
  return new Date().getHours() + new Date().getMinutes() / 60;
}

// Maps a Supabase row -> the shape the UI uses
function fromRow(r) {
  return {
    id: r.id,
    equipId: r.equip_id,
    equipName: r.equip_name,
    date: r.date,
    start: r.start_hour,
    end: r.end_hour,
    name: r.booked_by,
  };
}

export default function App() {
  const [name, setName] = useState("");
  const [bookings, setBookings] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [pendingSlot, setPendingSlot] = useState(null);
  const [duration, setDuration] = useState(1);
  const [view, setView] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [clock, setClock] = useState(new Date());

  const nameRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  async function fetchBookings() {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .order("date", { ascending: true })
      .order("start_hour", { ascending: true });
    if (error) {
      setStorageError(true);
      return;
    }
    setStorageError(false);
    setBookings((data || []).map(fromRow));
  }

  // initial load + realtime subscription + light polling fallback
  useEffect(() => {
    let poll;
    (async () => {
      await fetchBookings();
      setLoaded(true);
    })();

    const channel = supabase
      .channel("bookings-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        fetchBookings();
      })
      .subscribe();

    poll = setInterval(fetchBookings, 20000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, []);

  function showToast(msg, tone = "ok") {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2600);
  }

  const filteredEquipment = useMemo(() => {
    return EQUIPMENT.filter((e) => {
      if (catFilter !== "All" && e.cat !== catFilter) return false;
      if (search.trim() && !e.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [search, catFilter]);

  function bookingsFor(equipId, date) {
    return bookings.filter((b) => b.equipId === equipId && b.date === date).sort((a, b) => a.start - b.start);
  }

  function isEquipBusyNow(equipId) {
    const list = bookingsFor(equipId, todayStr());
    const now = currentHourNow();
    return list.some((b) => now >= b.start && now < b.end);
  }

  async function confirmBooking() {
    if (!name.trim()) {
      showToast("Enter your name before booking.", "err");
      nameRef.current?.focus();
      return;
    }
    const start = pendingSlot.hour;
    const end = Math.min(22, start + duration);

    // re-fetch right before writing to reduce race conditions between users
    await fetchBookings();
    const dayBookings = bookingsFor(selected.id, selectedDate);
    const clash = dayBookings.some((b) => overlaps(start, end, b.start, b.end));
    if (clash) {
      showToast("That slot was just taken — pick another.", "err");
      return;
    }

    const { error } = await supabase.from("bookings").insert({
      equip_id: selected.id,
      equip_name: selected.name,
      date: selectedDate,
      start_hour: start,
      end_hour: end,
      booked_by: name.trim(),
    });

    if (error) {
      showToast("Couldn't save the booking — try again.", "err");
      return;
    }

    await fetchBookings();
    setPendingSlot(null);
    showToast(`Booked ${selected.name}, ${hourLabel(start)}–${hourLabel(end)}.`, "ok");
  }

  async function cancelBooking(b) {
    const { error } = await supabase.from("bookings").delete().eq("id", b.id);
    if (error) {
      showToast("Couldn't cancel — try again.", "err");
      return;
    }
    await fetchBookings();
    showToast("Booking cancelled.", "ok");
  }

  const myBookings = useMemo(() => {
    if (!name.trim()) return [];
    return bookings
      .filter((b) => b.name.toLowerCase() === name.trim().toLowerCase())
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  }, [bookings, name]);

  return (
    <div style={styles.app}>
      <style>{css}</style>

      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.brandRow}>
            <Radio size={16} color={T.live} style={{ marginRight: 8 }} />
            <span style={styles.brandTitle}>ANDOU LAB</span>
            <span style={styles.brandSub}>INSTRUMENT LOG</span>
          </div>
          <div style={styles.clockRow}>
            {clock.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            <span style={{ margin: "0 8px", color: T.textFaint }}>·</span>
            {clock.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
        <div style={styles.headerRight}>
          <label style={styles.nameLabel}>BOOKING AS</label>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="your name"
            style={styles.nameInput}
          />
        </div>
      </div>

      {storageError && (
        <div style={styles.errorBanner}>
          <AlertCircle size={14} style={{ marginRight: 6 }} />
          Can't reach the database right now. Check your Supabase URL/key in .env, then reload.
        </div>
      )}

      <div style={styles.tabs}>
        <button
          onClick={() => setView("dashboard")}
          style={{ ...styles.tabBtn, ...(view === "dashboard" ? styles.tabBtnActive : {}) }}
        >
          Equipment
        </button>
        <button
          onClick={() => setView("mine")}
          style={{ ...styles.tabBtn, ...(view === "mine" ? styles.tabBtnActive : {}) }}
        >
          My bookings {myBookings.length > 0 && `(${myBookings.length})`}
        </button>
      </div>

      {view === "dashboard" && (
        <>
          <div style={styles.filterRow}>
            <div style={styles.searchBox}>
              <Search size={14} color={T.textFaint} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search equipment…"
                style={styles.searchInput}
              />
            </div>
            <div style={styles.chipRow}>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCatFilter(c)}
                  style={{ ...styles.chip, ...(catFilter === c ? styles.chipActive : {}) }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {!loaded ? (
            <div style={styles.loading}>Loading log…</div>
          ) : (
            <div style={styles.grid}>
              {filteredEquipment.map((eq) => {
                const busy = isEquipBusyNow(eq.id);
                const todays = bookingsFor(eq.id, todayStr());
                return (
                  <button key={eq.id} style={styles.card} onClick={() => { setSelected(eq); setPendingSlot(null); }}>
                    <div style={styles.cardTop}>
                      <span style={{ ...styles.led, background: busy ? T.busy : T.live, boxShadow: `0 0 8px ${busy ? T.busy : T.live}` }} />
                      <span style={styles.cardCat}>{eq.cat}</span>
                    </div>
                    <div style={styles.cardName}>{eq.name}</div>
                    <div style={styles.cardStatus}>{busy ? "In use now" : "Available now"}</div>
                    <div style={styles.miniTimeline}>
                      {HOURS.map((h) => {
                        const filled = todays.some((b) => h >= b.start && h < b.end);
                        return <span key={h} style={{ ...styles.miniTick, background: filled ? T.busy : T.border }} />;
                      })}
                    </div>
                    <div style={styles.cardFooter}>
                      Today <ChevronRight size={13} />
                    </div>
                  </button>
                );
              })}
              {filteredEquipment.length === 0 && (
                <div style={styles.emptyState}>No equipment matches “{search}”.</div>
              )}
            </div>
          )}
        </>
      )}

      {view === "mine" && (
        <div style={styles.mineWrap}>
          {!name.trim() ? (
            <div style={styles.emptyState}>Enter your name above to see your bookings.</div>
          ) : myBookings.length === 0 ? (
            <div style={styles.emptyState}>No bookings yet, {name.trim()}.</div>
          ) : (
            myBookings.map((b) => (
              <div key={b.id} style={styles.mineRow}>
                <div>
                  <div style={styles.mineEquip}>{b.equipName}</div>
                  <div style={styles.mineTime}>
                    {b.date} · {hourLabel(b.start)}–{hourLabel(b.end)}
                  </div>
                </div>
                <button style={styles.cancelBtn} onClick={() => cancelBooking(b)} title="Cancel booking">
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {selected && (
        <div style={styles.drawerOverlay} onClick={() => { setSelected(null); setPendingSlot(null); }}>
          <div style={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <div style={styles.drawerHeader}>
              <div>
                <div style={styles.drawerCat}>{selected.cat}</div>
                <div style={styles.drawerTitle}>{selected.name}</div>
              </div>
              <button style={styles.iconBtn} onClick={() => { setSelected(null); setPendingSlot(null); }}>
                <X size={16} />
              </button>
            </div>

            <div style={styles.dateRow}>
              <Calendar size={14} color={T.textFaint} />
              <input
                type="date"
                value={selectedDate}
                min={todayStr()}
                onChange={(e) => { setSelectedDate(e.target.value); setPendingSlot(null); }}
                style={styles.dateInput}
              />
            </div>

            <div style={styles.legend}>
              <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: T.border }} /> Open</span>
              <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: T.busy }} /> Booked</span>
              <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: T.focus }} /> Selected</span>
            </div>

            <div style={styles.timelineFull}>
              {HOURS.map((h) => {
                const dayBookings = bookingsFor(selected.id, selectedDate);
                const booking = dayBookings.find((b) => h >= b.start && h < b.end);
                const isPendingStart = pendingSlot?.hour === h;
                return (
                  <div key={h} style={styles.timelineRow}>
                    <span style={styles.timelineHour}>{hourLabel(h)}</span>
                    <button
                      disabled={!!booking}
                      onClick={() => setPendingSlot({ hour: h })}
                      style={{
                        ...styles.timelineCell,
                        background: booking ? T.busy + "22" : isPendingStart ? T.focus + "22" : "transparent",
                        borderColor: booking ? T.busy : isPendingStart ? T.focus : T.border,
                        cursor: booking ? "not-allowed" : "pointer",
                      }}
                    >
                      {booking ? (
                        <span style={{ color: T.busy, fontSize: 12 }}>
                          {booking.name} · {hourLabel(booking.start)}–{hourLabel(booking.end)}
                        </span>
                      ) : isPendingStart ? (
                        <span style={{ color: T.focus, fontSize: 12 }}>Start here</span>
                      ) : (
                        <span style={{ color: T.textFaint, fontSize: 12 }}>Open</span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {pendingSlot && (
              <div style={styles.confirmBar}>
                <div style={styles.durationRow}>
                  <Clock size={13} color={T.textFaint} />
                  <span style={styles.durationLabel}>Duration</span>
                  {DURATIONS.filter((d) => pendingSlot.hour + d <= 22).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      style={{ ...styles.durationChip, ...(duration === d ? styles.durationChipActive : {}) }}
                    >
                      {d}h
                    </button>
                  ))}
                </div>
                <div style={styles.confirmSummary}>
                  {hourLabel(pendingSlot.hour)}–{hourLabel(Math.min(22, pendingSlot.hour + duration))} · {name.trim() || "no name entered"}
                </div>
                <button style={styles.confirmBtn} onClick={confirmBooking}>
                  <Check size={14} style={{ marginRight: 6 }} /> Confirm booking
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div style={{ ...styles.toast, borderColor: toast.tone === "err" ? T.danger : T.live, color: toast.tone === "err" ? T.danger : T.live }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

const styles = {
  app: { fontFamily: T.sans, background: T.bg, color: T.text, minHeight: "100vh", padding: "20px 20px 60px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, borderBottom: `1px solid ${T.border}`, paddingBottom: 16, marginBottom: 16 },
  headerLeft: {},
  brandRow: { display: "flex", alignItems: "center" },
  brandTitle: { fontFamily: T.mono, fontWeight: 700, fontSize: 15, letterSpacing: "0.08em" },
  brandSub: { fontFamily: T.mono, fontSize: 11, color: T.textFaint, marginLeft: 10, letterSpacing: "0.12em" },
  clockRow: { fontFamily: T.mono, fontSize: 12, color: T.textMuted, marginTop: 6 },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  nameLabel: { fontFamily: T.mono, fontSize: 10, color: T.textFaint, letterSpacing: "0.1em" },
  nameInput: { background: T.panel, border: `1px solid ${T.border}`, borderRadius: 6, padding: "8px 12px", color: T.text, fontSize: 13, outline: "none", width: 160 },
  errorBanner: { display: "flex", alignItems: "center", background: "#2A1E1B", border: `1px solid ${T.danger}55`, color: T.danger, fontSize: 12, padding: "8px 12px", borderRadius: 6, marginBottom: 14 },
  tabs: { display: "flex", gap: 8, marginBottom: 16 },
  tabBtn: { fontFamily: T.mono, fontSize: 12, letterSpacing: "0.05em", background: "transparent", border: `1px solid ${T.border}`, color: T.textMuted, padding: "7px 14px", borderRadius: 20, cursor: "pointer" },
  tabBtnActive: { background: T.panelRaised, color: T.text, borderColor: T.borderBright },
  filterRow: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 },
  searchBox: { display: "flex", alignItems: "center", gap: 8, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", minWidth: 220 },
  searchInput: { background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 13, width: "100%" },
  chipRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  chip: { fontFamily: T.mono, fontSize: 11, background: "transparent", border: `1px solid ${T.border}`, color: T.textMuted, padding: "5px 10px", borderRadius: 14, cursor: "pointer" },
  chipActive: { background: T.live + "1A", borderColor: T.live, color: T.live },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 },
  card: { textAlign: "left", background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 },
  cardTop: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  led: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" },
  cardCat: { fontFamily: T.mono, fontSize: 10, color: T.textFaint, letterSpacing: "0.08em" },
  cardName: { fontSize: 13.5, fontWeight: 600, lineHeight: 1.3, color: T.text },
  cardStatus: { fontFamily: T.mono, fontSize: 11, color: T.textMuted },
  miniTimeline: { display: "flex", gap: 2, marginTop: 2 },
  miniTick: { flex: 1, height: 5, borderRadius: 1 },
  cardFooter: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2, fontFamily: T.mono, fontSize: 10, color: T.textFaint, marginTop: 2 },
  loading: { fontFamily: T.mono, color: T.textMuted, fontSize: 13, padding: 30, textAlign: "center" },
  emptyState: { fontFamily: T.mono, color: T.textFaint, fontSize: 13, padding: 30, textAlign: "center", gridColumn: "1 / -1" },
  mineWrap: { display: "flex", flexDirection: "column", gap: 8, maxWidth: 560 },
  mineRow: { display: "flex", justifyContent: "space-between", alignItems: "center", background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 14px" },
  mineEquip: { fontSize: 13.5, fontWeight: 600 },
  mineTime: { fontFamily: T.mono, fontSize: 11, color: T.textMuted, marginTop: 3 },
  cancelBtn: { background: "transparent", border: `1px solid ${T.border}`, color: T.danger, borderRadius: 6, padding: 7, cursor: "pointer", display: "flex" },
  drawerOverlay: { position: "fixed", inset: 0, background: "#000A", display: "flex", justifyContent: "flex-end", zIndex: 50 },
  drawer: { width: "min(420px, 100%)", background: T.bg, borderLeft: `1px solid ${T.border}`, height: "100%", overflowY: "auto", padding: 20 },
  drawerHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  drawerCat: { fontFamily: T.mono, fontSize: 10, color: T.textFaint, letterSpacing: "0.08em" },
  drawerTitle: { fontSize: 16, fontWeight: 700, marginTop: 4, maxWidth: 320 },
  iconBtn: { background: T.panel, border: `1px solid ${T.border}`, color: T.textMuted, borderRadius: 6, padding: 6, cursor: "pointer" },
  dateRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 },
  dateInput: { background: T.panel, border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px", color: T.text, fontFamily: T.mono, fontSize: 12, outline: "none" },
  legend: { display: "flex", gap: 14, marginBottom: 10 },
  legendItem: { display: "flex", alignItems: "center", gap: 5, fontFamily: T.mono, fontSize: 10, color: T.textFaint },
  legendDot: { width: 7, height: 7, borderRadius: "50%", display: "inline-block" },
  timelineFull: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 },
  timelineRow: { display: "flex", alignItems: "center", gap: 8 },
  timelineHour: { fontFamily: T.mono, fontSize: 11, color: T.textFaint, width: 42 },
  timelineCell: { flex: 1, textAlign: "left", border: "1px solid", borderRadius: 6, padding: "7px 10px", background: "transparent" },
  confirmBar: { position: "sticky", bottom: 0, background: T.panelRaised, border: `1px solid ${T.borderBright}`, borderRadius: 10, padding: 14, marginTop: 10 },
  durationRow: { display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" },
  durationLabel: { fontFamily: T.mono, fontSize: 11, color: T.textFaint, marginRight: 4 },
  durationChip: { fontFamily: T.mono, fontSize: 11, background: "transparent", border: `1px solid ${T.border}`, color: T.textMuted, padding: "4px 9px", borderRadius: 12, cursor: "pointer" },
  durationChipActive: { background: T.focus + "1A", borderColor: T.focus, color: T.focus },
  confirmSummary: { fontFamily: T.mono, fontSize: 12, color: T.textMuted, marginBottom: 10 },
  confirmBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", background: T.live, color: "#0A2318", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  toast: { position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: T.panelRaised, border: "1px solid", borderRadius: 8, padding: "10px 16px", fontFamily: T.mono, fontSize: 12, zIndex: 60 },
};

const css = `
  button { font-family: inherit; }
  input::-webkit-calendar-picker-indicator { filter: invert(0.8); }
  * { box-sizing: border-box; }
  ::placeholder { color: ${T.textFaint}; }
  button:hover:not(:disabled) { filter: brightness(1.15); }
  button:focus-visible, input:focus-visible { outline: 2px solid ${T.focus}; outline-offset: 1px; }
  @media (max-width: 480px) {
    .drawer { width: 100% !important; }
  }
`;
