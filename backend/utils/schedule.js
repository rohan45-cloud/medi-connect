// Everything about a doctor's working hours lives here, so booking,
// rescheduling and the doctor's "Schedule" settings all use the same rules.

const DEFAULT_SCHEDULE = {
    workingDays: [0, 1, 2, 3, 4, 5, 6], // 0 = Sunday ... 6 = Saturday
    startTime: "10:00",
    endTime: "17:00",
    slotMinutes: 30,
    breakStart: "13:00", // "" = no break
    breakEnd: "14:00",
    reservedTimes: [], // slots kept back for walk-ins / emergencies
};

const ALLOWED_SLOT_MINUTES = [15, 20, 30, 45, 60];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const toMinutes = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
};
const pad = (n) => String(n).padStart(2, "0");

// The doctor's schedule, with defaults for anything missing (older doctor records)
function scheduleOf(doctor) {
    const s = (doctor && doctor.schedule) || {};
    const days = Array.isArray(s.workingDays) && s.workingDays.length ? s.workingDays : DEFAULT_SCHEDULE.workingDays;
    return {
        workingDays: [...days].map(Number),
        startTime: s.startTime || DEFAULT_SCHEDULE.startTime,
        endTime: s.endTime || DEFAULT_SCHEDULE.endTime,
        slotMinutes: s.slotMinutes || DEFAULT_SCHEDULE.slotMinutes,
        breakStart: s.breakStart === undefined || s.breakStart === null ? DEFAULT_SCHEDULE.breakStart : s.breakStart,
        breakEnd: s.breakEnd === undefined || s.breakEnd === null ? DEFAULT_SCHEDULE.breakEnd : s.breakEnd,
        reservedTimes: Array.isArray(s.reservedTimes) ? [...s.reservedTimes] : [],
    };
}

function dayOfWeek(dateStr) {
    return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

// Does this doctor work on this date? ("YYYY-MM-DD")
function worksOn(doctor, dateStr) {
    return scheduleOf(doctor).workingDays.includes(dayOfWeek(dateStr));
}

// All possible times in a day for this schedule, e.g. ["10:00", "10:30", ...]
function allTimes(doctor) {
    const s = scheduleOf(doctor);
    const times = [];
    const hasBreak = s.breakStart && s.breakEnd;
    for (let m = toMinutes(s.startTime); m + s.slotMinutes <= toMinutes(s.endTime); m += s.slotMinutes) {
        if (hasBreak && m < toMinutes(s.breakEnd) && m + s.slotMinutes > toMinutes(s.breakStart)) continue;
        times.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
    }
    return times;
}

// The times PATIENTS may book: all times minus the ones the doctor reserved for walk-ins.
function patientTimes(doctor) {
    const reserved = new Set(scheduleOf(doctor).reservedTimes);
    return allTimes(doctor).filter((t) => !reserved.has(t));
}

// Checks what a doctor typed in the Schedule form.
// Returns { error } or { value } (clean schedule).
function validateSchedule(input) {
    if (!input || typeof input !== "object") return { error: "Invalid schedule." };

    const days = input.workingDays;
    if (!Array.isArray(days) || days.length === 0 || !days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
        return { error: "Choose at least one working day." };
    }

    const { startTime, endTime } = input;
    if (!TIME_RE.test(startTime || "") || !TIME_RE.test(endTime || "")) {
        return { error: "Start and end time must look like 09:30." };
    }
    if (toMinutes(startTime) >= toMinutes(endTime)) return { error: "End time must be after start time." };

    const slotMinutes = Number(input.slotMinutes);
    if (!ALLOWED_SLOT_MINUTES.includes(slotMinutes)) {
        return { error: `Slot length must be one of ${ALLOWED_SLOT_MINUTES.join(", ")} minutes.` };
    }

    let breakStart = input.breakStart || "";
    let breakEnd = input.breakEnd || "";
    if (breakStart || breakEnd) {
        if (!TIME_RE.test(breakStart) || !TIME_RE.test(breakEnd) || toMinutes(breakStart) >= toMinutes(breakEnd)) {
            return { error: "Break must have a start and an end, and the end must be after the start." };
        }
    }

    const value = {
        workingDays: [...new Set(days)].sort((a, b) => a - b),
        startTime,
        endTime,
        slotMinutes,
        breakStart,
        breakEnd,
        reservedTimes: [],
    };

    const everyTime = allTimes({ schedule: value });
    if (everyTime.length === 0) return { error: "These hours leave no bookable slots." };

    // reserved slots: must be real slot times. Times that no longer exist (after changing hours) are dropped.
    if (input.reservedTimes !== undefined) {
        if (!Array.isArray(input.reservedTimes) || input.reservedTimes.some((t) => typeof t !== "string")) {
            return { error: "Reserved slots are invalid." };
        }
        value.reservedTimes = [...new Set(input.reservedTimes)].filter((t) => everyTime.includes(t)).sort();
    }
    return { value };
}

module.exports = { DEFAULT_SCHEDULE, scheduleOf, worksOn, allTimes, patientTimes, validateSchedule, dayOfWeek };