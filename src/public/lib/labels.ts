// Parses the structured contact labels created by getOrderLabels (Velo backend), e.g.
//   "Course Type:Little Stars"
//   "Course Term:Spring 2026"
//   "Course Year:2026"
//   "Location:Battersea"
//   "Location and Term:Battersea, Spring 2026"
//   "Location and Year:Battersea, 2026"
//   "Type and Term:Little Stars, Spring 2026"
//   "Type and Year:Little Stars, 2026"
// Anything else (e.g. "Free Trial") is grouped under "Other".

export const TERMS = ["Spring", "Summer", "Autumn", "Winter"] as const;

export const STRUCTURED_GROUPS = [
    "Course Type",
    "Course Term",
    "Course Year",
    "Location",
    "Location and Term",
    "Location and Year",
    "Type and Term",
    "Type and Year",
];

export const OTHER_GROUP = "Other";

export interface ParsedLabel {
    group: string;
    value: string;
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

    const parsed: ParsedLabel = { group, value };
    const isType = group === "Course Type" || group.startsWith("Type and");
    const isLocation = group.startsWith("Location");

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

// The label display names whose intersection (contact has ALL of them) best matches the criteria.
// Uses the most specific label available for each side (course type / location).
export function labelNamesForCriteria(c: LabelCriteria): { names: string[]; problem?: string } {
    if (c.term && !c.year) {
        return { names: [], problem: "Pick a year to go with the term." };
    }

    const termYear = c.term && c.year ? `${c.term} ${c.year}` : undefined;
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

    return { names };
}

export function uniqueSorted(values: (string | undefined)[]): string[] {
    return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
}
