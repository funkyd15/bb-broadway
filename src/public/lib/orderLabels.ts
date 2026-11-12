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
// - Only labels a contact does not already have are added, and the run reports
//   how many labels were new to the site and how many contacts changed.

import { orders } from "@wix/ecom";
import { extendedBookings } from "@wix/bookings";
import { contacts, labels } from "@wix/crm";
import { items } from "@wix/data";
import { wixAppIds } from "./utilities";

const pageLimit = 100;
const batchSize = 5;

export interface OrderLabelResult {
    orderId: string;
    orderNumber: string;
    createdDate: string;
    contactId: string;
    buyerName: string;
    buyerEmail: string;
    labels: string[];
    status: "ready" | "skipped" | "labelled" | "failed";
    message?: string;
    // After applying: how many of the labels were new to this contact.
    added?: number;
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

async function loadLookupData(): Promise<LookupData> {
    const [locationItems, courseTypeItems] = await Promise.all([queryAll("locations"), queryAll("courseTypeLabels")]);
    return {
        locations: new Map(locationItems.filter(i => i.label).map(i => [i._id, String(i.label).trim()])),
        courseTypes: courseTypeItems
            .filter(i => i.label && i.findText)
            .map(i => ({ label: String(i.label), findText: String(i.findText).toLowerCase() })),
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
        const code = (d.coupon?.code || "").toLowerCase();
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
        const name = (item.productName?.original || "").toLowerCase();
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

    return [...new Set(out.map(l => l.trim()))];
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
        };
        try {
            const orderLabels = labelsForOrder(order, bookingLocations, lookup);
            if (!contactId) return { ...base, labels: orderLabels, status: "skipped", message: "Order has no contact" };
            if (!orderLabels.length) return { ...base, labels: [], status: "skipped", message: "No labels to add" };
            return { ...base, labels: orderLabels, status: "ready" };
        } catch (error) {
            return { ...base, labels: [], status: "failed", message: (error as Error)?.message || String(error) };
        }
    });

    status(
        `${results.filter(r => r.status === "ready").length} of ${results.length} bookings orders ready to label ` +
            `(${allOrders.length} orders since ${since.toLocaleDateString("en-GB")})`
    );
    return results;
}

export interface ApplySummary {
    // Labels that did not exist on the site before this run.
    newLabels: string[];
    // Contacts that got at least one label they did not have.
    contactsUpdated: number;
    // Contacts that already had every label.
    contactsUnchanged: number;
    // Total labels added across all contacts.
    labelsAdded: number;
    failedOrders: number;
}

// Step 2: add the previewed labels to each contact, a few orders at a time.
// Only labels the contact does not already have are added.
export async function applyOrderLabels(
    results: OrderLabelResult[],
    onProgress: (done: number, total: number, updated: OrderLabelResult) => void
): Promise<ApplySummary> {
    const newLabels = new Set<string>();

    // Cache the lookup itself, so orders running side by side share one call per label.
    const labelKeys = new Map<string, Promise<string>>();
    function keyFor(displayName: string): Promise<string> {
        const cached = labelKeys.get(displayName);
        if (cached) return cached;
        const key: Promise<string> = labels.findOrCreateLabel(displayName).then(res => {
            if (!res.label?.key) throw new Error(`Could not find or create label "${displayName}"`);
            if (res.newLabel) newLabels.add(displayName);
            return res.label.key;
        });
        key.catch(() => labelKeys.delete(displayName));
        labelKeys.set(displayName, key);
        return key;
    }

    let contactsUpdated = 0;
    let contactsUnchanged = 0;
    let labelsAdded = 0;
    let failedOrders = 0;

    // One buyer can have several orders: handle each contact once, with all their labels.
    const todo = results.filter(r => r.status === "ready");
    const byContact = new Map<string, OrderLabelResult[]>();
    todo.forEach(r => byContact.set(r.contactId, [...(byContact.get(r.contactId) || []), r]));
    const contactIds = [...byContact.keys()];
    let done = 0;

    for (let i = 0; i < contactIds.length; i += batchSize) {
        await Promise.all(
            contactIds.slice(i, i + batchSize).map(async contactId => {
                const contactOrders = byContact.get(contactId) || [];
                let updated: OrderLabelResult[];
                try {
                    const names = [...new Set(contactOrders.flatMap(r => r.labels))];
                    const keyByName = new Map<string, string>();
                    for (const name of names) keyByName.set(name, await keyFor(name));
                    const contact = await contacts.getContact(contactId);
                    const has = new Set(contact.info?.labelKeys?.items || []);
                    const missing = [...new Set(keyByName.values())].filter(k => !has.has(k));
                    if (missing.length) {
                        await contacts.labelContact(contactId, missing);
                        contactsUpdated++;
                        labelsAdded += missing.length;
                    } else {
                        contactsUnchanged++;
                    }
                    const missingSet = new Set(missing);
                    updated = contactOrders.map(r => ({
                        ...r,
                        status: "labelled",
                        message: undefined,
                        added: r.labels.filter(n => missingSet.has(keyByName.get(n) || "")).length,
                    }));
                } catch (error) {
                    failedOrders += contactOrders.length;
                    const message = (error as Error)?.message || String(error);
                    updated = contactOrders.map(r => ({ ...r, status: "failed", message }));
                }
                done += contactOrders.length;
                updated.forEach(u => onProgress(done, todo.length, u));
            })
        );
    }

    return { newLabels: [...newLabels].sort(), contactsUpdated, contactsUnchanged, labelsAdded, failedOrders };
}
