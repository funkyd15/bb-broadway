import { contacts, labels } from "@wix/crm";

const pageLimit = 1000;

export interface LabelRow {
    key: string;
    displayName: string;
    labelType: string;
    namespace: string;
    count: number;
    queryFilter: Record<string, any>;
}

export interface LabelSummary {
    labels: LabelRow[];
    totalContacts: number;
    notLabelled: number;
    notLabelledFilter?: Record<string, any>;
}

export interface ContactRow {
    _id: string;
    name: string;
    email: string;
    phone: string;
    company: string;
    labels: string;
    createdDate: string;
    lastActivity: string;
}

// Labels with contact counts. Counts come from the contacts facets endpoint,
// label type / namespace come from the labels endpoint.
export async function loadLabelSummary(statusState: Function): Promise<LabelSummary> {
    statusState("Loading labels...");

    const allLabels: labels.ContactLabel[] = [];
    let offset = 0;
    while (true) {
        const res = await labels.listLabels({ paging: { limit: pageLimit, offset } });
        const page = res.labels || [];
        allLabels.push(...page);
        if (page.length < pageLimit) break;
        offset += pageLimit;
    }

    statusState("Counting contacts per label...");

    const allFacets: contacts.ContactsFacet[] = [];
    offset = 0;
    while (true) {
        const res = await contacts.listFacets({ paging: { limit: pageLimit, offset } });
        const page = res.facets || [];
        allFacets.push(...page);
        if (page.length < pageLimit) break;
        offset += pageLimit;
    }

    const countByKey = new Map<string, contacts.ContactsFacet>();
    allFacets
        .filter(f => f.facetType === "LABEL" && f.facetKey)
        .forEach(f => countByKey.set(f.facetKey as string, f));

    const rows: LabelRow[] = allLabels.filter(l => l.key).map(l => {
        const key = l.key as string;
        const facet = countByKey.get(key);
        return {
            key,
            displayName: l.displayName || key,
            labelType: l.labelType || "",
            namespace: l.namespace || "",
            count: facet?.count || 0,
            queryFilter: facet?.queryFilter || { "info.labelKeys": { $hasSome: [key] } },
        };
    });
    rows.sort((a, b) => b.count - a.count);

    const allFacet = allFacets.find(f => f.facetType === "ALL_CONTACTS");
    const notLabelledFacet = allFacets.find(f => f.facetType === "NOT_LABELED");

    statusState("Ready");

    return {
        labels: rows,
        totalContacts: allFacet?.count || 0,
        notLabelled: notLabelledFacet?.count || 0,
        notLabelledFilter: notLabelledFacet?.queryFilter || undefined,
    };
}

// Contacts filter for a set of label keys: "all" = contact has every label, "any" = at least one.
export function labelKeysFilter(keys: string[], mode: "all" | "any"): Record<string, any> {
    return { "info.labelKeys": { [mode === "all" ? "$hasAll" : "$hasSome"]: keys } };
}

// All contacts matching a contacts query filter (e.g. a label facet's queryFilter).
export async function queryContactsByFilter(
    filter: Record<string, any>,
    labelNames: Map<string, string>,
    statusState: Function
): Promise<ContactRow[]> {
    const all: contacts.Contact[] = [];
    let offset = 0;

    while (true) {
        statusState(`Loading contacts... (${all.length})`);
        const res = await contacts.queryContacts({
            filter,
            paging: { limit: pageLimit, offset },
        } as contacts.ContactQuery);
        const page = res.contacts || [];
        all.push(...page);
        if (page.length < pageLimit) break;
        offset += pageLimit;
    }

    statusState(`Loaded ${all.length} contacts`);

    return all.map(c => {
        const first = c.info?.name?.first || "";
        const last = c.info?.name?.last || "";
        const keys = c.info?.labelKeys?.items || [];
        return {
            _id: c._id || "",
            name: `${first} ${last}`.trim(),
            email: c.primaryInfo?.email || "",
            phone: c.primaryInfo?.phone || "",
            company: c.info?.company || "",
            labels: keys.map(k => labelNames.get(k) || k).sort().join(", "),
            createdDate: c._createdDate ? new Date(c._createdDate).toLocaleDateString("en-GB") : "",
            lastActivity: c.lastActivity?.activityDate
                ? new Date(c.lastActivity.activityDate).toLocaleDateString("en-GB")
                : "",
        };
    });
}
