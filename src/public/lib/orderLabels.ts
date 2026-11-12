// Labels contacts from their Wix Bookings orders.
//
// Rebuild of the Velo backend labelBookingsOrder (bb-broadway-site, backend/orders.web.js),
// which runs on every new order. Keep the label rules here and in Velo the same.
//
// Changes from the Velo version, to make re-labelling past orders reliable:
// - Coupon codes are matched without caring about capitals.
// - A booking with no business location still gets its other labels.
// - One failing order never stops the rest, and every result is reported.
// - Labels are looked up once and reused across orders.
// - Preview reads every buyer's current labels (1,000 contacts per call) and compares,
//   so it shows only the labels each contact is really missing. Labels are never removed.

import { orders } from "@wix/ecom";
import { extendedBookings } from "@wix/bookings";
import { contacts, labels } from "@wix/crm";
import { items } from "@wix/data";
import { wixAppIds } from "./utilities";

const pageLimit = 100;
const contactPageLimit = 1000;
const batchSize = 5;

export interface OrderLabelResult {
    orderId: string;
    orderNumber: string;
    createdDate: string;
    contactId: string;
    buyerName: string;
    buyerEmail: string;
    // Every label this order should give its buyer.
    labels: string[];
    // The labels the buyer's contact doesn't have yet (worked out in Preview).
    missing: string[];
    // ready = has labels to add; current = contact already has them all.
    status: "ready" | "current" | "skipped" | "labelled" | "failed";
    message?: string;
}

interface LookupData {
    locations: Map<string, string>;
    courseTypes: { label: string; findText: string }[];
}

type Status = (s: string) => void;

function titleCase(s: string) {
    return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

async function queryAll(collection: string): Promise<any[]> {
    const all: any[] = [];
    let res = await items.query(collection).limit(1000).find();
    all.push(...res.items);
    while (res.hasNext()) {
        res = await res.next();
        all.push(...res.items);
    }
    return all;
}

export interface UnlabelledLocation {
    id: string;
    name: string;
    address: string;
}

// Locations in the "locations" CMS collection with no label. Bookings at these get no location labels.
export async function findUnlabelledLocations(): Promise<UnlabelledLocation[]> {
    const all = await queryAll("locations");
    return all
        .filter(i => !i.archived && !String(i.label || "").trim())
        .map(i => ({ id: i._id, name: String(i.name || i._id), address: String(i.address?.formatted || "") }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

// The client's typing often has trailing or double spaces: tidy every text value before using it.
export function clean(value: unknown): string {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function loadLookupData(): Promise<LookupData> {
    const [locationItems, courseTypeItems] = await Promise.all([queryAll("locations"), queryAll("courseTypeLabels")]);
    return {
        locations: new Map(locationItems.filter(i => clean(i.label)).map(i => [i._id, clean(i.label)])),
        courseTypes: courseTypeItems
            .filter(i => clean(i.label) && clean(i.findText))
            .map(i => ({ label: clean(i.label), findText: clean(i.findText).toLowerCase() })),
    };
}

// Every order created on or after the date, oldest first.
async function loadOrdersSince(since: Date, status: Status): Promise<orders.Order[]> {
    const all: orders.Order[] = [];
    let res = await orders.searchOrders({
        filter: { createdDate: { $gte: since.toISOString() } },
        sort: [{ fieldName: "createdDate", order: "ASC" }],
        cursorPaging: { limit: pageLimit },
    } as any);
    all.push(...(res.orders || []));
    status(`Loading orders... (${all.length})`);
    while (res.metadata?.hasNext && res.metadata?.cursors?.next) {
        res = await orders.searchOrders({ cursorPaging: { cursor: res.metadata.cursors.next, limit: pageLimit } });
        all.push(...(res.orders || []));
        status(`Loading orders... (${all.length})`);
    }
    return all;
}

// Business location id for each booking id.
async function loadBookingLocations(bookingIds: string[]): Promise<Map<string, string | undefined>> {
    const locations = new Map<string, string | undefined>();
    for (let i = 0; i < bookingIds.length; i += pageLimit) {
        const ids = bookingIds.slice(i, i + pageLimit);
        const res = await extendedBookings.queryExtendedBookings({
            filter: { _id: { $in: ids } },
            cursorPaging: { limit: pageLimit },
        } as any);
        (res.extendedBookings || []).forEach((e: any) => {
            const entity = e.booking?.bookedEntity;
            const locationId = entity?.slot?.location?._id || entity?.schedule?.location?._id || undefined;
            if (e.booking?._id) locations.set(e.booking._id, locationId);
        });
    }
    return locations;
}

function bookingsLineItems(order: orders.Order) {
    return (order.lineItems || []).filter(l => l.catalogReference?.appId === wixAppIds.wixBookings);
}

// The same label rules as the Velo labelBookingsOrder.
export function labelsForOrder(
    order: orders.Order,
    bookingLocations: Map<string, string | undefined>,
    lookup: LookupData
): string[] {
    const out: string[] = [];
    const add = (label: string | false | null | undefined) => {
        if (label) out.push(label);
    };

    let earlybird = false;
    let freetrial = false;
    let sibling = false;
    (order.appliedDiscounts || []).forEach(d => {
        const code = clean(d.coupon?.code).toLowerCase();
        if (code === "freetrial") {
            add("Free Trial");
            freetrial = true;
        }
        if (code.startsWith("sib")) {
            add("Sibling Discount");
            sibling = true;
        }
        if (code.startsWith("earlybird")) {
            add("Early Bird Discount");
            earlybird = true;
        }
    });

    bookingsLineItems(order).forEach(item => {
        const name = clean(item.productName?.original).toLowerCase();
        const bookingId = item.catalogReference?.catalogItemId || "";
        const locationId = bookingLocations.get(bookingId);
        const locationLabel = locationId ? lookup.locations.get(locationId) : undefined;

        const courseTypeLabel = lookup.courseTypes.find(c => name.includes(c.findText))?.label;
        const seasonMatch = name.match(/(Spring|Summer|Autumn|Winter) \d{4}/i);
        const seasonAndYear = seasonMatch ? titleCase(seasonMatch[0]) : undefined;
        const year = name.match(/\b\d{4}\b/)?.[0];

        add(seasonAndYear && `Course Term:${seasonAndYear}`);
        add(courseTypeLabel && `Course Type:${courseTypeLabel}`);
        add(year && `Course Year:${year}`);

        add(earlybird && seasonAndYear && `Early Bird Term:${seasonAndYear}`);
        add(earlybird && year && `Early Bird Year:${year}`);

        add(freetrial && seasonAndYear && `Free Trial Term:${seasonAndYear}`);
        add(freetrial && year && `Free Trial Year:${year}`);
        add(freetrial && courseTypeLabel && `Free Trial Course:${courseTypeLabel}`);
        add(freetrial && courseTypeLabel && seasonAndYear && `Free Trial Course Term:${courseTypeLabel}, ${seasonAndYear}`);
        add(
            freetrial && courseTypeLabel && seasonAndYear && locationLabel &&
                `Free Trial:${courseTypeLabel}, ${locationLabel}, ${seasonAndYear}`
        );

        add(locationLabel && `Location:${locationLabel}`);
        add(locationLabel && year && `Location and Year:${locationLabel}, ${year}`);
        add(locationLabel && seasonAndYear && `Location and Term:${locationLabel}, ${seasonAndYear}`);

        add(sibling && seasonAndYear && `Sibling Term:${seasonAndYear}`);
        add(sibling && year && `Sibling Year:${year}`);

        add(
            courseTypeLabel && seasonAndYear && locationLabel &&
                `Type, Location and Term:${courseTypeLabel}, ${locationLabel}, ${seasonAndYear}`
        );
        add(courseTypeLabel && seasonAndYear && `Type and Term:${courseTypeLabel}, ${seasonAndYear}`);
        add(courseTypeLabel && year && `Type and Year:${courseTypeLabel}, ${year}`);
    });

    return [...new Set(out.map(clean))];
}

// Step 1: work out the labels for every bookings order since the date. Changes nothing.
export async function previewOrderLabels(since: Date, status: Status): Promise<OrderLabelResult[]> {
    status("Loading locations and course types...");
    const lookup = await loadLookupData();

    const allOrders = await loadOrdersSince(since, status);
    const bookingOrders = allOrders.filter(o => bookingsLineItems(o).length > 0);

    status(`Loading bookings for ${bookingOrders.length} orders...`);
    const bookingIds = [
        ...new Set(bookingOrders.flatMap(o => bookingsLineItems(o).map(l => l.catalogReference?.catalogItemId || ""))),
    ].filter(Boolean);
    const bookingLocations = await loadBookingLocations(bookingIds);

    const results: OrderLabelResult[] = bookingOrders.map(order => {
        const contactId = order.buyerInfo?.contactId || "";
        const first = order.billingInfo?.contactDetails?.firstName || "";
        const last = order.billingInfo?.contactDetails?.lastName || "";
        const base = {
            orderId: order._id || "",
            orderNumber: order.number || "",
            createdDate: order._createdDate ? new Date(order._createdDate).toLocaleDateString("en-GB") : "",
            contactId,
            buyerName: `${first} ${last}`.trim(),
            buyerEmail: order.buyerInfo?.email || "",
            missing: [] as string[],
        };
        try {
            const orderLabels = labelsForOrder(order, bookingLocations, lookup);
            if (!contactId) return { ...base, labels: orderLabels, status: "skipped", message: "Order has no contact" };
            if (!orderLabels.length) return { ...base, labels: [], status: "skipped", message: "No labels for this order" };
            return { ...base, labels: orderLabels, status: "ready" };
        } catch (error) {
            return { ...base, labels: [], status: "failed", message: (error as Error)?.message || String(error) };
        }
    });

    // Compare with what each buyer already has.
    const contactIds = [...new Set(results.filter(r => r.status === "ready").map(r => r.contactId))];
    status(`Checking the current labels of ${contactIds.length} contacts...`);
    const [labelKeyByName, contactKeys] = await Promise.all([
        loadLabelKeysByName(),
        loadContactLabelKeys(contactIds, status),
    ]);

    results.forEach(r => {
        if (r.status !== "ready") return;
        const has = contactKeys.get(r.contactId);
        if (!has) {
            r.status = "failed";
            r.message = "Contact not found";
            return;
        }
        r.missing = r.labels.filter(name => {
            const key = labelKeyByName.get(clean(name).toLowerCase());
            return !key || !has.has(key);
        });
        if (!r.missing.length) r.status = "current";
    });

    status(`Checked ${results.length} bookings orders since ${since.toLocaleDateString("en-GB")}.`);
    return results;
}

// Every label on the site, by lower-case display name.
async function loadLabelKeysByName(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    let offset = 0;
    while (true) {
        const res = await labels.listLabels({ paging: { limit: contactPageLimit, offset } });
        const page = res.labels || [];
        page.forEach(l => l.key && l.displayName && map.set(clean(l.displayName).toLowerCase(), l.key));
        if (page.length < contactPageLimit) break;
        offset += contactPageLimit;
    }
    return map;
}

// The current label keys of each contact, 1,000 contacts per call.
async function loadContactLabelKeys(contactIds: string[], status: Status): Promise<Map<string, Set<string>>> {
    const keys = new Map<string, Set<string>>();
    for (let i = 0; i < contactIds.length; i += contactPageLimit) {
        const ids = contactIds.slice(i, i + contactPageLimit);
        const res = await contacts.queryContacts({
            filter: { _id: { $in: ids } },
            paging: { limit: contactPageLimit },
        } as contacts.ContactQuery);
        (res.contacts || []).forEach(c => c._id && keys.set(c._id, new Set(c.info?.labelKeys?.items || [])));
        status(`Checking the current labels of ${contactIds.length} contacts... (${keys.size})`);
    }
    return keys;
}

export interface ApplySummary {
    // Labels that did not exist on the site before this run.
    newLabels: string[];
    // Contacts that got at least one label they did not have.
    contactsUpdated: number;
    // Total labels added across all contacts.
    labelsAdded: number;
    failedOrders: number;
}

// Totals across contacts (a buyer with several orders counts once).
export function previewTotals(results: OrderLabelResult[]) {
    const missingByContact = new Map<string, Set<string>>();
    const checkedContacts = new Set<string>();
    results.forEach(r => {
        if (r.status !== "ready" && r.status !== "current") return;
        checkedContacts.add(r.contactId);
        if (!r.missing.length) return;
        const set = missingByContact.get(r.contactId) || new Set<string>();
        r.missing.forEach(m => set.add(m));
        missingByContact.set(r.contactId, set);
    });
    let labelsToAdd = 0;
    missingByContact.forEach(s => (labelsToAdd += s.size));
    return {
        contactsChecked: checkedContacts.size,
        contactsToUpdate: missingByContact.size,
        contactsUpToDate: checkedContacts.size - missingByContact.size,
        labelsToAdd,
    };
}

// Step 2: add each contact's missing labels (from Preview), a few contacts at a time.
// Labels are only ever added, never removed.
//
// Wix quietly skips a label used straight after it is created. So: create every new label first,
// wait, then label contacts, check what Wix actually saved, and retry anything it skipped.
export async function applyOrderLabels(
    results: OrderLabelResult[],
    onProgress: (done: number, total: number, updated: OrderLabelResult) => void,
    status: Status = () => {}
): Promise<ApplySummary> {
    const newLabels = new Set<string>();

    // One buyer can have several orders: handle each contact once, with all their missing labels.
    const todo = results.filter(r => r.status === "ready" && r.missing.length > 0);
    const byContact = new Map<string, OrderLabelResult[]>();
    todo.forEach(r => byContact.set(r.contactId, [...(byContact.get(r.contactId) || []), r]));
    const contactIds = [...byContact.keys()];

    // 1. A key for every label needed. Existing labels by key; new labels created now, one at a time.
    const keyByName = new Map<string, string>();
    const createErrors = new Map<string, string>();
    const existingKeys = await loadLabelKeysByName();
    const needed = [...new Set(todo.flatMap(r => r.missing))];
    const toCreate: string[] = [];
    needed.forEach(name => {
        const key = existingKeys.get(clean(name).toLowerCase());
        if (key) keyByName.set(name, key);
        else toCreate.push(name);
    });
    for (const [i, name] of toCreate.entries()) {
        status(`Creating new labels... (${i + 1} of ${toCreate.length})`);
        try {
            const res = await labels.findOrCreateLabel(clean(name));
            if (!res.label?.key) throw new Error(`Could not create label "${name}"`);
            if (res.newLabel) newLabels.add(name);
            keyByName.set(name, res.label.key);
        } catch (error) {
            createErrors.set(name, describeError(error, "create the label", "Manage Contact Labels"));
        }
    }
    // Give Wix a moment before new labels are used on contacts.
    if (toCreate.length) {
        status("Waiting for the new labels to be ready...");
        await wait(newLabelDelayMs);
    }

    // 2. Label each contact, then check the labels Wix saved and retry any it skipped.
    let contactsUpdated = 0;
    let labelsAdded = 0;
    let failedOrders = 0;
    let done = 0;
    status("Adding labels to contacts...");

    for (let i = 0; i < contactIds.length; i += batchSize) {
        await Promise.all(
            contactIds.slice(i, i + batchSize).map(async contactId => {
                const contactOrders = byContact.get(contactId) || [];
                const names = [...new Set(contactOrders.flatMap(r => r.missing))];
                let updated: OrderLabelResult[];
                try {
                    const blocked = names.find(n => createErrors.has(n));
                    if (blocked) throw new Error(createErrors.get(blocked));
                    const keys = [...new Set(names.map(n => keyByName.get(n) as string))];
                    const notSaved = await labelContactChecked(contactId, keys);
                    const added = keys.length - notSaved.length;
                    labelsAdded += added;
                    if (added > 0) contactsUpdated++;
                    if (notSaved.length) {
                        const missingNames = names.filter(n => notSaved.includes(keyByName.get(n) as string));
                        throw new Error(`Wix did not save: ${missingNames.join("; ")}. Run Preview, then try again.`);
                    }
                    updated = contactOrders.map(r => ({ ...r, status: "labelled", message: undefined }));
                } catch (error) {
                    failedOrders += contactOrders.length;
                    const message = describeError(error, "add labels", "");
                    updated = contactOrders.map(r => ({ ...r, status: "failed", message }));
                }
                done += contactOrders.length;
                updated.forEach(u => onProgress(done, todo.length, u));
            })
        );
    }

    return { newLabels: [...newLabels].sort(), contactsUpdated, labelsAdded, failedOrders };
}

const newLabelDelayMs = 4000;
const retryDelaysMs = [2000, 5000, 10000];

function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Adds the labels, then checks the contact Wix sends back. Retries any keys Wix skipped.
// Returns the keys that still aren't on the contact.
async function labelContactChecked(contactId: string, keys: string[]): Promise<string[]> {
    let remaining = keys;
    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
        if (attempt > 0) await wait(retryDelaysMs[attempt - 1]);
        try {
            const res = await contacts.labelContact(contactId, remaining);
            const saved = new Set(res.contact?.info?.labelKeys?.items || []);
            remaining = remaining.filter(k => !saved.has(k));
        } catch (error) {
            const e = error as any;
            const text = `${e?.message || ""} ${JSON.stringify(e?.details || {})}`;
            // Wix had nothing it could add yet (a new label not ready): wait and try again.
            if (!text.includes("EMPTY_ASSIGN_AND_UNASSIGN_LISTS")) {
                throw new Error(describeError(error, "label the contact", "Manage Contacts"));
            }
        }
        if (!remaining.length) return [];
    }
    return remaining;
}

// A short, readable message for a failed Wix call (instead of the raw error JSON).
function describeError(error: unknown, action: string, permission: string): string {
    const e = error as any;
    let parsed: any;
    try {
        parsed = typeof e?.message === "string" && e.message.trim().startsWith("{") ? JSON.parse(e.message) : undefined;
    } catch {
        parsed = undefined;
    }
    const code =
        e?.details?.applicationError?.code ??
        parsed?.details?.applicationError?.code ??
        e?.httpStatus ??
        e?.status ??
        e?.response?.status;
    if (Number(code) === 403 && permission) {
        return `No permission to ${action}. The app needs the "${permission}" permission.`;
    }
    const message = typeof e?.message === "string" ? e.message.trim() : "";
    if (message && !message.startsWith("{")) return message;
    return `Could not ${action}${code ? ` (error ${code})` : ""}.`;
}
