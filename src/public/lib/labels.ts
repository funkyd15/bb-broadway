// Parses the structured contact labels created by getOrderLabels (Velo backend).
//
// Bookings labels:
//   "Course Type:Little Stars"
//   "Course Term:Spring 2026"
//   "Course Year:2026"
//   "Location:Battersea"
//   "Location and Term:Battersea, Spring 2026"
//   "Location and Year:Battersea, 2026"
//   "Type and Term:Little Stars, Spring 2026"
//   "Type and Year:Little Stars, 2026"
//
// Free trial labels:
//   "Free Trial"                                  (every free trial)
//   "Free Trial Course:Tiny Stars"
//   "Free Trial Term:Spring 2026"
//   "Free Trial Year:2026"
//   "Free Trial Course Term:Tiny Stars, Spring 2026"
//
// Anything else is grouped under "Other".

export const TERMS = ["Spring", "Summer", "Autumn", "Winter"] as const;

export type LabelMode = "bookings" | "freeTrials";

export const BOOKING_GROUPS = [
    "Course Type",
    "Course Term",
    "Course Year",
    "Location",
    "Location and Term",
    "Location and Year",
    "Type and Term",
    "Type and Year",
];

export const FREE_TRIAL_GROUPS = [
    "Free Trial Course",
    "Free Trial Term",
    "Free Trial Year",
    "Free Trial Course Term",
    "Free Trial Location",
];

export const STRUCTURED_GROUPS = [...BOOKING_GROUPS, ...FREE_TRIAL_GROUPS];

export const OTHER_GROUP = "Other";
export const ALL_FREE_TRIALS_LABEL = "Free Trial";

export interface ParsedLabel {
    group: string;
    value: string;
    mode?: LabelMode;
    type?: string;
    location?: string;
    term?: string;
    year?: string;
}

export interface LabelCriteria {
    type?: string;
    location?: string;
    term?: string;
    year?: string;
}

export interface ResolvedLabels {
    names: string[];
    problem?: string;
    // True when the labels are combined (contact has all of them) rather than one exact label,
    // so a contact could match through different bookings.
    approximate?: boolean;
}

const termYearRegex = /^(Spring|Summer|Autumn|Winter)\s+(\d{4})$/i;
const yearRegex = /^\d{4}$/;

function titleCase(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function parseLabel(displayName: string): ParsedLabel {
    const i = displayName.indexOf(":");
    if (i < 0) return { group: OTHER_GROUP, value: displayName };

    const group = displayName.slice(0, i).trim();
    const value = displayName.slice(i + 1).trim();
    if (!STRUCTURED_GROUPS.includes(group)) return { group: OTHER_GROUP, value: displayName };

    const mode: LabelMode = FREE_TRIAL_GROUPS.includes(group) ? "freeTrials" : "bookings";
    const parsed: ParsedLabel = { group, value, mode };
    const isType =
        group === "Course Type" || group.startsWith("Type and") || group.startsWith("Free Trial Course");
    const isLocation = group.includes("Location");

    value.split(",").map(p => p.trim()).filter(Boolean).forEach(part => {
        const termYear = part.match(termYearRegex);
        if (termYear) {
            parsed.term = titleCase(termYear[1]);
            parsed.year = termYear[2];
        } else if (yearRegex.test(part)) {
            parsed.year = part;
        } else if (isType) {
            parsed.type = part;
        } else if (isLocation) {
            parsed.location = part;
        }
    });

    return parsed;
}

function resolveBookings(c: LabelCriteria, termYear?: string): ResolvedLabels {
    const names: string[] = [];

    if (c.type) {
        if (termYear) names.push(`Type and Term:${c.type}, ${termYear}`);
        else if (c.year) names.push(`Type and Year:${c.type}, ${c.year}`);
        else names.push(`Course Type:${c.type}`);
    }

    if (c.location) {
        if (termYear) names.push(`Location and Term:${c.location}, ${termYear}`);
        else if (c.year) names.push(`Location and Year:${c.location}, ${c.year}`);
        else names.push(`Location:${c.location}`);
    }

    if (!c.type && !c.location) {
        if (termYear) names.push(`Course Term:${termYear}`);
        else if (c.year) names.push(`Course Year:${c.year}`);
    }

    return { names, approximate: names.length > 1 };
}

function resolveFreeTrials(c: LabelCriteria, termYear?: string): ResolvedLabels {
    const names: string[] = [];
    let approximate = false;

    if (c.type) {
        if (termYear) {
            names.push(`Free Trial Course Term:${c.type}, ${termYear}`);
        } else if (c.year) {
            // No "course + year" free trial label, so combine course and year.
            names.push(`Free Trial Course:${c.type}`, `Free Trial Year:${c.year}`);
            approximate = true;
        } else {
            names.push(`Free Trial Course:${c.type}`);
        }
    }

    if (c.location) names.push(`Free Trial Location:${c.location}`);

    if (!c.type && !c.location) {
        if (termYear) names.push(`Free Trial Term:${termYear}`);
        else if (c.year) names.push(`Free Trial Year:${c.year}`);
        else names.push(ALL_FREE_TRIALS_LABEL);
    }

    return { names, approximate: approximate || names.length > 1 };
}

// The label display names whose intersection (contact has ALL of them) best matches the criteria.
export function labelNamesForCriteria(c: LabelCriteria, mode: LabelMode = "bookings"): ResolvedLabels {
    if (c.term && !c.year) {
        return { names: [], problem: "Pick a year to go with the term." };
    }
    const termYear = c.term && c.year ? `${c.term} ${c.year}` : undefined;
    return mode === "freeTrials" ? resolveFreeTrials(c, termYear) : resolveBookings(c, termYear);
}

export function uniqueSorted(values: (string | undefined)[]): string[] {
    return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
}
